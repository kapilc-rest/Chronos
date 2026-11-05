import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowRight, UserPlus, LogIn, ShieldCheck, AlertCircle } from 'lucide-react';
import { authenticateUser, registerUser } from '../services/auth';

interface LoginScreenProps {
  onLogin: (userId: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (authMode === 'signup') {
      if (confirmPassword && password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      setLoading(true);
      const res = registerUser(username, password);
      setLoading(false);

      if (res.success && res.user) {
        onLogin(res.user);
      } else {
        setError(res.error || 'Failed to create account');
      }
    } else {
      setLoading(true);
      const res = authenticateUser(username, password);
      setLoading(false);

      if (res.success && res.user) {
        onLogin(res.user);
      } else {
        setError(res.error || 'Invalid username or password');
      }
    }
  };

  const handleSwitchTab = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setError('');
    if (mode === 'signup') {
      setUsername('');
      setPassword('');
      setConfirmPassword('');
    } else {
      setUsername('admin');
      setPassword('password');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl transition-all">
        {/* Brand Header */}
        <div className="text-center space-y-1.5 mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 mb-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-white">
            Chronos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {authMode === 'signin'
              ? 'Sign in to access your personal journal'
              : 'Create your private account to begin journaling'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 mb-6 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            type="button"
            onClick={() => handleSwitchTab('signin')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === 'signin'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('signup')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === 'signup'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Username or Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={authMode === 'signin' ? 'admin' : 'Choose a unique username'}
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === 'signin' ? '••••••••' : 'Minimum 4 characters'}
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {authMode === 'signup' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Processing...' : (authMode === 'signin' ? 'Sign In' : 'Create Account')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Footer info */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-center">
          {authMode === 'signin' ? (
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Registered demo: <code>admin</code> / <code>password</code></span>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Accounts are stored safely in local database.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
