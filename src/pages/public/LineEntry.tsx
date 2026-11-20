import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, UtensilsCrossed } from 'lucide-react';
import { callFunction } from '@/lib/supabase';
import { initLiff, type Liff } from '@/lib/liff';
import { EmptyState, PageLoading } from '@/components/ui';
import OrderingView, { StoreBanner, type PlaceResult } from './OrderingView';
import BookingForm, { type BookingResult } from './BookingForm';
import { usePublicStore } from './usePublicStore';

type Step = 'home' | 'pick-table' | 'order' | 'book';

/**
 * LINE LIFF page — opened from the LINE OA rich menu.
 * Customer picks a table number, then orders food for that table or books it.
 * Everything goes through the `line-liff` edge function, which verifies the
 * LINE ID token, so the shop knows which LINE user ordered and can reply in chat.
 */
export default function LineEntry() {
  const { slug } = useParams();
  const [data, loading, error] = usePublicStore(slug);
  const [line, setLine] = useState<{ liff: Liff; name: string; idToken: string | null } | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  // Rich-menu link https://liff.line.me/<id>?go=book opens the booking form directly.
  const [step, setStep] = useState<Step>(() => (new URLSearchParams(window.location.search).get('go') === 'book' ? 'book' : 'home'));
  const [tableId, setTableId] = useState<string | null>(null);

  useEffect(() => {
    const id = data?.store.line_liff_id;
    if (!id) return;
    initLiff(id).then((r) => r && setLine({ liff: r.liff, name: r.profile.displayName, idToken: r.idToken }))
      .catch((e) => setLineError((e as Error).message));
  }, [data?.store.line_liff_id]);

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="p-6"><EmptyState title="ไม่พบร้านนี้">{error}</EmptyState></div>;
  if (!data.store.line_liff_id) return <div className="p-6"><EmptyState title="ร้านยังไม่ได้ตั้งค่า LINE LIFF" /></div>;
  if (lineError) return <div className="p-6"><EmptyState title="เชื่อมต่อ LINE ไม่สำเร็จ">{lineError}</EmptyState></div>;
  if (!line) return <PageLoading />;

  const table = data.tables.find((t) => t.id === tableId);
  const back = <button className="btn-ghost m-2" onClick={() => setStep(step === 'order' ? 'pick-table' : 'home')}><ChevronLeft className="h-4 w-4" /> กลับ</button>;
  const call = <T,>(action: string, payload: object) =>
    callFunction<T>('line-liff', { action, slug, id_token: line.idToken, ...payload });

  return (
    <div className="mx-auto min-h-full max-w-xl">
      <StoreBanner store={data.store} sub={`สวัสดีคุณ ${line.name}`} />
      {step === 'home' && (
        <div className="grid gap-3 p-4">
          {data.store.qr_order_enabled && (
            <button className="card flex items-center gap-4 p-5 text-left" onClick={() => setStep('pick-table')}>
              <UtensilsCrossed className="h-10 w-10 text-brand-600" />
              <div><div className="text-lg font-bold">สั่งอาหารที่โต๊ะ</div><div className="text-sm text-slate-500">เลือกหมายเลขโต๊ะที่นั่งอยู่ แล้วสั่งได้เลย</div></div>
            </button>
          )}
          {data.store.booking_enabled && (
            <button className="card flex items-center gap-4 p-5 text-left" onClick={() => setStep('book')}>
              <CalendarDays className="h-10 w-10 text-brand-600" />
              <div><div className="text-lg font-bold">จองโต๊ะ</div><div className="text-sm text-slate-500">เลือกวัน เวลา และหมายเลขโต๊ะ</div></div>
            </button>
          )}
        </div>
      )}
      {step === 'pick-table' && (
        <div>
          {back}
          <h2 className="px-4 text-lg font-bold">เลือกหมายเลขโต๊ะของคุณ</h2>
          <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
            {data.tables.map((t) => (
              <button key={t.id} onClick={() => { setTableId(t.id); setStep('order'); }}
                className="card p-4 text-center transition active:scale-95">
                <div className="text-3xl font-bold">{t.code}</div>
                <div className="text-xs text-slate-500">{t.zone ?? `${t.seats} ที่นั่ง`}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 'order' && table && (
        <OrderingView data={data} canOrder tableLabel={`โต๊ะ ${table.code}`} header={back}
          onPlace={(items, note, name) => call<PlaceResult>('order', { table_id: table.id, items, note, customer_name: name || line.name })} />
      )}
      {step === 'book' && (
        <div>
          {back}
          <BookingForm data={data} defaultName={line.name}
            onSubmit={(b) => call<BookingResult>('booking', { booking: b })} />
        </div>
      )}
    </div>
  );
}
