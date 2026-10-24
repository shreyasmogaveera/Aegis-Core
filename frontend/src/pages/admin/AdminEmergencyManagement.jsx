import React, { useEffect, useState } from 'react';
import socketService from '../../services/socketService';

export const AdminEmergencyManagement = () => {
  const [data, setData] = useState({ metrics: {}, sosRequests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const computeMetrics = (list) => {
    const pending = list.filter((s) => s.status === 'PENDING').length;
    const responding = list.filter((s) => s.status === 'RESPONDING' || s.status === 'IN_PROGRESS').length;
    const resolved24h = list.filter((s) => s.status === 'RESOLVED').length;
    const cancelled = list.filter((s) => s.status === 'CANCELLED').length;
    return {
      totalActive: pending + responding,
      pending,
      responding,
      resolved24h,
      cancelled
    };
  };

  const fetchSosRequests = () => {
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/admin/sos`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch admin SOS requests`);
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[AdminEmergencyManagement] Error:', err);
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSosRequests();

    const unsubscribeCreated = socketService.onSosCreated((newSos) => {
      setData((prevData) => {
        const existingIndex = prevData.sosRequests.findIndex((s) => s.id === newSos.id);
        let updatedList;
        if (existingIndex >= 0) {
          updatedList = [...prevData.sosRequests];
          updatedList[existingIndex] = newSos;
        } else {
          updatedList = [newSos, ...prevData.sosRequests];
        }
        return {
          metrics: computeMetrics(updatedList),
          sosRequests: updatedList
        };
      });
    });

    const unsubscribeUpdated = socketService.onSosUpdated((updatedSos) => {
      setData((prevData) => {
        const existingIndex = prevData.sosRequests.findIndex((s) => s.id === updatedSos.id);
        let updatedList;
        if (existingIndex >= 0) {
          updatedList = [...prevData.sosRequests];
          updatedList[existingIndex] = updatedSos;
        } else {
          updatedList = [updatedSos, ...prevData.sosRequests];
        }
        return {
          metrics: computeMetrics(updatedList),
          sosRequests: updatedList
        };
      });
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, []);

  const handleUpdateStatus = (sosId, newStatus) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${baseUrl}/admin/sos/${sosId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('aegis_token')}`
      },
      body: JSON.stringify({ status: newStatus })
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to update SOS status to ${newStatus}`);
        return res.json();
      })
      .then(() => {
        fetchSosRequests();
      })
      .catch((err) => {
        alert(err.message);
      });
  };

  const metrics = data.metrics || {};

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-lg text-xl font-bold text-on-surface flex items-center gap-3">
            Emergency Response
            <span className="bg-primary/10 text-primary font-label-caps text-[10px] px-2 py-0.5 rounded border border-primary/20 flex items-center gap-1.5 tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              LIVE
            </span>
          </h1>
        </div>
        <div className="glass-panel px-4 py-2 rounded-lg flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">ACTIVE SOS</span>
            <span className={`font-data-mono text-xl font-bold ${metrics.totalActive > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
              {metrics.totalActive !== undefined ? metrics.totalActive : 0}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Loading / Error Indicators */}
          {loading && (
            <div className="bg-surface-container/60 text-xs text-primary px-4 py-3 rounded-lg border border-primary/20 backdrop-blur-md font-data-mono">
              Receiving live distress beacon signals from MongoDB emergency matrix...
            </div>
          )}

          {error && (
            <div className="bg-error/15 text-xs text-error px-4 py-3 rounded-lg border border-error/30 backdrop-blur-md font-data-mono">
              Emergency Signal Matrix Error: {error}
            </div>
          )}

          {/* Status Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={`glass-panel p-4 rounded-xl ${metrics.pending > 0 ? 'critical-border' : 'border border-white/5'}`}>
              <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 flex items-center gap-2 uppercase tracking-wider">
                <span className={`status-dot ${metrics.pending > 0 ? 'bg-error' : 'bg-on-surface-variant/40'}`}></span>PENDING
              </div>
              <div className={`font-data-mono text-3xl font-bold ${metrics.pending > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                {metrics.pending !== undefined ? metrics.pending : 0}
              </div>
            </div>
            <div className={`glass-panel p-4 rounded-xl ${metrics.responding > 0 ? 'high-border' : 'border border-white/5'}`}>
              <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 flex items-center gap-2 uppercase tracking-wider">
                <span className={`status-dot ${metrics.responding > 0 ? 'bg-tertiary-container' : 'bg-on-surface-variant/40'}`}></span>RESPONDING
              </div>
              <div className={`font-data-mono text-3xl font-bold ${metrics.responding > 0 ? 'text-tertiary-container' : 'text-on-surface-variant'}`}>
                {metrics.responding !== undefined ? metrics.responding : 0}
              </div>
            </div>
            <div className="glass-panel p-4 rounded-xl border border-white/5">
              <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 flex items-center gap-2 uppercase tracking-wider">
                <span className="status-dot bg-on-surface-variant/40"></span>CANCELLED
              </div>
              <div className="font-data-mono text-3xl font-bold text-on-surface-variant">
                {metrics.cancelled !== undefined ? metrics.cancelled : 0}
              </div>
            </div>
            <div className="glass-panel p-4 rounded-xl border border-white/5">
              <div className="font-label-caps text-[11px] text-on-surface-variant mb-1 flex items-center gap-2 uppercase tracking-wider">
                <span className="status-dot bg-risk-low"></span>RESOLVED (24H)
              </div>
              <div className="font-data-mono text-3xl font-bold text-on-surface">
                {metrics.resolved24h !== undefined ? metrics.resolved24h : 0}
              </div>
            </div>
          </div>

          {/* Empty State */}
          {!loading && !error && data.sosRequests.length === 0 && (
            <div className="glass-panel p-8 text-center rounded-xl border border-white/10">
              <span className="material-symbols-outlined text-outline text-4xl mb-2">check_circle</span>
              <h3 className="font-headline-md text-base font-semibold text-on-surface">All Clear — No Active SOS Signals</h3>
              <p className="text-xs text-on-surface-variant mt-1">There are no active emergency distress calls reported in monitored sectors.</p>
            </div>
          )}

          {/* SOS Requests */}
          {data.sosRequests.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant">ACTIVE DISTRESS SIGNALS</h3>
              {data.sosRequests.map((sos) => (
                <div
                  key={sos.id}
                  className={`glass-panel p-5 rounded-xl flex gap-5 ${
                    sos.priority === 'CRITICAL' ? 'border-l-4 border-l-error' : 'border-l-4 border-l-tertiary-container'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-data-mono font-bold text-error text-sm">
                        SOS #{sos.id.slice(-4).toUpperCase()}
                      </span>
                      <span
                        className={`font-label-caps text-[9px] px-2 py-0.5 rounded font-bold ${
                          sos.status === 'PENDING'
                            ? 'bg-error/10 text-error'
                            : sos.status === 'RESPONDING' || sos.status === 'IN_PROGRESS'
                            ? 'bg-tertiary/10 text-tertiary'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {sos.status}
                      </span>
                      <span className="font-data-mono text-[10px] text-on-surface-variant">{sos.time}</span>
                    </div>
                    <h4 className="font-headline-md text-base font-semibold text-on-surface mb-1">{sos.loc}</h4>
                    <p className="text-sm text-on-surface-variant leading-relaxed mb-2">{sos.desc}</p>
                    <div className="flex items-center gap-2 text-[11px] font-data-mono text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">my_location</span>
                      {sos.coords} • Requester: {sos.name} ({sos.phone})
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 justify-center">
                    {sos.status === 'PENDING' && (
                      <button
                        onClick={() => handleUpdateStatus(sos.id, 'RESPONDING')}
                        className="bg-error text-white font-label-caps text-[11px] px-4 py-2.5 rounded-lg font-bold hover:bg-red-600 transition-colors shadow-lg shadow-error/20 flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Dispatch first responders (sets status to RESPONDING)"
                      >
                        <span className="material-symbols-outlined text-sm">local_shipping</span>
                        DISPATCH RESCUE
                      </button>
                    )}
                    {(sos.status === 'RESPONDING' || sos.status === 'IN_PROGRESS') && (
                      <button
                        onClick={() => handleUpdateStatus(sos.id, 'RESOLVED')}
                        className="bg-primary text-black font-label-caps text-[11px] px-4 py-2.5 rounded-lg font-bold hover:bg-primary-fixed transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Mark emergency resolved and close ticket"
                      >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        MARK RESOLVED
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
