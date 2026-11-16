import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fmt2 } from '@/lib/format';
import { applyTheme } from '@/lib/theme';
import { EmptyState, PageLoading, useLoad } from '@/components/ui';

interface PublicOrder {
  id: string; order_no: string; table_code: string | null; status: string; subtotal: number; discount: number;
  service_charge: number; vat: number; total: number;
  store: { name: string; slug: string; logo_url: string | null; theme_color: string };
  items: { name: string; qty: number; unit_price: number; status: string; note: string | null }[];
}

const ITEM_STATUS: Record<string, [string, string]> = {
  pending: ['รอร้านยืนยัน', 'bg-amber-100 text-amber-800'],
  sent: ['กำลังทำ', 'bg-blue-100 text-blue-700'],
  served: ['เสิร์ฟแล้ว', 'bg-green-100 text-green-700'],
};

export default function BillStatus() {
  const { orderId } = useParams();
  const [o, loading, , reload] = useLoad(async () => {
    const { data, error } = await supabase.rpc('public_order', { p_order: orderId });
    if (error) throw new Error(error.message);
    return data as PublicOrder | null;
  }, [orderId]);
  useEffect(() => { const t = setInterval(() => void reload(), 15000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (o) applyTheme(o.store.theme_color); }, [o]);

  if (loading && !o) return <PageLoading />;
  if (!o) return <div className="p-6"><EmptyState title="ไม่พบบิล" /></div>;
  return (
    <div className="mx-auto max-w-lg p-4">
      <div className="card p-5">
        <div className="mb-1 text-center text-lg font-bold">{o.store.name}</div>
        <div className="mb-4 text-center text-sm text-slate-500">{o.table_code ? `โต๊ะ ${o.table_code}` : 'กลับบ้าน'} · บิล #{o.order_no}
          {o.status === 'paid' && <span className="badge ml-2 bg-green-100 text-green-700">ชำระแล้ว</span>}</div>
        <ul className="divide-y divide-slate-100">
          {o.items.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div><div>{i.qty} × {i.name}</div>{i.note && <div className="text-xs text-slate-400">{i.note}</div>}</div>
              <div className="text-right">
                <div>{fmt2(i.qty * i.unit_price)}</div>
                {ITEM_STATUS[i.status] && <span className={`badge ${ITEM_STATUS[i.status][1]}`}>{ITEM_STATUS[i.status][0]}</span>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
          {Number(o.service_charge) > 0 && <div className="flex justify-between text-slate-500"><span>ค่าบริการ</span><span>{fmt2(o.service_charge)}</span></div>}
          {Number(o.vat) > 0 && <div className="flex justify-between text-slate-500"><span>VAT</span><span>{fmt2(o.vat)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>ยอดรวม</span><span>฿{fmt2(o.total)}</span></div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">หน้านี้อัปเดตอัตโนมัติ · เรียกพนักงานเพื่อชำระเงิน</p>
      <div className="mt-3 text-center"><button className="btn-ghost" onClick={() => history.back()}>← กลับไปสั่งเพิ่ม</button></div>
      <div className="mt-1 text-center"><Link className="text-xs text-slate-400 underline" to={`/s/${o.store.slug}`}>ดูเมนูร้าน</Link></div>
    </div>
  );
}
