// LINE Messaging API + LINE Login helpers.

const API = 'https://api.line.me';

export type LineMessage = Record<string, unknown>;

/** Validate the X-Line-Signature header (HMAC-SHA256 of the raw body). */
export async function verifySignature(channelSecret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Verify a LIFF ID token and return the LINE user id + display name. */
export async function verifyIdToken(idToken: string, channelId: string): Promise<{ sub: string; name?: string }> {
  const res = await fetch(`${API}/oauth2/v2.1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.sub) throw new Error(`LINE login ไม่ถูกต้อง (${body.error_description ?? res.status})`);
  return { sub: body.sub, name: body.name };
}

async function call(token: string, path: string, payload: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`LINE API ${path} ${res.status}: ${await res.text()}`);
}

export const reply = (token: string, replyToken: string, messages: LineMessage[]) =>
  call(token, '/v2/bot/message/reply', { replyToken, messages: messages.slice(0, 5) });

export const push = (token: string, to: string, messages: LineMessage[]) =>
  call(token, '/v2/bot/message/push', { to, messages: messages.slice(0, 5) });

export const text = (t: string): LineMessage => ({ type: 'text', text: t.slice(0, 5000) });

/** Buttons card that opens the shop's LIFF app. */
export function shopButtons(storeName: string, liffId: string, opts: { order: boolean; book: boolean }): LineMessage {
  const actions = [];
  if (opts.order) actions.push({ type: 'uri', label: 'สั่งอาหารที่โต๊ะ', uri: `https://liff.line.me/${liffId}` });
  if (opts.book) actions.push({ type: 'uri', label: 'จองโต๊ะ', uri: `https://liff.line.me/${liffId}?go=book` });
  return {
    type: 'template',
    altText: `${storeName}: สั่งอาหาร / จองโต๊ะ`,
    template: { type: 'buttons', title: storeName.slice(0, 40), text: 'เลือกหมายเลขโต๊ะ แล้วสั่งอาหารหรือจองโต๊ะได้เลย', actions },
  };
}
