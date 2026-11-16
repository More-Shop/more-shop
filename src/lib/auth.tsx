import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { AUTH_LOST_EVENT, supabase } from './supabase';

interface AuthState { session: Session | null; user: User | null; loading: boolean; notice: string | null }
const AuthCtx = createContext<AuthState>({ session: null, user: null, loading: true, notice: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true, notice: null });
  useEffect(() => {
    const apply = (session: Session | null, notice: string | null = null) =>
      setState({ session, user: session?.user ?? null, loading: false, notice });

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => apply(session));

    // The server saw us as signed out although the screen shows a user:
    // go back to the login page with an explanation instead of failing silently.
    const onLost = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) apply(null, 'การเข้าสู่ระบบหมดอายุหรือหลุด กรุณาเข้าสู่ระบบอีกครั้ง แล้วลองใหม่');
    };
    // Re-check when the tab comes back to the foreground (phones suspend tabs).
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(({ data: s }) => {
        setState((cur) => (cur.session && !s.session
          ? { session: null, user: null, loading: false, notice: 'การเข้าสู่ระบบหลุด กรุณาเข้าสู่ระบบอีกครั้ง' }
          : cur));
      });
    };
    window.addEventListener(AUTH_LOST_EVENT, onLost);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener(AUTH_LOST_EVENT, onLost);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
