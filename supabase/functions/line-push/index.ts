// Staff confirmed / cancelled a booking in the back office → tell the
// customer in LINE. The caller must be signed in and belong to the store
// (checked by reading the booking through RLS with the caller's session).
import { adminClient, corsHeaders, json, loadStoreLine, thaiDate, userClient } from '../_shared/common.ts';
import { push } from '../_shared/line.ts';
import { STATUS, storeCard } from '../_shared/flex.ts';

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
    const ok = b.status === 'confirmed', no = b.status === 'cancelled';
    if (!ok && !no) return json({ sent: false, reason: 'status not notifiable' });
    const when = `${thaiDate(b.booking_date)} เวลา ${String(b.booking_time).slice(0, 5)} น.`;
    await push(token, b.line_user_id, [storeCard(store, {
      icon: ok ? '✅' : '❌', title: ok ? 'ยืนยันการจองแล้ว' : 'การจองถูกยกเลิก', status: ok ? STATUS.ok : STATUS.no,
      rows: [
        { label: 'วันที่', value: thaiDate(b.booking_date), bold: true }, { label: 'เวลา', value: `${String(b.booking_time).slice(0, 5)} น.`, bold: true },
        { label: 'จำนวน', value: `${b.party_size} คน` }, { label: 'โต๊ะ', value: table ? table.code : '' },
      ],
      note: ok ? 'แล้วพบกันค่ะ 🙏' : 'ขออภัยค่ะ สอบถามเพิ่มเติมได้ทางแชทนี้',
      altText: ok ? `✅ ${store.name} ยืนยันการจองแล้ว · ${when}` : `❌ ${store.name} ยกเลิกการจอง · ${when}`,
    })]);
    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
