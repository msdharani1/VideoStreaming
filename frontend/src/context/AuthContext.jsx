import { createContext, useContext, useMemo, useState } from 'react';
import { loginWithEmailPassword, signupWithEmailPassword } from '../api';

const SESSION_KEY = 'primeview_session_v1';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user?.role) return null;
    if (parsed.user.role !== 'guest' && !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession());

  function writeSession(nextSession) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    return nextSession;
  }

  async function login(email, password) {
    const payload = await loginWithEmailPassword({ email, password });
    return writeSession({
      token: payload.token,
      user: payload.user
    });
  }

  async function signup(email, password) {
    const payload = await signupWithEmailPassword({ email, password });
    return writeSession({
      token: payload.token,
      user: payload.user
    });
  }

  function continueAsGuest() {
    return writeSession({
      token: '',
      user: {
        id: 'guest',
        email: 'guest@local',
        role: 'guest'
      }
    });
  }

  function logout() {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  const value = useMemo(
    () => ({
      token: session?.token || '',
      user: session?.user || null,
      isAuthenticated: Boolean(session),
      isSignedIn: Boolean(session?.token),
      isGuest: session?.user?.role === 'guest',
      isAdmin: session?.user?.role === 'admin',
      login,
      signup,
      continueAsGuest,
      logout
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
