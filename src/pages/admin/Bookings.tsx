import { useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, MessageCircle, Phone, Plus, Users } from 'lucide-react';
import { supabase, must, callFunction } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { thaiDate, todayISO } from '@/lib/format';
import type { Booking, BookingStatus, DiningTable } from '@/lib/types';
import { EmptyState, Field, Modal, PageHeader, PageLoading, Spinner, toast, useLoad } from '@/components/ui';
import { useStoreRealtime } from '@/components/usePendingCount';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; cls: string }> = {
  pending: { label: 'รอยืนยัน', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'ยืนยันแล้ว', cls: 'bg-green-100 text-green-700' },
  seated: { label: 'มาถึงแล้ว', cls: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-slate-100 text-slate-500' },
  no_show: { label: 'ไม่มาตามนัด', cls: 'bg-red-100 text-red-700' },
};

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function Bookings() {
  const { store } = useCurrentStore();
  const [date, setDate] = useState(todayISO(store.timezone));
  const [data, loading, , reload] = useLoad(async () => {
    const [b, t] = await Promise.all([
      supabase.from('bookings').select('*').eq('store_id', store.id).eq('booking_date', date).order('booking_time'),
      supabase.from('dining_tables').select('*').eq('store_id', store.id).eq('active', true).order('sort').order('code'),
    ]);
    return { bookings: must(b) as Booking[], tables: must(t) as DiningTable[] };
  }, [store.id, date]);
  useStoreRealtime(store.id, () => { void reload(); }, 60000);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(b: Booking, status: BookingStatus) {
    setBusy(b.id);
    try {
      must(await supabase.from('bookings').update({ status }).eq('id', b.id).select('id'));
      if (b.line_user_id && (status === 'confirmed' || status === 'cancelled')) {
        await callFunction('line-push', { booking_id: b.id }).then(
          () => toast.ok('แจ้งลูกค้าทาง LINE แล้ว'),
          (e) => toast.err(`อัปเดตแล้ว แต่ส่ง LINE ไม่สำเร็จ: ${(e as Error).message}`));
      }
      await reload();
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(null); }
  }

  const tableCode = (id: string | null) => data?.tables.find((t) => t.id === id)?.code;

  return (
    <div>
      <PageHeader title="การจองโต๊ะ" subtitle="รับจองจาก LINE OA / ลิงก์จอง / โทรศัพท์"
        actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> เพิ่มการจอง</button>} />
      <div className="mb-4 flex items-center gap-2">
        <button className="btn-secondary px-3" onClick={() => setDate(shift(date, -1))} aria-label="วันก่อน"><ChevronLeft className="h-4 w-4" /></button>
        <input type="date" className="input w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn-secondary px-3" onClick={() => setDate(shift(date, 1))} aria-label="วันถัดไป"><ChevronRight className="h-4 w-4" /></button>
        <button className="btn-ghost" onClick={() => setDate(todayISO(store.timezone))}>วันนี้</button>
        <span className="ml-2 hidden text-sm text-slate-500 sm:inline">{thaiDate(date, 'long')}</span>
      </div>
      {loading && !data ? <PageLoading /> : !data?.bookings.length ? (
        <EmptyState icon={<CalendarDays className="h-10 w-10" />} title="ไม่มีการจองในวันนี้" />
      ) : (
        <div className="space-y-2">
          {data.bookings.map((b) => (
            <div key={b.id} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="w-16 text-center">
                <div className="text-xl font-bold">{b.booking_time.slice(0, 5)}</div>
                <div className="text-xs text-slate-400">น.</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{b.customer_name}</span>
                  <span className={`badge ${BOOKING_STATUS[b.status].cls}`}>{BOOKING_STATUS[b.status].label}</span>
                  {b.source === 'line' && <span className="badge bg-green-500 text-white"><MessageCircle className="mr-1 h-3 w-3" />LINE</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {b.party_size} คน</span>
                  <span>{tableCode(b.table_id) ? `โต๊ะ ${tableCode(b.table_id)}` : 'ยังไม่ระบุโต๊ะ'}</span>
                  {b.phone && <a href={`tel:${b.phone}`} className="flex items-center gap-1 text-brand-700"><Phone className="h-4 w-4" /> {b.phone}</a>}
                </div>
                {b.note && <div className="mt-1 text-sm text-amber-700">{b.note}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {busy === b.id && <Spinner />}
                {b.status === 'pending' && <button className="btn-primary" onClick={() => setStatus(b, 'confirmed')}><Check className="h-4 w-4" /> ยืนยัน</button>}
                {(b.status === 'pending' || b.status === 'confirmed') && <>
                  <button className="btn-secondary" onClick={() => setStatus(b, 'seated')}>มาถึงแล้ว</button>
                  <button className="btn-ghost text-slate-500" onClick={() => setStatus(b, 'no_show')}>ไม่มา</button>
                  <button className="btn-ghost text-red-600" onClick={() => confirm('ยกเลิกการจองนี้?') && setStatus(b, 'cancelled')}>ยกเลิก</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && data && <AddBooking date={date} tables={data.tables} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await reload(); }} />}
    </div>
  );
}

function AddBooking({ date, tables, onClose, onSaved }: { date: string; tables: DiningTable[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { store } = useCurrentStore();
  const [f, setF] = useState({ booking_date: date, booking_time: '18:00', party_size: 2, customer_name: '', phone: '', note: '', table_id: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.customer_name.trim()) { toast.err('กรุณาใส่ชื่อผู้จอง'); return; }
    setBusy(true);
    try {
      must(await supabase.from('bookings').insert({ ...f, store_id: store.id, table_id: f.table_id || null, status: 'confirmed', source: 'pos' }).select('id'));
      toast.ok('บันทึกการจองแล้ว');
      await onSaved();
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="เพิ่มการจอง (รับทางโทรศัพท์/หน้าร้าน)"
      footer={<><button className="btn-secondary" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} บันทึก</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ชื่อผู้จอง *"><input className="input" value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} autoFocus /></Field>
        <Field label="เบอร์โทร"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="วันที่"><input className="input" type="date" value={f.booking_date} onChange={(e) => setF({ ...f, booking_date: e.target.value })} /></Field>
        <Field label="เวลา"><input className="input" type="time" value={f.booking_time} onChange={(e) => setF({ ...f, booking_time: e.target.value })} /></Field>
        <Field label="จำนวนคน"><input className="input" type="number" min={1} value={f.party_size} onChange={(e) => setF({ ...f, party_size: Number(e.target.value) })} /></Field>
        <Field label="โต๊ะ">
          <select className="input" value={f.table_id} onChange={(e) => setF({ ...f, table_id: e.target.value })}>
            <option value="">— ยังไม่ระบุ —</option>
            {tables.map((t) => <option key={t.id} value={t.id}>โต๊ะ {t.code} ({t.seats} ที่)</option>)}
          </select>
        </Field>
        <Field label="หมายเหตุ" className="sm:col-span-2"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
