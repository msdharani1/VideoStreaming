import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { auth } from '../firebase';

const SESSION_KEY = 'cloudstream_session_v1';

const AuthContext = createContext(null);

function parseAdminEmails() {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || import.meta.env.VITE_ADMIN_OWNER_EMAIL || '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_EMAILS = parseAdminEmails();

function isAdminEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return false;
  if (ADMIN_EMAILS.length === 0) return false;
  return ADMIN_EMAILS.includes(normalized);
}

function readStoredGuest() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.user?.role !== 'guest') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredGuest());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken();
        const role = isAdminEmail(user.email) ? 'admin' : 'user';
        setSession({
          token,
          user: {
            id: user.uid,
            email: user.email || '',
            role
          }
        });
        window.localStorage.removeItem(SESSION_KEY);
      } else {
        setSession(readStoredGuest());
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  async function login(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdToken();
    const role = isAdminEmail(credential.user.email) ? 'admin' : 'user';
    const nextSession = {
      token,
      user: {
        id: credential.user.uid,
        email: credential.user.email || '',
        role
      }
    };
    setSession(nextSession);
    window.localStorage.removeItem(SESSION_KEY);
    return nextSession;
  }

  async function signup(email, password) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdToken();
    const role = isAdminEmail(credential.user.email) ? 'admin' : 'user';
    const nextSession = {
      token,
      user: {
        id: credential.user.uid,
        email: credential.user.email || '',
        role
      }
    };
    setSession(nextSession);
    window.localStorage.removeItem(SESSION_KEY);
    return nextSession;
  }

  function continueAsGuest() {
    const guestSession = {
      token: '',
      user: {
        id: 'guest',
        email: 'guest@local',
        role: 'guest'
      }
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(guestSession));
    setSession(guestSession);
    return guestSession;
  }

  async function logout() {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    await signOut(auth);
  }

  const value = useMemo(
    () => ({
      token: session?.token || '',
      user: session?.user || null,
      isAuthenticated: Boolean(session),
      isSignedIn: Boolean(session?.token),
      isGuest: session?.user?.role === 'guest',
      isAdmin: session?.user?.role === 'admin',
      authReady,
      login,
      signup,
      continueAsGuest,
      logout
    }),
    [session, authReady]
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
