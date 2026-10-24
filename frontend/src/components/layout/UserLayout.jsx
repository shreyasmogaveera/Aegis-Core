import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const UserLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/user/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/user/risk-map', label: 'Risk Map', icon: 'map' },
    { to: '/user/alerts', label: 'Alerts', icon: 'notifications' },
    { to: '/user/emergency', label: 'Emergency SOS', icon: 'sos' },
    { to: '/user/shelters', label: 'Safe Shelters', icon: 'location_home' },
    { to: '/user/profile', label: 'Profile', icon: 'person' },
  ];

  const currentPage = navItems.find(i => location.pathname.startsWith(i.to));

  return (
    <div className="h-screen w-screen flex bg-background text-on-surface overflow-hidden">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 h-full bg-surface-container-low border-r border-white/10">
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10 shrink-0">
          <span className="material-symbols-outlined text-primary text-2xl">shield</span>
          <div className="flex flex-col leading-tight">
            <span className="font-['Inter'] text-[18px] font-bold text-primary tracking-tight">AegisCore</span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-on-surface-variant tracking-[0.08em] uppercase">Citizen Safety</span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                  >
                    {item.icon}
                  </span>
                  <span className="font-['Inter']">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
              {user?.name ? user.name[0] : 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{user?.name || 'Citizen'}</p>
              <p className="text-xs text-on-surface-variant truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-['JetBrains_Mono'] tracking-wider uppercase text-on-surface-variant hover:text-[#ef4444] hover:bg-[#ef4444]/10 border border-white/10 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 shrink-0 flex items-center justify-between px-6 lg:px-8 bg-surface-container-low/50 backdrop-blur-xl border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="flex lg:hidden items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">shield</span>
              <span className="font-['Inter'] text-lg font-bold text-primary tracking-tight">AegisCore</span>
            </div>
            <h1 className="hidden lg:block font-['Inter'] text-lg font-semibold text-on-surface">
              {currentPage?.label || 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/30">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="font-['JetBrains_Mono'] text-[11px] tracking-[0.05em] font-medium text-primary uppercase">
                PROTECTED
              </span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-on-surface-variant text-xs font-['JetBrains_Mono']">
              <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
              CITIZEN
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto bg-[#0a0c10]">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Bottom Nav (below lg) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 bg-surface-container/95 backdrop-blur-2xl border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2 transition-colors ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined text-[22px]" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
                  {item.icon}
                </span>
                <span className="text-[9px] font-['JetBrains_Mono'] tracking-wide mt-0.5">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
