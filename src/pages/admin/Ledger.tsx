import { useMemo, useState } from 'react';
import { ListTree, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { fmt2, round2, thaiDate, todayISO, THAI_MONTHS, buddhistYear } from '@/lib/format';
import { uploadStoreFile } from '@/lib/upload';
import { PAYMENT_METHODS, type Account, type EntryType, type LedgerEntry } from '@/lib/types';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';

export function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m] = value.split('-').map(Number);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  return (
    <div className="flex gap-2">
      <select className="input w-auto" value={m} onChange={(e) => onChange(`${y}-${String(e.target.value).padStart(2, '0')}`)}>
        {THAI_MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <select className="input w-auto" value={y} onChange={(e) => onChange(`${e.target.value}-${String(m).padStart(2, '0')}`)}>
        {years.map((yy) => <option key={yy} value={yy}>{buddhistYear(yy)}</option>)}
      </select>
    </div>
  );
}

export default function Ledger() {
  const { store, feature } = useCurrentStore();
  const [ym, setYm] = useState(todayISO(store.timezone).slice(0, 7));
  const [type, setType] = useState<'all' | EntryType>('all');
  const [data, loading, error, reload] = useLoad(async () => {
    const { from, to } = monthRange(ym);
    const [e, a] = await Promise.all([
      supabase.from('ledger_entries').select('*').eq('store_id', store.id).gte('entry_date', from).lte('entry_date', to)
        .order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('store_id', store.id).order('code'),
    ]);
    return { entries: must(e) as LedgerEntry[], accounts: must(a) as Account[] };
  }, [store.id, ym]);
  const [edit, setEdit] = useState<Partial<LedgerEntry> | null>(null);
  const [chart, setChart] = useState(false);

  const totals = useMemo(() => {
    const live = (data?.entries ?? []).filter((e) => !e.voided);
    const inc = live.filter((e) => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0);
    const exp = live.filter((e) => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
    return { inc, exp, net: inc - exp };
  }, [data]);

  if (loading && !data) return <PageLoading />;
  if (!data) return <ErrorBox error={error} />;
  const accName = (code: string) => data.accounts.find((a) => a.code === code)?.name ?? code;
  const rows = data.entries.filter((e) => type === 'all' || e.type === type);

  return (
    <div>
      <PageHeader title="รายรับ-รายจ่าย" subtitle="ยอดขายจากการเช็คบิลถูกบันทึกเป็นรายรับอัตโนมัติ — บันทึกรายจ่ายพร้อมแนบรูปใบเสร็จได้ที่นี่"
        actions={<>
          {feature('chart_of_accounts') && <button className="btn-secondary" onClick={() => setChart(true)}><ListTree className="h-4 w-4" /> ผังบัญชี</button>}
          {feature('ledger_manual') && <>
            <button className="btn-secondary" onClick={() => setEdit({ type: 'income', entry_date: todayISO(store.timezone), account_code: '4900' })}><Plus className="h-4 w-4" /> รายรับ</button>
            <button className="btn-primary" onClick={() => setEdit({ type: 'expense', entry_date: todayISO(store.timezone), account_code: '5100' })}><Plus className="h-4 w-4" /> รายจ่าย</button>
          </>}
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthPicker value={ym} onChange={setYm} />
        <div className="flex rounded-xl bg-slate-100 p-1">
          {([['all', 'ทั้งหมด'], ['income', 'รายรับ'], ['expense', 'รายจ่าย']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setType(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${type === k ? 'bg-white shadow' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="รายรับ" value={totals.inc} cls="text-green-700" />
        <Stat label="รายจ่าย" value={totals.exp} cls="text-red-600" />
        <Stat label="คงเหลือ (รับ - จ่าย)" value={totals.net} cls={totals.net >= 0 ? 'text-slate-900' : 'text-red-600'} />
      </div>
      {rows.length === 0 ? <EmptyState title="ยังไม่มีรายการในเดือนนี้" /> : (
        <div className="card overflow-x-auto">
          <table className="table-std">
            <thead><tr><th>วันที่</th><th>รายการ</th><th>บัญชี</th><th>เลขที่เอกสาร</th><th className="text-right">รายรับ</th><th className="text-right">รายจ่าย</th><th className="text-right">VAT</th><th></th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className={e.voided ? 'text-slate-300 line-through' : ''}>
                  <td className="whitespace-nowrap">{thaiDate(e.entry_date)}</td>
                  <td>{e.description}{e.counterparty_name && <div className="text-xs text-slate-400">{e.counterparty_name}</div>}</td>
                  <td className="text-xs text-slate-500">{e.account_code} {accName(e.account_code)}</td>
                  <td className="whitespace-nowrap text-xs">{e.doc_no}</td>
                  <td className="text-right text-green-700">{e.type === 'income' ? fmt2(e.amount) : ''}</td>
                  <td className="text-right text-red-600">{e.type === 'expense' ? fmt2(e.amount) : ''}</td>
                  <td className="text-right text-xs">{Number(e.vat_amount) ? fmt2(e.vat_amount) : ''}</td>
                  <td className="whitespace-nowrap text-right">
                    {e.attachment_url && <a href={e.attachment_url} target="_blank" rel="noreferrer" className="btn-ghost px-1.5" aria-label="ไฟล์แนบ"><Paperclip className="h-4 w-4" /></a>}
                    {!e.order_id && feature('ledger_manual') && <button className="btn-ghost px-1.5" onClick={() => setEdit(e)} aria-label="แก้ไข"><Pencil className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <EntryModal draft={edit} accounts={data.accounts} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
      {chart && <ChartModal accounts={data.accounts} onClose={() => setChart(false)} onChanged={reload} />}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return <div className="card p-4"><div className="text-sm text-slate-500">{label}</div><div className={`text-2xl font-bold ${cls}`}>฿{fmt2(value)}</div></div>;
}

function EntryModal({ draft, accounts, onClose, onSaved }: { draft: Partial<LedgerEntry>; accounts: Account[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { store, feature } = useCurrentStore();
  const [d, setD] = useState<Partial<LedgerEntry>>({ payment_method: 'cash', amount: 0, vat_amount: 0, ...draft });
  const [hasVat, setHasVat] = useState(Number(draft.vat_amount) > 0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accs = accounts.filter((a) => a.type === d.type && (a.active || a.code === d.account_code));

  const setAmount = (amount: number) => setD((x) => ({
    ...x, amount, vat_amount: hasVat ? round2((amount * Number(store.vat_rate || 7)) / (100 + Number(store.vat_rate || 7))) : 0,
  }));

  async function save() {
    if (!d.description?.trim()) { setError('กรุณาใส่รายละเอียด'); return; }
    if (!(Number(d.amount) > 0)) { setError('จำนวนเงินต้องมากกว่า 0'); return; }
    setBusy(true); setError(null);
    const row = {
      store_id: store.id, entry_date: d.entry_date, type: d.type, account_code: d.account_code, description: d.description.trim(),
      amount: Number(d.amount), vat_amount: hasVat ? Number(d.vat_amount) || 0 : 0, counterparty_name: d.counterparty_name || null,
      counterparty_tax_id: d.counterparty_tax_id || null, counterparty_branch: d.counterparty_branch || null, doc_no: d.doc_no || null,
      payment_method: d.payment_method || null, attachment_url: d.attachment_url || null,
    };
    try {
      if (d.id) must(await supabase.from('ledger_entries').update(row).eq('id', d.id).select('id'));
      else must(await supabase.from('ledger_entries').insert(row).select('id'));
      toast.ok('บันทึกแล้ว');
      await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!d.id || !confirm('ลบรายการนี้?')) return;
    try { must(await supabase.from('ledger_entries').delete().eq('id', d.id).select('id')); await onSaved(); } catch (e) { setError((e as Error).message); }
  }
  async function onFile(f?: File) {
    if (!f) return;
    setUploading(true);
    try { const url = await uploadStoreFile(store, f, 'receipts'); setD((x) => ({ ...x, attachment_url: url })); }
    catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }

  const isExp = d.type === 'expense';
  return (
    <Modal open onClose={onClose} title={`${d.id ? 'แก้ไข' : 'บันทึก'}${isExp ? 'รายจ่าย' : 'รายรับ'}`} wide
      footer={<>
        {d.id && <button className="btn-ghost mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> ลบ</button>}
        <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" disabled={busy || uploading} onClick={save}>{busy && <Spinner />} บันทึก</button>
      </>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="วันที่"><input className="input" type="date" value={d.entry_date ?? ''} onChange={(e) => setD({ ...d, entry_date: e.target.value })} /></Field>
          <Field label="หมวดบัญชี" className="sm:col-span-2">
            <select className="input" value={d.account_code} onChange={(e) => setD({ ...d, account_code: e.target.value })}>
              {accs.map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
          </Field>
          <Field label="รายละเอียด *" className="sm:col-span-3"><input className="input" value={d.description ?? ''} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder={isExp ? 'เช่น ซื้อหมู ผัก ตลาดไท' : 'เช่น รายได้จัดเลี้ยงนอกสถานที่'} /></Field>
          <Field label="จำนวนเงินรวม (บาท) *"><input className="input text-lg font-bold" type="number" min={0} step="0.01" value={d.amount ?? ''} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <div className="pt-7">
            <Toggle checked={hasVat} onChange={(v) => { setHasVat(v); setD((x) => ({ ...x, vat_amount: v ? round2((Number(x.amount) * Number(store.vat_rate || 7)) / (100 + Number(store.vat_rate || 7))) : 0 })); }}
              label={isExp ? 'มีใบกำกับภาษี (ภาษีซื้อ)' : 'มี VAT'} />
          </div>
          {hasVat && <Field label="ภาษีมูลค่าเพิ่ม (รวมอยู่ในยอด)"><input className="input" type="number" step="0.01" value={d.vat_amount ?? 0} onChange={(e) => setD({ ...d, vat_amount: Number(e.target.value) })} /></Field>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={isExp ? 'ผู้ขาย / ร้านค้า' : 'ผู้ซื้อ / ผู้จ่ายเงิน'}><input className="input" value={d.counterparty_name ?? ''} onChange={(e) => setD({ ...d, counterparty_name: e.target.value })} /></Field>
          <Field label="เลขผู้เสียภาษี"><input className="input" inputMode="numeric" maxLength={13} value={d.counterparty_tax_id ?? ''} onChange={(e) => setD({ ...d, counterparty_tax_id: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="สาขา (00000 = สนญ.)"><input className="input" maxLength={5} value={d.counterparty_branch ?? ''} onChange={(e) => setD({ ...d, counterparty_branch: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="เลขที่ใบเสร็จ/ใบกำกับ"><input className="input" value={d.doc_no ?? ''} onChange={(e) => setD({ ...d, doc_no: e.target.value })} /></Field>
          <Field label="ชำระโดย">
            <select className="input" value={d.payment_method ?? 'cash'} onChange={(e) => setD({ ...d, payment_method: e.target.value })}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {feature('ledger_attachments') && <Field label="แนบรูปใบเสร็จ">
            <label className="btn-secondary w-full cursor-pointer">
              {uploading ? <Spinner /> : <Paperclip className="h-4 w-4" />} {d.attachment_url ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์/ถ่ายรูป'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {d.attachment_url && <a className="mt-1 block truncate text-xs text-brand-700 underline" href={d.attachment_url} target="_blank" rel="noreferrer">ดูไฟล์แนบ</a>}
          </Field>}
        </div>
      </div>
    </Modal>
  );
}

const PL_GROUPS: Record<Account['pl_group'], string> = {
  revenue: 'รายได้จากการขาย/บริการ', other_income: 'รายได้อื่น', cogs: 'ต้นทุนขาย', operating: 'ค่าใช้จ่ายในการดำเนินงาน', finance: 'ต้นทุนทางการเงิน', tax: 'ภาษีเงินได้',
};

function ChartModal({ accounts, onClose, onChanged }: { accounts: Account[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const { store } = useCurrentStore();
  const [f, setF] = useState({ code: '', name: '', type: 'expense' as EntryType, pl_group: 'operating' as Account['pl_group'] });
  const add = async () => {
    if (!f.code || !f.name) return;
    try { must(await supabase.from('accounts').insert({ ...f, store_id: store.id }).select('id')); setF({ ...f, code: '', name: '' }); await onChanged(); }
    catch (e) { toast.err((e as Error).message.includes('duplicate') ? 'รหัสบัญชีซ้ำ' : (e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title="ผังบัญชี (Chart of Accounts)" wide>
      <p className="mb-3 text-sm text-slate-500">หมวด 4xxx = รายได้, 5xxx = ค่าใช้จ่าย — เพิ่มหมวดของร้านเองได้ ระบบใช้กลุ่มงบกำไรขาดทุนในการทำรายงาน</p>
      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <input className="input" placeholder="รหัส เช่น 5120" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <input className="input sm:col-span-2" placeholder="ชื่อบัญชี" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className="input" value={f.pl_group} onChange={(e) => {
          const g = e.target.value as Account['pl_group'];
          setF({ ...f, pl_group: g, type: g === 'revenue' || g === 'other_income' ? 'income' : 'expense' });
        }}>
          {Object.entries(PL_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> เพิ่ม</button>
      </div>
      <table className="table-std">
        <thead><tr><th>รหัส</th><th>ชื่อบัญชี</th><th>กลุ่ม</th><th>ใช้งาน</th></tr></thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.code}</td><td>{a.name}</td><td className="text-xs text-slate-500">{PL_GROUPS[a.pl_group]}</td>
              <td><Toggle checked={a.active} onChange={async (v) => { must(await supabase.from('accounts').update({ active: v }).eq('id', a.id).select('id')); await onChanged(); }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export { PL_GROUPS };
