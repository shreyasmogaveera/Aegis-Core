import React, { useEffect, useState } from 'react';
import socketService from '../../services/socketService';
import { AegisMap } from '../../components/map/AegisMap';

export const AdminDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [districtTelemetry, setDistrictTelemetry] = useState(null);
  const [hazardFilter, setHazardFilter] = useState('all'); // 'all', 'flood', 'landslide', 'rain'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSummary = () => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/admin/dashboard/summary`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to load admin dashboard summary`);
        }
        return res.json();
      })
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[AdminDashboard] Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSummary();

    const unsubSosCreated = socketService.onSosCreated(() => fetchSummary());
    const unsubSosUpdated = socketService.onSosUpdated(() => fetchSummary());
    const unsubAlertCreated = socketService.onAlertCreated(() => fetchSummary());
    const unsubAlertUpdated = socketService.onAlertUpdated(() => fetchSummary());
    const unsubShelterUpdated = socketService.onShelterUpdated(() => fetchSummary());
    const unsubPredictionUpdated = socketService.onPredictionUpdated(() => fetchSummary());

    return () => {
      unsubSosCreated();
      unsubSosUpdated();
      unsubAlertCreated();
      unsubAlertUpdated();
      unsubShelterUpdated();
      unsubPredictionUpdated();
    };
  }, []);

  // Fetch telemetry when user explicitly clicks a district on the map
  useEffect(() => {
    if (!selectedDistrict) {
      setDistrictTelemetry(null);
      return;
    }
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const token = localStorage.getItem('aegis_token');
    fetch(`${baseUrl}/environmental/latest?district=${encodeURIComponent(selectedDistrict)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setDistrictTelemetry(data);
      })
      .catch((err) => console.warn('[AdminDashboard] District telemetry fetch error:', err));
  }, [selectedDistrict]);

  return (
    <div className="flex-1 h-full overflow-hidden grid grid-cols-1 lg:grid-cols-12">
      {/* ══════ Left Panel (Map + Header) — 8 columns ══════ */}
      <div className="lg:col-span-8 h-full flex flex-col border-r border-white/10 overflow-hidden">
        {/* Inline Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-headline-md text-xl font-bold text-on-surface">Tactical Overview</h1>
            <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <span className="font-label-caps text-[10px] text-primary font-bold tracking-wider">LIVE FEED</span>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-white/10">
              <span className="material-symbols-outlined text-sm text-primary">location_on</span>
              <span className="text-xs font-mono font-semibold text-on-surface">
                {selectedDistrict ? selectedDistrict.toUpperCase() : 'KARNATAKA OVERVIEW'}
              </span>
            </div>
          </div>
        </header>

        {/* Map Area */}
        <div className="flex-1 relative overflow-hidden">
          {/* OpenStreetMap + Leaflet Tactical Map Engine */}
          <div className="absolute inset-0">
            <AegisMap
              mode="dashboard"
              selectedDistrict={selectedDistrict}
              onSelectDistrict={(districtName) => setSelectedDistrict(districtName)}
              hazardFilter={hazardFilter}
            />
          </div>

          {/* Loading / Error Banner Overlay */}
          {loading && (
            <div className="absolute top-4 left-6 bg-surface/80 text-xs text-primary px-3 py-1.5 rounded-lg border border-primary/20 backdrop-blur-md z-30 font-mono">
              Connecting to MongoDB Tactical Feed...
            </div>
          )}
          {error && (
            <div className="absolute top-4 left-6 bg-error/20 text-xs text-error px-3 py-1.5 rounded-lg border border-error/30 backdrop-blur-md z-30 font-mono">
              Live Feed Connection Warning: {error}
            </div>
          )}

          {/* Map Layer Controls (Top-Right) */}
          <div className="absolute top-6 right-6 flex flex-col gap-2 z-20">
            <div className="glass-panel p-1.5 rounded-xl flex flex-col gap-2 shadow-2xl">
              <button
                type="button"
                onClick={() => setHazardFilter('all')}
                title="Multi-Hazard Dominant View (Default)"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  hazardFilter === 'all'
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 font-bold'
                    : 'hover:bg-white/10 text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined">layers</span>
              </button>
              <button
                type="button"
                onClick={() => setHazardFilter('flood')}
                title="Flood Threat Layer"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  hazardFilter === 'flood'
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 font-bold'
                    : 'hover:bg-white/10 text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined">water_drop</span>
              </button>
              <button
                type="button"
                onClick={() => setHazardFilter('landslide')}
                title="Landslide Threat Layer"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  hazardFilter === 'landslide'
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 font-bold'
                    : 'hover:bg-white/10 text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined">landslide</span>
              </button>
              <button
                type="button"
                onClick={() => setHazardFilter('rain')}
                title="Rainfall Telemetry Severity Layer"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  hazardFilter === 'rain'
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/25 font-bold'
                    : 'hover:bg-white/10 text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined">rainy</span>
              </button>
            </div>
          </div>

          {/* Environmental Condition Cards (Docked Bottom-Left with District Association) */}
          <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2 max-w-xl">
            {/* Visual District Telemetry Header Link */}
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container/90 backdrop-blur-md border border-white/10 rounded-lg text-xs font-sans text-on-surface w-fit shadow-lg">
              <span className="material-symbols-outlined text-sm text-primary">location_on</span>
              <span className="font-semibold text-on-surface text-[11px]">
                {selectedDistrict ? `${selectedDistrict} Station Telemetry` : 'Karnataka Baseline Telemetry'}
              </span>
              <span className="text-[9px] text-outline font-mono uppercase tracking-wider">
                {selectedDistrict ? 'LOCAL SENSORS' : 'REGIONAL AVG'}
              </span>
            </div>

            {/* 3 Unified Telemetry Cards */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
              {/* Rainfall */}
              <div className="glass-panel p-3.5 rounded-xl border border-white/10 min-w-[150px] flex-1">
                <div className="flex items-center gap-1.5 mb-1 text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm">rainy</span>
                  <span className="font-label-caps text-[10px] font-semibold tracking-wider text-outline uppercase">RAINFALL</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-bold text-on-surface">
                    {selectedDistrict && districtTelemetry?.rainfall_mm !== undefined
                      ? `${districtTelemetry.rainfall_mm}mm`
                      : summary?.environmentalSummary?.rainfall_mm !== undefined
                      ? `${summary.environmentalSummary.rainfall_mm}mm`
                      : '—'}
                  </span>
                  <span className="text-outline text-[9px] font-mono">TELEMETRY</span>
                </div>
              </div>

              {/* River Level */}
              <div className="glass-panel p-3.5 rounded-xl border border-white/10 min-w-[150px] flex-1">
                <div className="flex items-center gap-1.5 mb-1 text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm">waves</span>
                  <span className="font-label-caps text-[10px] font-semibold tracking-wider text-outline uppercase">RIVER LEVEL</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-bold text-on-surface">
                    {selectedDistrict && districtTelemetry?.river_level_m !== undefined
                      ? `${districtTelemetry.river_level_m}m`
                      : summary?.environmentalSummary?.river_level_m !== undefined
                      ? `${summary.environmentalSummary.river_level_m}m`
                      : '—'}
                  </span>
                  <span className="text-outline text-[9px] font-mono">STAGE</span>
                </div>
              </div>

              {/* Soil Moisture */}
              <div className="glass-panel p-3.5 rounded-xl border border-white/10 min-w-[150px] flex-1">
                <div className="flex items-center gap-1.5 mb-1 text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-sm">grass</span>
                  <span className="font-label-caps text-[10px] font-semibold tracking-wider text-outline uppercase">SOIL MOISTURE</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-mono font-bold text-on-surface">
                    {selectedDistrict && districtTelemetry?.volumetric_sm !== undefined
                      ? `${districtTelemetry.volumetric_sm} m³/m³`
                      : selectedDistrict && districtTelemetry?.soil_moisture_pct !== undefined
                      ? `${(districtTelemetry.soil_moisture_pct / 100).toFixed(3)} m³/m³`
                      : summary?.environmentalSummary?.soil_moisture_pct !== undefined
                      ? `${(summary.environmentalSummary.soil_moisture_pct / 100).toFixed(3)} m³/m³`
                      : '0.352 m³/m³'}
                  </span>
                  <span className="text-outline text-[9px] font-mono">VOLUMETRIC</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ Right Panel (Intelligence Feed) — 4 columns ══════ */}
      <aside className="lg:col-span-4 h-full bg-surface-container-low flex flex-col overflow-hidden border-l border-white/10">
        {/* Feed Header */}
        <div className="p-5 border-b border-white/10 shrink-0 flex items-center justify-between">
          <h2 className="font-headline-md text-base font-semibold flex items-center gap-2 text-on-surface">
            <span className="material-symbols-outlined text-primary text-lg">crisis_alert</span>
            Intelligence Feed
          </h2>
          <span className="text-[10px] font-mono text-outline">LIVE BROADCASTS</span>
        </div>

        {/* Alert Items — Hero Emphasis on Top Alert */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5 custom-scrollbar">
          {summary?.intelligenceFeed && summary.intelligenceFeed.length > 0 ? (
            summary.intelligenceFeed.map((item, idx) => {
              const isLive = item.createdAt
                ? (Date.now() - new Date(item.createdAt).getTime()) < 60 * 60 * 1000
                : false;
              const isHero = idx === 0;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border flex gap-3 transition-all ${
                    isHero
                      ? 'bg-surface-container border-primary/30 shadow-lg ring-1 ring-primary/20'
                      : 'bg-surface-container/70 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div
                    className={`w-1 rounded-full shrink-0 ${
                      item.riskLevel === 'CRITICAL' ? 'bg-error' : item.riskLevel === 'HIGH' ? 'bg-tertiary-container' : 'bg-primary'
                    }`}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <h4 className={`font-semibold text-on-surface ${isHero ? 'text-sm' : 'text-xs'}`}>
                        {item.district} — {item.title || item.riskLevel}
                      </h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {isLive && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-error/15 text-error border border-error/25 tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
                            LIVE
                          </span>
                        )}
                        <div className="flex items-center gap-1 font-mono text-[10px] text-on-surface-variant">
                          <span className="text-primary font-medium" title={item.updatedAt ? `Last evaluated: ${new Date(item.updatedAt).toLocaleString()}` : ''}>
                            Verified {item.lastEvaluated || item.timeAgo}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {item.description}
                    </p>
                    {item.technicalDetails && (
                      <div className="mt-2 text-[10px] font-mono bg-black/30 border border-white/5 rounded-md px-2 py-1 text-on-surface-variant flex flex-wrap gap-x-3 gap-y-1">
                        <span><span className="text-outline">Decision:</span> <span className="text-on-surface font-medium">{item.technicalDetails.operationalDecision}</span></span>
                        <span><span className="text-outline">P(Event):</span> <span className="text-primary font-medium">{(item.technicalDetails.calibratedProbability * 100).toFixed(1)}%</span></span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="glass-panel p-6 text-center rounded-xl border border-white/10 text-on-surface-variant text-xs">
              No active intelligence advisories.
            </div>
          )}
        </div>

        {/* Emergency Status Panel (Calm Neutral Zero-State Treatment) */}
        {(() => {
          const activeSos = summary?.activeSosCount !== undefined ? summary.activeSosCount : 0;
          const pendingCount = summary?.sosBreakdown?.pending !== undefined ? summary.sosBreakdown.pending : 0;
          const respondingCount = summary?.sosBreakdown?.responding !== undefined ? summary.sosBreakdown.responding : 0;
          const isDanger = activeSos > 0;

          return (
            <div className="p-5 bg-surface-container border-t border-white/10 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-label-caps text-xs font-semibold flex items-center gap-2 text-on-surface">
                  <span className={`material-symbols-outlined text-sm ${isDanger ? 'text-error' : 'text-primary'}`}>
                    emergency
                  </span>
                  EMERGENCY STATUS
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    isDanger ? 'bg-error/15 text-error border border-error/25' : 'bg-white/5 text-on-surface-variant border border-white/10'
                  }`}
                >
                  {activeSos} ACTIVE
                </span>
              </div>

              <div className={`p-4 rounded-xl border transition-all ${
                isDanger ? 'glass-panel border-error/30' : 'bg-surface-container-high/40 border-white/5'
              }`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-outline uppercase tracking-wider font-label-caps">
                      ACTIVE SOS REQUESTS
                    </span>
                    <span className={`text-3xl font-mono font-bold ${isDanger ? 'text-error' : 'text-on-surface-variant'}`}>
                      {activeSos}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className={`flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono ${
                      pendingCount > 0 ? 'bg-error/10 text-error font-bold' : 'bg-white/5 text-on-surface-variant'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${pendingCount > 0 ? 'bg-error' : 'bg-outline'}`}></div>
                      <span>{pendingCount} Pending</span>
                    </div>
                    <div className={`flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono ${
                      respondingCount > 0 ? 'bg-tertiary/10 text-tertiary font-bold' : 'bg-white/5 text-on-surface-variant'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${respondingCount > 0 ? 'bg-tertiary' : 'bg-outline'}`}></div>
                      <span>{respondingCount} Responding</span>
                    </div>
                  </div>
                </div>

                <a
                  href="/admin/emergency"
                  className="text-primary text-[11px] font-semibold flex items-center justify-center gap-1 w-full py-2 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  VIEW ALL EMERGENCIES
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </a>
              </div>
            </div>
          );
        })()}
      </aside>
    </div>
  );
};
