// Flex cards for LINE messages, coloured with the store's theme colour (stores.theme_color)
// and showing the store logo when it is a public image URL.
import type { LineMessage } from './line.ts';

export interface CardStore { name: string; theme_color?: string | null; logo_url?: string | null }
export interface CardRow { label: string; value: string; bold?: boolean }
export interface CardOpts {
  icon: string;            // emoji in front of the title
  title: string;           // e.g. "ได้รับออเดอร์แล้ว"
  status?: { text: string; color: string; bg: string };   // pill under the title
  rows: CardRow[];
  note?: string;           // grey line at the bottom of the body
  button?: { label: string; uri: string } | null;
  altText: string;         // shown in the chat list / notification
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function themeOf(store: CardStore) { return store.theme_color && HEX.test(store.theme_color) ? store.theme_color : '#ea580c'; }

/** Mix the colour with white (0..1) → light tint for row backgrounds. */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return '#' + c.map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')).join('');
}
/** Darker shade for text on the light tint. */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return '#' + c.map((v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0')).join('');
}
/** Light colours (yellow, light green) need dark header text. */
function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 170 ? '#111827' : '#FFFFFF';
}
/** Drive share links → thumbnail URL LINE can load (same rule as the web app). */
export function logoUrl(input?: string | null) {
  const s = (input ?? '').trim();
  if (!/^https:\/\//.test(s)) return null;
  if (!/^https:\/\/(drive|docs)\.google\.com\//.test(s)) return s;
  const m = s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : null;
}

export function storeCard(store: CardStore, o: CardOpts): LineMessage {
  const c = themeOf(store), fg = textOn(c), soft = tint(c, 0.9), deep = shade(c, 0.35), btn = fg === '#FFFFFF' ? c : deep;
  const logo = logoUrl(store.logo_url);
  const head: Record<string, unknown>[] = [];
  head.push({
    type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
    contents: [
      ...(logo ? [{ type: 'box', layout: 'vertical', width: '40px', height: '40px', cornerRadius: '20px', backgroundColor: '#FFFFFF',
        contents: [{ type: 'image', url: logo, size: 'full', aspectMode: 'cover', aspectRatio: '1:1' }] }] : []),
      { type: 'text', text: store.name.slice(0, 60), color: fg, weight: 'bold', size: 'md', wrap: true, flex: 1 },
    ],
  });
  head.push({ type: 'text', text: `${o.icon} ${o.title}`, color: fg, weight: 'bold', size: 'xl', wrap: true, margin: 'md' });
  if (o.status) head.push({
    type: 'box', layout: 'vertical', margin: 'sm', paddingStart: '10px', paddingEnd: '10px', paddingTop: '3px', paddingBottom: '3px',
    cornerRadius: '12px', backgroundColor: o.status.bg, flex: 0,
    contents: [{ type: 'text', text: o.status.text, color: o.status.color, size: 'xs', weight: 'bold' }],
  });

  const rows = o.rows.filter((r) => r.value).map((r) => ({
    type: 'box', layout: 'horizontal', spacing: 'md',
    contents: [
      { type: 'text', text: r.label, size: 'sm', color: '#6B7280', flex: 2, wrap: true },
      { type: 'text', text: r.value, size: 'sm', color: r.bold ? deep : '#111827', weight: r.bold ? 'bold' : 'regular', flex: 4, wrap: true },
    ],
  }));
  const body: Record<string, unknown>[] = [
    { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', cornerRadius: '12px', backgroundColor: soft, contents: rows },
  ];
  if (o.note) body.push({ type: 'text', text: o.note, size: 'xs', color: '#6B7280', wrap: true, margin: 'md' });

  const bubble: Record<string, unknown> = {
    type: 'bubble', size: 'kilo',
    header: { type: 'box', layout: 'vertical', backgroundColor: c, paddingAll: '16px', contents: head },
    body: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: body },
  };
  if (o.button) bubble.footer = {
    type: 'box', layout: 'vertical', paddingAll: '12px', paddingTop: '0px',
    contents: [{ type: 'button', style: 'primary', color: btn, height: 'sm', action: { type: 'uri', label: o.button.label.slice(0, 40), uri: o.button.uri } }],
  };
  return { type: 'flex', altText: o.altText.slice(0, 400), contents: bubble };
}

export const STATUS = {
  wait: { text: '⏳ รอร้านยืนยัน', color: '#9A3412', bg: '#FFEDD5' },
  ok: { text: '✓ ยืนยันแล้ว', color: '#166534', bg: '#DCFCE7' },
  no: { text: '✕ ยกเลิกแล้ว', color: '#991B1B', bg: '#FEE2E2' },
  new: { text: '🔔 ใหม่ · ผ่าน LINE', color: '#1E3A8A', bg: '#DBEAFE' },
};
