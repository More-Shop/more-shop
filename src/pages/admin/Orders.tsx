import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowRightLeft, Ban, Check, ClipboardList, Printer, Receipt, ShoppingBag, Utensils, Wallet, X } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { fmt2, thaiDateTime, timeHM, todayISO } from '@/lib/format';
import { computeTotals } from '@/lib/totals';
import { printHtml } from '@/lib/print';
import { prefs } from '@/lib/prefs';
import { isValidThaiTaxId } from '@/lib/taxid';
import { promptPayPayload } from '@/lib/promptpay';
import { kitchenTicketHtml, preBillHtml, receiptHtml } from '@/print/templates';
import { PAYMENT_METHODS, type DiningTable, type Order, type OrderItem } from '@/lib/types';
import { EmptyState, Field, Modal, PageHeader, PageLoading, Spinner, Toggle, toast, useLoad } from '@/components/ui';
import { useStoreRealtime } from '@/components/usePendingCount';
import { useAuth } from '@/lib/auth';

const SOURCE: Record<string, string> = { pos: 'POS', qr: 'QR โต๊ะ', line: 'LINE' };

export default function Orders() {
  const { store, can } = useCurrentStore();
  const [tab, setTab] = useState<'open' | 'paid'>('open');
  const [data, loading, , reload] = useLoad(async () => {
    const since = `${todayISO(store.timezone)}T00:00:00`;
    const q = supabase.from('orders').select('*, order_items(*)').eq('store_id', store.id);
    const [open, paid, tables] = await Promise.all([
      q.eq('status', 'open').order('created_at'),
      supabase.from('orders').select('*, order_items(*)').eq('store_id', store.id).in('status', ['paid', 'cancelled'])
        .gte('updated_at', new Date(since).toISOString()).order('updated_at', { ascending: false }).limit(200),
      supabase.from('dining_tables').select('*').eq('store_id', store.id).eq('active', true).order('sort').order('code'),
    ]);
    return { open: must(open) as Order[], paid: must(paid) as Order[], tables: must(tables) as DiningTable[] };
  }, [store.id]);
  useStoreRealtime(store.id, () => { void reload(); });
  const [selId, setSelId] = useState<string | null>(null);

  const list = tab === 'open' ? data?.open ?? [] : data?.paid ?? [];
  const sel = useMemo(() => [...(data?.open ?? []), ...(data?.paid ?? [])].find((o) => o.id === selId) ?? null, [data, selId]);

  if (loading && !data) return <PageLoading />;

  return (
    <div>
      <PageHeader title="ออเดอร์ / เช็คบิล" subtitle="ออเดอร์จาก QR และ LINE จะขึ้นที่นี่ทันที พร้อมเสียงแจ้งเตือน"
        actions={
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(['open', 'paid'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-white shadow' : 'text-slate-500'}`}>
                {t === 'open' ? `บิลเปิด (${data?.open.length ?? 0})` : 'ปิดแล้ววันนี้'}
              </button>
            ))}
          </div>
        } />
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title={tab === 'open' ? 'ยังไม่มีบิลเปิด' : 'ยังไม่มีบิลที่ปิดวันนี้'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => {
            const pending = (o.order_items ?? []).filter((i) => i.status === 'pending').length;
            return (
              <button key={o.id} onClick={() => setSelId(o.id)}
                className={`card p-4 text-left transition hover:border-brand-500 ${pending ? 'border-red-300 ring-2 ring-red-100' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-xl font-bold">
                    {o.table_code ? <><Utensils className="h-5 w-5 text-slate-400" /> โต๊ะ {o.table_code}</> : <><ShoppingBag className="h-5 w-5 text-slate-400" /> กลับบ้าน</>}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">฿{fmt2(o.total)}</div>
                    <div className="text-xs text-slate-400">#{o.order_no} · {timeHM(o.created_at, store.timezone)}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="badge bg-slate-100 text-slate-600">{SOURCE[o.source]}</span>
                  {pending > 0 && <span className="badge animate-pulse bg-red-500 text-white">รอยืนยัน {pending} รายการ</span>}
                  {o.status === 'paid' && <span className="badge bg-green-100 text-green-700">{o.receipt_no}</span>}
                  {o.status === 'cancelled' && <span className="badge bg-red-100 text-red-700">ยกเลิก</span>}
                  {o.customer_name && <span className="badge bg-blue-50 text-blue-700">{o.customer_name}</span>}
                </div>
                <div className="mt-2 line-clamp-2 text-sm text-slate-500">
                  {(o.order_items ?? []).filter((i) => i.status !== 'void').map((i) => `${i.name} ×${i.qty}`).join(', ')}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {sel && <BillModal order={sel} tables={data?.tables ?? []} canVoid={can('owner', 'manager')} onClose={() => setSelId(null)} onChanged={reload} />}
    </div>
  );
}

function BillModal({ order, tables, canVoid, onClose, onChanged }: {
  order: Order; tables: DiningTable[]; canVoid: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { store } = useCurrentStore();
  const { user } = useAuth();
  const items = [...(order.order_items ?? [])].sort((a, b) => a.round - b.round || a.created_at.localeCompare(b.created_at));
  const pending = items.filter((i) => i.status === 'pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [pay, setPay] = useState(false);
  const [move, setMove] = useState(false);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); await onChanged(); } catch (e) { toast.err((e as Error).message); } finally { setBusy(null); }
  }

  const accept = () => run('accept', async () => {
    must(await supabase.from('order_items').update({ status: 'sent' }).in('id', pending.map((i) => i.id)).select('id'));
    if (prefs.autoPrintKitchen()) await printHtml(kitchenTicketHtml(store, order, pending, pending[0]?.round), store.paper_width, `ครัว-${order.order_no}`);
    toast.ok('ยืนยันและส่งเข้าครัวแล้ว');
  });
  const reject = () => run('reject', async () => {
    must(await supabase.from('order_items').update({ status: 'void' }).in('id', pending.map((i) => i.id)).select('id'));
    toast.ok('ปฏิเสธรายการแล้ว');
  });
  const voidItem = (i: OrderItem) => run(`void-${i.id}`, async () => {
    if (!confirm(`ยกเลิก “${i.name}” ×${i.qty}?`)) return;
    must(await supabase.from('order_items').update({ status: 'void' }).eq('id', i.id).select('id'));
  });
  const reprintKitchen = () => run('kitchen', async () => {
    const live = items.filter((i) => i.status === 'sent' || i.status === 'served');
    await printHtml(kitchenTicketHtml(store, order, live), store.paper_width, `ครัว-${order.order_no}`);
  });
  const preBill = () => run('prebill', async () => {
    await printHtml(await preBillHtml(store, order, items), store.paper_width, `บิล-${order.order_no}`);
  });
  const printReceipt = () => run('receipt', async () => {
    await printHtml(await receiptHtml(store, order, items, user?.email ?? undefined), store.paper_width, order.receipt_no ?? 'receipt');
  });
  const voidBill = () => run('voidbill', async () => {
    const reason = prompt('เหตุผลการยกเลิกบิล');
    if (reason === null) return;
    if (order.status === 'open') {
      must(await supabase.from('order_items').update({ status: 'void' }).eq('order_id', order.id).neq('status', 'void').select('id'));
    }
    must(await supabase.rpc('void_order', { p_order: order.id, p_reason: reason }));
    toast.ok('ยกเลิกบิลแล้ว'); onClose();
  });

  const title = `${order.table_code ? `โต๊ะ ${order.table_code}` : 'กลับบ้าน'} · บิล #${order.order_no}`;
  return (
    <Modal open onClose={onClose} title={title} wide
      footer={order.status === 'open' ? (
        <div className="flex w-full flex-wrap gap-2">
          {canVoid && <button className="btn-ghost text-red-600" onClick={voidBill} disabled={!!busy}><Ban className="h-4 w-4" /> ยกเลิกบิล</button>}
          {order.table_id && <button className="btn-secondary" onClick={() => setMove(true)}><ArrowRightLeft className="h-4 w-4" /> ย้ายโต๊ะ</button>}
          <button className="btn-secondary ml-auto" onClick={reprintKitchen} disabled={!!busy}><Printer className="h-4 w-4" /> ใบสั่งครัว</button>
          <button className="btn-secondary" onClick={preBill} disabled={!!busy}>{busy === 'prebill' ? <Spinner /> : <Receipt className="h-4 w-4" />} ใบแจ้งยอด</button>
          <button className="btn-primary" onClick={() => setPay(true)} disabled={!!busy || pending.length > 0 || Number(order.total) <= 0 && items.every((i) => i.status === 'void')}><Wallet className="h-4 w-4" /> ชำระเงิน</button>
        </div>
      ) : (
        <div className="flex w-full gap-2">
          {order.status === 'paid' && canVoid && <button className="btn-ghost text-red-600" onClick={voidBill}><Ban className="h-4 w-4" /> ยกเลิกใบเสร็จ</button>}
          {order.status === 'paid' && <button className="btn-primary ml-auto" onClick={printReceipt} disabled={!!busy}><Printer className="h-4 w-4" /> พิมพ์ใบเสร็จซ้ำ</button>}
        </div>
      )}>
      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 font-bold text-red-700">ลูกค้าสั่งเพิ่ม ({SOURCE[order.source]}) — รอยืนยัน</div>
          <ul className="mb-3 space-y-1 text-sm">
            {pending.map((i) => <li key={i.id}>{i.qty} × {i.name}{i.note && <span className="text-amber-700"> ({i.note})</span>}</li>)}
          </ul>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={accept} disabled={!!busy}>{busy === 'accept' ? <Spinner /> : <Check className="h-4 w-4" />} ยืนยันส่งครัว</button>
            <button className="btn-secondary" onClick={reject} disabled={!!busy}><X className="h-4 w-4" /> ปฏิเสธ</button>
          </div>
        </div>
      )}
      {order.note && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">หมายเหตุ: {order.note}</p>}
      <table className="table-std">
        <thead><tr><th>รายการ</th><th className="text-right">จำนวน</th><th className="text-right">ราคา</th><th></th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className={i.status === 'void' ? 'text-slate-300 line-through' : ''}>
              <td>{i.name}{i.note && <div className="text-xs text-amber-700">{i.note}</div>}
                <div className="text-[11px] text-slate-400">รอบ {i.round}{i.status === 'pending' ? ' · รอยืนยัน' : ''}</div></td>
              <td className="text-right">{i.qty}</td>
              <td className="text-right">{fmt2(i.unit_price * i.qty)}</td>
              <td className="w-10 text-right">
                {order.status === 'open' && i.status === 'sent' && (
                  <button className="text-slate-400 hover:text-red-600" onClick={() => voidItem(i)} aria-label="ยกเลิกรายการ"><X className="h-4 w-4" /></button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
        <Row l="รวม" r={fmt2(order.subtotal)} />
        {Number(order.discount) > 0 && <Row l="ส่วนลด" r={`-${fmt2(order.discount)}`} />}
        {Number(order.service_charge) > 0 && <Row l={`ค่าบริการ ${Number(store.service_charge_rate)}%`} r={fmt2(order.service_charge)} />}
        {store.vat_registered && <Row l={`VAT ${Number(store.vat_rate)}%${store.prices_include_vat ? ' (รวมในราคา)' : ''}`} r={fmt2(order.vat)} />}
        <Row l="ยอดสุทธิ" r={`฿${fmt2(order.total)}`} strong />
        {order.status === 'paid' && <p className="pt-2 text-xs text-slate-400">{order.receipt_no} · {PAYMENT_METHODS[order.payment_method ?? ''] ?? order.payment_method} · {thaiDateTime(order.paid_at, store.timezone)}</p>}
      </div>
      {pay && <PayModal order={order} items={items} onClose={() => setPay(false)} onDone={async () => { setPay(false); await onChanged(); onClose(); }} />}
      {move && (
        <Modal open onClose={() => setMove(false)} title="ย้ายไปโต๊ะ">
          <div className="grid grid-cols-4 gap-2">
            {tables.filter((t) => t.id !== order.table_id).map((t) => (
              <button key={t.id} className="btn-secondary py-4 text-lg" onClick={() => run('move', async () => {
                must(await supabase.rpc('move_order_table', { p_order: order.id, p_table: t.id }));
                setMove(false); toast.ok(`ย้ายไปโต๊ะ ${t.code} แล้ว`);
              })}>{t.code}</button>
            ))}
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function Row({ l, r, strong }: { l: string; r: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? 'border-t border-slate-200 pt-2 text-lg font-bold' : 'text-slate-600'}`}><span>{l}</span><span>{r}</span></div>;
}

function PayModal({ order, items, onClose, onDone }: { order: Order; items: OrderItem[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { store, feature } = useCurrentStore();
  const { user } = useAuth();
  const [method, setMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [received, setReceived] = useState('');
  const [taxInvoice, setTaxInvoice] = useState(false);
  const [buyer, setBuyer] = useState({ name: '', tax_id: '', branch: '00000', address: '' });
  const [autoPrint, setAutoPrint] = useState(prefs.autoPrintReceipt());
  const [busy, setBusy] = useState(false);

  const t = computeTotals(store, Number(order.subtotal), Number(discount) || 0);
  const paid = method === 'cash' && received !== '' ? Number(received) : t.total;
  const change = Math.max(paid - t.total, 0);
  const quick = [...new Set([t.total, Math.ceil(t.total / 100) * 100, Math.ceil(t.total / 500) * 500, Math.ceil(t.total / 1000) * 1000])];

  async function confirmPay() {
    if (paid < t.total) { toast.err('ยอดรับเงินไม่พอ'); return; }
    if (taxInvoice && (!buyer.name || !isValidThaiTaxId(buyer.tax_id))) { toast.err('กรอกชื่อและเลขผู้เสียภาษีผู้ซื้อให้ถูกต้อง'); return; }
    setBusy(true);
    try {
      const done = must(await supabase.rpc('checkout_order', {
        p_order: order.id, p_payment_method: method, p_paid_amount: paid, p_discount: Number(discount) || 0,
        p_buyer: taxInvoice ? buyer : null,
      })) as Order;
      prefs.setAutoPrintReceipt(autoPrint);
      if (autoPrint) await printHtml(await receiptHtml(store, done, items, user?.email ?? undefined), store.paper_width, done.receipt_no ?? 'receipt');
      toast.ok(`ชำระเงินแล้ว ${done.receipt_no}${change > 0 ? ` · ทอน ฿${fmt2(change)}` : ''}`);
      await onDone();
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`ชำระเงิน · ฿${fmt2(t.total)}`}
      footer={<><button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary px-8" onClick={confirmPay} disabled={busy}>{busy && <Spinner />} ยืนยันรับเงิน</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
            <button key={k} onClick={() => setMethod(k)} className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold ${method === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200'}`}>{v}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ส่วนลด (บาท)"><input className="input" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          {method === 'cash' && (
            <Field label="รับเงินมา">
              <input className="input text-lg font-bold" type="number" min={0} step="0.01" value={received} placeholder={fmt2(t.total)} onChange={(e) => setReceived(e.target.value)} />
            </Field>
          )}
        </div>
        {method === 'promptpay' && store.promptpay_id && <PromptPayQr id={store.promptpay_id} amount={t.total} />}
        {method === 'cash' && (
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => <button key={q} className="btn-secondary" onClick={() => setReceived(String(q))}>฿{fmt2(q)}</button>)}
          </div>
        )}
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <Row l="รวม" r={fmt2(t.subtotal)} />
          {t.discount > 0 && <Row l="ส่วนลด" r={`-${fmt2(t.discount)}`} />}
          {t.service > 0 && <Row l="ค่าบริการ" r={fmt2(t.service)} />}
          {store.vat_registered && <Row l="VAT" r={fmt2(t.vat)} />}
          <Row l="ยอดสุทธิ" r={`฿${fmt2(t.total)}`} strong />
          {method === 'cash' && <div className="mt-2 flex justify-between text-lg font-bold text-green-700"><span>เงินทอน</span><span>฿{fmt2(change)}</span></div>}
        </div>
        {store.vat_registered && feature('full_tax_invoice') && (
          <div className="space-y-3">
            <Toggle checked={taxInvoice} onChange={setTaxInvoice} label="ลูกค้าขอใบกำกับภาษีเต็มรูป" />
            {taxInvoice && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ชื่อผู้ซื้อ / บริษัท"><input className="input" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} /></Field>
                <Field label="เลขผู้เสียภาษี"><input className="input" inputMode="numeric" maxLength={13} value={buyer.tax_id} onChange={(e) => setBuyer({ ...buyer, tax_id: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="สาขา (00000 = สนญ.)"><input className="input" maxLength={5} value={buyer.branch} onChange={(e) => setBuyer({ ...buyer, branch: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="ที่อยู่"><input className="input" value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} /></Field>
              </div>
            )}
          </div>
        )}
        <Toggle checked={autoPrint} onChange={setAutoPrint} label="พิมพ์ใบเสร็จทันที" />
      </div>
    </Modal>
  );
}

/** PromptPay QR with the exact amount — turn the tablet around and let the customer scan. */
function PromptPayQr({ id, amount }: { id: string; amount: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { void QRCode.toDataURL(promptPayPayload(id, amount), { margin: 1, width: 360 }).then(setSrc); }, [id, amount]);
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 p-3">
      <div className="text-sm font-semibold text-[#113566]">PromptPay · ฿{fmt2(amount)}</div>
      {src ? <img src={src} alt="PromptPay QR" className="h-52 w-52" /> : <Spinner />}
      <div className="text-xs text-slate-500">ให้ลูกค้าสแกนจ่าย แล้วตรวจสอบยอดเงินเข้าก่อนกดยืนยัน</div>
    </div>
  );
}
