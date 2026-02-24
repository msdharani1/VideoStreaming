import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, continueAsGuest, isAuthenticated, isAdmin, isGuest } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSignupMode = mode === 'signup';
  const passwordTooShort = isSignupMode && password.length > 0 && password.length < 6;
  const confirmTouched = isSignupMode && confirmPassword.length > 0;
  const passwordMismatch = confirmTouched && password !== confirmPassword;
  const passwordMatch = confirmTouched && password === confirmPassword;
  const canSubmit = Boolean(
    !loading &&
    email.trim() &&
    password &&
    (!isSignupMode || (!passwordTooShort && confirmPassword && !passwordMismatch))
  );

  if (isAuthenticated && !isGuest) {
    return <Navigate to={isAdmin ? '/admin' : '/videos'} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    if (isSignupMode && password.length < 6) {
      setLoading(false);
      setError('Password must be at least 6 characters');
      return;
    }

    if (isSignupMode && password !== confirmPassword) {
      setLoading(false);
      setError('Password and confirm password do not match');
      return;
    }

    try {
      const session =
        isSignupMode
          ? await signup(email, password)
          : await login(email, password);
      const target =
        location.state?.from?.pathname ||
        (session.user?.role === 'admin' ? '/admin' : '/videos');
      navigate(target, { replace: true });
    } catch (requestError) {
      setError(requestError.message || (isSignupMode ? 'Sign up failed' : 'Sign in failed'));
    } finally {
      setLoading(false);
    }
  }

  function onContinueAsGuest() {
    continueAsGuest();
    const target = location.state?.from?.pathname || '/videos';
    navigate(target, { replace: true });
  }

  return (
    <main className="max-w-md mx-auto px-4 py-12 animate-rise">
      <section className="rounded-2xl bg-bg-card border border-border p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent mb-2">PrimeView Access</p>
        <h1 className="text-2xl font-black text-text-primary mb-2">
          {isSignupMode ? 'Create Account' : 'Sign In'}
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          Sign in, create an account, or continue as guest.
        </p>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-bg-tertiary border border-border mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError('');
              setConfirmPassword('');
            }}
            className={`py-2 rounded-lg text-sm font-semibold border-none cursor-pointer ${
              mode === 'signin' ? 'bg-accent text-white' : 'bg-transparent text-text-secondary'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
              setConfirmPassword('');
            }}
            className={`py-2 rounded-lg text-sm font-semibold border-none cursor-pointer ${
              mode === 'signup' ? 'bg-accent text-white' : 'bg-transparent text-text-secondary'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={isSignupMode ? 'new-password' : 'current-password'}
              className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {passwordTooShort ? (
              <p className="text-xs text-red font-semibold mt-1">Password must be at least 6 characters.</p>
            ) : null}
          </div>

          {isSignupMode ? (
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              {passwordMismatch ? (
                <p className="text-xs text-red font-semibold mt-1">Passwords do not match.</p>
              ) : null}
              {passwordMatch ? (
                <p className="text-xs text-green font-semibold mt-1">Passwords match.</p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red font-semibold">{error}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-colors disabled:opacity-50 border-none cursor-pointer"
          >
            {loading
              ? isSignupMode
                ? 'Creating Account...'
                : 'Signing In...'
              : isSignupMode
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>

        <div className="mt-6">
          <button
            type="button"
            onClick={onContinueAsGuest}
            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-border text-text-secondary font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Continue as Guest
          </button>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
