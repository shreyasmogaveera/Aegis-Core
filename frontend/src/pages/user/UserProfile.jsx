import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const UserProfile = () => {
  const { user, logout } = useAuth();

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-headline-md text-xl font-bold text-on-surface">Citizen Profile & Emergency Settings</h1>
        <p className="text-xs text-on-surface-variant font-data-mono mt-1">Manage personal info and emergency contacts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-2xl border border-primary/30">
              {user?.name ? user.name[0] : 'C'}
            </div>
            <div>
              <h2 className="font-headline-md font-semibold text-on-surface text-lg">{user?.name || 'Citizen User'}</h2>
              <p className="text-sm text-on-surface-variant font-data-mono">{user?.email}</p>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex justify-between text-sm font-data-mono">
              <span className="text-on-surface-variant">Account Category</span>
              <span className="text-primary font-bold uppercase">CITIZEN</span>
            </div>
            <div className="flex justify-between text-sm font-data-mono">
              <span className="text-on-surface-variant">Registered Phone</span>
              <span className="text-on-surface">{user?.phone || '+91 9876543210'}</span>
            </div>
            <div className="flex justify-between text-sm font-data-mono">
              <span className="text-on-surface-variant">Primary Zone</span>
              <span className="text-on-surface">Kodagu District</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full py-3 bg-error/10 text-error border border-error/30 rounded-lg font-data-mono text-xs tracking-wider font-bold hover:bg-error hover:text-white transition-colors mt-2"
          >
            LOGOUT ACCOUNT
          </button>
        </div>

        {/* Emergency Contacts */}
        <div className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col gap-4">
          <h2 className="font-headline-md font-semibold text-on-surface text-base flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">call</span>
            Emergency Helplines
          </h2>
          <div className="space-y-3">
            <div className="p-3.5 bg-surface-container rounded-lg border border-white/5 flex justify-between items-center text-xs font-data-mono">
              <div>
                <div className="text-on-surface font-bold">KSDMA Control Room</div>
                <div className="text-on-surface-variant">State Disaster Management Authority</div>
              </div>
              <span className="text-primary font-bold text-sm bg-primary/10 px-3 py-1 rounded">1070</span>
            </div>
            <div className="p-3.5 bg-surface-container rounded-lg border border-white/5 flex justify-between items-center text-xs font-data-mono">
              <div>
                <div className="text-on-surface font-bold">District Emergency Ops</div>
                <div className="text-on-surface-variant">Kodagu Control Room</div>
              </div>
              <span className="text-primary font-bold text-sm bg-primary/10 px-3 py-1 rounded">08272-221077</span>
            </div>
            <div className="p-3.5 bg-surface-container rounded-lg border border-white/5 flex justify-between items-center text-xs font-data-mono">
              <div>
                <div className="text-on-surface font-bold">Fire & Rescue Service</div>
                <div className="text-on-surface-variant">Emergency Medical & Fire</div>
              </div>
              <span className="text-primary font-bold text-sm bg-primary/10 px-3 py-1 rounded">101</span>
            </div>
            <div className="p-3.5 bg-surface-container rounded-lg border border-white/5 flex justify-between items-center text-xs font-data-mono">
              <div>
                <div className="text-on-surface font-bold">Police Command</div>
                <div className="text-on-surface-variant">Law Enforcement Response</div>
              </div>
              <span className="text-primary font-bold text-sm bg-primary/10 px-3 py-1 rounded">112</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
