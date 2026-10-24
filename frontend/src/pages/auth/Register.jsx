import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const Register = () => {
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await register(fullname, email, phone, password);
      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="antialiased min-h-screen flex flex-col items-center justify-center p-gutter relative overflow-hidden bg-background text-on-surface">
      {/* Background Map Element */}
      <div 
        className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-cover bg-center" 
        style={{ backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuC4kHAcvm7xSjrE2fMByNnx9PbHdPdi3sCPA8n2mSqfE9Xt9U65V-VcAiyqS7aBe-7XDfGLMe1OX2VlJBTOgf2L3yZGikRNm30FupGYQTOnH1VpcvvDISQMo4RSPVOx2Flt2rgKRrDZsf592eJifA1VLnyQ9rwSneLOKCR5GlQiPOyvRR_0R4ubshK5mWNDSUJzgq9KvY88R7NM6EaF8A4ItkBSbx2OlwxRTjBC9ntvD4kdC0TqmB4y')` }}
      ></div>

      {/* Registration Panel */}
      <main className="w-full max-w-[500px] z-10 glass-panel rounded-xl p-panel-desktop md:p-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative my-8">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-primary-container rounded-t-xl opacity-80"></div>
        
        <div className="text-center mb-8">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tighter mb-2">AegisCore</h1>
          <h2 className="font-body-lg text-body-lg text-on-surface-variant uppercase tracking-widest font-semibold">Create Citizen Account</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-error/10 border border-error/30 text-error text-xs font-data-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-data-mono flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Full Name */}
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase" htmlFor="fullname">Full Name</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-outline-variant pl-2 pointer-events-none">person</span>
              <input
                id="fullname"
                type="text"
                required
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                placeholder="JANE DOE"
                className="input-technical w-full pl-10 py-3 font-data-mono text-data-mono"
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase" htmlFor="email">Email Address</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-outline-variant pl-2 pointer-events-none">mail</span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="CITIZEN@AEGIS.GOV"
                className="input-technical w-full pl-10 py-3 font-data-mono text-data-mono"
              />
            </div>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase" htmlFor="phone">Phone Number</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-outline-variant pl-2 pointer-events-none">call</span>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="input-technical w-full pl-10 py-3 font-data-mono text-data-mono"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase" htmlFor="password">Password</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-outline-variant pl-2 pointer-events-none">lock</span>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-technical w-full pl-10 py-3 font-data-mono text-data-mono"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 uppercase" htmlFor="confirm_password">Confirm Password</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-outline-variant pl-2 pointer-events-none">lock_reset</span>
              <input
                id="confirm_password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="input-technical w-full pl-10 py-3 font-data-mono text-data-mono"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary-container text-black font-label-caps text-label-caps uppercase py-4 px-6 rounded hover:bg-primary-fixed transition-colors duration-200 flex items-center justify-center gap-2 group font-bold disabled:opacity-50"
            >
              <span>{submitting ? 'Creating Account...' : 'Create Account'}</span>
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </form>

        <div className="mt-8 text-center">
          <p className="font-data-mono text-data-mono text-on-surface-variant">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-fixed transition-colors underline decoration-primary/30 underline-offset-4">
              Login
            </Link>
          </p>
        </div>
      </main>

      <footer className="w-full bg-surface-lowest/50 border-t border-white/10 backdrop-blur-sm flex flex-row justify-between items-center px-margin-desktop py-4 z-40 text-xs font-data-mono text-on-surface-variant">
        <div>© 2024 AegisCore Disaster Intelligence. Classified Command Access Only.</div>
      </footer>
    </div>
  );
};
