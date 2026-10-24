import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import socketService from '../../services/socketService';
import { detectDistrictFromCoords, calculateDistanceToDistrict } from '../../utils/geoDistrictDetector';

const DISTRICTS = ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'];

export const UserDashboard = () => {
  // District state & user manual override tracking
  const [selectedDistrict, setSelectedDistrict] = useState('Kodagu');
  const isManualOverrideRef = useRef(false);

  // Geolocation state
  const [geoState, setGeoState] = useState({
    status: 'detecting', // 'detecting' | 'detected_inside' | 'detected_outside' | 'denied' | 'unsupported'
    coords: null,        // { lat, lng }
    detectedDistrict: null,
    isOutsidePilots: false,
    distanceKm: 0,
    nearestDistrict: 'Kodagu'
  });

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch summary from API with optional user GPS coordinates for accurate distance calculation
  const fetchUserSummary = useCallback((district = selectedDistrict, userCoords = geoState.coords) => {
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    let url = `${baseUrl}/user/dashboard/summary?district=${encodeURIComponent(district)}`;
    if (userCoords?.lat && userCoords?.lng) {
      url += `&lat=${userCoords.lat}&lng=${userCoords.lng}`;
    }

    fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('aegis_token')}` }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to load citizen intelligence summary`);
        }
        return res.json();
      })
      .then((data) => {
        setSummary(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[UserDashboard] Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [selectedDistrict, geoState.coords]);

  // Real GPS Geolocation detection via browser API
  const detectLocation = useCallback(() => {
    setGeoState((prev) => ({ ...prev, status: 'detecting' }));

    if (!('geolocation' in navigator)) {
      setGeoState({
        status: 'unsupported',
        coords: null,
        detectedDistrict: null,
        isOutsidePilots: false,
        distanceKm: 0,
        nearestDistrict: 'Kodagu'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const result = detectDistrictFromCoords(lat, lng);

        if (result.inside && result.district) {
          // Citizen is physically inside or adjacent to one of the 4 monitored pilot districts
          setGeoState({
            status: 'detected_inside',
            coords: { lat, lng },
            detectedDistrict: result.district,
            isOutsidePilots: false,
            distanceKm: 0,
            nearestDistrict: result.district
          });

          // Automatically select detected district unless citizen has already manually chosen one
          if (!isManualOverrideRef.current) {
            setSelectedDistrict(result.district);
          }
        } else {
          // Citizen is outside all 4 monitored districts (e.g. Bangalore, Mangalore, etc.)
          setGeoState({
            status: 'detected_outside',
            coords: { lat, lng },
            detectedDistrict: null,
            isOutsidePilots: true,
            distanceKm: result.distanceKm,
            nearestDistrict: result.nearestDistrict || 'Kodagu'
          });
        }
      },
      (err) => {
        console.warn('[UserDashboard] Geolocation access denied or unavailable:', err.message);
        setGeoState({
          status: 'denied',
          coords: null,
          detectedDistrict: null,
          isOutsidePilots: false,
          distanceKm: 0,
          nearestDistrict: 'Kodagu'
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Run GPS auto-detection once on mount
  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  // Synchronize dashboard whenever selectedDistrict or coordinates change
  useEffect(() => {
    fetchUserSummary(selectedDistrict, geoState.coords);

    const unsubAlertCreated = socketService.onAlertCreated(() => fetchUserSummary(selectedDistrict, geoState.coords));
    const unsubAlertUpdated = socketService.onAlertUpdated(() => fetchUserSummary(selectedDistrict, geoState.coords));
    const unsubShelterUpdated = socketService.onShelterUpdated(() => fetchUserSummary(selectedDistrict, geoState.coords));
    const unsubPredictionUpdated = socketService.onPredictionUpdated(() => fetchUserSummary(selectedDistrict, geoState.coords));

    return () => {
      unsubAlertCreated();
      unsubAlertUpdated();
      unsubShelterUpdated();
      unsubPredictionUpdated();
    };
  }, [selectedDistrict, geoState.coords, fetchUserSummary]);

  // Manual district dropdown handler
  const handleDistrictChange = (e) => {
    const newDistrict = e.target.value;
    isManualOverrideRef.current = true;
    setSelectedDistrict(newDistrict);
  };

  // Reset to auto-detected GPS location
  const handleResetToMyLocation = () => {
    if (geoState.detectedDistrict) {
      isManualOverrideRef.current = false;
      setSelectedDistrict(geoState.detectedDistrict);
    }
  };

  // Real-world distance from citizen's real GPS coordinates to the CURRENTLY PREVIEWED district's centroid
  const previewDistanceKm = useMemo(() => {
    if (!geoState.coords?.lat || !geoState.coords?.lng) return null;
    return calculateDistanceToDistrict(geoState.coords.lat, geoState.coords.lng, selectedDistrict);
  }, [geoState.coords, selectedDistrict]);

  const riskLevel = summary?.riskLevel || 'LOW';
  const calibProb = summary?.calibratedProbability !== undefined
    ? (summary.calibratedProbability * 100).toFixed(1)
    : null;
  const safetyScore = summary?.safetyScore !== undefined ? summary.safetyScore : '—';

  // Dynamic aesthetic themes per risk level (never hardcoded)
  const getTierStyles = (tier) => {
    switch (tier) {
      case 'CRITICAL':
        return {
          border: 'border-error/40',
          bgGlow: 'bg-error/10',
          text: 'text-error',
          badgeBg: 'bg-error/15',
          badgeText: 'text-error border-error/30',
          icon: 'emergency',
          label: 'Critical Emergency Advisory',
          gaugeColor: '#ef4444'
        };
      case 'HIGH':
        return {
          border: 'border-orange-500/40',
          bgGlow: 'bg-orange-500/10',
          text: 'text-orange-400',
          badgeBg: 'bg-orange-500/15',
          badgeText: 'text-orange-400 border-orange-500/30',
          icon: 'warning',
          label: 'High Hazard Advisory',
          gaugeColor: '#f97316'
        };
      case 'MODERATE':
        return {
          border: 'border-yellow-500/40',
          bgGlow: 'bg-yellow-500/10',
          text: 'text-yellow-400',
          badgeBg: 'bg-yellow-500/15',
          badgeText: 'text-yellow-400 border-yellow-500/30',
          icon: 'info',
          label: 'Moderate Advisory',
          gaugeColor: '#eab308'
        };
      case 'LOW':
      default:
        return {
          border: 'border-emerald-500/30',
          bgGlow: 'bg-emerald-500/5',
          text: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/15',
          badgeText: 'text-emerald-400 border-emerald-500/30',
          icon: 'check_circle',
          label: 'Low Risk — Monitored',
          gaugeColor: '#22c55e'
        };
    }
  };

  const tierStyle = getTierStyles(riskLevel);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header with GPS Status and Manual District Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-2xl md:text-3xl text-on-surface font-semibold flex items-center gap-2">
            Citizen Safety Dashboard
            {geoState.status === 'detected_inside' && (
              <span className="material-symbols-outlined text-emerald-400 text-lg" title="GPS Locked to Your District">
                my_location
              </span>
            )}
          </h1>
          <p className="font-body-md text-xs md:text-sm text-on-surface-variant">
            Live environmental hazard intelligence & civil defense advisories
          </p>
        </div>

        {/* GPS Location & District Selector Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* GPS Status Badge */}
          {geoState.status === 'detecting' && (
            <div className="glass-panel px-3 py-1.5 rounded-lg border border-primary/20 text-primary text-xs flex items-center gap-1.5 font-data-mono">
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              Acquiring GPS location...
            </div>
          )}

          {geoState.status === 'detected_inside' && (
            <div className="glass-panel px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span className="font-medium">GPS Auto-Detected: {geoState.detectedDistrict}</span>
            </div>
          )}

          {geoState.status === 'detected_outside' && (
            <div className="glass-panel px-3 py-1.5 rounded-lg border border-yellow-500/30 text-yellow-400 text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">explore</span>
              <span className="font-medium">GPS: Outside Pilot Area</span>
            </div>
          )}

          {geoState.status === 'denied' && (
            <button
              onClick={detectLocation}
              type="button"
              className="glass-panel px-3 py-1.5 rounded-lg border border-white/10 hover:border-primary/40 text-on-surface-variant hover:text-primary text-xs flex items-center gap-1.5 transition-colors"
              title="Click to grant GPS location permission"
            >
              <span className="material-symbols-outlined text-sm">location_disabled</span>
              <span>Enable GPS</span>
            </button>
          )}

          {/* Reset to Auto-Detected Location Button if user manually navigated away */}
          {geoState.detectedDistrict && isManualOverrideRef.current && (
            <button
              onClick={handleResetToMyLocation}
              type="button"
              className="glass-panel px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/20 transition-all"
            >
              <span className="material-symbols-outlined text-sm">my_location</span>
              <span>Back to My Location ({geoState.detectedDistrict})</span>
            </button>
          )}

          {/* District Selector Dropdown (Manual Exploration / Override) */}
          <div className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-lg border border-white/10 shadow-sm">
            <span className="material-symbols-outlined text-sm text-primary">location_on</span>
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
              {geoState.isOutsidePilots ? 'Explore Pilot:' : 'District:'}
            </span>
            <select
              value={selectedDistrict}
              onChange={handleDistrictChange}
              className="bg-transparent text-sm font-semibold text-on-surface focus:outline-none cursor-pointer pr-1"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d} className="bg-surface-container text-on-surface">
                  {d} {geoState.detectedDistrict === d ? '(Your Location)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Honest Warning Banner when Citizen GPS is Outside Monitored Pilot Districts */}
      {geoState.isOutsidePilots && (
        <div className="glass-panel p-4 md:p-5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <span className="material-symbols-outlined text-2xl">location_off</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-sm md:text-base font-semibold text-yellow-200">
                Outside Monitored Pilot Districts
              </h3>
              <p className="font-body-md text-xs md:text-sm text-yellow-100/90 leading-relaxed mt-0.5">
                You are currently outside AegisCore's 4 monitored pilot districts. Select a district below to view its current status.
              </p>
              {geoState.coords && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-data-mono text-yellow-200/80">
                  <span>GPS: {geoState.coords.lat.toFixed(4)}°N, {geoState.coords.lng.toFixed(4)}°E</span>
                  <span>•</span>
                  <span>Nearest pilot district: <strong className="text-yellow-100">{geoState.nearestDistrict}</strong> (~{geoState.distanceKm} km away)</span>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 self-stretch sm:self-auto flex items-center justify-end">
            <span className="px-3 py-1 rounded-full text-xs font-label-caps uppercase tracking-wider bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 font-bold">
              Preview Mode: {selectedDistrict}
            </span>
          </div>
        </div>
      )}

      {/* Loading / Error Banner Overlay */}
      {loading && (
        <div className="bg-surface-container/60 text-xs text-primary px-4 py-2 rounded-lg border border-primary/20 backdrop-blur-md font-data-mono flex items-center gap-2">
          <span className="material-symbols-outlined text-sm animate-spin">sync</span>
          Syncing calibrated hazard intelligence for {selectedDistrict}...
        </div>
      )}
      {error && (
        <div className="bg-error/15 text-xs text-error px-4 py-2 rounded-lg border border-error/30 backdrop-blur-md font-data-mono">
          Connection Alert: {error}
        </div>
      )}

      {/* Hero Section & Calibrated Alert / Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Risk Advisory Card */}
        <div className={`glass-panel rounded-xl p-6 ${tierStyle.border} lg:col-span-2 flex flex-col justify-between relative overflow-hidden transition-all duration-300`}>
          <div className={`absolute top-0 right-0 w-64 h-64 ${tierStyle.bgGlow} rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none`}></div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${tierStyle.badgeBg} ${tierStyle.badgeText}`}>
                <span className="material-symbols-outlined text-sm">{tierStyle.icon}</span>
                <span>{tierStyle.label}</span>
              </div>
              {calibProb !== null && (
                <span className="px-2.5 py-1 rounded-full text-xs font-data-mono bg-white/5 border border-white/10 text-on-surface-variant">
                  {calibProb}% Calibrated Probability
                </span>
              )}
              {(geoState.isOutsidePilots || (geoState.detectedDistrict && geoState.detectedDistrict !== selectedDistrict)) && (
                <span className="px-2.5 py-1 rounded-full text-xs font-label-caps bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">
                  Remote District Preview
                </span>
              )}
            </div>

            <h2 className="font-headline-lg text-xl md:text-2xl text-on-surface font-semibold mb-1">
              {summary?.weatherAlert || `${riskLevel} Advisory — ${selectedDistrict}`}
            </h2>
            <p className="font-body-lg text-on-surface-variant text-sm">
              Monitored Sector: <span className="text-on-surface font-medium">{summary?.currentLocation || `${selectedDistrict}, Karnataka`}</span>
              {geoState.detectedDistrict === selectedDistrict ? (
                <span className="text-emerald-400 font-medium ml-2 text-xs">(Your Live GPS Location)</span>
              ) : (geoState.isOutsidePilots || (geoState.detectedDistrict && geoState.detectedDistrict !== selectedDistrict)) ? (
                <span className="text-yellow-400 font-medium ml-2 text-xs">
                  (Remote Preview • ~{previewDistanceKm !== null ? previewDistanceKm : geoState.distanceKm} km away)
                </span>
              ) : null}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-container-highest/80 rounded-lg p-4 border border-white/5">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-2">Live Hazard Assessment</h3>
              <p className="font-body-md text-sm text-on-surface leading-relaxed">
                {summary?.hazardAssessment || 'Real-time telemetry reports normal baseline conditions across monitored hydrologic zones.'}
              </p>
            </div>
            <div className="bg-surface-container-highest/80 rounded-lg p-4 border border-white/5">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-2">Recommended Action</h3>
              <p className="font-body-md text-sm text-on-surface leading-relaxed">
                {summary?.recommendedAction || 'Normal routine permitted. Monitor official emergency channels for updates.'}
              </p>
            </div>
          </div>
        </div>

        {/* Safety Score Radial Gauge */}
        <div className="glass-panel rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-4">
            CITIZEN SAFETY INDEX
          </span>
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="none" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="8"></circle>
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="42"
                stroke={tierStyle.gaugeColor}
                strokeDasharray="264"
                strokeDashoffset={typeof safetyScore === 'number' ? 264 - (264 * safetyScore) / 100 : 264}
                strokeLinecap="round"
                strokeWidth="8"
                className="transition-all duration-700 ease-out"
              ></circle>
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="font-display-stat text-4xl font-bold text-on-surface">{safetyScore}</span>
              <span className="font-label-caps text-xs text-on-surface-variant">/ 100</span>
            </div>
          </div>
          <span className="inline-block mt-4 bg-primary/10 text-primary font-label-caps text-xs px-3 py-1 rounded-full font-bold">
            CALIBRATED INFERENCE
          </span>
        </div>
      </div>

      {/* Emergency SOS Banner */}
      <div className="glass-panel p-6 rounded-xl border border-error/30 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-error/20 text-error flex items-center justify-center shrink-0 animate-pulse">
            <span className="material-symbols-outlined text-3xl">emergency</span>
          </div>
          <div>
            <h2 className="font-headline-md text-lg font-bold text-on-surface">Emergency Distress Beacon</h2>
            <p className="text-sm text-on-surface-variant">
              In immediate danger? Transmit your real GPS coordinates directly to emergency response coordinators.
            </p>
          </div>
        </div>
        <Link
          to="/user/emergency"
          className="w-full md:w-auto px-8 py-3.5 bg-error text-white font-label-caps text-xs font-bold rounded-lg tracking-widest uppercase shadow-[0_0_25px_rgba(239,68,68,0.4)] hover:bg-red-600 active:scale-95 transition-all text-center shrink-0"
        >
          TRIGGER EMERGENCY SOS
        </Link>
      </div>

      {/* 3 Status Cards Grid with Live Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Nearby Active Hazards */}
        <div className="glass-panel p-5 rounded-xl flex flex-col justify-between gap-2 border border-white/5 hover:border-white/15 transition-all">
          <div>
            <div className="flex items-center gap-2 mb-1 text-primary">
              <span className="material-symbols-outlined text-lg">travel_explore</span>
              <span className="font-label-caps text-xs text-on-surface-variant uppercase">Nearby Elevated Hazards</span>
            </div>
            <span className="font-data-mono text-3xl font-bold text-on-surface">
              {summary?.nearbyRisksCount !== undefined ? summary.nearbyRisksCount : '0'}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {summary?.nearbyRisksCount === 0
              ? 'Zero elevated (High/Critical) risk zones currently detected across state.'
              : `${summary?.nearbyRisksCount} district sector(s) currently under High/Critical threat.`}
          </p>
        </div>

        {/* Nearest Shelter (Clickable Link to /user/shelters) */}
        <Link
          to="/user/shelters"
          className="glass-panel p-5 rounded-xl flex flex-col justify-between gap-2 border border-white/5 hover:border-primary/40 hover:bg-surface-container-high/40 transition-all group"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-lg">location_home</span>
                <span className="font-label-caps text-xs text-on-surface-variant uppercase">
                  {geoState.isOutsidePilots ? `Shelter in ${selectedDistrict}` : 'Nearest Relief Shelter'}
                </span>
              </div>
              <span className="material-symbols-outlined text-xs text-on-surface-variant group-hover:text-primary transition-colors">
                arrow_forward
              </span>
            </div>
            <span className="font-data-mono text-2xl font-bold text-on-surface">
              {summary?.nearestShelter?.name || 'Local Shelter'}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {summary?.nearestShelter
              ? `${summary.nearestShelter.capacity} • ${summary.nearestShelter.distance}`
              : 'Tap to view registered relief shelters'}
          </p>
        </Link>

        {/* Active Advisories (Clickable Link to /user/alerts) */}
        <Link
          to="/user/alerts"
          className="glass-panel p-5 rounded-xl flex flex-col justify-between gap-2 border border-white/5 hover:border-primary/40 hover:bg-surface-container-high/40 transition-all group"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-lg">notifications_active</span>
                <span className="font-label-caps text-xs text-on-surface-variant uppercase">Active Advisories</span>
              </div>
              <span className="material-symbols-outlined text-xs text-on-surface-variant group-hover:text-primary transition-colors">
                arrow_forward
              </span>
            </div>
            <span className="font-data-mono text-3xl font-bold text-on-surface">
              {summary?.activeAdvisoriesCount !== undefined ? summary.activeAdvisoriesCount : '0'}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">
            Automated hazard advisories active. Tap to view full bulletins.
          </p>
        </Link>
      </div>
    </div>
  );
};

