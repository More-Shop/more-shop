import { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { thaiDate } from '@/lib/format';
import type { Role } from '@/lib/types';
import { Field, PageHeader, PageLoading, Spinner, toast, useLoad } from '@/components/ui';
import { ROLE_LABEL } from '@/components/Layout';

interface Member { user_id: string; email: string; role: Role; created_at: string }

const ROLE_DESC: Record<Role, string> = {
  owner: 'ทุกอย่าง รวมถึงพนักงาน การเชื่อม LINE และลบร้าน',
  manager: 'เมนู โต๊ะ บัญชี รายงาน ตั้งค่าร้าน + งานหน้าร้าน',
  staff: 'POS รับออเดอร์ เช็คบิล การจอง และเปิด/ปิดเมนูที่หมด',
};

export default function Staff() {
  const { store } = useCurrentStore();
  const { user } = useAuth();
  const [members, loading, , reload] = useLoad(async () =>
    must(await supabase.rpc('list_store_members', { p_store: store.id })) as Member[], [store.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      must(await supabase.rpc('add_store_member', { p_store: store.id, p_email: email.trim(), p_role: role }));
      toast.ok('เพิ่มพนักงานแล้ว'); setEmail(''); await reload();
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  }
  async function update(m: Member, r: Role) {
    try { must(await supabase.from('store_members').update({ role: r }).eq('store_id', store.id).eq('user_id', m.user_id).select('user_id')); await reload(); }
    catch (e) { toast.err((e as Error).message); }
  }
  async function remove(m: Member) {
    if (!confirm(`นำ ${m.email} ออกจากร้าน?`)) return;
    try { must(await supabase.from('store_members').delete().eq('store_id', store.id).eq('user_id', m.user_id).select('user_id')); await reload(); }
    catch (e) { toast.err((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="พนักงาน" subtitle="แต่ละคนเข้าระบบด้วยอีเมลของตัวเอง — ให้พนักงานกด “สมัครใช้งาน” ก่อน แล้วเพิ่มอีเมลที่นี่" />
      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="อีเมลพนักงาน"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" /></Field>
        <Field label="สิทธิ์">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(['staff', 'manager', 'owner'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        <button className="btn-primary" onClick={add} disabled={busy}>{busy ? <Spinner /> : <UserPlus className="h-4 w-4" />} เพิ่ม</button>
        <p className="text-xs text-slate-500 sm:col-span-3">{ROLE_LABEL[role]}: {ROLE_DESC[role]}</p>
      </div>
      {loading && !members ? <PageLoading /> : (
        <div className="card divide-y divide-slate-100">
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.email}{m.user_id === user?.id && <span className="ml-2 text-xs text-slate-400">(คุณ)</span>}</div>
                <div className="text-xs text-slate-400">เพิ่มเมื่อ {thaiDate(m.created_at)}</div>
              </div>
              <select className="input w-36" value={m.role} onChange={(e) => update(m, e.target.value as Role)}>
                {(['staff', 'manager', 'owner'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button className="btn-ghost px-2 text-red-600" onClick={() => remove(m)} aria-label="ลบ"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
