import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState { session: Session | null; user: User | null; loading: boolean }
const AuthCtx = createContext<AuthState>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      setState({ session: data.session, user: data.session?.user ?? null, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setState({ session, user: session?.user ?? null, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
