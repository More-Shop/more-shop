// Staff confirmed / cancelled a booking in the back office → tell the
// customer in LINE. The caller must be signed in and belong to the store
// (checked by reading the booking through RLS with the caller's session).
import { adminClient, corsHeaders, json, loadStoreLine, thaiDate, userClient } from '../_shared/common.ts';
import { push, text } from '../_shared/line.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'unauthorized' }, 401);
  try {
    const { booking_id } = await req.json();
    const { data: b, error } = await userClient(auth).from('bookings')
      .select('id, store_id, booking_date, booking_time, party_size, status, line_user_id, table:dining_tables(code)')
      .eq('id', booking_id).maybeSingle();
    if (error || !b) return json({ error: 'ไม่พบการจอง หรือไม่มีสิทธิ์' }, 403);
    if (!b.line_user_id) return json({ sent: false, reason: 'no line user' });

    const store = await loadStoreLine(adminClient(), { id: b.store_id });
    const token = store?.secret?.line_channel_access_token;
    if (!store || !token) return json({ error: 'ร้านยังไม่ได้ตั้งค่า LINE access token' }, 400);

    const table = (Array.isArray(b.table) ? b.table[0] : b.table) as { code: string } | null;
    const when = `${thaiDate(b.booking_date)} เวลา ${String(b.booking_time).slice(0, 5)} น. · ${b.party_size} คน${table ? ` · โต๊ะ ${table.code}` : ''}`;
    const msg = b.status === 'confirmed' ? `✅ ${store.name} ยืนยันการจองของคุณแล้ว\n${when}\nแล้วพบกันค่ะ`
      : b.status === 'cancelled' ? `❌ ${store.name} ขออภัย การจองของคุณถูกยกเลิก\n${when}\nสอบถามเพิ่มเติมได้ทางแชทนี้`
      : null;
    if (!msg) return json({ sent: false, reason: 'status not notifiable' });
    await push(token, b.line_user_id, [text(msg)]);
    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
