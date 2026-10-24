import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-on-surface relative overflow-hidden font-body-md bg-background">
      <div className="absolute inset-0 scanlines z-0"></div>
      <div className="absolute inset-0 bg-cover bg-center opacity-10 z-0 mix-blend-overlay"></div>

      <main className="relative z-10 w-full max-w-md px-gutter md:px-0">
        <div className="text-center mb-8">
          <span className="font-headline-lg text-headline-lg font-bold tracking-tighter text-primary block">AegisCore</span>
          <span className="font-label-caps text-label-caps text-on-surface-variant block mt-2">SECURE ACCESS TERMINAL</span>
        </div>

        <div className="glass-panel p-panel-padding rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-primary"></div>

          <div className="mb-8 mt-2">
            <h1 className="font-headline-md text-headline-md text-on-surface mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lock_reset</span>
              Forgot Password?
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Enter your registered email to receive a secure reset link.
            </p>
          </div>

          {submitted ? (
            <div className="p-4 rounded bg-primary/10 border border-primary/30 text-primary text-sm font-data-mono flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold">
                <span className="material-symbols-outlined">mark_email_read</span>
                Reset Link Sent!
              </div>
              <p className="text-xs text-on-surface-variant">
                If an account exists for {email}, instructions have been dispatched.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface-variant mb-2" htmlFor="email">OPERATOR EMAIL</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>mail</span>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@aegiscore.gov"
                    className="input-dark w-full pl-10 pr-4 py-3 text-on-surface placeholder-on-surface-variant/50 font-data-mono text-data-mono rounded-DEFAULT"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-primary-container text-black font-label-caps text-label-caps font-bold py-3 px-6 rounded-DEFAULT flex items-center justify-center gap-2 hover:bg-primary transition-colors duration-200 active:scale-[0.98]"
                >
                  SEND RESET LINK
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 text-center border-t border-white/5 pt-6">
            <Link to="/login" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors duration-200 font-label-caps text-label-caps">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
              Back to Login
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <span className="font-data-mono text-data-mono text-on-surface-variant text-[10px] opacity-50">
            SYSTEM STATUS: <span className="text-primary">SECURE</span> // ENCRYPTION: ACTIVE
          </span>
        </div>
      </main>
    </div>
  );
};
