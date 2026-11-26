import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen, CalendarDays, ChevronDown, ClipboardList, FileBarChart, LayoutDashboard, LogOut, Menu as MenuIcon,
  QrCode, Settings, ShieldCheck, ShoppingCart, Store as StoreIcon, Users, UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useCurrentStore } from '@/lib/store';
import { APP_NAME } from '@/lib/config';
import type { Role } from '@/lib/types';
import type { FeatureKey } from '@/lib/features';
import { usePendingBookings, usePendingCount } from './usePendingCount';
import { toast } from './ui';
import { todayISO } from '@/lib/format';

const NAV: { to: string; label: string; icon: typeof StoreIcon; roles?: Role[]; feature?: FeatureKey }[] = [
  { to: '/', label: 'ภาพรวม', icon: LayoutDashboard },
  { to: '/pos', label: 'สั่งอาหาร (POS)', icon: ShoppingCart },
  { to: '/orders', label: 'ออเดอร์ / เช็คบิล', icon: ClipboardList },
  { to: '/bookings', label: 'การจองโต๊ะ', icon: CalendarDays },
  { to: '/menu', label: 'เมนูและราคา', icon: UtensilsCrossed, roles: ['owner', 'manager'] },
  { to: '/tables', label: 'โต๊ะ & QR Code', icon: QrCode, roles: ['owner', 'manager'] },
  { to: '/ledger', label: 'รายรับ-รายจ่าย', icon: Wallet, roles: ['owner', 'manager'], feature: 'ledger' },
  { to: '/reports', label: 'รายงานบัญชี/ภาษี', icon: FileBarChart, roles: ['owner', 'manager'], feature: 'reports' },
  { to: '/staff', label: 'พนักงาน', icon: Users, roles: ['owner'] },
  { to: '/settings', label: 'ตั้งค่าร้าน', icon: Settings, roles: ['owner', 'manager'] },
];

export const ROLE_LABEL: Record<Role, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'พนักงาน' };

export default function Layout() {
  const { user } = useAuth();
  const { store, role, memberships, selectStore, adminView, feature } = useCurrentStore();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pending = usePendingCount(store.id);
  const showBookings = NAV.some((n) => n.to === '/bookings' && (!n.roles || n.roles.includes(role)) && (!n.feature || feature(n.feature)));
  const { count: bookingsPending } = usePendingBookings(store.id, todayISO(store.timezone),
    (n) => showBookings && toast.ok(`📅 มีการจองโต๊ะใหม่ ${n} รายการ — รอยืนยัน`));

  useEffect(() => { document.title = `${store.name} · ${APP_NAME}`; }, [store.name]);

  const nav = NAV.filter((n) => (!n.roles || n.roles.includes(role)) && (!n.feature || feature(n.feature)));

  const sidebar = (
    <div className="flex h-full flex-col">
      <button className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 text-left hover:bg-slate-50"
        onClick={() => { selectStore(null); navigate('/'); }} title="เปลี่ยนร้าน">
        {store.logo_url
          ? <img src={store.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
          : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">{store.name.slice(0, 1)}</div>}
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-slate-900">{store.name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABEL[role]}{memberships.length > 1 ? ' · เปลี่ยนร้าน' : ''}</div>
        </div>
        {memberships.length > 1 && <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <n.icon className="h-5 w-5" />
            <span className="flex-1">{n.label}</span>
            {n.to === '/orders' && pending > 0 && (
              <span className="badge animate-pulse bg-red-500 text-white">{pending}</span>)}
            {n.to === '/bookings' && bookingsPending > 0 && (
              <span className="badge animate-pulse bg-amber-500 text-white" title="การจองที่รอยืนยัน">{bookingsPending}</span>)}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 truncate px-3 text-xs text-slate-400">{user?.email}</div>
        <button className="btn-ghost w-full justify-start" onClick={() => supabase.auth.signOut()}>
          <LogOut className="h-4 w-4" /> ออกจากระบบ
        </button>
        <div className="mt-2 flex items-center gap-1 px-3 text-[11px] text-slate-300"><BookOpen className="h-3 w-3" /> {APP_NAME}</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost absolute right-2 top-3 p-2" onClick={() => setOpen(false)} aria-label="ปิดเมนู"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button className="btn-ghost -ml-2 p-2" onClick={() => setOpen(true)} aria-label="เมนู"><MenuIcon className="h-6 w-6" /></button>
          <span className="truncate font-bold">{store.name}</span>
          <span className="ml-auto flex gap-1.5">
            {pending > 0 && <NavLink to="/orders" className="badge bg-red-500 text-white">ออเดอร์ใหม่ {pending}</NavLink>}
            {showBookings && bookingsPending > 0 && <NavLink to="/bookings" className="badge bg-amber-500 text-white">จองรอยืนยัน {bookingsPending}</NavLink>}
          </span>
        </header>
        {adminView && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 px-4 py-2 text-sm text-white">
            <ShieldCheck className="h-4 w-4 text-amber-300" />
            <span className="flex-1">โหมดผู้ดูแลระบบ — กำลังจัดการร้าน <b>{store.name}</b> แทนเจ้าของร้าน</span>
            <button className="rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25" onClick={() => { selectStore(null); window.location.href = './admin.html'; }}>กลับหน้าผู้ดูแล</button>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
