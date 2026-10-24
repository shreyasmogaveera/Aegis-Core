import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const Login = () => {
  const [email, setEmail] = useState('admin@aegiscore.gov');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const user = await login(email, password);
      if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/user/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-background text-on-surface h-screen w-screen overflow-hidden flex flex-col font-body-md antialiased relative">
      {/* Background Layer (Map/Grid) */}
      <div className="absolute inset-0 z-0 bg-surface-lowest">
        <div className="absolute inset-0 bg-grid pointer-events-none z-10"></div>
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-overlay z-0" 
          style={{ backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuDFJ6nRSRkX6h9qtgf0ksnYqu3lnCiW-usO9Px_LwM5UQaK_LhfZenh6ej2mJpdMsoNJSZTnJZkbl18PQMusVPyXHayki6aJY4RIoWDFocXw6xQc-bMnxaOLraLz4plfJDf_uR-c_8exdCXLN8RbOx9SJTyTzV7y4a6hD3U7gMaKRPbLDz5UEoiPmUaAgbbpqml-tDLe-vvgmbFwgmEX9e3XW1AXrqa72T7ws1zp-08a0zAX8dt8L3V')` }}
        ></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-background/80 to-background z-10 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 0%, #101419 80%)' }}></div>
      </div>

      {/* Top Header */}
      <header className="fixed top-0 w-full flex justify-between items-center px-gutter py-4 z-50 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-3xl font-bold">public</span>
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md font-bold tracking-tighter text-primary leading-none">AegisCore</span>
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mt-1">Disaster Intelligence Platform</span>
          </div>
        </div>
        <div className="text-right">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">System Status</span>
          <div className="flex items-center gap-2 justify-end mt-1">
            <span className="w-2 h-2 rounded-full bg-primary-container inline-block animate-pulse"></span>
            <span className="font-data-mono text-data-mono text-primary-container">SECURE</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full h-full flex flex-col justify-center items-center z-20 px-margin-mobile md:px-margin-desktop relative pt-20">
        <div className="glass-panel w-full max-w-md rounded-xl p-panel-padding shadow-2xl relative overflow-hidden flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary-container"></div>
          
          <div className="mb-8 text-center mt-4">
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">Secure Access</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Command & Citizen Portal Login</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded bg-error/10 border border-error/30 text-error text-xs font-data-mono flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Email Input */}
            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase flex items-center gap-2" htmlFor="email">
                <span className="material-symbols-outlined text-[16px]">badge</span>
                Operative ID / Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="enter.credential@aegiscore.gov"
                className="input-technical w-full px-4 py-3 text-on-surface font-data-mono text-data-mono rounded-t-DEFAULT focus:ring-0 placeholder-on-surface-variant/50"
              />
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="font-label-caps text-label-caps text-on-surface-variant uppercase flex items-center gap-2" htmlFor="password">
                  <span className="material-symbols-outlined text-[16px]">key</span>
                  Access Code
                </label>
                <Link to="/forgot-password" className="font-label-caps text-label-caps text-primary hover:text-primary-container transition-colors duration-200 uppercase tracking-wide">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="input-technical w-full px-4 py-3 text-on-surface font-data-mono text-data-mono rounded-t-DEFAULT focus:ring-0 placeholder-on-surface-variant/50 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex flex-col gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary-container text-on-primary-container font-label-caps text-label-caps uppercase tracking-widest py-4 rounded-DEFAULT font-bold hover:bg-primary-fixed transition-colors duration-200 active:scale-[0.98] shadow-[0_0_15px_rgba(56,189,248,0.2)] flex justify-center items-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">login</span>
                {submitting ? 'Authenticating...' : 'Initialize Link'}
              </button>

              <Link
                to="/register"
                className="w-full bg-transparent border border-white/10 text-on-surface font-label-caps text-label-caps uppercase tracking-widest py-4 rounded-DEFAULT hover:border-white/30 hover:bg-white/5 transition-all duration-200 active:scale-[0.98] text-center"
              >
                Request Citizen Access
              </Link>
            </div>
          </form>

          {/* Quick Demo Hints */}
          <div className="mt-6 pt-4 border-t border-white/10 text-center">
            <p className="font-data-mono text-[11px] text-primary/80 mb-1">Demo Credentials:</p>
            <p className="font-data-mono text-[10px] text-on-surface-variant">Admin: admin@aegiscore.gov / admin123</p>
            <p className="font-data-mono text-[10px] text-on-surface-variant">Citizen: citizen@aegis.gov / citizen123</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full flex flex-row justify-between items-center px-margin-desktop py-4 z-40 bg-surface-lowest/50 border-t border-white/10 backdrop-blur-sm pointer-events-none md:pointer-events-auto flex-wrap gap-4 md:gap-0">
        <div className="font-data-mono text-data-mono text-on-surface-variant opacity-80 text-xs md:text-sm">
          © 2024 AegisCore Disaster Intelligence. Classified Command Access Only.
        </div>
      </footer>
    </div>
  );
};
