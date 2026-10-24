import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const AdminProfile = () => {
  const { user, logout } = useAuth();

  // Notification Preferences State (Persisted in localStorage)
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('aegis_notif_prefs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      sos: true,
      risk: true,
      shelter: true,
      weather: false,
      system: false
    };
  });

  const [exporting, setExporting] = useState(false);
  const [modalInfo, setModalInfo] = useState(null);

  const togglePref = (key) => {
    setNotifPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('aegis_notif_prefs', JSON.stringify(next));
      return next;
    });
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
      const token = localStorage.getItem('aegis_token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch latest summary & shelters
      const [sheltersRes, summaryRes] = await Promise.all([
        fetch(`${baseUrl}/admin/shelters`, { headers }).then((r) => r.json()).catch(() => ({})),
        fetch(`${baseUrl}/admin/summary`, { headers }).then((r) => r.json()).catch(() => ({}))
      ]);

      const reportData = {
        generatedAt: new Date().toISOString(),
        platform: 'AegisCore Disaster Intelligence Platform',
        environment: 'Demonstration / Defense Review',
        operator: user?.name || 'Command Officer',
        operatorEmail: user?.email || 'admin@aegiscore.gov',
        systemStatus: {
          backendApi: 'ONLINE (Node/Express 22)',
          mlInferenceEngine: 'ONLINE (Frozen M11 LSTM Flask)',
          database: 'CONNECTED (MongoDB Atlas)',
          realTimeStream: 'CONNECTED (Socket.io)'
        },
        sheltersSummary: sheltersRes.metrics || {},
        activeDisasterIntelligence: summaryRes || {}
      };

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AegisCore_Operational_Audit_Report_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export operational report: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
        <div>
          <h1 className="font-headline-lg text-xl font-bold text-on-surface">Profile & Settings</h1>
          <p className="font-data-mono text-[11px] text-outline">Manage operator credentials, audit telemetry and system configurations</p>
        </div>
        <button
          onClick={logout}
          className="px-5 py-2.5 bg-surface-container border border-error/30 text-error font-data-mono text-data-mono rounded hover:bg-error/10 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          TERMINATE SESSION
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
        <div className="max-w-[1400px] mx-auto">
          {/* 3-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {/* Column 1: Profile & System */}
            <div className="xl:col-span-1 flex flex-col gap-6">
              {/* Profile Card */}
              <section className="glass-panel rounded-xl p-6 flex flex-col items-center text-center">
                <div className="relative w-28 h-28 mb-4">
                  <div className="w-full h-full rounded-full bg-primary/20 border-4 border-surface shadow-2xl flex items-center justify-center text-primary text-4xl font-bold">
                    {user?.name ? user.name[0] : 'A'}
                  </div>
                  <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary-container border-2 border-surface flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
                  </div>
                </div>
                <h2 className="font-headline-md text-xl font-semibold text-on-surface mb-1">
                  {user?.name || 'Command Officer'}
                </h2>
                <p className="font-data-mono text-data-mono text-primary-container mb-4">
                  {user?.email || 'admin@aegiscore.gov'}
                </p>
                <div className="flex flex-col w-full gap-2 mb-4">
                  <div className="px-3 py-2 rounded bg-surface-container border border-white/5 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-outline">location_on</span>
                    <span className="font-label-caps text-label-caps text-on-surface-variant">Karnataka State HQ</span>
                  </div>
                  <div className="px-3 py-2 rounded bg-primary/10 border border-primary/20 flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    <span className="font-label-caps text-label-caps text-primary">OPERATIONAL ADMINISTRATOR</span>
                  </div>
                </div>
                <div className="text-xs text-on-surface-variant font-data-mono">
                  Role: <span className="text-primary font-bold">{user?.role || 'admin'}</span>
                </div>
              </section>

              {/* System Status */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="font-data-mono text-data-mono text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">memory</span>
                  System Services Status
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Backend API', status: 'ONLINE', color: 'text-primary', dot: 'bg-primary' },
                    { label: 'ML Service', status: 'ONLINE', color: 'text-primary', dot: 'bg-primary' },
                    { label: 'Database', status: 'CONNECTED', color: 'text-primary', dot: 'bg-primary' },
                    { label: 'WebSocket Stream', status: 'CONNECTED', color: 'text-primary', dot: 'bg-primary' },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <span className="font-data-mono text-sm text-on-surface-variant">{s.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`status-dot ${s.dot}`}></span>
                        <span className={`font-data-mono text-sm font-bold ${s.color}`}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Settings */}
            <div className="lg:col-span-2 xl:col-span-2 flex flex-col gap-6">
              {/* Notification Preferences */}
              <div className="glass-panel rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-data-mono text-data-mono text-on-surface flex items-center gap-2 m-0">
                    <span className="material-symbols-outlined text-[18px]">notifications</span>
                    Session Notification Subscriptions
                  </h3>
                  <span className="text-[10px] font-mono text-outline">Stored locally in session</span>
                </div>
                <div className="space-y-4">
                  {[
                    { key: 'sos', label: 'Critical SOS Alerts', desc: 'Real-time WebSocket alerts for emergency distress calls' },
                    { key: 'risk', label: 'Risk Level Changes', desc: 'Automated notification when district risk level escalates' },
                    { key: 'shelter', label: 'Shelter Capacity Strain', desc: 'Alerts when registered shelter occupancy reaches near capacity' },
                    { key: 'weather', label: 'Severe Weather Advisories', desc: 'Extreme precipitation alerts based on telemetry sensors' },
                    { key: 'system', label: 'Model Service Health', desc: 'Diagnostics when secondary model fallback is invoked' },
                  ].map((pref) => {
                    const isEnabled = Boolean(notifPrefs[pref.key]);
                    return (
                      <div key={pref.key} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                        <div>
                          <div className="font-data-mono text-sm text-on-surface">{pref.label}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5">{pref.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePref(pref.key)}
                          className={`w-10 h-5 rounded-full ${isEnabled ? 'bg-primary-container' : 'bg-surface-container-highest'} relative cursor-pointer transition-colors shrink-0`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Security & Authentication */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="font-data-mono text-data-mono text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">security</span>
                  Security & Authentication State
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-white/5">
                    <div>
                      <div className="font-data-mono text-sm text-on-surface">Authentication Protocol</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">Cryptographic JWT bearer authentication with bcrypt password hashing</div>
                    </div>
                    <span className="font-label-caps text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-bold">JWT ACTIVE</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-white/5">
                    <div>
                      <div className="font-data-mono text-sm text-on-surface">Session Expiration</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">JWT token lifespan before re-authentication is required</div>
                    </div>
                    <span className="font-data-mono text-sm text-on-surface">24 Hours</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-data-mono text-sm text-on-surface">Access Tier</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">Role-based access control protecting admin endpoints</div>
                    </div>
                    <span className="font-data-mono text-sm text-primary font-bold">Administrator (Full Access)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Quick Actions */}
            <div className="xl:col-span-1 flex flex-col gap-6">
              <div className="glass-panel rounded-xl p-6">
                <h3 className="font-data-mono text-data-mono text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={handleExportReport}
                    disabled={exporting}
                    className="w-full py-2.5 bg-primary/10 text-primary font-data-mono text-data-mono rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 border border-primary/20 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    {exporting ? 'GENERATING...' : 'Export Operational Report'}
                  </button>
                  <button
                    onClick={() => setModalInfo({
                      title: 'Automated Database Backups',
                      body: 'Database backups are managed automatically through MongoDB Atlas cluster point-in-time snapshots every 6 hours, retaining 7 days of operational state history.'
                    })}
                    className="w-full py-2.5 bg-surface-container text-on-surface font-data-mono text-data-mono rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">backup</span>
                    Backup Diagnostics
                  </button>
                  <button
                    onClick={() => setModalInfo({
                      title: 'Platform Architecture & Config',
                      body: 'AegisCore v1.0.0 Architecture:\n• Backend: Node.js 22 + Express 4.19 + Socket.io 4.8\n• Database: MongoDB Atlas (Mongoose 8.3)\n• ML Inference Service: Flask Python 3.12 (TensorFlow/Keras + Scikit-Learn)\n• Frontend: Vite 8.2 + React 18 + Leaflet 1.9'
                    })}
                    className="w-full py-2.5 bg-surface-container text-on-surface font-data-mono text-data-mono rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">tune</span>
                    System Stack Specs
                  </button>
                </div>
              </div>

              {/* Activity Log */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="font-data-mono text-data-mono text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">history</span>
                  Recent System Events
                </h3>
                <div className="space-y-3">
                  {[
                    { action: 'Calibrated multi-hazard prediction evaluated — Kodagu', time: 'Active' },
                    { action: 'Updated shelter logistics & occupancy directory', time: '1h ago' },
                    { action: 'Synchronized telemetry sensor feeds — 4 Districts', time: '2h ago' },
                    { action: 'Authenticated administrator session (HQ Command)', time: 'Today' },
                  ].map((log, i) => (
                    <div key={i} className="py-2 border-b border-white/5 last:border-0">
                      <div className="font-data-mono text-[12px] text-on-surface">{log.action}</div>
                      <div className="font-data-mono text-[10px] text-on-surface-variant mt-0.5">{log.time}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Info Dialog Modal */}
      {modalInfo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full rounded-xl p-6 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-headline-md text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">info</span>
                {modalInfo.title}
              </h3>
              <button onClick={() => setModalInfo(null)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <pre className="text-xs font-data-mono text-on-surface-variant whitespace-pre-wrap leading-relaxed mb-4">
              {modalInfo.body}
            </pre>
            <button
              onClick={() => setModalInfo(null)}
              className="w-full py-2 bg-primary text-black font-bold font-data-mono text-xs rounded hover:bg-primary-fixed cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
