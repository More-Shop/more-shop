import { Link } from 'react-router-dom';
import { ChevronRight, LogOut, Plus, Store as StoreIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { APP_NAME } from '@/lib/config';
import { applyTheme } from '@/lib/theme';
import { ROLE_LABEL } from '@/components/Layout';
import { useEffect } from 'react';

export default function StorePicker() {
  const { user } = useAuth();
  const { memberships, selectStore } = useStore();
  useEffect(() => { applyTheme(null); document.title = APP_NAME; }, []);

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{APP_NAME}</h1>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /> ออก</button>
      </div>
      <h2 className="mb-3 font-semibold text-slate-700">เลือกร้าน</h2>
      <div className="space-y-2">
        {memberships.map(({ store, role }) => (
          <button key={store.id} onClick={() => selectStore(store.id)}
            className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-brand-500">
            {store.logo_url
              ? <img src={store.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: store.theme_color }}>{store.name.slice(0, 1)}</div>}
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{store.name}</div>
              <div className="text-sm text-slate-500">{ROLE_LABEL[role]} · /{store.slug}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>
        ))}
        {memberships.length === 0 && (
          <div className="card flex flex-col items-center gap-2 p-8 text-center text-slate-500">
            <StoreIcon className="h-10 w-10 text-slate-300" />
            <p>ยังไม่มีร้านในบัญชีนี้</p>
            <p className="text-sm">สร้างร้านใหม่ หรือให้เจ้าของร้านเพิ่มอีเมลของคุณเป็นพนักงาน</p>
          </div>
        )}
        <Link to="/new-store" className="btn-primary w-full py-3"><Plus className="h-5 w-5" /> เพิ่มร้านใหม่</Link>
      </div>
    </div>
  );
}
