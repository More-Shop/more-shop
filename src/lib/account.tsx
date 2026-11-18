import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type AccountStatus = 'pending' | 'approved' | 'suspended';
interface AccountState {
  status: AccountStatus | null;
  isAdmin: boolean;
  fullName: string | null;
  adminNote: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<AccountState>({
  status: null, isAdmin: false, fullName: null, adminNote: null, loading: true, reload: async () => undefined,
});

/** The signed-in person's approval status and platform-admin flag. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<AccountState, 'reload'>>({
    status: null, isAdmin: false, fullName: null, adminNote: null, loading: true,
  });

  const reload = useCallback(async () => {
    if (!user) { setState({ status: null, isAdmin: false, fullName: null, adminNote: null, loading: false }); return; }
    const { data, error } = await supabase.rpc('my_account');
    if (error || !data) {
      // Fail open to "approved" only if the function is missing (older database);
      // otherwise keep the user on the waiting screen.
      const missing = error?.message?.includes('my_account');
      setState({ status: missing ? 'approved' : 'pending', isAdmin: false, fullName: null, adminNote: null, loading: false });
      return;
    }
    const d = data as { status: AccountStatus; is_admin: boolean; full_name: string | null; admin_note: string | null };
    setState({ status: d.status, isAdmin: d.is_admin, fullName: d.full_name, adminNote: d.admin_note, loading: false });
  }, [user]);

  useEffect(() => { setState((s) => ({ ...s, loading: true })); void reload(); }, [reload]);

  return <Ctx.Provider value={{ ...state, reload }}>{children}</Ctx.Provider>;
}

export const useAccount = () => useContext(Ctx);
