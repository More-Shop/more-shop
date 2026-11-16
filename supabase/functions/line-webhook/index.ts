// LINE Messaging API webhook — one URL per store: .../line-webhook?store=<slug>
// Replies with buttons that open the LIFF app (order at table / book a table).
import { adminClient, loadStoreLine } from '../_shared/common.ts';
import { reply, shopButtons, text, verifySignature } from '../_shared/line.ts';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type: string; text?: string };
}

const ORDER_WORDS = ['เมนู', 'สั่ง', 'อาหาร', 'menu', 'order'];
const BOOK_WORDS = ['จอง', 'book', 'reserve'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const slug = new URL(req.url).searchParams.get('store') ?? '';
  const raw = await req.text();
  try {
    const store = await loadStoreLine(adminClient(), { slug });
    const secret = store?.secret?.line_channel_secret;
    const token = store?.secret?.line_channel_access_token;
    if (!store || !secret || !token) return new Response('store not configured', { status: 404 });
    if (!(await verifySignature(secret, raw, req.headers.get('x-line-signature')))) {
      return new Response('bad signature', { status: 401 });
    }
    const { data: s } = await adminClient().from('stores').select('booking_enabled, qr_order_enabled').eq('id', store.id).single();
    const opts = { order: Boolean(s?.qr_order_enabled), book: Boolean(s?.booking_enabled) };
    const { events = [] } = JSON.parse(raw) as { events?: LineEvent[] };

    for (const ev of events) {
      if (!ev.replyToken) continue;
      const buttons = store.line_liff_id && (opts.order || opts.book) ? [shopButtons(store.name, store.line_liff_id, opts)] : [];
      if (ev.type === 'follow') {
        await reply(token, ev.replyToken, [text(`ยินดีต้อนรับสู่ ${store.name} 🙏\nสั่งอาหารที่โต๊ะ หรือจองโต๊ะล่วงหน้า กดปุ่มด้านล่างได้เลย`), ...buttons]);
        continue;
      }
      if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
      const msg = (ev.message.text ?? '').trim().toLowerCase();
      if (msg === 'staff-id') {
        const id = ev.source?.groupId ?? ev.source?.roomId ?? ev.source?.userId ?? '-';
        await reply(token, ev.replyToken, [text(`รหัสสำหรับรับแจ้งเตือน:\n${id}\nนำไปใส่ในหน้า ตั้งค่าร้าน → LINE`)]);
      } else if ([...ORDER_WORDS, ...BOOK_WORDS].some((w) => msg.includes(w)) && buttons.length) {
        await reply(token, ev.replyToken, buttons);
      }
    }
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });
  }
});
