import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, Receipt, ShoppingCart, TrendingUp } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { fmt2, thaiDate, todayISO } from '@/lib/format';
import type { Booking, BookingStatus, Order } from '@/lib/types';
import { PageHeader, PageLoading, useLoad } from '@/components/ui';
import { useStoreRealtime } from '@/components/usePendingCount';
import { BOOKING_STATUS } from './Bookings';

export default function Dashboard() {
  const { store } = useCurrentStore();
  const today = todayISO(store.timezone);
  const [data, loading, , reload] = useLoad(async () => {
    const start = new Date(`${today}T00:00:00`).toISOString();
    const [paid, open, bookings, items] = await Promise.all([
      supabase.from('orders').select('total, payment_method, paid_at').eq('store_id', store.id).eq('status', 'paid').gte('paid_at', start),
      supabase.from('orders').select('id, total').eq('store_id', store.id).eq('status', 'open'),
      supabase.from('bookings').select('*').eq('store_id', store.id).eq('booking_date', today).order('booking_time'),
      supabase.from('order_items').select('name, qty, created_at').eq('store_id', store.id).in('status', ['sent', 'served']).gte('created_at', start),
    ]);
    return {
      paid: must(paid) as Pick<Order, 'total' | 'payment_method' | 'paid_at'>[], open: must(open) as Pick<Order, 'id' | 'total'>[],
      bookings: must(bookings) as Booking[], items: must(items) as { name: string; qty: number }[],
    };
  }, [store.id, today]);
  useStoreRealtime(store.id, () => { void reload(); }, 60000);

  if (loading && !data) return <PageLoading />;
  if (!data) return null;
  const sales = data.paid.reduce((s, o) => s + Number(o.total), 0);
  const active = data.bookings.filter((b) => ['pending', 'confirmed', 'seated'].includes(b.status));
  const statusCount = (Object.keys(BOOKING_STATUS) as BookingStatus[])
    .map((s) => [s, data.bookings.filter((b) => b.status === s).length] as const).filter(([, n]) => n > 0);
  const top = Object.entries(data.items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.name]: (m[i.name] ?? 0) + i.qty }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div>
      <PageHeader title={`สวัสดี, ${store.name}`} subtitle={thaiDate(today, 'long')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<TrendingUp />} label="ยอดขายวันนี้" value={`฿${fmt2(sales)}`} />
        <Kpi icon={<Receipt />} label="บิลที่ชำระแล้ว" value={String(data.paid.length)} />
        <Kpi icon={<ClipboardList />} label="บิลเปิดอยู่" value={`${data.open.length} · ฿${fmt2(data.open.reduce((s, o) => s + Number(o.total), 0))}`} to="/orders" />
        <Kpi icon={<CalendarDays />} label="จองวันนี้" value={`${active.length} · ทั้งหมด ${data.bookings.length}`} to="/bookings" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-bold">การจองวันนี้ (ทุกสถานะ)</h3>
            <Link to="/bookings" className="text-sm font-semibold text-brand-700">จัดการ →</Link>
          </div>
          {statusCount.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {statusCount.map(([s, n]) => <span key={s} className={`badge ${BOOKING_STATUS[s].cls}`}>{BOOKING_STATUS[s].label} {n}</span>)}
            </div>
          )}
          {data.bookings.length === 0 ? <p className="text-sm text-slate-400">ไม่มีการจอง</p> : (
            <ul className="divide-y divide-slate-100">
              {data.bookings.map((b) => {
                const done = b.status === 'cancelled' || b.status === 'no_show';
                return (
                  <li key={b.id} className={`flex items-center gap-3 py-2 text-sm ${done ? 'text-slate-400' : ''}`}>
                    <span className={`w-12 font-bold ${done ? 'line-through' : ''}`}>{b.booking_time.slice(0, 5)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={done ? 'line-through' : ''}>{b.customer_name} · {b.party_size} คน</span>
                      {b.source === 'line' && <span className="ml-1 text-xs font-semibold text-green-600">LINE</span>}
                      {b.phone && <a href={`tel:${b.phone}`} className="ml-2 text-xs text-brand-700">{b.phone}</a>}
                    </span>
                    <span className={`badge ${BOOKING_STATUS[b.status].cls}`}>{BOOKING_STATUS[b.status].label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-3 font-bold">เมนูขายดีวันนี้</h3>
          {top.length === 0 ? <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p> : (
            <ol className="space-y-2">
              {top.map(([name, qty], i) => (
                <li key={name} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                  <span className="flex-1">{name}</span><span className="font-semibold">{qty}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <Link to="/pos" className="btn-primary fixed bottom-6 right-6 rounded-full px-6 py-4 shadow-lg lg:hidden"><ShoppingCart className="h-5 w-5" /> เปิด POS</Link>
    </div>
  );
}

function Kpi({ icon, label, value, to }: { icon: React.ReactNode; label: string; value: string; to?: string }) {
  const body = (
    <div className="card flex items-center gap-4 p-4 transition hover:border-brand-500">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <div><div className="text-sm text-slate-500">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
