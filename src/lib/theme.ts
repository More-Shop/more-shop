function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = parseInt(m ? m[1] : 'ea580c', 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(' ');

/** CSS variables behind Tailwind's `brand-*` colours for a given brand colour. */
export function brandVars(hex: string | null | undefined): Record<string, string> {
  const c = hexToRgb(hex || '#ea580c');
  return {
    '--brand-50': mix(c, [255, 255, 255], 0.92),
    '--brand-100': mix(c, [255, 255, 255], 0.8),
    '--brand-500': mix(c, [255, 255, 255], 0.1),
    '--brand-600': c.join(' '),
    '--brand-700': mix(c, [0, 0, 0], 0.2),
  };
}

/** Apply a store's brand colour to the whole page. */
export function applyTheme(hex: string | null | undefined) {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(brandVars(hex))) root.setProperty(k, v);
}

// ---- Background gradient ("ตกแต่งหน้าร้าน") --------------------------------
export interface Background { bg_from: string; bg_to: string; bg_angle: number }
type MaybeBg = { bg_from?: string | null; bg_to?: string | null; bg_angle?: number | null } | null | undefined;

export const DEFAULT_BG: Background = { bg_from: '#fff7ed', bg_to: '#fdba74', bg_angle: 135 };
let platformBg: Background = DEFAULT_BG;
let currentOverride: MaybeBg = null;

export const gradientCss = (b: Background) => `linear-gradient(${b.bg_angle}deg, ${b.bg_from} 0%, ${b.bg_to} 100%)`;

/** The store's own gradient when it has one, otherwise the system default. */
export function resolveBackground(store?: MaybeBg): Background {
  return store?.bg_from && store?.bg_to
    ? { bg_from: store.bg_from, bg_to: store.bg_to, bg_angle: store.bg_angle ?? platformBg.bg_angle }
    : platformBg;
}

/** Paint the page background (body) with a store's gradient or the system default. */
export function applyBackground(store?: MaybeBg) {
  currentOverride = store;
  const b = resolveBackground(store);
  const root = document.documentElement.style;
  root.setProperty('--bg-from', b.bg_from);
  root.setProperty('--bg-to', b.bg_to);
  root.setProperty('--bg-angle', `${b.bg_angle}deg`);
}

/** Load the system-wide default once at start-up (works before login). */
export async function loadPlatformAppearance(fetcher: () => Promise<unknown>) {
  try {
    const v = (await fetcher()) as Partial<Background> | null;
    if (v?.bg_from && v?.bg_to) platformBg = { bg_from: v.bg_from, bg_to: v.bg_to, bg_angle: Number(v.bg_angle ?? 135) };
  } catch { /* keep the built-in default */ }
  applyBackground(currentOverride);
}

export function setPlatformBackground(b: Background) {
  platformBg = b;
  applyBackground(currentOverride);
}
