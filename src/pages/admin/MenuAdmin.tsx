import { useState } from 'react';
import { ArrowDown, ArrowUp, ImageOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { fmtPrice } from '@/lib/format';
import { uploadStoreFile } from '@/lib/upload';
import type { Category, MenuItem } from '@/lib/types';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';

type Draft = Partial<MenuItem> & { name: string; price: number };

export default function MenuAdmin() {
  const { store } = useCurrentStore();
  const [data, loading, error, reload] = useLoad(async () => {
    const [c, i] = await Promise.all([
      supabase.from('categories').select('*').eq('store_id', store.id).order('sort').order('name'),
      supabase.from('menu_items').select('*').eq('store_id', store.id).order('sort').order('name'),
    ]);
    return { cats: must(c) as Category[], items: must(i) as MenuItem[] };
  }, [store.id]);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [cats, setCats] = useState(false);
  const [filter, setFilter] = useState('all');

  if (loading && !data) return <PageLoading />;
  if (!data) return <ErrorBox error={error} />;

  const shown = data.items.filter((i) => filter === 'all' || (filter === 'none' ? !i.category_id : i.category_id === filter));

  async function toggleAvailable(i: MenuItem) {
    try { must(await supabase.from('menu_items').update({ available: !i.available }).eq('id', i.id).select('id')); await reload(); }
    catch (e) { toast.err((e as Error).message); }
  }

  return (
    <div>
      <PageHeader title="เมนูและราคา" subtitle="เพิ่มรูป ชื่อ ราคา — แสดงบนแท็บเล็ต POS และหน้าสั่งอาหารของลูกค้าทันที"
        actions={<>
          <button className="btn-secondary" onClick={() => setCats(true)}>หมวดหมู่ ({data.cats.length})</button>
          <button className="btn-primary" onClick={() => setEdit({ name: '', price: 0, available: true, category_id: filter !== 'all' && filter !== 'none' ? filter : data.cats[0]?.id ?? null })}>
            <Plus className="h-4 w-4" /> เพิ่มเมนู
          </button>
        </>} />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[{ id: 'all', name: `ทั้งหมด (${data.items.length})` }, ...data.cats, { id: 'none', name: 'ไม่มีหมวด' }].map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${filter === c.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{c.name}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState title="ยังไม่มีเมนูในหมวดนี้">กด “เพิ่มเมนู” เพื่อเริ่ม</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <div key={i.id} className="card flex gap-3 p-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {i.image_url ? <img src={i.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{i.name}</div>
                <div className="text-xs text-slate-400">{data.cats.find((c) => c.id === i.category_id)?.name ?? 'ไม่มีหมวด'}</div>
                <div className="font-bold text-brand-700">฿{fmtPrice(i.price)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <Toggle checked={i.available} onChange={() => toggleAvailable(i)} label={<span className="text-xs">{i.available ? 'มีขาย' : 'หมด'}</span>} />
                  <button className="btn-ghost px-2" onClick={() => setEdit({ ...i, price: Number(i.price) })}><Pencil className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <ItemModal draft={edit} cats={data.cats} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
      {cats && <CategoriesModal cats={data.cats} onClose={() => setCats(false)} onChanged={reload} />}
    </div>
  );
}

function ItemModal({ draft, cats, onClose, onSaved }: { draft: Draft; cats: Category[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { store } = useCurrentStore();
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(f?: File) {
    if (!f) return;
    setUploading(true); setError(null);
    try { setD((x) => ({ ...x, image_url: null })); const url = await uploadStoreFile(store, f, 'menu'); setD((x) => ({ ...x, image_url: url })); }
    catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }

  async function save() {
    if (!d.name.trim()) { setError('กรุณาใส่ชื่อเมนู'); return; }
    setBusy(true); setError(null);
    const row = {
      store_id: store.id, name: d.name.trim(), price: Number(d.price) || 0, description: d.description || null,
      category_id: d.category_id || null, image_url: d.image_url || null, available: d.available ?? true, sort: Number(d.sort) || 0,
    };
    try {
      if (d.id) must(await supabase.from('menu_items').update(row).eq('id', d.id).select('id'));
      else must(await supabase.from('menu_items').insert(row).select('id'));
      toast.ok('บันทึกเมนูแล้ว');
      await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!d.id || !confirm(`ลบเมนู “${d.name}”? (บิลเก่ายังเก็บชื่อและราคาไว้)`)) return;
    try { must(await supabase.from('menu_items').delete().eq('id', d.id).select('id')); await onSaved(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <Modal open onClose={onClose} title={d.id ? 'แก้ไขเมนู' : 'เพิ่มเมนู'}
      footer={<>
        {d.id && <button className="btn-ghost mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> ลบ</button>}
        <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" onClick={save} disabled={busy || uploading}>{busy && <Spinner />} บันทึก</button>
      </>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-brand-500">
          {d.image_url ? <img src={d.image_url} alt="" className="h-full w-full object-cover" />
            : <div className="flex flex-col items-center gap-1">{uploading ? <Spinner /> : <ImagePlus className="h-8 w-8" />}<span className="text-sm">แตะเพื่อถ่าย/เลือกรูปเมนู</span></div>}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {d.image_url && <span className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700">เปลี่ยนรูป</span>}
        </label>
        <Field label="หรือวางลิงก์รูป"><input className="input" value={d.image_url ?? ''} onChange={(e) => setD({ ...d, image_url: e.target.value })} placeholder="https://…" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ชื่อเมนู *" className="sm:col-span-2"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
          <Field label="ราคา (บาท) *"><input className="input text-lg font-bold" type="number" min={0} step="0.01" value={d.price} onChange={(e) => setD({ ...d, price: Number(e.target.value) })} /></Field>
          <Field label="หมวดหมู่">
            <select className="input" value={d.category_id ?? ''} onChange={(e) => setD({ ...d, category_id: e.target.value || null })}>
              <option value="">— ไม่มีหมวด —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="รายละเอียด" className="sm:col-span-2"><textarea className="input" rows={2} value={d.description ?? ''} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
          <Field label="ลำดับการแสดง" hint="เลขน้อยแสดงก่อน"><input className="input" type="number" value={d.sort ?? 0} onChange={(e) => setD({ ...d, sort: Number(e.target.value) })} /></Field>
          <div className="pt-7"><Toggle checked={d.available ?? true} onChange={(v) => setD({ ...d, available: v })} label="มีขาย" /></div>
        </div>
      </div>
    </Modal>
  );
}

function CategoriesModal({ cats, onClose, onChanged }: { cats: Category[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const { store } = useCurrentStore();
  const [name, setName] = useState('');
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await onChanged(); } catch (e) { toast.err((e as Error).message); } };

  const add = () => act(async () => {
    if (!name.trim()) return;
    must(await supabase.from('categories').insert({ store_id: store.id, name: name.trim(), sort: (cats.at(-1)?.sort ?? 0) + 10 }).select('id'));
    setName('');
  });
  const swap = (a: Category, b: Category) => act(async () => {
    const sa = a.sort === b.sort ? b.sort + 1 : b.sort;
    must(await supabase.from('categories').update({ sort: sa }).eq('id', a.id).select('id'));
    must(await supabase.from('categories').update({ sort: a.sort }).eq('id', b.id).select('id'));
  });

  return (
    <Modal open onClose={onClose} title="หมวดหมู่เมนู">
      <div className="mb-4 flex gap-2">
        <input className="input" placeholder="เช่น อาหารจานเดียว, เครื่องดื่ม" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> เพิ่ม</button>
      </div>
      <ul className="divide-y divide-slate-100">
        {cats.map((c, idx) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <input className="input flex-1" defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && act(async () => must(await supabase.from('categories').update({ name: e.target.value.trim() }).eq('id', c.id).select('id')))} />
            <button className="btn-ghost px-2" disabled={idx === 0} onClick={() => swap(c, cats[idx - 1])} aria-label="ขึ้น"><ArrowUp className="h-4 w-4" /></button>
            <button className="btn-ghost px-2" disabled={idx === cats.length - 1} onClick={() => swap(c, cats[idx + 1])} aria-label="ลง"><ArrowDown className="h-4 w-4" /></button>
            <Toggle checked={c.active} onChange={(v) => act(async () => must(await supabase.from('categories').update({ active: v }).eq('id', c.id).select('id')))} />
            <button className="btn-ghost px-2 text-red-600" aria-label="ลบ"
              onClick={() => confirm(`ลบหมวด “${c.name}”? เมนูในหมวดจะกลายเป็น “ไม่มีหมวด”`) && act(async () => must(await supabase.from('categories').delete().eq('id', c.id).select('id')))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
