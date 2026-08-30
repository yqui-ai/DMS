import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  /** Memoised because this is the value of a context read near the root.
   *
   * A fresh object every render makes every `useAuth()` consumer re-render whenever this provider
   * does — and it sits above the whole app, so that is the entire tree. The session only actually
   * changes on sign-in, sign-out and token refresh; without this the identity of `value` changed
   * far more often than the session behind it did. */
  const value = useMemo<AuthState>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    signOut,
  }), [session, loading, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
