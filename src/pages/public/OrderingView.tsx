import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ImageOff, Minus, Plus, ShoppingBag } from 'lucide-react';
import { fmt2, fmtPrice } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import type { PublicStore } from '@/lib/types';
import { displayableImageUrl } from '@/lib/upload';
import { Modal, Spinner } from '@/components/ui';

export interface CartItem { menu_item_id: string; qty: number; note: string }
export interface PlaceResult { order_id: string; order_no: string; table_code: string; items: number }

/** Customer menu with photos, prices and a cart. Used by the table QR page and the LINE LIFF page. */
export default function OrderingView({ data, tableLabel, canOrder, onPlace, header }: {
  data: PublicStore;
  tableLabel?: string;
  canOrder: boolean;
  onPlace?: (items: CartItem[], note: string, name: string) => Promise<PlaceResult>;
  header?: React.ReactNode;
}) {
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PlaceResult | null>(null);

  const items = useMemo(() => data.items.filter((i) => cat === 'all' || i.category_id === cat), [data, cat]);
  const lines = Object.values(cart).filter((l) => l.qty > 0);
  const price = (id: string) => Number(data.items.find((i) => i.id === id)?.price ?? 0);
  const subtotal = lines.reduce((s, l) => s + price(l.menu_item_id) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const totals = computeTotals(data.store, subtotal);
  const setQty = (id: string, d: number) => setCart((c) => ({ ...c, [id]: { menu_item_id: id, note: c[id]?.note ?? '', qty: Math.max(0, Math.min(50, (c[id]?.qty ?? 0) + d)) } }));

  async function place() {
    if (!onPlace || !lines.length) return;
    setBusy(true); setError(null);
    try { setDone(await onPlace(lines, note.trim(), name.trim())); setCart({}); setNote(''); setOpen(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold">ส่งออเดอร์แล้ว!</h2>
        <p className="text-slate-600">โต๊ะ {done.table_code} · {done.items} รายการ<br />พนักงานจะยืนยันออเดอร์และเริ่มทำอาหารให้ค่ะ</p>
        <Link to={`/bill/${done.order_id}`} className="btn-secondary">ดูรายการที่สั่ง / ยอดรวม</Link>
        <button className="btn-primary" onClick={() => setDone(null)}>สั่งเพิ่ม</button>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {header}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
        {tableLabel && <div className="mb-2 text-center text-sm font-semibold text-brand-700">{tableLabel}</div>}
        <div className="flex gap-2 overflow-x-auto">
          {[{ id: 'all', name: 'ทั้งหมด' }, ...data.categories].map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${cat === c.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c.name}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
        {items.map((i) => {
          const q = cart[i.id]?.qty ?? 0;
          return (
            <div key={i.id} className={`card overflow-hidden ${i.available ? '' : 'opacity-50'}`}>
              <div className="relative aspect-square bg-slate-100">
                {i.image_url ? <img src={i.image_url} alt={i.name} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff className="h-8 w-8" /></div>}
                {!i.available && <span className="badge absolute left-2 top-2 bg-slate-900 text-white">หมด</span>}
              </div>
              <div className="p-3">
                <div className="line-clamp-2 font-semibold leading-tight">{i.name}</div>
                {i.description && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{i.description}</div>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-brand-700">฿{fmtPrice(i.price)}</span>
                  {canOrder && i.available && (q === 0
                    ? <button className="btn-primary h-9 w-9 rounded-full p-0" onClick={() => setQty(i.id, 1)} aria-label={`เพิ่ม ${i.name}`}><Plus className="h-5 w-5" /></button>
                    : <div className="flex items-center gap-1">
                        <button className="btn-secondary h-8 w-8 rounded-full p-0" onClick={() => setQty(i.id, -1)} aria-label="ลด"><Minus className="h-4 w-4" /></button>
                        <span className="w-6 text-center font-bold">{q}</span>
                        <button className="btn-primary h-8 w-8 rounded-full p-0" onClick={() => setQty(i.id, 1)} aria-label="เพิ่ม"><Plus className="h-4 w-4" /></button>
                      </div>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {canOrder && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3" style={{ paddingBottom: 'max(.75rem, env(safe-area-inset-bottom))' }}>
          <button className="btn-primary w-full rounded-2xl py-4 text-base shadow-xl" onClick={() => setOpen(true)}>
            <ShoppingBag className="h-5 w-5" /> ดูตะกร้า {count} รายการ · ฿{fmt2(subtotal)}
          </button>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="ยืนยันออเดอร์"
        footer={<button className="btn-primary w-full py-3" disabled={busy || !lines.length} onClick={place}>{busy && <Spinner />} ส่งออเดอร์{tableLabel ? ` (${tableLabel})` : ''}</button>}>
        <div className="space-y-3">
          {lines.map((l) => {
            const it = data.items.find((i) => i.id === l.menu_item_id)!;
            return (
              <div key={l.menu_item_id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex justify-between gap-2"><span className="font-semibold">{it.name}</span><span>฿{fmt2(Number(it.price) * l.qty)}</span></div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="btn-secondary h-8 w-8 p-0" onClick={() => setQty(l.menu_item_id, -1)}><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center font-bold">{l.qty}</span>
                  <button className="btn-secondary h-8 w-8 p-0" onClick={() => setQty(l.menu_item_id, 1)}><Plus className="h-4 w-4" /></button>
                  <input className="input ml-2 py-1.5 text-xs" placeholder="หมายเหตุ เช่น ไม่เผ็ด" value={l.note}
                    onChange={(e) => setCart((c) => ({ ...c, [l.menu_item_id]: { ...l, note: e.target.value } }))} />
                </div>
              </div>
            );
          })}
          <input className="input" placeholder="ชื่อเล่น (ไม่บังคับ)" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input" rows={2} placeholder="หมายเหตุถึงร้าน (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between"><span>รวม</span><span>฿{fmt2(subtotal)}</span></div>
            {totals.service > 0 && <div className="flex justify-between text-slate-500"><span>ค่าบริการ {Number(data.store.service_charge_rate)}%</span><span>฿{fmt2(totals.service)}</span></div>}
            {data.store.vat_registered && !data.store.prices_include_vat && <div className="flex justify-between text-slate-500"><span>VAT</span><span>฿{fmt2(totals.vat)}</span></div>}
            <div className="mt-1 flex justify-between font-bold"><span>ยอดโดยประมาณ</span><span>฿{fmt2(totals.total)}</span></div>
          </div>
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </div>
      </Modal>
    </div>
  );
}

export type BannerStore = Pick<PublicStore['store'], 'name' | 'logo_url' | 'open_time' | 'close_time'> &
  Partial<Pick<PublicStore['store'], 'cover_image_url' | 'welcome_text'>>;

/** Store header on customer pages: brand colour, or the cover photo when the store has one. */
export function StoreBanner({ store, sub }: { store: BannerStore; sub?: React.ReactNode }) {
  const cover = store.cover_image_url ? displayableImageUrl(store.cover_image_url) : null;
  const hours = store.open_time && store.close_time ? `เปิด ${store.open_time.slice(0, 5)}–${store.close_time.slice(0, 5)} น.` : '';
  return (
    <div className={`relative overflow-hidden text-white ${cover ? 'min-h-[9.5rem]' : 'bg-brand-600'}`}>
      {cover && <>
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
      </>}
      <div className={`flex items-center gap-3 px-4 py-4 ${cover ? 'absolute inset-x-0 bottom-0' : 'relative'}`}>
        {store.logo_url ? <img src={displayableImageUrl(store.logo_url)} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover shadow" />
          : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">{store.name.slice(0, 1)}</div>}
        <div className="min-w-0">
          <div className="truncate text-lg font-bold drop-shadow">{store.name}</div>
          {store.welcome_text && <div className="text-sm font-medium text-white/95 drop-shadow">{store.welcome_text}</div>}
          <div className="text-xs text-white/80">{sub ?? hours}</div>
        </div>
      </div>
    </div>
  );
}
