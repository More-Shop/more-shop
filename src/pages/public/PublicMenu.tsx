import { Link, useParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { EmptyState, PageLoading, useLoad } from '@/components/ui';
import OrderingView, { StoreBanner, type PlaceResult } from './OrderingView';
import { usePublicStore } from './usePublicStore';

/** /s/:slug (menu only) and /s/:slug/t/:token (table QR — order). */
export default function PublicMenu() {
  const { slug, token } = useParams();
  const [data, loading, error] = usePublicStore(slug);
  const [table, tLoading] = useLoad(async () => {
    if (!token) return null;
    const { data: t } = await supabase.rpc('public_table', { p_slug: slug, p_token: token });
    return t as { id: string; code: string; zone: string | null } | null;
  }, [slug, token]);

  if ((loading && !data) || (token && tLoading)) return <PageLoading />;
  if (error || !data) return <div className="p-6"><EmptyState title="ไม่พบร้านนี้">{error}</EmptyState></div>;
  if (token && !table) return <div className="p-6"><EmptyState title="QR โต๊ะนี้ใช้ไม่ได้แล้ว">กรุณาแจ้งพนักงาน</EmptyState></div>;

  const canOrder = Boolean(table) && data.store.qr_order_enabled;
  return (
    <div className="mx-auto min-h-full max-w-3xl">
      <OrderingView
        data={data}
        canOrder={canOrder}
        tableLabel={table ? `โต๊ะ ${table.code}` : undefined}
        header={<>
          <StoreBanner store={data.store} />
          {!table && (
            <div className="flex items-center justify-between gap-2 bg-white px-4 py-3 text-sm">
              <span className="text-slate-500">สแกน QR บนโต๊ะเพื่อสั่งอาหาร</span>
              {data.store.booking_enabled && <Link to={`/s/${slug}/book`} className="btn-primary py-2"><CalendarDays className="h-4 w-4" /> จองโต๊ะ</Link>}
            </div>
          )}
          {table && !data.store.qr_order_enabled && <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800">ร้านปิดรับออเดอร์ผ่าน QR ชั่วคราว กรุณาสั่งกับพนักงาน</div>}
        </>}
        onPlace={async (items, note, name) => {
          const { data: r, error: e } = await supabase.rpc('public_place_order', {
            p_slug: slug, p_items: items, p_table_token: token, p_note: note || null, p_customer_name: name || null, p_source: 'qr',
          });
          if (e) throw new Error(e.message);
          return r as PlaceResult;
        }}
      />
    </div>
  );
}
