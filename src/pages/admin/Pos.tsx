import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Minus, NotebookPen, Plus, Printer, Search, Send, ShoppingBag, Trash2, Utensils } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { fmt2, fmtPrice } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import { printHtml } from '@/lib/print';
import { prefs } from '@/lib/prefs';
import { kitchenTicketHtml } from '@/print/templates';
import type { Category, DiningTable, MenuItem, Order } from '@/lib/types';
import { EmptyState, Field, Modal, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';
import { useStoreRealtime } from '@/components/usePendingCount';

interface CartLine { key: string; menu_item_id: string | null; name: string; unit_price: number; qty: number; note: string }

export default function Pos() {
  const { store } = useCurrentStore();
  const [data, loading, error, reload] = useLoad(async () => {
    const [cats, items, tables, open] = await Promise.all([
      supabase.from('categories').select('*').eq('store_id', store.id).eq('active', true).order('sort').order('name'),
      supabase.from('menu_items').select('*').eq('store_id', store.id).order('sort').order('name'),
      supabase.from('dining_tables').select('*').eq('store_id', store.id).eq('active', true).order('sort').order('code'),
      supabase.from('orders').select('id, table_id, order_no, total').eq('store_id', store.id).eq('status', 'open'),
    ]);
    return {
      cats: must(cats) as Category[], items: must(items) as MenuItem[], tables: must(tables) as DiningTable[],
      open: must(open) as Pick<Order, 'id' | 'table_id' | 'order_no' | 'total'>[],
    };
  }, [store.id]);
  useStoreRealtime(store.id, () => { void reload(); }, 60000);

  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableId, setTableId] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState(false);
  const [pickTable, setPickTable] = useState(false);
  const [noteFor, setNoteFor] = useState<CartLine | null>(null);
  const [custom, setCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoPrint, setAutoPrint] = useState(prefs.autoPrintKitchen());
  const [showCart, setShowCart] = useState(false);

  const items = useMemo(() => (data?.items ?? []).filter((i) =>
    (cat === 'all' || i.category_id === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase()))), [data, cat, q]);

  if (loading && !data) return <PageLoading />;
  if (error) return <EmptyState title="โหลดข้อมูลไม่สำเร็จ">{error}</EmptyState>;
  if (!data) return null;

  const table = data.tables.find((t) => t.id === tableId) ?? null;
  const openBill = table ? data.open.find((o) => o.table_id === table.id) : undefined;
  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const t = computeTotals(store, subtotal);

  function add(i: MenuItem) {
    if (!i.available) return;
    setCart((c) => {
      const ex = c.find((l) => l.menu_item_id === i.id && !l.note);
      if (ex) return c.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: crypto.randomUUID(), menu_item_id: i.id, name: i.name, unit_price: Number(i.price), qty: 1, note: '' }];
    });
  }
  const changeQty = (key: string, d: number) =>
    setCart((c) => c.flatMap((l) => (l.key !== key ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }])));

  async function send() {
    if (!cart.length) return;
    if (!table && !takeaway) { setPickTable(true); return; }
    setSending(true);
    try {
      const orderId = must(await supabase.rpc('pos_add_items', {
        p_store: store.id, p_order: null, p_table: takeaway ? null : table!.id,
        p_items: cart.map((l) => ({ menu_item_id: l.menu_item_id, name: l.name, unit_price: l.unit_price, qty: l.qty, note: l.note })),
        p_note: null,
      })) as string;
      const order = must(await supabase.from('orders').select('*').eq('id', orderId).single()) as Order;
      if (autoPrint) {
        const round = must(await supabase.from('order_items').select('round').eq('order_id', orderId)
          .order('round', { ascending: false }).limit(1)) as { round: number }[];
        await printHtml(kitchenTicketHtml(store, order, cart, round[0]?.round), store.paper_width, `ครัว-${order.order_no}`);
      }
      toast.ok(`ส่งออเดอร์${order.table_code ? ` โต๊ะ ${order.table_code}` : ' (กลับบ้าน)'} แล้ว · บิล #${order.order_no}`);
      setCart([]); setShowCart(false);
      void reload();
    } catch (e) {
      toast.err((e as Error).message);
    } finally { setSending(false); }
  }

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <button onClick={() => setPickTable(true)}
          className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left ${table || takeaway ? 'border-brand-500 bg-brand-50' : 'border-dashed border-slate-300'}`}>
          <span className="flex items-center gap-2 font-bold">
            {takeaway ? <><ShoppingBag className="h-5 w-5" /> กลับบ้าน</> : table ? <><Utensils className="h-5 w-5" /> โต๊ะ {table.code}</> : 'เลือกโต๊ะ'}
          </span>
          <span className="text-sm text-slate-500">{openBill ? `บิลเปิด #${openBill.order_no} · ฿${fmt2(openBill.total)}` : 'เปลี่ยน'}</span>
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {cart.length === 0 && <p className="py-10 text-center text-sm text-slate-400">แตะเมนูเพื่อเพิ่มรายการ</p>}
        {cart.map((l) => (
          <div key={l.key} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{l.name}</div>
                <div className="text-xs text-slate-500">฿{fmtPrice(l.unit_price)}</div>
                {l.note && <div className="mt-1 text-xs font-medium text-amber-700">* {l.note}</div>}
              </div>
              <div className="font-semibold">{fmt2(l.unit_price * l.qty)}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-secondary h-9 w-9 p-0" onClick={() => changeQty(l.key, -1)} aria-label="ลด">{l.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
              <span className="w-8 text-center font-bold">{l.qty}</span>
              <button className="btn-secondary h-9 w-9 p-0" onClick={() => changeQty(l.key, 1)} aria-label="เพิ่ม"><Plus className="h-4 w-4" /></button>
              <button className="btn-ghost ml-auto px-2 text-xs" onClick={() => setNoteFor(l)}><NotebookPen className="h-4 w-4" /> หมายเหตุ</button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-slate-100 p-4">
        <div className="flex justify-between text-sm text-slate-500"><span>{count} รายการ</span><span>รวม ฿{fmt2(subtotal)}</span></div>
        {(t.service > 0 || (store.vat_registered && !store.prices_include_vat)) && (
          <div className="flex justify-between text-xs text-slate-400"><span>รวมค่าบริการ/VAT</span><span>฿{fmt2(t.total)}</span></div>
        )}
        <Toggle checked={autoPrint} onChange={(v) => { setAutoPrint(v); prefs.setAutoPrintKitchen(v); }} label={<span className="flex items-center gap-1"><Printer className="h-4 w-4" /> พิมพ์ใบสั่งครัวอัตโนมัติ</span>} />
        <button className="btn-primary w-full py-4 text-base" disabled={!cart.length || sending} onClick={send}>
          {sending ? <Spinner /> : <Send className="h-5 w-5" />} ส่งออเดอร์
        </button>
      </div>
    </div>
  );

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] sm:-m-6 sm:h-[calc(100%+3rem)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-slate-200 bg-white p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="ค้นหาเมนู" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn-secondary" onClick={() => setCustom(true)}><Plus className="h-4 w-4" /> รายการพิเศษ</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ id: 'all', name: 'ทั้งหมด' }, ...data.cats].map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${cat === c.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {data.items.length === 0 ? (
            <EmptyState title="ยังไม่มีเมนู"><Link className="text-brand-700 underline" to="/menu">เพิ่มเมนูและราคา</Link></EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((i) => {
                const inCart = cart.filter((l) => l.menu_item_id === i.id).reduce((s, l) => s + l.qty, 0);
                return (
                  <button key={i.id} onClick={() => add(i)} disabled={!i.available}
                    className="card relative overflow-hidden text-left transition active:scale-[.97] disabled:opacity-50">
                    <div className="aspect-[4/3] bg-slate-100">
                      {i.image_url ? <img src={i.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff className="h-8 w-8" /></div>}
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 font-semibold leading-tight">{i.name}</div>
                      <div className="mt-1 text-lg font-bold text-brand-700">฿{fmtPrice(i.price)}</div>
                    </div>
                    {!i.available && <span className="badge absolute left-2 top-2 bg-slate-900 text-white">หมด</span>}
                    {inCart > 0 && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 font-bold text-white shadow">{inCart}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button className="btn-primary m-3 py-4 md:hidden" onClick={() => setShowCart(true)}>
          ตะกร้า {count} รายการ · ฿{fmt2(subtotal)}
        </button>
      </div>
      <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-white md:block lg:w-96">{cartPanel}</aside>

      <Modal open={showCart} onClose={() => setShowCart(false)} title="ตะกร้า">{cartPanel}</Modal>

      <Modal open={pickTable} onClose={() => setPickTable(false)} title="เลือกโต๊ะ" wide>
        <button className={`mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 p-3 font-semibold ${takeaway ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
          onClick={() => { setTakeaway(true); setTableId(null); setPickTable(false); }}>
          <ShoppingBag className="h-5 w-5" /> กลับบ้าน / ไม่ระบุโต๊ะ
        </button>
        {data.tables.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีโต๊ะ — เพิ่มได้ที่เมนู “โต๊ะ & QR Code”</p>}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {data.tables.map((tb) => {
            const busy = data.open.some((o) => o.table_id === tb.id);
            return (
              <button key={tb.id} onClick={() => { setTableId(tb.id); setTakeaway(false); setPickTable(false); }}
                className={`rounded-xl border-2 p-3 text-center ${tableId === tb.id ? 'border-brand-500 bg-brand-50' : busy ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                <div className="text-2xl font-bold">{tb.code}</div>
                <div className="text-xs text-slate-500">{busy ? 'มีลูกค้า' : `ว่าง · ${tb.seats} ที่`}</div>
                {tb.zone && <div className="text-[11px] text-slate-400">{tb.zone}</div>}
              </button>
            );
          })}
        </div>
      </Modal>

      <NoteModal line={noteFor} onClose={() => setNoteFor(null)}
        onSave={(note) => { setCart((c) => c.map((l) => (l.key === noteFor?.key ? { ...l, note } : l))); setNoteFor(null); }} />
      <CustomItemModal open={custom} onClose={() => setCustom(false)}
        onAdd={(name, price, qty) => { setCart((c) => [...c, { key: crypto.randomUUID(), menu_item_id: null, name, unit_price: price, qty, note: '' }]); setCustom(false); }} />
    </div>
  );
}

const QUICK_NOTES = ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก', 'ไม่ใส่ผัก', 'หวานน้อย', 'ไม่ใส่น้ำแข็ง', 'ใส่กล่อง', 'พิเศษ'];

function NoteModal({ line, onClose, onSave }: { line: CartLine | null; onClose: () => void; onSave: (n: string) => void }) {
  const [note, setNote] = useState('');
  const [prev, setPrev] = useState<string | null>(null);
  if (line && prev !== line.key) { setPrev(line.key); setNote(line.note); }
  return (
    <Modal open={!!line} onClose={onClose} title={`หมายเหตุ: ${line?.name ?? ''}`}
      footer={<><button className="btn-secondary" onClick={onClose}>ยกเลิก</button><button className="btn-primary" onClick={() => onSave(note.trim())}>บันทึก</button></>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_NOTES.map((n) => (
          <button key={n} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm" onClick={() => setNote((x) => (x ? `${x}, ${n}` : n))}>{n}</button>
        ))}
      </div>
      <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
    </Modal>
  );
}

function CustomItemModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, price: number, qty: number) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  return (
    <Modal open={open} onClose={onClose} title="เพิ่มรายการพิเศษ"
      footer={<><button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary" disabled={!name || price === ''} onClick={() => { onAdd(name, Number(price), Math.max(1, Number(qty) || 1)); setName(''); setPrice(''); setQty('1'); }}>เพิ่ม</button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="ชื่อรายการ" className="sm:col-span-3"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="ราคา/หน่วย"><input className="input" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="จำนวน"><input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
