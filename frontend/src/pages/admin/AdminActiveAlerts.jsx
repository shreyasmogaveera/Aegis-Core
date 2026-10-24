import React, { useEffect, useState } from 'react';
import socketService from '../../services/socketService';

export const AdminActiveAlerts = () => {
  const [data, setData] = useState({ summary: {}, alerts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusTab, setStatusTab] = useState('ACTIVE'); // 'ACTIVE' | 'RESOLVED'

  // Form state for creating a new alert
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hazardType, setHazardType] = useState('FLOOD');
  const [riskLevel, setRiskLevel] = useState('HIGH');
  const [district, setDistrict] = useState('Kodagu');
  const [affectedPopulation, setAffectedPopulation] = useState(5000);
  const [submitting, setSubmitting] = useState(false);

  const computeSummary = (activeList, prevSummary = {}) => {
    return {
      ...prevSummary,
      totalActive: activeList.length,
      critical: activeList.filter((a) => a.riskLevel === 'CRITICAL').length,
      high: activeList.filter((a) => a.riskLevel === 'HIGH').length,
      moderate: activeList.filter((a) => a.riskLevel === 'MODERATE').length,
      low: activeList.filter((a) => a.riskLevel === 'LOW').length
    };
  };

  const fetchAlerts = (tab = statusTab) => {
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/admin/alerts?status=${tab}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch admin alerts`);
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[AdminActiveAlerts] Error:', err);
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAlerts(statusTab);
  }, [statusTab]);

  useEffect(() => {
    const unsubscribeCreated = socketService.onAlertCreated((newAlert) => {
      setData((prevData) => {
        if (statusTab === 'ACTIVE') {
          if (newAlert.status !== 'ACTIVE') return prevData;
          const existingIndex = prevData.alerts.findIndex((a) => a.id === newAlert.id);
          const updatedList = existingIndex >= 0
            ? prevData.alerts.map((a, i) => i === existingIndex ? newAlert : a)
            : [newAlert, ...prevData.alerts];
          return {
            summary: computeSummary(updatedList, prevData.summary),
            alerts: updatedList
          };
        } else {
          if (newAlert.status !== 'RESOLVED') return prevData;
          return {
            ...prevData,
            alerts: [newAlert, ...prevData.alerts]
          };
        }
      });
    });

    const unsubscribeUpdated = socketService.onAlertUpdated((updatedAlert) => {
      setData((prevData) => {
        if (statusTab === 'ACTIVE') {
          // If alert is no longer ACTIVE, remove from visible active list
          if (updatedAlert.status !== 'ACTIVE') {
            const updatedList = prevData.alerts.filter((a) => a.id !== updatedAlert.id);
            return {
              summary: computeSummary(updatedList, prevData.summary),
              alerts: updatedList
            };
          }
          const existingIndex = prevData.alerts.findIndex((a) => a.id === updatedAlert.id);
          const updatedList = existingIndex >= 0
            ? prevData.alerts.map((a, i) => i === existingIndex ? updatedAlert : a)
            : [updatedAlert, ...prevData.alerts];
          return {
            summary: computeSummary(updatedList, prevData.summary),
            alerts: updatedList
          };
        } else {
          if (updatedAlert.status === 'RESOLVED') {
            const existingIndex = prevData.alerts.findIndex((a) => a.id === updatedAlert.id);
            const updatedList = existingIndex >= 0
              ? prevData.alerts.map((a, i) => i === existingIndex ? updatedAlert : a)
              : [updatedAlert, ...prevData.alerts];
            return {
              ...prevData,
              alerts: updatedList
            };
          } else {
            return {
              ...prevData,
              alerts: prevData.alerts.filter((a) => a.id !== updatedAlert.id)
            };
          }
        }
      });
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [statusTab]);

  const handleCreateAlert = (e) => {
    e.preventDefault();
    setSubmitting(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

    fetch(`${baseUrl}/admin/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      },
      body: JSON.stringify({
        title,
        description,
        hazardType,
        riskLevel,
        district,
        affectedPopulation: Number(affectedPopulation) || 0
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create alert');
        return res.json();
      })
      .then(() => {
        setShowCreateModal(false);
        setTitle('');
        setDescription('');
        setSubmitting(false);
        fetchAlerts();
      })
      .catch((err) => {
        alert(err.message);
        setSubmitting(false);
      });
  };

  const handleDeactivateAlert = (alertId) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

    fetch(`${baseUrl}/admin/alerts/${alertId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      },
      body: JSON.stringify({ status: 'RESOLVED' })
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to deactivate alert');
        return res.json();
      })
      .then(() => {
        fetchAlerts();
      })
      .catch((err) => {
        alert(err.message);
      });
  };

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col relative">
      {/* Top Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">notifications_active</span>
            Active Alerts
          </h1>
          <span className="bg-primary/10 text-primary font-label-caps text-[10px] px-2 py-0.5 rounded border border-primary/20 flex items-center gap-1.5 tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            LIVE
          </span>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary-container text-on-primary-container font-label-caps text-label-caps py-2.5 px-5 rounded-lg hover:bg-primary-fixed transition-colors flex items-center gap-2 font-bold cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">add_alert</span>
          ISSUE ALERT
        </button>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Loading / Error States */}
          {loading && (
            <div className="bg-surface-container/60 text-xs text-primary px-4 py-3 rounded-lg border border-primary/20 backdrop-blur-md font-data-mono">
              Loading active alerts from MongoDB control database...
            </div>
          )}

          {error && (
            <div className="bg-error/15 text-xs text-error px-4 py-3 rounded-lg border border-error/30 backdrop-blur-md font-data-mono">
              Alert Control Feed Error: {error}
            </div>
          )}

          {/* Tab Switcher: Active Alerts vs Resolved/History */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 bg-surface-container/60 p-1 rounded-xl border border-white/10 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setStatusTab('ACTIVE')}
                className={`font-label-caps text-xs px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  statusTab === 'ACTIVE'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-sm">notifications_active</span>
                ACTIVE ALERTS ({data.summary?.totalActive !== undefined ? data.summary.totalActive : 0})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('RESOLVED')}
                className={`font-label-caps text-xs px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  statusTab === 'RESOLVED'
                    ? 'bg-white/15 text-on-surface shadow-sm border border-white/15'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined text-sm">history</span>
                RESOLVED ARCHIVE ({data.summary?.totalResolved !== undefined ? data.summary.totalResolved : 0})
              </button>
            </div>
            <span className="text-[11px] font-mono text-outline hidden sm:inline-block">
              {statusTab === 'ACTIVE'
                ? `Showing ${data.alerts.length} active emergency advisory${data.alerts.length === 1 ? '' : 's'}`
                : `Showing ${data.alerts.length} historical resolved advisory${data.alerts.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* Alert Summary Cards (Active Mode) */}
          {statusTab === 'ACTIVE' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-panel p-4 rounded-xl">
                <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 uppercase tracking-wider">TOTAL ACTIVE</div>
                <div className={`font-data-mono text-3xl font-bold ${data.summary?.totalActive > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                  {data.summary?.totalActive !== undefined ? data.summary.totalActive : 0}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-xl">
                <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 uppercase tracking-wider">CRITICAL</div>
                <div className={`font-data-mono text-3xl font-bold ${data.summary?.critical > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                  {data.summary?.critical !== undefined ? data.summary.critical : 0}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-xl">
                <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 uppercase tracking-wider">HIGH</div>
                <div className={`font-data-mono text-3xl font-bold ${data.summary?.high > 0 ? 'text-tertiary-container' : 'text-on-surface-variant'}`}>
                  {data.summary?.high !== undefined ? data.summary.high : 0}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-xl">
                <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 uppercase tracking-wider">MODERATE</div>
                <div className={`font-data-mono text-3xl font-bold ${data.summary?.moderate > 0 ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {data.summary?.moderate !== undefined ? data.summary.moderate : 0}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && data.alerts.length === 0 && (
            <div className="glass-panel p-8 text-center rounded-xl border border-white/10">
              <span className="material-symbols-outlined text-outline text-4xl mb-2">check_circle</span>
              <h3 className="font-headline-md text-base font-semibold text-on-surface">
                {statusTab === 'ACTIVE' ? 'All Clear — No Active Alerts' : 'No Resolved Alerts'}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1">
                {statusTab === 'ACTIVE'
                  ? 'There are currently no active emergency alerts in monitored sectors.'
                  : 'No past alerts have been recorded as resolved in the archive.'}
              </p>
            </div>
          )}

          {/* Alert List */}
          <div className="space-y-4">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`glass-panel p-5 rounded-xl flex gap-4 transition-all hover:border-white/20 ${
                  alert.severity === 'critical'
                    ? 'critical-border'
                    : alert.severity === 'high'
                    ? 'high-border'
                    : 'moderate-border'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`font-label-caps text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        alert.severity === 'critical'
                          ? 'bg-error/10 text-error'
                          : alert.severity === 'high'
                          ? 'bg-tertiary-container/10 text-tertiary-container'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {alert.type || alert.riskLevel}
                    </span>
                    <div className="flex items-center gap-2 font-data-mono text-[10px] text-on-surface-variant">
                      <span title={alert.createdAt ? `First detected: ${new Date(alert.createdAt).toLocaleString()}` : ''}>
                        Active: {alert.activeSince || alert.time}
                      </span>
                      <span>•</span>
                      <span className="text-primary font-medium" title={alert.updatedAt ? `Last evaluated: ${new Date(alert.updatedAt).toLocaleString()}` : ''}>
                        Verified {alert.lastEvaluated || alert.time}
                      </span>
                    </div>
                    {alert.status === 'ACTIVE' && alert.updatedAt && (Date.now() - new Date(alert.updatedAt).getTime()) < 60 * 60 * 1000 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/15 text-primary border border-primary/25 tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        LIVE
                      </span>
                    )}
                    <span
                      className={`font-label-caps text-[9px] px-1.5 py-0.5 rounded ${
                        alert.status === 'ACTIVE'
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'bg-white/10 text-on-surface-variant'
                      }`}
                    >
                      {alert.status}
                    </span>
                  </div>
                  <h3 className="font-headline-md text-base font-semibold text-on-surface mb-1">{alert.title}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-2">{alert.desc || alert.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-data-mono text-on-surface-variant">
                    <span className="flex items-center gap-1 text-primary">
                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                      {alert.affectedZone || alert.district}
                    </span>
                    {alert.affectedPopulation > 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1" title={alert.populationBasis || 'Estimated figure, not verified against official DDMP records'}>
                          <span className="material-symbols-outlined text-[14px]">groups</span>
                          ~{alert.affectedPopulation.toLocaleString()} est. pop. (unverified estimate)
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span>{alert.district}</span>
                  </div>
                  {alert.technicalDetails && (
                    <div className="mt-2 text-[10px] font-data-mono bg-black/40 border border-white/5 rounded-md px-2.5 py-1.5 text-on-surface-variant flex flex-wrap gap-x-4 gap-y-1">
                      <span><span className="text-outline">Decision:</span> <span className="text-on-surface font-semibold">{alert.technicalDetails.operationalDecision}</span></span>
                      <span><span className="text-outline">Calibrated P:</span> <span className="text-primary font-semibold">{(alert.technicalDetails.calibratedProbability * 100).toFixed(1)}%</span></span>
                      <span><span className="text-outline">Threshold:</span> <span className="text-on-surface font-semibold">{(alert.technicalDetails.calibratedThreshold * 100).toFixed(1)}%</span></span>
                      <span><span className="text-outline">Reliability:</span> <span className="text-tertiary-container font-semibold">{alert.technicalDetails.statisticalReliability}</span></span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {alert.status === 'ACTIVE' ? (
                    <button
                      onClick={() => handleDeactivateAlert(alert.id)}
                      className="bg-error/10 text-error font-label-caps text-[10px] px-3 py-1.5 rounded-lg hover:bg-error/20 transition-colors font-bold"
                    >
                      RESOLVE
                    </button>
                  ) : (
                    <span className="font-label-caps text-[9px] px-2.5 py-1 rounded bg-white/5 text-outline border border-white/10 text-center">
                      RESOLVED
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modal for Creating an Alert */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg rounded-xl p-6 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">add_alert</span>
                Issue Emergency Alert
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateAlert} className="space-y-4 text-xs font-data-mono">
              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">Alert Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Flash Flood Advisory"
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">District</label>
                <input
                  type="text"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Kodagu"
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Hazard Type</label>
                  <select
                    value={hazardType}
                    onChange={(e) => setHazardType(e.target.value)}
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="FLOOD">FLOOD</option>
                    <option value="LANDSLIDE">LANDSLIDE</option>
                    <option value="HEAVY_RAINFALL">HEAVY RAINFALL</option>
                    <option value="GENERAL">GENERAL</option>
                    <option value="INFRASTRUCTURE">INFRASTRUCTURE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1 uppercase font-bold">Risk Level</label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value)}
                    className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MODERATE">MODERATE</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">Affected Population</label>
                <input
                  type="number"
                  value={affectedPopulation}
                  onChange={(e) => setAffectedPopulation(e.target.value)}
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1 uppercase font-bold">Description</label>
                <textarea
                  rows="3"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed evacuation instructions or cautionary notice..."
                  className="w-full bg-surface-container border border-white/10 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 font-bold"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded bg-primary text-black font-bold hover:bg-primary-fixed disabled:opacity-50"
                >
                  {submitting ? 'ISSUING...' : 'BROADCAST ALERT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
