import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const AdminLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { to: '/admin/risk-map', icon: 'travel_explore', label: 'Risk Map' },
    { to: '/admin/risk-analysis', icon: 'query_stats', label: 'Predictions' },
    { to: '/admin/alerts', icon: 'warning', label: 'Alerts' },
    { to: '/admin/predictions', icon: 'psychology', label: 'AI Center' },
    { to: '/admin/emergency', icon: 'emergency_share', label: 'Emergency' },
    { to: '/admin/shelters', icon: 'location_home', label: 'Shelters' },
  ];

  const bottomItems = [
    { to: '/admin/profile', icon: 'settings', label: 'Settings' },
  ];

  const currentPage = [...navItems, ...bottomItems].find(
    (i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/')
  );

  return (
    <div className="bg-background text-on-surface h-screen w-screen overflow-hidden flex flex-row font-body-md selection:bg-primary-container selection:text-black">
      {/* ── Desktop Sidebar — Icon Rail (w-20) ── */}
      <aside className="hidden md:flex flex-col w-20 h-full bg-surface-container border-r border-white/10 items-center py-6 gap-8 z-50 shrink-0">
        {/* Brand Icon */}
        <div className="text-primary">
          <span className="material-symbols-outlined text-3xl">hub</span>
        </div>

        {/* Navigation Icons */}
        <nav className="flex flex-col gap-3 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                `p-3 rounded-xl transition-all duration-200 flex items-center justify-center ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-on-surface-variant hover:text-primary hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <span
                  className="material-symbols-outlined"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Items */}
        <div className="flex flex-col gap-3 mt-auto">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                `p-3 rounded-xl transition-all duration-200 flex items-center justify-center ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-on-surface-variant hover:text-primary hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <span
                  className="material-symbols-outlined"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
              )}
            </NavLink>
          ))}
          <button
            onClick={logout}
            title="Logout"
            className="p-3 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-all duration-200 flex items-center justify-center"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Header (below md) ── */}
      <div className="md:hidden fixed top-0 left-0 w-full h-14 bg-surface/90 backdrop-blur-xl border-b border-white/10 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">hub</span>
          <span className="font-headline-md text-lg font-bold text-primary tracking-tight">AegisCore</span>
          <span className="font-label-caps text-[9px] text-on-surface-variant bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
            ADMIN
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-error/10 px-2 py-0.5 rounded-full border border-error/30">
            <div className="w-1.5 h-1.5 rounded-full bg-error pulse-live"></div>
            <span className="font-label-caps text-[9px] text-error font-bold tracking-wider">LIVE</span>
          </div>
          <button onClick={logout} className="text-on-surface-variant p-1">
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 h-full overflow-hidden bg-[#0a0c10] flex flex-col md:pt-0 pt-14">
        <Outlet />
      </main>

      {/* ── Mobile Bottom Nav (below md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-14 bg-surface-container/95 backdrop-blur-2xl border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
        {[...navItems.slice(0, 4), ...bottomItems].map((item) => (
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
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
                <span className="text-[8px] font-label-caps tracking-wide mt-0.5">
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
