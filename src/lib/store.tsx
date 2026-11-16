import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, must } from './supabase';
import { useAuth } from './auth';
import { applyTheme } from './theme';
import type { Role, Store } from './types';

interface Membership { role: Role; store: Store }
interface StoreState {
  memberships: Membership[];
  store: Store | null;
  role: Role | null;
  loading: boolean;
  selectStore: (id: string | null) => void;
  reload: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const KEY = 'moreshop.currentStore';
const Ctx = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) { setMemberships([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = must(await supabase.from('store_members').select('role, store:stores(*)').eq('user_id', user.id));
      setMemberships((rows as unknown as Membership[]).filter((r) => r.store)
        .sort((a, b) => a.store.name.localeCompare(b.store.name, 'th')));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const current = memberships.find((m) => m.store.id === currentId) ?? (memberships.length === 1 ? memberships[0] : null);

  useEffect(() => { applyTheme(current?.store.theme_color); }, [current?.store.theme_color]);

  const value = useMemo<StoreState>(() => ({
    memberships,
    store: current?.store ?? null,
    role: current?.role ?? null,
    loading,
    selectStore: (id) => {
      setCurrentId(id);
      try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* private mode */ }
    },
    reload,
    can: (...roles) => Boolean(current && roles.includes(current.role)),
  }), [memberships, current, loading, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

/** For pages that are only rendered once a store is selected. */
export function useCurrentStore() {
  const v = useStore();
  if (!v.store || !v.role) throw new Error('no store selected');
  return { ...v, store: v.store, role: v.role };
}
