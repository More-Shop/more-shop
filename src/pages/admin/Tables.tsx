import { useState } from 'react';
import { Copy, Link2, Pencil, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { publicLink } from '@/lib/config';
import { printHtml } from '@/lib/print';
import { linkQrHtml, tableQrHtml } from '@/print/templates';
import type { DiningTable } from '@/lib/types';
import { EmptyState, Field, Modal, PageHeader, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';

export const tableUrl = (slug: string, t: Pick<DiningTable, 'qr_token'>) => publicLink(`s/${slug}/t/${t.qr_token}`);

export default function Tables() {
  const { store } = useCurrentStore();
  const [tables, loading, , reload] = useLoad(async () =>
    must(await supabase.from('dining_tables').select('*').eq('store_id', store.id).order('sort').order('code')) as DiningTable[], [store.id]);
  const [edit, setEdit] = useState<Partial<DiningTable> | null>(null);
  const [bulk, setBulk] = useState(false);
  const [printing, setPrinting] = useState(false);

  if (loading && !tables) return <PageLoading />;
  const list = tables ?? [];

  async function printQr(ts: DiningTable[]) {
    setPrinting(true);
    try {
      const html = await tableQrHtml(store, ts.map((t) => ({ code: t.code, zone: t.zone, url: tableUrl(store.slug, t) })));
      await printHtml(html, store.paper_width, `QR-โต๊ะ-${store.slug}`);
    } finally { setPrinting(false); }
  }

  async function printLink(kind: 'book' | 'line') {
    const url = kind === 'book' ? publicLink(`s/${store.slug}/book`)
      : store.line_oa_basic_id ? `https://line.me/R/ti/p/${encodeURIComponent(store.line_oa_basic_id)}` : null;
    if (!url) { toast.err('ยังไม่ได้ตั้งค่า LINE OA ID ในหน้าตั้งค่า'); return; }
    await printHtml(await linkQrHtml(store, kind === 'book' ? 'สแกนเพื่อจองโต๊ะ' : 'เพิ่มเพื่อน LINE รับสิทธิ์ จอง & สั่งอาหาร', url,
      kind === 'line' ? store.line_oa_basic_id ?? '' : ''), store.paper_width, `QR-${kind}`);
  }

  const copy = async (text: string) => { await navigator.clipboard.writeText(text).catch(() => undefined); toast.ok('คัดลอกลิงก์แล้ว'); };

  return (
    <div>
      <PageHeader title="โต๊ะ & QR Code" subtitle="พิมพ์ QR ไปวางบนโต๊ะ ลูกค้าสแกนแล้วสั่งอาหารได้เลย (ออเดอร์จะเข้าหน้า “ออเดอร์” ให้พนักงานยืนยัน)"
        actions={<>
          <button className="btn-secondary" onClick={() => printLink('book')}><Printer className="h-4 w-4" /> QR จองโต๊ะ</button>
          <button className="btn-secondary" onClick={() => printLink('line')}><Printer className="h-4 w-4" /> QR เพิ่มเพื่อน LINE</button>
          <button className="btn-secondary" disabled={!list.length || printing} onClick={() => printQr(list.filter((t) => t.active))}>
            {printing ? <Spinner /> : <Printer className="h-4 w-4" />} พิมพ์ QR ทุกโต๊ะ
          </button>
          <button className="btn-secondary" onClick={() => setBulk(true)}>เพิ่มหลายโต๊ะ</button>
          <button className="btn-primary" onClick={() => setEdit({ code: '', seats: 4, active: true })}><Plus className="h-4 w-4" /> เพิ่มโต๊ะ</button>
        </>} />
      {list.length === 0 ? (
        <EmptyState title="ยังไม่มีโต๊ะ">กด “เพิ่มหลายโต๊ะ” เพื่อสร้างโต๊ะ 1–10 ได้ในครั้งเดียว</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => (
            <div key={t.id} className={`card p-4 ${t.active ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold">โต๊ะ {t.code}</div>
                  <div className="text-sm text-slate-500">{t.seats} ที่นั่ง{t.zone ? ` · ${t.zone}` : ''}</div>
                </div>
                <button className="btn-ghost px-2" onClick={() => setEdit(t)} aria-label="แก้ไข"><Pencil className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn-secondary flex-1 px-2" onClick={() => printQr([t])}><Printer className="h-4 w-4" /> พิมพ์ QR</button>
                <button className="btn-secondary px-3" onClick={() => copy(tableUrl(store.slug, t))} aria-label="คัดลอกลิงก์"><Copy className="h-4 w-4" /></button>
                <a className="btn-secondary px-3" href={tableUrl(store.slug, t)} target="_blank" rel="noreferrer" aria-label="เปิดลิงก์"><Link2 className="h-4 w-4" /></a>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <TableModal draft={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
      {bulk && <BulkModal existing={list} onClose={() => setBulk(false)} onSaved={async () => { setBulk(false); await reload(); }} />}
    </div>
  );
}

function TableModal({ draft, onClose, onSaved }: { draft: Partial<DiningTable>; onClose: () => void; onSaved: () => Promise<void> }) {
  const { store } = useCurrentStore();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!d.code?.trim()) return;
    setBusy(true);
    try {
      const row = { store_id: store.id, code: d.code.trim(), zone: d.zone || null, seats: Number(d.seats) || 1, active: d.active ?? true, sort: Number(d.sort) || 0 };
      if (d.id) must(await supabase.from('dining_tables').update(row).eq('id', d.id).select('id'));
      else must(await supabase.from('dining_tables').insert(row).select('id'));
      await onSaved();
    } catch (e) {
      const m = (e as Error).message;
      toast.err(m.includes('duplicate') ? 'หมายเลขโต๊ะซ้ำ' : m);
    } finally { setBusy(false); }
  };
  const regen = async () => {
    if (!d.id || !confirm('สร้าง QR ใหม่? QR เดิมที่พิมพ์ไว้จะใช้ไม่ได้ (ใช้เมื่อ QR หลุดออกไปนอกร้าน)')) return;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
    try { must(await supabase.from('dining_tables').update({ qr_token: token }).eq('id', d.id).select('id')); toast.ok('สร้าง QR ใหม่แล้ว อย่าลืมพิมพ์ใหม่'); await onSaved(); }
    catch (e) { toast.err((e as Error).message); }
  };
  const remove = async () => {
    if (!d.id || !confirm(`ลบโต๊ะ ${d.code}?`)) return;
    try { must(await supabase.from('dining_tables').delete().eq('id', d.id).select('id')); await onSaved(); }
    catch (e) { toast.err((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={d.id ? `แก้ไขโต๊ะ ${draft.code}` : 'เพิ่มโต๊ะ'}
      footer={<>
        {d.id && <button className="btn-ghost mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /></button>}
        {d.id && <button className="btn-ghost" onClick={regen}><RefreshCw className="h-4 w-4" /> QR ใหม่</button>}
        <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />} บันทึก</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="หมายเลข/ชื่อโต๊ะ *"><input className="input" value={d.code ?? ''} onChange={(e) => setD({ ...d, code: e.target.value })} autoFocus /></Field>
        <Field label="จำนวนที่นั่ง"><input className="input" type="number" min={1} value={d.seats ?? 4} onChange={(e) => setD({ ...d, seats: Number(e.target.value) })} /></Field>
        <Field label="โซน" hint="เช่น ในร้าน, ระเบียง, ชั้น 2"><input className="input" value={d.zone ?? ''} onChange={(e) => setD({ ...d, zone: e.target.value })} /></Field>
        <Field label="ลำดับ"><input className="input" type="number" value={d.sort ?? 0} onChange={(e) => setD({ ...d, sort: Number(e.target.value) })} /></Field>
        <Toggle checked={d.active ?? true} onChange={(v) => setD({ ...d, active: v })} label="เปิดใช้งาน" />
      </div>
    </Modal>
  );
}

function BulkModal({ existing, onClose, onSaved }: { existing: DiningTable[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { store } = useCurrentStore();
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [prefix, setPrefix] = useState('');
  const [seats, setSeats] = useState(4);
  const [zone, setZone] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const codes = new Set(existing.map((t) => t.code));
    const rows = [];
    for (let n = from; n <= Math.min(to, from + 199); n++) {
      const code = `${prefix}${n}`;
      if (!codes.has(code)) rows.push({ store_id: store.id, code, seats, zone: zone || null, sort: n });
    }
    if (!rows.length) { toast.err('โต๊ะเหล่านี้มีอยู่แล้ว'); return; }
    setBusy(true);
    try { must(await supabase.from('dining_tables').insert(rows).select('id')); toast.ok(`เพิ่ม ${rows.length} โต๊ะ`); await onSaved(); }
    catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="เพิ่มหลายโต๊ะ"
      footer={<><button className="btn-secondary" onClick={onClose}>ยกเลิก</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />} เพิ่ม</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ตัวอักษรนำหน้า (ถ้ามี)" hint="เช่น A → A1, A2"><input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
        <Field label="โซน"><input className="input" value={zone} onChange={(e) => setZone(e.target.value)} /></Field>
        <Field label="จากเลข"><input className="input" type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} /></Field>
        <Field label="ถึงเลข"><input className="input" type="number" min={from} value={to} onChange={(e) => setTo(Number(e.target.value))} /></Field>
        <Field label="ที่นั่ง/โต๊ะ"><input className="input" type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}
