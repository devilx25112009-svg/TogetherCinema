import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Film, Heart, KeyRound, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signInGoogle, signInEmail, registerEmail, resetPassword, enterDemoCoupleMode } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!showReset && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (showReset) {
        await resetPassword(email.trim());
        setNotice('Password reset instructions sent to your email.');
      } else if (mode === 'register') {
        if (!displayName.trim()) {
          setError('Please enter your display name.');
          setBusy(false);
          return;
        }
        await registerEmail(email.trim(), password, displayName.trim());
        navigate('/home');
      } else {
        await signInEmail(email.trim(), password);
        navigate('/home');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not enabled in the Firebase Console yet (Google Sign-In is pre-enabled). Enable Email/Password in Firebase Auth Console, or sign in with Google / Demo Couple Mode below.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInGoogle();
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080810] text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 cinema-surface rounded-2xl overflow-hidden">
        {/* Left Visual Showcase */}
        <div className="relative hidden lg:flex flex-col justify-between p-10 bg-[#151126]">
          <img
            src="/images/cinema_hero_couple_1794680184863.jpg"
            alt="Luxury private screening room"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-45"
          />
          <div className="relative z-10 flex items-center gap-2.5">
            <Film className="w-5 h-5 text-[#C4B5FD]" />
            <span className="font-display font-bold text-lg text-white">Together Cinema</span>
          </div>
          <div className="relative z-10 space-y-3">
            <p className="text-xs font-mono-tabular uppercase tracking-widest text-[#F472B6]">
              Miles Apart · One Screen · Together
            </p>
            <h2 className="font-display text-3xl font-bold text-white text-balance">
              Your private midnight theatre awaits.
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Connect your account with your partner, upload up to 50GB+ films, and step into your shared 3D auditorium.
            </p>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="p-6 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <Link to="/" className="text-xs text-[#C4B5FD] hover:text-white inline-block mb-3">
              ← Back to entrance
            </Link>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
              {showReset ? 'Reset Password' : mode === 'register' ? 'Create Your Cinema Account' : 'Sign In to Together Cinema'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {mode === 'register'
                ? 'Start your private two-person cinema collection.'
                : 'Welcome back. Take your seats beside your partner.'}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 leading-relaxed">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
              {notice}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full py-3 px-4 rounded-xl bg-white text-[#080810] font-semibold text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <span>Continue with Google</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
            <div className="flex-1 h-px bg-white/10" />
            <span>or use email</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && !showReset && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Display Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    id="auth-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Aayush"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
            </div>

            {!showReset && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="text-xs font-medium text-slate-300">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setShowReset(true)}
                      className="text-xs text-[#C4B5FD] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#0B1020] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 px-4 rounded-xl bg-[#8B5CF6] hover:bg-[#9167FF] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              {busy
                ? 'Please wait...'
                : showReset
                ? 'Send Password Reset Email'
                : mode === 'register'
                ? 'Create Private Account'
                : 'Sign In'}
            </button>
          </form>

          {showReset && (
            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="mt-3 text-xs text-[#C4B5FD] hover:underline self-start cursor-pointer"
            >
              ← Back to Sign In
            </button>
          )}

          {/* Clearly labelled Demo Couple Session */}
          <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5">
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-[#F472B6]" />
              <span>Instant Preview · Demo Couple Session (no password needed)</span>
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  enterDemoCoupleMode('a');
                  navigate('/home');
                }}
                className="py-2 px-3 rounded-lg bg-[#1C1930] hover:bg-[#211B32] border border-[#8B5CF6]/30 text-xs font-medium text-white cursor-pointer"
              >
                Enter as Aayush (Host)
              </button>
              <button
                type="button"
                onClick={() => {
                  enterDemoCoupleMode('b');
                  navigate('/home');
                }}
                className="py-2 px-3 rounded-lg bg-[#1C1930] hover:bg-[#211B32] border border-[#F472B6]/30 text-xs font-medium text-white cursor-pointer"
              >
                Enter as Maya (Partner)
              </button>
            </div>
          </div>

          <p className="mt-5 text-xs text-slate-400 text-center">
            {mode === 'register' ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="text-[#C4B5FD] hover:underline font-medium">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to Together Cinema?{' '}
                <Link to="/register" className="text-[#C4B5FD] hover:underline font-medium">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
