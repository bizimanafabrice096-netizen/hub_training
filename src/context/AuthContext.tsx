import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { CertificateRecord, UserProfile, UserRole } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  certificates: CertificateRecord[];
  loading: boolean;
  signInWithGoogle: (role?: UserRole) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (params: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessionWithToken = useCallback(async (bearerToken: string) => {
    const res = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) {
      throw new Error('Failed to validate session');
    }
    const data = await res.json();
    setUser(data.user);
    setCertificates(data.certificates ?? []);
    setToken(bearerToken);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const syncRes = await fetch('/api/auth/firebase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ idToken }),
          });
          if (syncRes.ok) {
            await fetchSessionWithToken(idToken);
          }
        } catch (err) {
          console.error('Firebase session sync error:', err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchSessionWithToken]);

  const signInWithGoogle = useCallback(
    async (role: UserRole = 'STUDENT') => {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ idToken, role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Google Sign-In failed');
      }
      await fetchSessionWithToken(idToken);
    },
    [fetchSessionWithToken]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }
      await fetchSessionWithToken(data.token);
    },
    [fetchSessionWithToken]
  );

  const registerWithEmail = useCallback(
    async (params: { name: string; email: string; password: string; role: UserRole }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      await fetchSessionWithToken(data.token);
    },
    [fetchSessionWithToken]
  );

  const switchRole = useCallback(
    async (role: UserRole) => {
      if (!token) return;
      const res = await fetch('/api/auth/role', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update role');
      }
      setUser(data.user);
      if (auth.currentUser) {
        const freshFirebaseToken = await auth.currentUser.getIdToken();
        setToken(freshFirebaseToken);
      } else if (data.token) {
        setToken(data.token);
      }
    },
    [token]
  );

  const refreshSession = useCallback(async () => {
    if (!token) return;
    await fetchSessionWithToken(token);
  }, [fetchSessionWithToken, token]);

  const signOut = useCallback(async () => {
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    setToken(null);
    setCertificates([]);
  }, []);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      let activeToken = token;
      if (auth.currentUser) {
        activeToken = await auth.currentUser.getIdToken();
      }
      const headers = new Headers(init.headers);
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      return fetch(input, { ...init, headers });
    },
    [token]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        certificates,
        loading,
        signInWithGoogle,
        loginWithEmail,
        registerWithEmail,
        switchRole,
        refreshSession,
        signOut,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
