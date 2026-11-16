function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = parseInt(m ? m[1] : 'ea580c', 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(' ');

/** Apply a store's brand colour to the CSS variables used by Tailwind's `brand-*` colours. */
export function applyTheme(hex: string | null | undefined) {
  const c = hexToRgb(hex || '#ea580c');
  const root = document.documentElement.style;
  root.setProperty('--brand-50', mix(c, [255, 255, 255], 0.92));
  root.setProperty('--brand-100', mix(c, [255, 255, 255], 0.8));
  root.setProperty('--brand-500', mix(c, [255, 255, 255], 0.1));
  root.setProperty('--brand-600', c.join(' '));
  root.setProperty('--brand-700', mix(c, [0, 0, 0], 0.2));
}
