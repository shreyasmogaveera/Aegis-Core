import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { KARNATAKA_BOUNDS, KARNATAKA_DISTRICTS_GEOJSON } from '../../data/karnatakaDistricts';
import { KARNATAKA_STATE_BOUNDARY_GEOJSON } from '../../data/karnatakaBoundary';
import socketService from '../../services/socketService';
import { resolveDominantPrediction } from '../../utils/dominantHazard';

// Helper: Point in Polygon check (point = [lat, lng], vs = [[lng, lat], ...])
const isPointInPolygon = (point, vs) => {
  if (!point || !vs || vs.length === 0) return false;
  const x = point[1], y = point[0];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Custom Shelter Pin Icon (Google Maps Style)
const createShelterIcon = (status) => {
  let color = '#16a34a'; // OPEN (Green)
  if (status === 'NEAR_CAPACITY') {
    color = '#ea580c'; // Orange
  } else if (status === 'FULL') {
    color = '#dc2626'; // Red
  } else if (status === 'CLOSED') {
    color = '#4b5563'; // Gray
  }

  return L.divIcon({
    className: 'custom-shelter-pin',
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid #ffffff;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      ">
        <span class="material-symbols-outlined" style="
          transform: rotate(45deg);
          font-size: 18px;
          color: #ffffff;
          font-weight: bold;
        ">home_work</span>
      </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

// Custom SOS Emergency Pin Icon (Pulsing Red)
const createSosIcon = () => {
  return L.divIcon({
    className: 'custom-sos-pin',
    html: `
      <div style="
        background-color: #dc2626;
        width: 34px;
        height: 34px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pulse-red 1.5s infinite;
        cursor: pointer;
      ">
        <span class="material-symbols-outlined" style="
          transform: rotate(45deg);
          font-size: 20px;
          color: #ffffff;
        ">emergency</span>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34]
  });
};

// Custom User GPS Location Dot (Google Maps Style Blue Pulse)
const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'custom-user-location-pin',
    html: `
      <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.3);
          animation: user-pulse 2s infinite ease-out;
        "></div>
        <div style="
          position: relative;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background-color: #2563eb;
          border: 2.5px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        "></div>
      </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

// Map Controller Component for programmatic movement and custom controls
const MapControls = ({ center, zoom, userLocation, onLocateSuccess }) => {
  const map = useMap();

  const handleZoomIn = () => map.zoomIn();
  const handleZoomOut = () => map.zoomOut();

  const handleLocateMe = () => {
    if (userLocation) {
      map.flyTo(userLocation, 12, { animate: true, duration: 1.5 });
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = [pos.coords.latitude, pos.coords.longitude];
          if (onLocateSuccess) onLocateSuccess(loc);
          map.flyTo(loc, 12, { animate: true, duration: 1.5 });
        },
        (err) => {
          console.warn('[AegisMap] Geolocation locate request failed:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  return (
    <>
      {/* Floating Zoom Controls (Upper-Right Area) */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 overflow-hidden text-gray-700">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 border-b border-gray-200 transition-colors"
          title="Zoom In"
        >
          <span className="material-symbols-outlined text-xl">add</span>
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 transition-colors"
          title="Zoom Out"
        >
          <span className="material-symbols-outlined text-xl">remove</span>
        </button>
      </div>

      {/* Floating Locate Me Button (Upper-Right Area) */}
      <button
        type="button"
        onClick={handleLocateMe}
        className="absolute top-28 right-4 z-[1000] w-10 h-10 bg-white/95 backdrop-blur-md hover:bg-gray-50 text-blue-600 rounded-xl shadow-lg border border-gray-200 flex items-center justify-center transition-colors cursor-pointer"
        title="Locate Me"
      >
        <span className="material-symbols-outlined text-xl">my_location</span>
      </button>
    </>
  );
};

export const AegisMap = ({ mode = 'dashboard', selectedDistrict = null, onSelectDistrict, hazardFilter = 'all' }) => {
  // Normalize mode
  const effectiveMode = mode === 'admin' ? 'dashboard' : mode;

  const [districtPredictions, setDistrictPredictions] = useState({});
  const [districtHazardPredictions, setDistrictHazardPredictions] = useState({});
  const [districtTelemetry, setDistrictTelemetry] = useState({});
  const [shelters, setShelters] = useState([]);
  const [sosRequests, setSosRequests] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isOutsideSupportedDistricts, setIsOutsideSupportedDistricts] = useState(false);
  const [activeDistrict, setActiveDistrict] = useState(selectedDistrict);

  useEffect(() => {
    setActiveDistrict(selectedDistrict);
  }, [selectedDistrict]);

  const geoJsonRef = useRef(null);
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
  const token = localStorage.getItem('aegis_token');

  // Prediction resolution with optional hazard filtering
  const getPrediction = (district) => {
    const hazards = districtHazardPredictions[district];
    if (hazardFilter === 'flood') {
      if (hazards?.flood) return hazards.flood;
      const pred = districtPredictions[district];
      if (pred && (pred.predictionType || pred.prediction_type || '').toLowerCase() === 'flood') return pred;
      return null;
    }
    if (hazardFilter === 'landslide') {
      if (hazards?.landslide) return hazards.landslide;
      const pred = districtPredictions[district];
      if (pred && (pred.predictionType || pred.prediction_type || '').toLowerCase() === 'landslide') return pred;
      return null;
    }
    if (hazards) {
      const dominant = resolveDominantPrediction(hazards.flood, hazards.landslide);
      if (dominant) return dominant;
    }
    return districtPredictions[district] || null;
  };

  const isFrozenPrediction = (pred) => (
    !!pred &&
    (
      pred.modelSource === 'AEGIS-CORE_M11_FROZEN' ||
      pred.source === 'AEGIS-CORE_M11_FROZEN' ||
      pred.decisionEngine === 'secondary_physical_rf' ||
      (typeof pred.modelSource === 'string' && pred.modelSource.includes('Secondary')) ||
      pred.district === 'Belagavi'
    )
  );

  const getEventProbability = (pred) => {
    if (!isFrozenPrediction(pred)) return null;

    const value = pred.riskScore !== undefined
      ? pred.riskScore
      : pred.event_probability;

    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : null;
  };

  const getPredictionStatus = (pred) => (
    isFrozenPrediction(pred)
      ? (pred.predictionStatus || 'UNKNOWN')
      : 'NO FROZEN PREDICTION'
  );

  // Fetch initial environmental telemetry & predictions for the 4 supported districts
  const fetchDistrictData = () => {
    const districts = ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'];

    districts.forEach((d) => {
      // 1. Environmental Telemetry
      fetch(`${baseUrl}/environmental/latest?district=${encodeURIComponent(d)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((envData) => {
          if (envData) {
            setDistrictTelemetry((prev) => ({ ...prev, [d]: envData }));
          }
        })
        .catch((e) => console.warn(`[AegisMap] Telemetry fetch warn for ${d}:`, e.message));

      // 2. Predictions (Primary Latest)
      fetch(`${baseUrl}/predictions/latest?district=${encodeURIComponent(d)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((predData) => {
          if (predData && !predData.error) {
            setDistrictPredictions((prev) => ({ ...prev, [d]: predData }));
            const hType = (predData.predictionType || predData.prediction_type || 'flood').toLowerCase();
            setDistrictHazardPredictions((prev) => ({
              ...prev,
              [d]: { ...(prev[d] || {}), [hType]: predData }
            }));
          }
        })
        .catch((e) => console.warn(`[AegisMap] Prediction fetch warn for ${d}:`, e.message));

      // 3. Multi-hazard queries: fetch explicit Flood & Landslide records
      fetch(`${baseUrl}/predictions/latest?district=${encodeURIComponent(d)}&hazard=flood`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((flData) => {
          if (flData && !flData.error) {
            setDistrictHazardPredictions((prev) => ({
              ...prev,
              [d]: { ...(prev[d] || {}), flood: flData }
            }));
          }
        })
        .catch(() => {});

      if (d === 'Kodagu' || d === 'Uttara Kannada') {
        fetch(`${baseUrl}/predictions/latest?district=${encodeURIComponent(d)}&hazard=landslide`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((lsData) => {
            if (lsData && !lsData.error) {
              setDistrictHazardPredictions((prev) => ({
                ...prev,
                [d]: { ...(prev[d] || {}), landslide: lsData }
              }));
            }
          })
          .catch(() => {});
      }
    });
  };

  // Fetch Shelters
  const fetchShelters = () => {
    fetch(`${baseUrl}/shelters`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.shelters) {
          setShelters(data.shelters);
        }
      })
      .catch((e) => console.warn('[AegisMap] Shelters fetch warn:', e.message));
  };

  // Fetch Active SOS signals (Admin / Dashboard / Risk modes ONLY - User Privacy Enforcement)
  const fetchSosRequests = () => {
    if (effectiveMode !== 'dashboard' && effectiveMode !== 'risk') return;
    fetch(`${baseUrl}/admin/sos`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.sosRequests) {
          const activeOnly = data.sosRequests.filter(
            (s) => s.status === 'PENDING' || s.status === 'RESPONDING' || s.status === 'IN_PROGRESS'
          );
          setSosRequests(activeOnly);
        }
      })
      .catch((e) => console.warn('[AegisMap] SOS fetch warn:', e.message));
  };

  const evaluateUserPosition = (pos) => {
    const loc = [pos.coords.latitude, pos.coords.longitude];
    setUserLocation(loc);
    setLocationError(null);

    // Verify if GPS location falls within any of the 4 supported districts
    let foundInside = false;
    KARNATAKA_DISTRICTS_GEOJSON.features.forEach((feature) => {
      const coords = feature.geometry.coordinates[0];
      if (isPointInPolygon(loc, coords)) {
        foundInside = true;
      }
    });

    setIsOutsideSupportedDistricts(!foundInside);
  };

  useEffect(() => {
    fetchDistrictData();
    fetchShelters();
    fetchSosRequests();

    // Geolocation API (User mode focus or Locate Me)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => evaluateUserPosition(pos),
        (err) => {
          console.warn('[AegisMap] User location permission denied or unavailable:', err.message);
          if (effectiveMode === 'user') {
            setLocationError('Unable to determine your location. Please enable location permission and try again.');
          }
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else if (effectiveMode === 'user') {
      setLocationError('Unable to determine your location. Please enable location permission and try again.');
    }

    // Socket.io Subscriptions
    const unsubPrediction = socketService.onPredictionUpdated((pred) => {
      if (pred && pred.district) {
        const hType = (pred.predictionType || pred.prediction_type || 'flood').toLowerCase();
        setDistrictHazardPredictions((prev) => {
          const updatedDistrictHazards = {
            ...(prev[pred.district] || {}),
            [hType]: pred
          };
          const dominant = resolveDominantPrediction(updatedDistrictHazards.flood, updatedDistrictHazards.landslide) || pred;
          setDistrictPredictions((dPrev) => ({ ...dPrev, [pred.district]: dominant }));
          return {
            ...prev,
            [pred.district]: updatedDistrictHazards
          };
        });
      }
    });

    const unsubShelter = socketService.onShelterUpdated((updatedShelter) => {
      if (!updatedShelter) return;
      setShelters((prev) => {
        const idx = prev.findIndex((s) => s.id === updatedShelter.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updatedShelter;
          return copy;
        }
        return [...prev, updatedShelter];
      });
    });

    let unsubSosCreated, unsubSosUpdated;
    if (effectiveMode === 'dashboard' || effectiveMode === 'risk') {
      unsubSosCreated = socketService.onSosCreated((newSos) => {
        setSosRequests((prev) => [newSos, ...prev]);
      });
      unsubSosUpdated = socketService.onSosUpdated((updatedSos) => {
        setSosRequests((prev) => {
          if (updatedSos.status === 'RESOLVED' || updatedSos.status === 'CANCELLED') {
            return prev.filter((s) => s.id !== updatedSos.id);
          }
          const idx = prev.findIndex((s) => s.id === updatedSos.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updatedSos;
            return copy;
          }
          return [updatedSos, ...prev];
        });
      });
    }

    return () => {
      unsubPrediction();
      unsubShelter();
      if (unsubSosCreated) unsubSosCreated();
      if (unsubSosUpdated) unsubSosUpdated();
    };
  }, [effectiveMode]);

  // Ensure Leaflet GeoJSON layer synchronizes styles dynamically when predictions, hazard evaluations, activeDistrict, or hazardFilter changes
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.setStyle(getDistrictStyle);
    }
  }, [districtPredictions, districtHazardPredictions, districtTelemetry, activeDistrict, effectiveMode, hazardFilter]);

  const RISK_THEME = {
    CRITICAL: {
      fill: '#ef4444',
      stroke: '#b91c1c',
      pill: '#dc2626',
      label: 'Critical Danger',
      badge: 'bg-red-100 text-red-800 border-red-200'
    },
    HIGH: {
      fill: '#f97316',
      stroke: '#c2410c',
      pill: '#ea580c',
      label: 'High Alert',
      badge: 'bg-orange-100 text-orange-800 border-orange-200'
    },
    MODERATE: {
      fill: '#eab308',
      stroke: '#ca8a04',
      pill: '#eab308',
      label: 'Moderate Advisory',
      badge: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    },
    LOW: {
      fill: '#38bdf8',
      stroke: '#0284c7',
      pill: '#0284c7',
      label: 'Low Risk',
      badge: 'bg-sky-100 text-sky-800 border-sky-200'
    },
    DEFAULT: {
      fill: '#f8fafc',
      stroke: '#94a3b8',
      pill: '#64748b',
      label: 'Normal',
      badge: 'bg-slate-100 text-slate-700 border-slate-200'
    }
  };

  /**
   * Shelter Capacity & Strain calculation per district for Shelter Logistics mode
   */
  const getDistrictShelterStrain = (dName) => {
    const districtShelters = shelters.filter(
      (s) => s.district && s.district.toLowerCase() === dName.toLowerCase()
    );

    if (districtShelters.length === 0) {
      return {
        status: 'NO_SHELTERS',
        fill: '#94a3b8',
        stroke: '#64748b',
        pillBg: '#64748b',
        pillText: '#ffffff',
        label: 'No Shelters',
        count: 0,
        totalCapacity: 0,
        totalOccupied: 0,
        availableBeds: 0,
        utilizationPct: 0,
        shelters: []
      };
    }

    const totalCapacity = districtShelters.reduce((acc, s) => acc + (s.capacity || 0), 0);
    const totalOccupied = districtShelters.reduce((acc, s) => acc + (s.occupied || 0), 0);
    const availableBeds = Math.max(0, totalCapacity - totalOccupied);
    const utilizationPct = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

    if (utilizationPct >= 85 || districtShelters.some((s) => s.status === 'FULL')) {
      return {
        status: 'HIGH_STRAIN',
        fill: '#f97316',
        stroke: '#c2410c',
        pillBg: '#ea580c',
        pillText: '#ffffff',
        label: `High Strain (${utilizationPct}%)`,
        count: districtShelters.length,
        totalCapacity,
        totalOccupied,
        availableBeds,
        utilizationPct,
        shelters: districtShelters
      };
    }

    if (utilizationPct >= 50) {
      return {
        status: 'MODERATE_UTILIZATION',
        fill: '#eab308',
        stroke: '#ca8a04',
        pillBg: '#eab308',
        pillText: '#78350f',
        label: `Moderate (${utilizationPct}%)`,
        count: districtShelters.length,
        totalCapacity,
        totalOccupied,
        availableBeds,
        utilizationPct,
        shelters: districtShelters
      };
    }

    return {
      status: 'AVAILABLE',
      fill: '#10b981',
      stroke: '#059669',
      pillBg: '#059669',
      pillText: '#ffffff',
      label: `Available (${utilizationPct}%)`,
      count: districtShelters.length,
      totalCapacity,
      totalOccupied,
      availableBeds,
      utilizationPct,
      shelters: districtShelters
    };
  };

  // District styling driven by Level 1 / Level 2 calibrated decision thresholds (or Shelter Capacity strain)
  const getDistrictStyle = (feature) => {
    const dName = feature.properties.name;
    const isSelected = activeDistrict === dName;

    // Shelter Logistics Mode: District coloring driven purely by shelter capacity strain
    if (effectiveMode === 'shelters') {
      const strain = getDistrictShelterStrain(dName);
      return {
        fillColor: strain.fill,
        weight: isSelected ? 3.0 : 1.75,
        opacity: 0.90,
        color: isSelected ? '#0f172a' : strain.stroke,
        fillOpacity: isSelected ? 0.45 : 0.25
      };
    }

    // Rainfall Telemetry Severity Mode
    if (hazardFilter === 'rain') {
      const telem = districtTelemetry[dName];
      const rain = telem?.rainfall_mm || 0;
      let fill = '#38bdf8'; // low (<15.6mm)
      let stroke = '#0284c7';
      if (rain >= 115.6) {
        fill = '#ef4444'; // critical
        stroke = '#b91c1c';
      } else if (rain >= 64.5) {
        fill = '#f97316'; // high
        stroke = '#c2410c';
      } else if (rain >= 15.6) {
        fill = '#eab308'; // moderate
        stroke = '#ca8a04';
      }
      return {
        fillColor: fill,
        weight: isSelected ? 3.0 : 1.75,
        opacity: 0.90,
        color: isSelected ? '#0f172a' : stroke,
        fillOpacity: isSelected ? 0.55 : 0.40
      };
    }

    const pred = getPrediction(dName);
    const hasFrozenPrediction = isFrozenPrediction(pred);

    const riskLevel = String(pred?.riskLevel || pred?.risk_level || '').toUpperCase();
    const theme = RISK_THEME[riskLevel] || (hasFrozenPrediction ? RISK_THEME.LOW : RISK_THEME.DEFAULT);

    return {
      fillColor: theme.fill,
      weight: isSelected ? 3.0 : 1.75,
      opacity: 0.90,
      color: isSelected ? '#0f172a' : theme.stroke,
      fillOpacity: isSelected ? 0.55 : 0.42
    };
  };

  const handleDistrictClick = (districtName) => {
    setActiveDistrict(districtName);
    if (onSelectDistrict) {
      onSelectDistrict(districtName);
    }
  };

  const onEachDistrictFeature = (feature, layer) => {
    const dName = feature.properties.name;
    layer.on({
      click: () => handleDistrictClick(dName)
    });
  };

  // Helper to format source nicely without inventing data
  const formatSource = (sourceStr) => {
    if (!sourceStr) return 'â€”';
    if (sourceStr === 'AEGIS-CORE_M11_FROZEN') return 'AEGIS-CORE Frozen M11 LSTM';
    if (sourceStr === 'mock') return 'Legacy mock source';
    if (sourceStr === 'flask_ml' || sourceStr === 'flask') return 'Legacy Flask source';
    return sourceStr;
  };

  return (
    <div className="w-full h-full relative">
      {/* User Location Warning Banner (User mode only) */}
      {effectiveMode === 'user' && locationError && (
        <div className="absolute top-4 left-4 right-16 z-[1000] bg-amber-600/95 text-white px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 text-xs font-semibold animate-fade-in border border-amber-400/30">
          <span className="material-symbols-outlined text-lg">warning</span>
          <span>{locationError}</span>
        </div>
      )}

      {/* Outside Supported Districts Notice (User mode only) */}
      {effectiveMode === 'user' && !locationError && isOutsideSupportedDistricts && (
        <div className="absolute top-4 left-4 right-16 z-[1000] bg-blue-600/95 text-white px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 text-xs font-semibold animate-fade-in border border-blue-400/30">
          <span className="material-symbols-outlined text-lg">location_off</span>
          <span>Your current location is outside the active AegisCore prediction districts.</span>
        </div>
      )}

      <MapContainer
        center={KARNATAKA_BOUNDS.center}
        zoom={KARNATAKA_BOUNDS.zoom}
        zoomControl={false}
        className="w-full h-full"
      >
        {/* OpenStreetMap Tile Layer - Clean Light Neutral Terrain */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={18}
          minZoom={5}
        />

        {/* Custom Controls */}
        <MapControls
          center={KARNATAKA_BOUNDS.center}
          zoom={KARNATAKA_BOUNDS.zoom}
          userLocation={userLocation}
          onLocateSuccess={(loc) => {
            setUserLocation(loc);
            evaluateUserPosition({ coords: { latitude: loc[0], longitude: loc[1] } });
          }}
        />

        {/* Complete Karnataka State Administrative Boundary Outline (Thin, Light, Clean) */}
        <GeoJSON
          data={KARNATAKA_STATE_BOUNDARY_GEOJSON}
          style={{
            fillColor: 'transparent',
            fillOpacity: 0,
            weight: effectiveMode === 'shelters' ? 1.25 : 1.75,
            color: effectiveMode === 'shelters' ? '#64748b' : '#334155',
            dashArray: '4, 4',
            opacity: effectiveMode === 'shelters' ? 0.55 : 0.70
          }}
          interactive={false}
        />

        {/* Subtle State Name Label */}
        <Marker
          position={[14.6, 75.8]}
          icon={L.divIcon({
            className: 'karnataka-state-label-marker',
            html: `<div style="
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 0.25em;
              color: #475569;
              opacity: 0.55;
              text-transform: uppercase;
              white-space: nowrap;
              pointer-events: none;
              user-select: none;
            ">KARNATAKA</div>`,
            iconSize: [120, 20],
            iconAnchor: [60, 10]
          })}
          interactive={false}
        />

        {/* 4 Supported Karnataka District Risk GeoJSON Polygons */}
        <GeoJSON
          key={`districts-${KARNATAKA_DISTRICTS_GEOJSON.features.map(f => `${f.properties.name}:${getPrediction(f.properties.name)?.riskLevel}`).join('-')}-${activeDistrict}`}
          ref={geoJsonRef}
          data={KARNATAKA_DISTRICTS_GEOJSON}
          style={getDistrictStyle}
          onEachFeature={(feature, layer) => {
            onEachDistrictFeature(feature, layer);
          }}
        />

        {/* District Centroid Rounded Pills with Dynamic Risk / Shelter Capacity Color & Bold Text */}
        {KARNATAKA_DISTRICTS_GEOJSON.features.map(f => {
          const dName = f.properties.name;
          const center = f.properties.center || [14.5, 75.5];

          let pillBg, pillTextColor, pillLabel;
          if (effectiveMode === 'shelters') {
            const strain = getDistrictShelterStrain(dName);
            pillBg = strain.pillBg;
            pillTextColor = strain.pillText;
            pillLabel = `${dName} (${strain.count} Shelters)`;
          } else {
            const pred = getPrediction(dName);
            const riskLevel = String(pred?.riskLevel || pred?.risk_level || '').toUpperCase();
            const theme = RISK_THEME[riskLevel] || (isFrozenPrediction(pred) ? RISK_THEME.LOW : RISK_THEME.DEFAULT);
            pillBg = theme.pill;
            pillTextColor = riskLevel === 'MODERATE' ? '#78350f' : '#ffffff';
            pillLabel = dName;
          }

          const isShelterMode = effectiveMode === 'shelters';
          return (
            <Marker
              key={`label-${dName}-${effectiveMode}`}
              position={center}
              zIndexOffset={isShelterMode ? 200 : 300}
              icon={L.divIcon({
                className: 'district-pill-marker',
                html: `<div style="
                  background-color: ${pillBg};
                  color: ${pillTextColor};
                  font-family: 'Inter', system-ui, -apple-system, sans-serif;
                  font-size: 11px;
                  font-weight: 700;
                  letter-spacing: 0.02em;
                  padding: 4px 12px;
                  border-radius: 9999px;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
                  border: 1.5px solid rgba(255, 255, 255, 0.9);
                  white-space: nowrap;
                  width: max-content;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  transform: translate(-50%, ${isShelterMode ? '22px' : '-50%'});
                  pointer-events: none;
                  user-select: none;
                ">${pillLabel}</div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
              })}
              interactive={false}
            />
          );
        })}

        {/* Shelter Pin Markers */}
        {shelters.map((shelter) => {
          if (!shelter.location || !shelter.location.coordinates) return null;
          const [lng, lat] = shelter.location.coordinates;
          const availableBeds = Math.max(0, (shelter.capacity || 0) - (shelter.occupied || 0));

          return (
            <Marker key={shelter.id} position={[lat, lng]} icon={createShelterIcon(shelter.status)}>
              <Popup className="clean-light-popup">
                <div className="p-1 space-y-2 min-w-[210px] text-slate-800 font-sans">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <h4 className="font-bold text-slate-900 text-sm">{shelter.name}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        shelter.status === 'OPEN'
                          ? 'bg-green-100 text-green-800'
                          : shelter.status === 'NEAR_CAPACITY'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {shelter.status}
                    </span>
                  </div>
                  <div className="text-xs space-y-1.5 font-medium text-slate-600">
                    <p><span className="text-slate-900 font-semibold">District:</span> {shelter.district}</p>
                    <p><span className="text-slate-900 font-semibold">Capacity:</span> {shelter.occupied} / {shelter.capacity} occupied</p>
                    <p><span className="text-emerald-600 font-bold">Beds Available:</span> {availableBeds}</p>
                    {shelter.contactPhone && <p><span className="text-slate-900 font-semibold">Contact:</span> {shelter.contactPhone}</p>}
                    {effectiveMode === 'shelters' && (
                      <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">Facilities:</span> Food, Water, Medical Care
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Active SOS Emergency Markers (ADMIN & RISK MODES ONLY - PRIVACY ENFORCED) */}
        {(effectiveMode === 'dashboard' || effectiveMode === 'risk') &&
          sosRequests.map((sos) => {
            if (!sos.location || !sos.location.coordinates) return null;
            const [lng, lat] = sos.location.coordinates;

            return (
              <Marker key={sos.id} position={[lat, lng]} icon={createSosIcon()}>
                <Popup className="clean-light-popup">
                  <div className="p-1 space-y-2 min-w-[230px] text-slate-800 font-sans">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="font-mono font-bold text-red-600 text-xs">
                        SOS #{sos.id ? sos.id.slice(-4).toUpperCase() : 'CALL'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                        {sos.status}
                      </span>
                    </div>
                    <div className="text-xs space-y-1 text-slate-600">
                      <p><span className="text-slate-900 font-semibold">Emergency Type:</span> {sos.emergencyType || sos.type}</p>
                      <p><span className="text-slate-900 font-semibold">District:</span> {sos.district}</p>
                      <p><span className="text-slate-900 font-semibold">Requester:</span> {sos.name || 'Citizen'} ({sos.phone || 'N/A'})</p>
                      <p><span className="text-slate-900 font-semibold">Latitude:</span> {lat.toFixed(5)}</p>
                      <p><span className="text-slate-900 font-semibold">Longitude:</span> {lng.toFixed(5)}</p>
                      {sos.details && <p className="text-[11px] text-slate-700 italic mt-1 bg-slate-50 p-1.5 rounded border border-slate-200">"{sos.details}"</p>}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* User GPS Location Marker */}
        {userLocation && (
          <Marker position={userLocation} icon={createUserLocationIcon()}>
            <Popup className="clean-light-popup">
              <div className="text-xs font-semibold text-blue-700 p-1">
                📍 Your Current Location
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Standardized Bottom-Right Floating Map Legend: Shelter Operations strain vs Operational Disaster Risk */}
      {effectiveMode === 'shelters' ? (
        <div className="absolute bottom-6 right-6 z-[1000] map-dock-card px-3.5 py-3 w-[190px] text-on-surface space-y-2 animate-fade-in pointer-events-auto">
          <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5">
            <span className="material-symbols-outlined text-emerald-400 text-sm">domain</span>
            <h4 className="font-semibold text-on-surface text-[11px] tracking-wide uppercase font-label-caps">
              Shelter Logistics
            </h4>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }}></span>
                Available (&lt;50%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#eab308' }}></span>
                Moderate (50–84%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f97316' }}></span>
                High Strain (≥85%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#64748b' }}></span>
                No Shelters
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-6 right-6 z-[1000] map-dock-card px-3.5 py-3 w-[190px] text-on-surface space-y-2 animate-fade-in pointer-events-auto">
          <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5">
            <span className="material-symbols-outlined text-primary text-sm">verified</span>
            <h4 className="font-semibold text-on-surface text-[11px] tracking-wide uppercase font-label-caps">
              Operational Risk
            </h4>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#ef4444' }}></span>
                Critical Danger
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f97316' }}></span>
                High Alert
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#eab308' }}></span>
                Moderate Advisory
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-on-surface-variant font-sans">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#38bdf8' }}></span>
                Low Risk
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODE 1: ADMIN DASHBOARD MAP OVERLAY (Concise "Situation at a glance")
         ══════════════════════════════════════════════════════════════════════ */}
      {effectiveMode === 'dashboard' && activeDistrict && (
        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-gray-200 shadow-xl max-w-xs w-full text-slate-800 font-sans space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 uppercase tracking-wide">
              <span className="material-symbols-outlined text-blue-600 text-lg">domain</span>
              {activeDistrict}
            </h3>
            <button
              type="button"
              onClick={() => setActiveDistrict(null)}
              className="text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1.5 text-xs font-semibold">
            {(() => {
              const pred = getPrediction(activeDistrict);
              const probability = getEventProbability(pred);
              const riskLevel = String(pred?.riskLevel || pred?.risk_level || 'LOW').toUpperCase();
              const theme = RISK_THEME[riskLevel] || RISK_THEME.DEFAULT;

              return (
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Operational Risk</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${theme.badge}`}>
                      {riskLevel}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">
                      {activeDistrict === 'Belagavi' || pred?.decisionEngine === 'secondary_physical_rf'
                        ? 'Physical RF Prob'
                        : 'LSTM Probability'}
                    </span>
                    <span className="font-mono text-slate-900 font-bold text-[11px]">
                      {probability !== null ? probability.toFixed(4) : '—'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-500">Monitored Hazard:</span>
                    <span className="font-mono text-slate-700 font-semibold uppercase">
                      {pred?.predictionType || pred?.prediction_type || 'FLOOD'}
                    </span>
                  </div>

                  {pred?.calibratedThreshold !== undefined && (
                    <div className="flex justify-between items-center text-[10px] pt-1 border-t border-gray-200/60">
                      <span className="text-gray-500">Decision Threshold:</span>
                      <span className="font-mono text-slate-700 font-semibold">
                        {pred.calibratedThreshold}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[9px] pt-0.5 text-gray-400">
                    <span>Engine:</span>
                    <span className="font-medium text-slate-600">
                      {activeDistrict === 'Belagavi' || pred?.decisionEngine === 'secondary_physical_rf'
                        ? 'Secondary Dynamic RF'
                        : 'Frozen LSTM + L2'}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODE 2: ADMIN RISK & DISASTER MAP DETAILED INSPECTOR OVERLAY
         ══════════════════════════════════════════════════════════════════════ */}
      {effectiveMode === 'risk' && activeDistrict && (
        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-gray-200 shadow-2xl max-w-sm w-full text-slate-800 font-sans space-y-4 animate-fade-in max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2 uppercase tracking-wide">
                <span className="material-symbols-outlined text-red-600 text-xl">travel_explore</span>
                {activeDistrict}
              </h3>
              <span className="text-[10px] text-gray-500 font-medium">CALIBRATED DISASTER INTELLIGENCE</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveDistrict(null)}
              className="text-gray-400 hover:text-gray-700 text-sm font-bold w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          {(() => {
            const pred = getPrediction(activeDistrict);
            const activeHazards = districtHazardPredictions[activeDistrict] || {};
            const floodPred = activeHazards.flood || (String(pred?.predictionType).toUpperCase() === 'FLOOD' ? pred : null);
            const landslidePred = activeHazards.landslide || (String(pred?.predictionType).toUpperCase() === 'LANDSLIDE' ? pred : null);

            // Authoritative overall risk level and decision for district hero badge
            const riskLevel = String(pred?.riskLevel || pred?.risk_level || 'LOW').toUpperCase();
            const theme = RISK_THEME[riskLevel] || RISK_THEME.DEFAULT;

            // Helper to get active escalation threshold & comparison text
            const getEscalationInfo = (hazardPred, currentTier, evalValue) => {
              const t = hazardPred?.thresholds;
              if (t) {
                if (currentTier === 'LOW') {
                  const cut = Number(t.moderate);
                  return {
                    cutoff: cut,
                    nextTier: 'Moderate',
                    text: `Evaluated: ${evalValue.toFixed(4)} < Moderate cutoff ${cut.toFixed(4)} → LOW (Normal)`
                  };
                }
                if (currentTier === 'MODERATE') {
                  const cut = Number(t.high);
                  const lower = Number(t.moderate);
                  return {
                    cutoff: cut,
                    nextTier: 'High',
                    text: `Evaluated: ${evalValue.toFixed(4)} < High cutoff ${cut.toFixed(4)} (≥ ${lower.toFixed(4)} Mod) → MODERATE`
                  };
                }
                if (currentTier === 'HIGH') {
                  const cut = Number(t.critical);
                  const lower = Number(t.high);
                  return {
                    cutoff: cut,
                    nextTier: 'Critical',
                    text: `Evaluated: ${evalValue.toFixed(4)} < Critical cutoff ${cut.toFixed(4)} (≥ ${lower.toFixed(4)} High) → HIGH`
                  };
                }
                const cut = Number(t.critical);
                return {
                  cutoff: cut,
                  nextTier: 'Critical',
                  text: `Evaluated: ${evalValue.toFixed(4)} ≥ Critical cutoff ${cut.toFixed(4)} → CRITICAL`
                };
              }
              const cut = hazardPred?.nextThreshold !== undefined && hazardPred?.nextThreshold !== null
                ? Number(hazardPred.nextThreshold)
                : (hazardPred?.calibratedThreshold !== undefined && hazardPred?.calibratedThreshold !== null ? Number(hazardPred.calibratedThreshold) : null);
              const nextTier = hazardPred?.nextThresholdTier
                ? hazardPred.nextThresholdTier.charAt(0) + hazardPred.nextThresholdTier.slice(1).toLowerCase()
                : (currentTier === 'LOW' ? 'Moderate' : 'High');
              const op = cut !== null && evalValue >= cut ? '≥' : '<';
              return {
                cutoff: cut,
                nextTier,
                text: cut !== null ? `Evaluated: ${evalValue.toFixed(4)} ${op} Cutoff ${cut.toFixed(4)} → ${currentTier}` : null
              };
            };

            // Flood Metrics
            const floodRaw = floodPred?.rawProbability !== undefined 
              ? floodPred.rawProbability 
              : (floodPred?.riskScore ?? null);
            const floodCalib = floodPred?.calibratedProbability !== undefined && floodPred?.calibratedProbability !== null
              ? floodPred.calibratedProbability
              : (activeDistrict === 'Belagavi' ? floodRaw : null);
            const floodRiskLevel = floodPred?.riskLevel || 'LOW';
            const floodEvalVal = floodCalib !== null ? floodCalib : (floodRaw !== null ? floodRaw : 0);
            const floodEscalation = floodPred ? getEscalationInfo(floodPred, floodRiskLevel, floodEvalVal) : null;

            // Landslide Metrics
            const lsRaw = landslidePred?.rawProbability !== undefined
              ? landslidePred.rawProbability
              : (landslidePred?.riskScore ?? null);
            const lsCalib = landslidePred?.calibratedProbability !== undefined && landslidePred?.calibratedProbability !== null
              ? landslidePred.calibratedProbability
              : lsRaw;
            const lsRiskLevel = landslidePred?.riskLevel || 'LOW';
            const lsEvalVal = lsCalib !== null ? lsCalib : (lsRaw !== null ? lsRaw : 0);
            const lsEscalation = landslidePred ? getEscalationInfo(landslidePred, lsRiskLevel, lsEvalVal) : null;

            return (
              <div className="space-y-3">
                {/* CALIBRATED RISK BADGE HERO */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                      Operational Tier
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {pred?.operationalDecision ? pred.operationalDecision.replace(/_/g, ' ') : theme.label}
                    </span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-xs border ${theme.badge}`}>
                    {riskLevel}
                  </span>
                </div>

                {/* FLOOD MODEL OUTPUT */}
                <div className="bg-red-50/60 p-3 rounded-xl border border-red-100 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-red-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-red-600">
                        water_drop
                      </span>
                      Flood Model
                    </span>

                    <span className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                      !floodPred ? 'bg-gray-100 text-gray-500 border-gray-200' :
                      floodRiskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800 border-red-200' :
                      floodRiskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                      floodRiskLevel === 'MODERATE' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                      'bg-sky-100 text-sky-800 border-sky-200'
                    }`}>
                      {floodPred ? `${floodRiskLevel} RISK` : 'NO DATA'}
                    </span>
                  </div>

                  {floodPred ? (
                    <div className="bg-white p-2.5 rounded-lg border border-red-100 shadow-sm space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 text-center divide-x divide-gray-100">
                        {/* 1. Raw Probability */}
                        <div className="px-1">
                          <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block">
                            {activeDistrict === 'Belagavi' || floodPred?.decisionEngine === 'secondary_physical_rf'
                              ? 'Physical RF'
                              : 'Raw LSTM'}
                          </span>
                          <span className="font-bold text-slate-800 text-sm font-mono block mt-0.5">
                            {floodRaw !== null ? floodRaw.toFixed(4) : '—'}
                          </span>
                          <span className="text-[8px] text-gray-400 block truncate" title={activeDistrict === 'Belagavi' && floodPred?.rawProbability !== undefined ? `LSTM Audit Raw: ${floodPred.rawProbability.toFixed(4)}` : 'Uncalibrated Scale'}>
                            {activeDistrict === 'Belagavi' && floodPred?.rawProbability !== undefined
                              ? `LSTM: ${floodPred.rawProbability.toFixed(3)}`
                              : 'Raw Scale'}
                          </span>
                        </div>

                        {/* 2. Calibrated Probability (Operating Decision Value) */}
                        <div className="px-1 bg-amber-50/70 rounded border border-amber-200/80 py-0.5">
                          <span className="text-amber-800 text-[9px] font-bold uppercase tracking-wider block">
                            Calibrated P
                          </span>
                          <span className="font-extrabold text-amber-950 text-sm font-mono block mt-0.5">
                            {floodCalib !== null ? floodCalib.toFixed(4) : (floodRaw !== null ? floodRaw.toFixed(4) : '—')}
                          </span>
                          <span className="text-[8px] text-amber-700 font-bold block truncate">
                            Evaluated Value
                          </span>
                        </div>

                        {/* 3. Next Escalation Cutoff */}
                        <div className="px-1">
                          <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block">
                            Next Cutoff
                          </span>
                          <span className="font-bold text-red-700 text-sm font-mono block mt-0.5">
                            {floodEscalation?.cutoff !== null && floodEscalation?.cutoff !== undefined ? Number(floodEscalation.cutoff).toFixed(4) : '—'}
                          </span>
                          <span className="text-[8px] text-gray-500 block truncate font-medium">
                            {floodEscalation?.nextTier ? `To ${floodEscalation.nextTier}` : 'Cutoff'}
                          </span>
                        </div>
                      </div>

                      {/* Clear evaluation comparison callout */}
                      {floodEscalation?.text && (
                        <div className="text-[10px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 flex items-center justify-between font-mono">
                          <span className="truncate">
                            {floodEscalation.text}
                          </span>
                          <span className={`text-[9px] font-sans font-bold px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                            floodRiskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                            floodRiskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                            floodRiskLevel === 'MODERATE' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-sky-100 text-sky-800'
                          }`}>
                            {floodRiskLevel}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic bg-white/80 p-2 rounded border border-gray-200">
                      No flood prediction record available for this district.
                    </p>
                  )}

                  <div className="text-[10px] text-gray-500 font-mono">
                    Engine: {activeDistrict === 'Belagavi' || floodPred?.decisionEngine === 'secondary_physical_rf'
                      ? 'Secondary Physical Classifier (Random Forest 26-Feature Dynamic Engine)'
                      : (floodPred ? formatSource(floodPred.modelSource || floodPred.source) : '—')}
                  </div>
                </div>

                {/* LANDSLIDE MODEL OUTPUT */}
                <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-amber-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-amber-600">
                        landslide
                      </span>
                      Landslide Model
                    </span>

                    {activeDistrict === 'Belagavi' || activeDistrict === 'Bagalkot' ? (
                      <span className="font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[10px]">
                        NOT APPLICABLE
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                        !landslidePred ? 'bg-gray-100 text-gray-500 border-gray-200' :
                        lsRiskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800 border-red-200' :
                        lsRiskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                        lsRiskLevel === 'MODERATE' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                        'bg-sky-100 text-sky-800 border-sky-200'
                      }`}>
                        {landslidePred ? `${lsRiskLevel} RISK` : 'NO DATA'}
                      </span>
                    )}
                  </div>

                  {activeDistrict === 'Belagavi' || activeDistrict === 'Bagalkot' ? (
                    <p className="text-[11px] text-gray-500 italic bg-white/80 p-2 rounded border border-gray-200">
                      Landslide prediction is not available for {activeDistrict}.
                    </p>
                  ) : landslidePred ? (
                    <div className="bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 text-center divide-x divide-gray-100">
                        {/* 1. Raw Probability */}
                        <div className="px-1">
                          <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block">
                            Raw LSTM
                          </span>
                          <span className="font-bold text-slate-800 text-sm font-mono block mt-0.5">
                            {lsRaw !== null ? lsRaw.toFixed(4) : '—'}
                          </span>
                          <span className="text-[8px] text-gray-400 block truncate">
                            Raw Scale
                          </span>
                        </div>

                        {/* 2. Calibrated Probability (Operating Decision Value) */}
                        <div className="px-1 bg-amber-50/70 rounded border border-amber-200/80 py-0.5">
                          <span className="text-amber-800 text-[9px] font-bold uppercase tracking-wider block">
                            Calibrated P
                          </span>
                          <span className="font-extrabold text-amber-950 text-sm font-mono block mt-0.5">
                            {lsCalib !== null ? lsCalib.toFixed(4) : '—'}
                          </span>
                          <span className="text-[8px] text-amber-700 font-bold block truncate">
                            Evaluated Value
                          </span>
                        </div>

                        {/* 3. Next Escalation Cutoff */}
                        <div className="px-1">
                          <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block">
                            Next Cutoff
                          </span>
                          <span className="font-bold text-amber-700 text-sm font-mono block mt-0.5">
                            {lsEscalation?.cutoff !== null && lsEscalation?.cutoff !== undefined ? Number(lsEscalation.cutoff).toFixed(4) : '—'}
                          </span>
                          <span className="text-[8px] text-gray-500 block truncate font-medium">
                            {lsEscalation?.nextTier ? `To ${lsEscalation.nextTier}` : 'Cutoff'}
                          </span>
                        </div>
                      </div>

                      {/* Clear evaluation comparison callout */}
                      {lsEscalation?.text && (
                        <div className="text-[10px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 flex items-center justify-between font-mono">
                          <span className="truncate">
                            {lsEscalation.text}
                          </span>
                          <span className={`text-[9px] font-sans font-bold px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                            lsRiskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                            lsRiskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                            lsRiskLevel === 'MODERATE' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-sky-100 text-sky-800'
                          }`}>
                            {lsRiskLevel}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic bg-white/80 p-2 rounded border border-gray-200">
                      No landslide prediction record available for {activeDistrict}.
                    </p>
                  )}

                  {landslidePred && (
                    <div className="text-[10px] text-gray-500 font-mono">
                      Engine: {formatSource(landslidePred.modelSource || landslidePred.source)} (30-day sequence)
                    </div>
                  )}
                </div>

                {/* CALIBRATION RELIABILITY & SAMPLE SIZE NOTICE */}
                {pred?.calibrationDetails && (
                  <div className="bg-blue-50/70 p-2.5 rounded-xl border border-blue-100 text-[11px] text-slate-700 space-y-1">
                    <div className="flex items-center gap-1 text-blue-900 font-bold">
                      <span className="material-symbols-outlined text-sm text-blue-600">info</span>
                      Statistical Reliability: {pred.calibrationDetails.statisticalReliability}
                    </div>
                    {pred.calibrationDetails.sampleSize && (
                      <div className="text-[10px] text-gray-600">
                        Calibrated on {pred.calibrationDetails.sampleSize.total_days} days ({pred.calibrationDetails.sampleSize.flood_days || pred.calibrationDetails.sampleSize.landslide_days} positive events).
                      </div>
                    )}
                    {pred.calibrationDetails.operationalNotes && (
                      <p className="text-[10px] text-slate-600 leading-tight">
                        {pred.calibrationDetails.operationalNotes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TELEMETRY */}

          {/* METADATA: FORECAST WINDOW, SOURCE & TECHNICAL AUDIT */}
          <div className="space-y-1.5 text-xs text-gray-600 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-500">Forecast Window:</span>
              <span className="text-slate-900 font-bold">
                {districtPredictions[activeDistrict]?.timeWindowHours ?? districtPredictions[activeDistrict]?.time_window_hours ?? '—'}{districtPredictions[activeDistrict]?.timeWindowHours !== undefined || districtPredictions[activeDistrict]?.time_window_hours !== undefined ? ' hours' : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Prediction Source:</span>
              <span className="text-blue-700 font-bold">
                {formatSource(districtPredictions[activeDistrict]?.source)}
              </span>
            </div>
            {/* Technical Pipeline Health (Debug / Audit Only - Visually Distinct & Neutral) */}
            <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1.5 border-t border-gray-200/80 mt-1">
              <span>Pipeline Status:</span>
              <span className="text-gray-500 bg-gray-200/60 border border-gray-300/50 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold">
                API Completed ({districtPredictions[activeDistrict]?.predictionStatus || 'success'})
              </span>
            </div>
            {districtPredictions[activeDistrict]?.createdAt && (
              <div className="flex justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-200/50 mt-1">
                <span>Updated:</span>
                <span>{new Date(districtPredictions[activeDistrict].createdAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* RECOMMENDATIONS */}
          <div className="space-y-2 pt-1 border-t border-gray-200">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
              RECOMMENDED ACTIONS
            </span>
            <ul className="text-xs text-slate-700 space-y-1 list-disc pl-4 font-medium">
              {districtPredictions[activeDistrict]?.recommendations && districtPredictions[activeDistrict].recommendations.length > 0 ? (
                districtPredictions[activeDistrict].recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)
              ) : (
                <li className="list-none pl-0 text-gray-500 italic">
                  No model-generated recommendations are available.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MODE 4: USER RISK MAP SIMPLIFIED SAFETY CARD
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {effectiveMode === 'user' && activeDistrict && (
        <div className="absolute top-16 left-4 z-[1000] bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-gray-200 shadow-xl max-w-xs w-full text-slate-800 font-sans space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <div>
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">YOUR AREA</span>
              <h3 className="font-bold text-slate-900 text-base uppercase tracking-wide">
                {activeDistrict}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveDistrict(null)}
              className="text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              âœ•
            </button>
          </div>

          {/* Frozen Model Output */}
          {(() => {
            const pred = getPrediction(activeDistrict);
            const probability = getEventProbability(pred);
            const predictionType = String(
              pred?.predictionType || pred?.prediction_type || ''
            ).toUpperCase();

            return (
              <div className="space-y-2 text-xs font-semibold">
                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <span className="text-gray-600">Risk Assessment</span>
                  <span className={`px-2.5 py-0.5 rounded font-bold text-xs border ${
                    riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800 border-red-200' :
                    riskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                    riskLevel === 'MODERATE' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                    'bg-sky-100 text-sky-800 border-sky-200'
                  }`}>
                    {riskLevel} RISK
                  </span>
                </div>

                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <span className="text-gray-600">Event Probability</span>
                  <span className="font-mono text-slate-900 font-bold">
                    {probability !== null ? probability.toFixed(4) : 'â€”'}
                  </span>
                </div>

                <div className="text-[10px] text-gray-500 font-mono">
                  Model: {isFrozenPrediction(pred) ? 'AEGIS-CORE M11 Frozen' : 'â€”'}
                  {predictionType ? ` Â· ${predictionType}` : ''}
                </div>
              </div>
            );
          })()}

          {/* Environmental Summary */}

          {/* Nearby Shelters Count */}
          <div className="flex justify-between items-center bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-emerald-600">home_work</span>
              Nearby Safe Shelters
            </span>
            <span className="bg-emerald-600 text-white font-mono font-bold px-2 py-0.5 rounded-full text-xs">
              {shelters.filter((s) => s.district === activeDistrict && (s.status === 'OPEN' || s.status === 'NEAR_CAPACITY')).length}
            </span>
          </div>

          {/* Recommended Action */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 space-y-1 text-xs text-blue-950 font-medium">
            <span className="font-bold text-blue-800 text-[10px] uppercase tracking-wider block">RECOMMENDED ACTION</span>
            <p>Monitor official alerts and prepare for possible evacuation if conditions escalate.</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODE 5: SHELTER LOGISTICS DISTRICT INSPECTOR OVERLAY
         ══════════════════════════════════════════════════════════════════════ */}
      {effectiveMode === 'shelters' && activeDistrict && (
        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-gray-200 shadow-xl max-w-xs w-full text-slate-800 font-sans space-y-3 animate-fade-in pointer-events-auto">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 uppercase tracking-wide">
              <span className="material-symbols-outlined text-emerald-600 text-lg">domain</span>
              {activeDistrict}
            </h3>
            <button
              type="button"
              onClick={() => setActiveDistrict(null)}
              className="text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {(() => {
            const strain = getDistrictShelterStrain(activeDistrict);
            return (
              <div className="space-y-2 text-xs font-semibold">
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Capacity Strain</span>
                    <span
                      className="px-2 py-0.5 rounded font-bold text-[10px] text-white"
                      style={{ backgroundColor: strain.pillBg }}
                    >
                      {strain.label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Registered Shelters</span>
                    <span className="font-mono text-slate-900 font-bold">{strain.count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Capacity</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {strain.totalOccupied} / {strain.totalCapacity} ({strain.utilizationPct}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-700 font-bold">
                    <span>Available Beds</span>
                    <span className="font-mono">{strain.availableBeds}</span>
                  </div>
                </div>

                {strain.shelters.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                      District Shelters
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                      {strain.shelters.map((s) => (
                        <div key={s.id} className="p-1.5 rounded bg-gray-50 border border-gray-200 text-[11px] flex justify-between items-center">
                          <span className="font-medium truncate max-w-[150px]">{s.name}</span>
                          <span className="font-mono text-[10px] text-gray-600 shrink-0">
                            {s.occupied}/{s.capacity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
