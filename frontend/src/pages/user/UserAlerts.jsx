import React, { useEffect, useState } from 'react';
import socketService from '../../services/socketService';

export const UserAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTechnical, setExpandedTechnical] = useState({});

  const toggleTechnical = (id) => {
    setExpandedTechnical((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/alerts`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load active alerts`);
        return res.json();
      })
      .then((data) => {
        setAlerts(data.alerts || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[UserAlerts] Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });

    const unsubscribeCreated = socketService.onAlertCreated((newAlert) => {
      if (newAlert.status === 'ACTIVE') {
        setAlerts((prevAlerts) => {
          const exists = prevAlerts.some((a) => a.id === newAlert.id);
          if (exists) {
            return prevAlerts.map((a) => (a.id === newAlert.id ? newAlert : a));
          }
          return [newAlert, ...prevAlerts];
        });
      }
    });

    const unsubscribeUpdated = socketService.onAlertUpdated((updatedAlert) => {
      setAlerts((prevAlerts) => {
        if (updatedAlert.status !== 'ACTIVE') {
          return prevAlerts.filter((a) => a.id !== updatedAlert.id);
        }
        const exists = prevAlerts.some((a) => a.id === updatedAlert.id);
        if (exists) {
          return prevAlerts.map((a) => (a.id === updatedAlert.id ? updatedAlert : a));
        }
        return [updatedAlert, ...prevAlerts];
      });
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">notifications_active</span>
            Alerts & Emergency Notifications
          </h1>
          <p className="text-xs text-on-surface-variant font-sans mt-1">
            Automated hazard advisories from AegisCore's calibrated prediction engine
          </p>
        </div>
      </div>

      {loading && (
        <div className="bg-surface-container/60 text-xs text-primary px-4 py-3 rounded-lg border border-primary/20 backdrop-blur-md font-data-mono">
          Fetching live calibrated hazard advisories from MongoDB...
        </div>
      )}

      {error && (
        <div className="bg-error/15 text-xs text-error px-4 py-3 rounded-lg border border-error/30 backdrop-blur-md font-data-mono">
          Broadcast Connection Error: {error}
        </div>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className="glass-panel p-8 text-center rounded-xl border border-white/10">
          <span className="material-symbols-outlined text-outline text-4xl mb-2">check_circle</span>
          <h3 className="font-headline-md text-base font-semibold text-on-surface">All Clear — No Active Alerts</h3>
          <p className="text-xs text-on-surface-variant mt-1">There are currently no active hazard advisories for your sector.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`glass-panel p-6 rounded-xl flex gap-4 transition-all hover:border-white/20 ${
              alert.severity === 'critical'
                ? 'critical-border'
                : alert.severity === 'high'
                ? 'high-border'
                : 'moderate-border'
            }`}
          >
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <span
                  className={`font-label-caps text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    alert.severity === 'critical'
                      ? 'bg-error/10 text-error'
                      : alert.severity === 'high'
                      ? 'bg-tertiary-container/10 text-tertiary-container'
                      : alert.severity === 'moderate'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-white/10 text-on-surface-variant'
                  }`}
                >
                  {alert.riskLevel || alert.severity} ADVISORY
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
              </div>
              <h3 className="font-headline-md font-semibold text-on-surface text-base mb-2">{alert.title}</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">{alert.desc || alert.description}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 font-data-mono text-[10px] text-outline">
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[13px] text-primary">location_on</span>
                  <span>{alert.affectedZone || alert.district}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTechnical(alert.id)}
                  className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-white/5"
                  title="View technical model calibration and sourcing details"
                >
                  <span className="material-symbols-outlined text-[13px] text-primary">verified</span>
                  <span>Technical Details</span>
                  <span
                    className="material-symbols-outlined text-[13px] transition-transform duration-200"
                    style={{ transform: expandedTechnical[alert.id] ? 'rotate(180deg)' : 'none' }}
                  >
                    expand_more
                  </span>
                </button>
              </div>

              {expandedTechnical[alert.id] && (
                <div className="mt-3 pt-3 border-t border-white/5 bg-black/20 p-2.5 rounded-lg space-y-1.5 text-[10px] font-data-mono text-on-surface-variant">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-outline uppercase tracking-wider">Prediction Engine:</span>
                    <span className="text-on-surface text-right font-medium">{alert.source || 'AegisCore Prediction Engine'}</span>
                  </div>
                  {alert.populationBasis && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-outline uppercase tracking-wider">Demographic Baseline:</span>
                      <span className="text-on-surface text-right">{alert.populationBasis}</span>
                    </div>
                  )}
                  {alert.technicalDetails?.operationalDecision && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-outline uppercase tracking-wider">Decision Logic:</span>
                      <span className="text-on-surface text-right">{alert.technicalDetails.operationalDecision}</span>
                    </div>
                  )}
                  {alert.technicalDetails?.calibratedProbability !== undefined && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-outline uppercase tracking-wider">Model Probability:</span>
                      <span className="text-on-surface text-right">{(alert.technicalDetails.calibratedProbability * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {alert.technicalDetails?.statisticalReliability && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-outline uppercase tracking-wider">Reliability:</span>
                      <span className="text-on-surface text-right">{alert.technicalDetails.statisticalReliability}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
