import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { EmptyState, PageLoading } from '@/components/ui';
import BookingForm, { type BookingResult } from './BookingForm';
import { StoreBanner } from './OrderingView';
import { usePublicStore } from './usePublicStore';

export default function PublicBooking() {
  const { slug } = useParams();
  const [data, loading, error] = usePublicStore(slug);
  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="p-6"><EmptyState title="ไม่พบร้านนี้">{error}</EmptyState></div>;
  return (
    <div className="mx-auto min-h-full max-w-xl bg-white">
      <StoreBanner store={data.store} sub="จองโต๊ะออนไลน์" />
      {!data.store.booking_enabled ? <div className="p-6"><EmptyState title="ร้านปิดรับจองออนไลน์ชั่วคราว">กรุณาโทร {data.store.phone}</EmptyState></div> : (
        <BookingForm data={data} onSubmit={async (b) => {
          const { data: r, error: e } = await supabase.rpc('public_create_booking', {
            p_slug: slug, p_table_id: b.table_id, p_date: b.date, p_time: b.time, p_party: b.party, p_name: b.name,
            p_phone: b.phone, p_note: b.note || null, p_source: 'qr',
          });
          if (e) throw new Error(e.message);
          return r as BookingResult;
        }} />
      )}
    </div>
  );
}
