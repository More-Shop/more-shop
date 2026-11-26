// Called by the LIFF page inside LINE. Verifies the customer's LINE ID token,
// then places the order / booking with the service role so the LINE user id
// is stored, and answers the customer (and optionally the staff group) in LINE.
import { adminClient, appLink, corsHeaders, json, loadStoreLine, thaiDate } from '../_shared/common.ts';
import { push, verifyIdToken, type LineMessage } from '../_shared/line.ts';
import { STATUS, storeCard } from '../_shared/flex.ts';

interface Body {
  action: 'order' | 'booking';
  slug: string;
  id_token: string;
  table_id?: string;
  items?: { menu_item_id: string; qty: number; note?: string }[];
  note?: string;
  customer_name?: string;
  booking?: { table_id: string | null; date: string; time: string; party: number; name: string; phone: string; note: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = (await req.json()) as Body;
    const db = adminClient();
    const store = await loadStoreLine(db, { slug: body.slug });
    if (!store) return json({ error: 'ไม่พบร้าน' }, 404);
    if (!store.line_login_channel_id) return json({ error: 'ร้านยังไม่ได้ตั้งค่า LINE Login Channel ID' }, 400);
    if (!body.id_token) return json({ error: 'กรุณาเปิดจากแอป LINE' }, 401);

    const user = await verifyIdToken(body.id_token, store.line_login_channel_id);
    const token = store.secret?.line_channel_access_token;
    const staff = store.secret?.line_staff_target_id;
    const notify = async (to: string | null | undefined, msg: LineMessage) => {
      if (!token || !to) return;
      await push(token, to, [msg]).catch((e) => console.error('push failed', e));
    };

    if (body.action === 'order') {
      const { data, error } = await db.rpc('public_place_order', {
        p_slug: store.slug, p_items: body.items ?? [], p_table_token: null, p_table_id: body.table_id ?? null,
        p_note: body.note ?? null, p_customer_name: body.customer_name ?? user.name ?? null, p_source: 'line', p_line_user_id: user.sub,
      });
      if (error) return json({ error: error.message }, 400);
      const r = data as { order_id: string; table_code: string; items: number; order_no: string };
      const link = appLink(`bill/${r.order_id}`);
      await notify(user.sub, storeCard(store, {
        icon: '🧾', title: 'ได้รับออเดอร์แล้ว', status: STATUS.wait,
        rows: [{ label: 'โต๊ะ', value: String(r.table_code), bold: true }, { label: 'จำนวน', value: `${r.items} รายการ` }, { label: 'เลขบิล', value: `#${r.order_no}` }],
        note: 'พนักงานกำลังยืนยันออเดอร์ของคุณ',
        button: link ? { label: 'ดูรายการที่สั่ง', uri: link } : null,
        altText: `🧾 ${store.name}: ได้รับออเดอร์โต๊ะ ${r.table_code} แล้ว ${r.items} รายการ`,
      }));
      await notify(staff, storeCard(store, {
        icon: '🔔', title: 'ออเดอร์ใหม่', status: STATUS.new,
        rows: [{ label: 'โต๊ะ', value: String(r.table_code), bold: true }, { label: 'จำนวน', value: `${r.items} รายการ` }, { label: 'เลขบิล', value: `#${r.order_no}` }, { label: 'ลูกค้า', value: body.customer_name ?? user.name ?? '' }],
        button: link ? { label: 'เปิดบิล', uri: link } : null,
        altText: `🔔 ออเดอร์ใหม่ (LINE) โต๊ะ ${r.table_code} · ${r.items} รายการ · บิล #${r.order_no}`,
      }));
      return json(r);
    }

    if (body.action === 'booking' && body.booking) {
      const b = body.booking;
      const { data, error } = await db.rpc('public_create_booking', {
        p_slug: store.slug, p_table_id: b.table_id, p_date: b.date, p_time: b.time, p_party: b.party, p_name: b.name,
        p_phone: b.phone || null, p_note: b.note || null, p_source: 'line', p_line_user_id: user.sub,
      });
      if (error) return json({ error: error.message }, 400);
      const r = data as { table_code: string | null; date: string; time: string; party_size: number };
      const when = `${thaiDate(r.date)} เวลา ${String(r.time).slice(0, 5)} น.`;
      const rows = [
        { label: 'วันที่', value: thaiDate(r.date), bold: true }, { label: 'เวลา', value: `${String(r.time).slice(0, 5)} น.`, bold: true },
        { label: 'จำนวน', value: `${r.party_size} คน` }, { label: 'โต๊ะ', value: r.table_code ? String(r.table_code) : '' },
      ];
      await notify(user.sub, storeCard(store, {
        icon: '📅', title: 'ได้รับคำขอจองแล้ว', status: STATUS.wait, rows,
        note: 'ร้านจะยืนยันการจองกลับทาง LINE นี้',
        altText: `📅 ${store.name}: ได้รับคำขอจอง ${when} · ${r.party_size} คน`,
      }));
      await notify(staff, storeCard(store, {
        icon: '🔔', title: 'จองโต๊ะใหม่', status: STATUS.new,
        rows: [{ label: 'ชื่อ', value: b.name, bold: true }, { label: 'โทร', value: b.phone }, ...rows, { label: 'หมายเหตุ', value: b.note }],
        note: 'ยืนยัน / ยกเลิกได้ในหน้าจองโต๊ะของร้าน',
        altText: `🔔 จองโต๊ะใหม่ (LINE) ${b.name} · ${when} · ${r.party_size} คน`,
      }));
      return json(r);
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
