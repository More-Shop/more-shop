// Called by the LIFF page inside LINE. Verifies the customer's LINE ID token,
// then places the order / booking with the service role so the LINE user id
// is stored, and answers the customer (and optionally the staff group) in LINE.
import { adminClient, appLink, corsHeaders, json, loadStoreLine, thaiDate } from '../_shared/common.ts';
import { push, text, verifyIdToken } from '../_shared/line.ts';

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
    const notify = async (to: string | null | undefined, msg: string) => {
      if (!token || !to) return;
      await push(token, to, [text(msg)]).catch((e) => console.error('push failed', e));
    };

    if (body.action === 'order') {
      const { data, error } = await db.rpc('public_place_order', {
        p_slug: store.slug, p_items: body.items ?? [], p_table_token: null, p_table_id: body.table_id ?? null,
        p_note: body.note ?? null, p_customer_name: body.customer_name ?? user.name ?? null, p_source: 'line', p_line_user_id: user.sub,
      });
      if (error) return json({ error: error.message }, 400);
      const r = data as { order_id: string; table_code: string; items: number; order_no: string };
      const link = appLink(`bill/${r.order_id}`);
      await notify(user.sub, `🧾 ${store.name}\nได้รับออเดอร์โต๊ะ ${r.table_code} แล้ว ${r.items} รายการ\nพนักงานกำลังยืนยันออเดอร์${link ? `\nดูรายการ: ${link}` : ''}`);
      await notify(staff, `🔔 ออเดอร์ใหม่ (LINE) โต๊ะ ${r.table_code} · ${r.items} รายการ · บิล #${r.order_no}`);
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
      await notify(user.sub, `📅 ${store.name}\nได้รับคำขอจองแล้ว\n${when}\n${r.party_size} คน${r.table_code ? ` · โต๊ะ ${r.table_code}` : ''}\nร้านจะยืนยันกลับทาง LINE นี้`);
      await notify(staff, `🔔 จองโต๊ะใหม่ (LINE)\n${b.name} ${b.phone}\n${when} · ${r.party_size} คน${r.table_code ? ` · โต๊ะ ${r.table_code}` : ''}`);
      return json(r);
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
