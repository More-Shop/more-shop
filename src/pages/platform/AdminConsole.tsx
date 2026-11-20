import { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, ExternalLink, KeyRound, LayoutDashboard,
  LogOut, MailCheck, Search, ShieldCheck, ShieldOff, Store as StoreIcon, UserPlus, Users, XCircle,
} from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { APP_NAME, publicLink } from '@/lib/config';
import { fmt2, thaiDateTime } from '@/lib/format';
import type { Role } from '@/lib/types';
import { EmptyState, ErrorBox, Field, Modal, PageLoading, Spinner, toast, useLoad } from '@/components/ui';
import { ROLE_LABEL } from '@/components/Layout';

/** Open a store's back office in the shop app (new tab), as the admin. */
function openStore(storeId: string, path = '/') {
  try { localStorage.setItem('moreshop.currentStore', storeId); } catch { /* ignore */ }
  window.open(`./#${path}`, '_blank', 'noopener');
}

type Status = 'pending' | 'approved' | 'suspended';
interface AdminUser {
  user_id: string; email: string; full_name: string | null; phone: string | null; business_name: string | null;
  status: Status; admin_note: string | null; created_at: string; last_sign_in_at: string | null;
  email_confirmed: boolean; is_admin: boolean; stores: { store_id: string; name: string; slug: string; role: Role }[];
}
interface AdminStore {
  id: string; name: string; slug: string; logo_url: string | null; created_at: string;
  owners: { user_id: string; email: string }[]; members: number; menu_items: number; tables: number;
  orders_7d: number; sales_7d: number; last_order_at: string | null; open_bills: number;
  checks: Record<string, boolean | number>;
}
interface AppError {
  id: number; created_at: string; user_email: string | null; store_name: string | null; store_id: string | null;
  message: string; page: string | null; user_agent: string | null; resolved: boolean;
}
interface Overview {
  users_pending: number; users_approved: number; users_suspended: number; users_unconfirmed: number;
  stores: number; orders_today: number; sales_today: number; errors_open: number; errors_24h: number;
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  pending: { label: 'รออนุมัติ', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'ใช้งานได้', cls: 'bg-green-100 text-green-700' },
  suspended: { label: 'ระงับ', cls: 'bg-red-100 text-red-700' },
};

type Tab = 'overview' | 'users' | 'stores' | 'problems';

export default function AdminConsole() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [ov, , , reloadOv] = useLoad(async () => must(await supabase.rpc('admin_overview')) as Overview, []);

  const tabs: { k: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { k: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
    { k: 'users', label: 'สมาชิก', icon: Users, badge: ov?.users_pending },
    { k: 'stores', label: 'ร้านค้า', icon: StoreIcon },
    { k: 'problems', label: 'ปัญหาที่พบ', icon: AlertTriangle, badge: ov?.errors_open },
  ];

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-orange-200/60 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <ShieldCheck className="h-6 w-6 text-brand-600" />
          <div className="min-w-0 flex-1">
            <div className="font-bold">ผู้ดูแลระบบ {APP_NAME}</div>
            <div className="text-xs text-slate-500">{user?.email}</div>
          </div>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /> ออก</button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t.k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
              {!!t.badge && <span className="badge bg-red-500 text-white">{t.badge}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {tab === 'overview' && <OverviewTab ov={ov} go={setTab} />}
        {tab === 'users' && <UsersTab onChanged={reloadOv} />}
        {tab === 'stores' && <StoresTab />}
        {tab === 'problems' && <ProblemsTab onChanged={reloadOv} />}
      </main>
    </div>
  );
}

function Kpi({ label, value, tone, onClick }: { label: string; value: string | number; tone?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="card p-4 text-left transition hover:border-brand-500">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${tone ?? ''}`}>{value}</div>
    </button>
  );
}

function OverviewTab({ ov, go }: { ov: Overview | undefined; go: (t: Tab) => void }) {
  if (!ov) return <PageLoading />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="รออนุมัติ" value={ov.users_pending} tone={ov.users_pending ? 'text-amber-600' : ''} onClick={() => go('users')} />
      <Kpi label="สมาชิกที่ใช้งานได้" value={ov.users_approved} onClick={() => go('users')} />
      <Kpi label="ถูกระงับ" value={ov.users_suspended} onClick={() => go('users')} />
      <Kpi label="ยังไม่ยืนยันอีเมล" value={ov.users_unconfirmed} tone={ov.users_unconfirmed ? 'text-amber-600' : ''} onClick={() => go('users')} />
      <Kpi label="จำนวนร้าน" value={ov.stores} onClick={() => go('stores')} />
      <Kpi label="บิลที่ชำระวันนี้ (ทุกร้าน)" value={ov.orders_today} onClick={() => go('stores')} />
      <Kpi label="ยอดขายวันนี้ (ทุกร้าน)" value={`฿${fmt2(ov.sales_today)}`} onClick={() => go('stores')} />
      <Kpi label="ปัญหาที่ยังไม่แก้" value={ov.errors_open} tone={ov.errors_open ? 'text-red-600' : ''} onClick={() => go('problems')} />
    </div>
  );
}

// ---------------------------------------------------------------- Users
function UsersTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const [users, loading, error, reload] = useLoad(async () => must(await supabase.rpc('admin_list_users')) as AdminUser[], []);
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [q, setQ] = useState('');
  const list = useMemo(() => (users ?? []).filter((u) =>
    (filter === 'all' || u.status === filter) &&
    (!q || [u.email, u.full_name, u.phone, u.business_name].some((x) => x?.toLowerCase().includes(q.toLowerCase())))), [users, filter, q]);
  const count = (s: Status) => (users ?? []).filter((u) => u.status === s).length;
  const refresh = async () => { await reload(); await onChanged(); };

  if (loading && !users) return <PageLoading />;
  return (
    <div>
      <ErrorBox error={error} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['pending', 'approved', 'suspended', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
            {f === 'all' ? `ทั้งหมด (${users?.length ?? 0})` : `${STATUS[f].label} (${count(f)})`}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="ค้นหาอีเมล ชื่อ เบอร์ ร้าน" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title={filter === 'pending' ? 'ไม่มีสมาชิกรออนุมัติ' : 'ไม่พบสมาชิก'} />
      ) : (
        <div className="space-y-3">{list.map((u) => <UserCard key={u.user_id} u={u} onChanged={refresh} />)}</div>
      )}
    </div>
  );
}

function UserCard({ u, onChanged }: { u: AdminUser; onChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(u.status === 'pending');
  const [note, setNote] = useState(u.admin_note ?? '');
  const me = u.user_id === user?.id;

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try { await fn(); toast.ok(ok); await onChanged(); } catch (e) { toast.err((e as Error).message); } finally { setBusy(null); }
  }
  const setStatus = (s: Status, msg: string) => run(s, async () =>
    must(await supabase.rpc('admin_set_user_status', { p_user: u.user_id, p_status: s, p_note: note || null })), msg);

  return (
    <div className={`card p-4 ${u.status === 'pending' ? 'border-amber-300' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold">{u.full_name || u.email}</span>
            <span className={`badge ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
            {u.is_admin && <span className="badge bg-slate-900 text-white">ผู้ดูแลระบบ</span>}
            {!u.email_confirmed && <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">ยังไม่ยืนยันอีเมล</span>}
            {me && <span className="text-xs text-slate-400">(คุณ)</span>}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {u.email}{u.phone && <> · <a className="text-brand-700" href={`tel:${u.phone}`}>{u.phone}</a></>}
            {u.business_name && <> · ร้าน: {u.business_name}</>}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            สมัคร {thaiDateTime(u.created_at)} · เข้าใช้ล่าสุด {u.last_sign_in_at ? thaiDateTime(u.last_sign_in_at) : '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {u.status !== 'approved' && (
            <button className="btn-primary" disabled={!!busy} onClick={() => setStatus('approved', `อนุมัติ ${u.email} แล้ว`)}>
              {busy === 'approved' ? <Spinner /> : <Check className="h-4 w-4" />} {u.status === 'pending' ? 'อนุมัติ' : 'เปิดใช้งาน'}
            </button>
          )}
          {u.status !== 'suspended' && !me && (
            <button className="btn-secondary text-red-600" disabled={!!busy}
              onClick={() => confirm(`ระงับการใช้งาน ${u.email}? (เข้าร้านไม่ได้จนกว่าจะเปิดใช้งาน)`) && setStatus('suspended', 'ระงับบัญชีแล้ว')}>
              {busy === 'suspended' ? <Spinner /> : <ShieldOff className="h-4 w-4" />} {u.status === 'pending' ? 'ไม่อนุมัติ' : 'ระงับ'}
            </button>
          )}
          <button className="btn-ghost px-2" onClick={() => setOpen(!open)} aria-label="รายละเอียด">{open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-600">ร้านที่สังกัด</div>
            {u.stores.length === 0 ? <p className="text-sm text-slate-400">ยังไม่มีร้าน</p> : (
              <div className="flex flex-wrap gap-2">
                {u.stores.map((s) => (
                  <button key={s.store_id} className="btn-secondary py-1.5 text-xs"
                    onClick={() => openStore(s.store_id)}>
                    {s.name} · {ROLE_LABEL[s.role]} <ExternalLink className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <Field label="หมายเหตุ (ผู้ใช้เห็นข้อความนี้ในหน้ารออนุมัติ / ระงับ)">
            <div className="flex gap-2">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โทรยืนยันแล้ว / กรุณาติดต่อ 08x-xxx-xxxx" />
              <button className="btn-secondary" disabled={!!busy}
                onClick={() => run('note', async () => must(await supabase.rpc('admin_set_note', { p_user: u.user_id, p_note: note })), 'บันทึกหมายเหตุแล้ว')}>บันทึก</button>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {!u.email_confirmed && (
              <button className="btn-secondary" disabled={!!busy}
                onClick={() => run('confirm', async () => must(await supabase.rpc('admin_confirm_email', { p_user: u.user_id })), 'ยืนยันอีเมลให้แล้ว — ผู้ใช้เข้าสู่ระบบได้ทันที')}>
                <MailCheck className="h-4 w-4" /> ยืนยันอีเมลให้ (อีเมลยืนยันไม่มา)
              </button>
            )}
            <button className="btn-secondary" disabled={!!busy}
              onClick={() => run('reset', async () => {
                const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: window.location.origin + window.location.pathname });
                if (error) throw error;
              }, `ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${u.email} แล้ว`)}>
              <KeyRound className="h-4 w-4" /> ส่งลิงก์ตั้งรหัสผ่านใหม่
            </button>
            {!me && (
              <button className="btn-ghost" disabled={!!busy}
                onClick={() => confirm(u.is_admin ? `ยกเลิกสิทธิ์ผู้ดูแลระบบของ ${u.email}?` : `ให้ ${u.email} เป็นผู้ดูแลระบบ? (จัดการได้ทุกร้านและทุกบัญชี)`) &&
                  run('admin', async () => must(await supabase.rpc('admin_set_platform_admin', { p_user: u.user_id, p_on: !u.is_admin })),
                    u.is_admin ? 'ยกเลิกสิทธิ์ผู้ดูแลแล้ว' : 'ตั้งเป็นผู้ดูแลระบบแล้ว')}>
                <ShieldCheck className="h-4 w-4" /> {u.is_admin ? 'ยกเลิกผู้ดูแลระบบ' : 'ตั้งเป็นผู้ดูแลระบบ'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Stores
const CHECKS: { k: string; ok: string; bad: string; where: string }[] = [
  { k: 'menu', ok: 'มีเมนู', bad: 'ยังไม่มีเมนู', where: '/menu' },
  { k: 'tables', ok: 'มีโต๊ะ', bad: 'ยังไม่มีโต๊ะ / QR', where: '/tables' },
  { k: 'promptpay', ok: 'ตั้งพร้อมเพย์', bad: 'ยังไม่ตั้งพร้อมเพย์', where: '/settings' },
  { k: 'tax_id', ok: 'ข้อมูลภาษีครบ', bad: 'จด VAT แต่ไม่มีเลขผู้เสียภาษี', where: '/settings' },
  { k: 'drive_folder', ok: 'มีโฟลเดอร์ Drive', bad: 'ยังไม่ตั้งโฟลเดอร์ Google Drive', where: '/settings' },
  { k: 'drive_script', ok: 'มีลิงก์ Apps Script', bad: 'ยังไม่ใส่ลิงก์ Apps Script', where: '/settings' },
  { k: 'line_liff', ok: 'ตั้ง LINE LIFF', bad: 'ยังไม่ตั้ง LINE LIFF', where: '/settings' },
  { k: 'line_secret', ok: 'ตั้ง LINE Messaging', bad: 'ยังไม่ใส่ LINE token/secret', where: '/settings' },
];

function StoresTab() {
  const [stores, loading, error] = useLoad(async () => must(await supabase.rpc('admin_list_stores')) as AdminStore[], []);
  const [q, setQ] = useState('');
  const [addTo, setAddTo] = useState<AdminStore | null>(null);
  const open = openStore;

  if (loading && !stores) return <PageLoading />;
  const list = (stores ?? []).filter((s) => !q || `${s.name} ${s.slug} ${s.owners.map((o) => o.email).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <ErrorBox error={error} />
      <div className="relative mb-4 sm:w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="ค้นหาร้าน / อีเมลเจ้าของ" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <EmptyState icon={<StoreIcon className="h-10 w-10" />} title="ยังไม่มีร้าน" /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((s) => {
            const stale = Number(s.checks.stale_bills) || 0;
            const waiting = Number(s.checks.pending_items) || 0;
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {s.logo_url ? <img src={s.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-500">{s.name.slice(0, 1)}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{s.name}</div>
                    <div className="text-xs text-slate-500">/{s.slug} · เจ้าของ: {s.owners.map((o) => o.email).join(', ') || '—'}</div>
                    <div className="text-xs text-slate-400">สร้าง {thaiDateTime(s.created_at)} · สมาชิก {s.members} คน</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-xl bg-slate-50 p-2"><div className="font-bold">{s.menu_items}</div><div className="text-xs text-slate-500">เมนู</div></div>
                  <div className="rounded-xl bg-slate-50 p-2"><div className="font-bold">{s.orders_7d}</div><div className="text-xs text-slate-500">บิล 7 วัน</div></div>
                  <div className="rounded-xl bg-slate-50 p-2"><div className="font-bold">฿{fmt2(s.sales_7d)}</div><div className="text-xs text-slate-500">ยอด 7 วัน</div></div>
                </div>
                <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                  {CHECKS.map((c) => (
                    <li key={c.k}>
                      {s.checks[c.k]
                        ? <span className="flex items-center gap-1.5 text-slate-500"><CheckCircle2 className="h-4 w-4 text-green-500" />{c.ok}</span>
                        : <button className="flex items-center gap-1.5 text-left text-amber-700 hover:underline" onClick={() => open(s.id, c.where)}><XCircle className="h-4 w-4" />{c.bad}</button>}
                    </li>
                  ))}
                  {stale > 0 && <li className="flex items-center gap-1.5 text-red-600 sm:col-span-2"><Clock className="h-4 w-4" />บิลเปิดค้างเกิน 24 ชม. {stale} บิล
                    <button className="underline" onClick={() => open(s.id, '/orders')}>ไปจัดการ</button></li>}
                  {waiting > 0 && <li className="flex items-center gap-1.5 text-red-600 sm:col-span-2"><Clock className="h-4 w-4" />ออเดอร์ลูกค้ารอยืนยันเกิน 30 นาที {waiting} รายการ
                    <button className="underline" onClick={() => open(s.id, '/orders')}>ไปจัดการ</button></li>}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => open(s.id)}><StoreIcon className="h-4 w-4" /> เข้าจัดการร้าน</button>
                  <button className="btn-secondary" onClick={() => setAddTo(s)}><UserPlus className="h-4 w-4" /> เพิ่มสมาชิกเข้าร้าน</button>
                  <a className="btn-ghost" href={publicLink(`s/${s.slug}`)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> หน้าลูกค้า</a>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {addTo && <AddMemberModal store={addTo} onClose={() => setAddTo(null)} />}
    </div>
  );
}

function AddMemberModal({ store, onClose }: { store: AdminStore; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      must(await supabase.rpc('add_store_member', { p_store: store.id, p_email: email.trim(), p_role: role }));
      toast.ok(`เพิ่ม ${email} เป็น${ROLE_LABEL[role]}ของ ${store.name} แล้ว`); onClose();
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`เพิ่มสมาชิกเข้า ${store.name}`}
      footer={<><button className="btn-secondary" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy || !email} onClick={save}>{busy && <Spinner />} เพิ่ม</button></>}>
      <p className="mb-3 text-sm text-slate-500">ใช้เพิ่มเจ้าของคนใหม่ (โอนร้าน) หรือพนักงาน — ผู้ถูกเพิ่มต้องสมัครใช้งานแล้ว และจะได้รับการอนุมัติอัตโนมัติ</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="อีเมล"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
        <Field label="สิทธิ์">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(['staff', 'manager', 'owner'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Problems
function ProblemsTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const [all, setAll] = useState(false);
  const [errors, loading, error, reload] = useLoad(async () =>
    must(await supabase.rpc('admin_list_errors', { p_include_resolved: all })) as AppError[], [all]);
  const [busy, setBusy] = useState(false);
  // Group identical messages so a repeated problem shows once with a count.
  const groups = useMemo(() => {
    const m = new Map<string, AppError[]>();
    for (const e of errors ?? []) {
      const k = `${e.message}|${e.store_id ?? ''}|${e.resolved}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.values()];
  }, [errors]);

  async function resolve(ids: number[]) {
    setBusy(true);
    try { must(await supabase.rpc('admin_resolve_errors', { p_ids: ids })); await reload(); await onChanged(); }
    catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  }

  if (loading && !errors) return <PageLoading />;
  return (
    <div>
      <ErrorBox error={error} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-slate-500">ข้อความ error ที่สมาชิกและลูกค้าเห็นบนหน้าจอ บันทึกอัตโนมัติ — ใช้ตามแก้ปัญหาให้แต่ละร้าน</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> แสดงที่แก้แล้วด้วย</label>
        {groups.some((g) => !g[0].resolved) && (
          <button className="btn-secondary" disabled={busy} onClick={() => resolve((errors ?? []).filter((e) => !e.resolved).map((e) => e.id))}>ทำเครื่องหมายแก้แล้วทั้งหมด</button>
        )}
      </div>
      {groups.length === 0 ? <EmptyState icon={<CheckCircle2 className="h-10 w-10 text-green-400" />} title="ไม่มีปัญหาค้างอยู่" /> : (
        <div className="space-y-2">
          {groups.map((g) => {
            const e = g[0];
            return (
              <div key={e.id} className={`card p-4 ${e.resolved ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${e.resolved ? 'text-slate-400' : 'text-red-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-semibold">{e.message}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {g.length > 1 && <span className="badge mr-1 bg-red-100 text-red-700">×{g.length}</span>}
                      ล่าสุด {thaiDateTime(e.created_at)} · {e.user_email ?? 'ลูกค้า (ไม่ได้ล็อกอิน)'}
                      {e.store_name && <> · ร้าน {e.store_name}</>}
                      {e.page && <> · หน้า {e.page}</>}
                    </div>
                    {e.user_agent && <div className="mt-0.5 truncate text-[11px] text-slate-400">{e.user_agent}</div>}
                  </div>
                  <div className="flex gap-2">
                    {e.store_id && <button className="btn-secondary py-1.5 text-xs" onClick={() => openStore(e.store_id!)}>เปิดร้าน</button>}
                    {!e.resolved && <button className="btn-secondary py-1.5 text-xs" disabled={busy} onClick={() => resolve(g.map((x) => x.id))}><Check className="h-3 w-3" /> แก้แล้ว</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
