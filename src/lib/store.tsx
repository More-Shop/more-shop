import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, must } from './supabase';
import { useAuth } from './auth';
import { useAccount } from './account';
import { applyTheme } from './theme';
import type { Role, Store } from './types';

interface Membership { role: Role; store: Store }
interface StoreState {
  memberships: Membership[];
  store: Store | null;
  role: Role | null;
  /** A platform admin is managing a store they are not a member of. */
  adminView: boolean;
  loading: boolean;
  selectStore: (id: string | null) => void;
  reload: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const KEY = 'moreshop.currentStore';
const Ctx = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin } = useAccount();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [adminStore, setAdminStore] = useState<Store | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) { setMemberships([]); setAdminStore(null); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = must(await supabase.from('store_members').select('role, store:stores(*)').eq('user_id', user.id));
      const ms = (rows as unknown as Membership[]).filter((r) => r.store)
        .sort((a, b) => a.store.name.localeCompare(b.store.name, 'th'));
      setMemberships(ms);
      // Platform admins can open any store, even one they don't belong to.
      if (isAdmin && currentId && !ms.some((m) => m.store.id === currentId)) {
        const s = must(await supabase.from('stores').select('*').eq('id', currentId).maybeSingle()) as Store | null;
        setAdminStore(s);
      } else {
        setAdminStore(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, currentId]);

  useEffect(() => { void reload(); }, [reload]);

  const member = memberships.find((m) => m.store.id === currentId);
  const viaAdmin = !member && adminStore && adminStore.id === currentId ? { role: 'owner' as Role, store: adminStore } : null;
  const current = member ?? viaAdmin ?? (!currentId && memberships.length === 1 ? memberships[0] : null)
    ?? (currentId && !isAdmin && memberships.length === 1 ? memberships[0] : null);

  useEffect(() => { applyTheme(current?.store.theme_color); }, [current?.store.theme_color]);

  const value = useMemo<StoreState>(() => ({
    memberships,
    store: current?.store ?? null,
    role: current?.role ?? null,
    adminView: Boolean(viaAdmin && current === viaAdmin),
    loading,
    selectStore: (id) => {
      setCurrentId(id);
      try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* private mode */ }
    },
    reload,
    can: (...roles) => Boolean(current && roles.includes(current.role)),
  }), [memberships, current, viaAdmin, loading, reload]);

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
