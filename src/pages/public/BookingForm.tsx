import { useState } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { thaiDate, todayISO } from '@/lib/format';
import type { PublicStore } from '@/lib/types';
import { ErrorBox, Field, Spinner, useLoad } from '@/components/ui';

export interface BookingInput { table_id: string | null; date: string; time: string; party: number; name: string; phone: string; note: string }
export interface BookingResult { booking_id: string; table_code: string | null; date: string; time: string; party_size: number }

/** Booking form with a table picker that shows which tables are taken at the chosen time. */
export default function BookingForm({ data, defaultName = '', onSubmit, preselectTable }: {
  data: PublicStore; defaultName?: string; preselectTable?: string | null; onSubmit: (b: BookingInput) => Promise<BookingResult>;
}) {
  const s = data.store;
  const [f, setF] = useState<BookingInput>({
    table_id: preselectTable ?? null, date: todayISO(s.timezone), time: '18:00', party: 2, name: defaultName, phone: '', note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookingResult | null>(null);

  const [avail] = useLoad(async () => {
    if (!f.date || !f.time) return {} as Record<string, boolean>;
    const { data: rows } = await supabase.rpc('public_table_availability', { p_slug: s.slug, p_date: f.date, p_time: f.time });
    return Object.fromEntries(((rows ?? []) as { table_id: string; booked: boolean }[]).map((r) => [r.table_id, r.booked]));
  }, [s.slug, f.date, f.time]);

  async function submit() {
    setError(null);
    if (!f.name.trim()) { setError('กรุณากรอกชื่อผู้จอง'); return; }
    if (!f.phone.trim()) { setError('กรุณากรอกเบอร์โทรศัพท์'); return; }
    setBusy(true);
    try { setDone(await onSubmit(f)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold">ส่งคำขอจองแล้ว</h2>
        <p className="text-slate-600">{thaiDate(done.date, 'long')} เวลา {String(done.time).slice(0, 5)} น.<br />{done.party_size} คน{done.table_code ? ` · โต๊ะ ${done.table_code}` : ''}</p>
        <p className="text-sm text-slate-500">ร้านจะยืนยันการจองให้เร็วที่สุด</p>
      </div>
    );
  }

  const tables = data.tables.filter((t) => t.seats >= Math.min(f.party, Math.max(...data.tables.map((x) => x.seats), 1)));
  return (
    <div className="space-y-4 p-4">
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="วันที่"><input className="input" type="date" min={todayISO(s.timezone)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="เวลา" hint={s.open_time && s.close_time ? `เปิด ${s.open_time.slice(0, 5)}–${s.close_time.slice(0, 5)}` : undefined}>
          <input className="input" type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </Field>
      </div>
      <Field label="จำนวนคน">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="h-5 w-5 text-slate-400" />
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
            <button key={n} type="button" onClick={() => setF({ ...f, party: n })}
              className={`h-10 min-w-10 rounded-xl px-2 font-semibold ${f.party === n ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{n}</button>
          ))}
        </div>
      </Field>
      {data.tables.length > 0 && (
        <div>
          <span className="label">เลือกหมายเลขโต๊ะ</span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            <button type="button" onClick={() => setF({ ...f, table_id: null })}
              className={`rounded-xl border-2 p-2 text-xs font-semibold ${f.table_id === null ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>ให้ร้านเลือก</button>
            {tables.map((t) => {
              const booked = avail?.[t.id];
              return (
                <button key={t.id} type="button" disabled={booked} onClick={() => setF({ ...f, table_id: t.id })}
                  className={`rounded-xl border-2 p-2 text-center disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50 ${f.table_id === t.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                  <div className="text-lg font-bold">{t.code}</div>
                  <div className="text-[11px] text-slate-500">{booked ? 'ถูกจองแล้ว' : `${t.seats} ที่`}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Field label="ชื่อผู้จอง"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="เบอร์โทรศัพท์"><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="หมายเหตุ"><input className="input" placeholder="เช่น ขอเก้าอี้เด็ก, วันเกิด" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button className="btn-primary w-full py-4 text-base" onClick={submit} disabled={busy}>{busy && <Spinner />} ยืนยันการจอง</button>
    </div>
  );
}
