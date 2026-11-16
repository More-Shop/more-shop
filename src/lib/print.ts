// Printing works through the browser print dialog, so any printer the
// device can see works: 58/80 mm thermal receipt printers (USB, LAN,
// Bluetooth on Android/Windows, AirPrint on iPad) and normal A4 printers.

export type Paper = 58 | 80 | 'A4';

const ROOT_ID = 'print-root';
const STYLE_ID = 'print-page-style';

function pageCss(paper: Paper): string {
  if (paper === 'A4') {
    return `@page { size: A4; margin: 12mm; }
      #${ROOT_ID} { font-size: 11pt; width: auto; }`;
  }
  const content = paper === 58 ? 48 : 72;
  return `@page { size: ${paper}mm auto; margin: 0; }
    #${ROOT_ID} { width: ${content}mm; padding: 2mm ${(paper - content) / 2}mm 6mm;
      font-size: ${paper === 58 ? 11 : 12.5}px; }`;
}

function waitForImages(root: HTMLElement, timeoutMs = 4000) {
  const imgs = Array.from(root.querySelectorAll('img')).filter((i) => !i.complete);
  if (!imgs.length) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }))),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

/** Print an HTML fragment produced by the templates in src/print. */
export async function printHtml(html: string, paper: Paper, title?: string): Promise<void> {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = pageCss(paper);
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = paper === 'A4' ? 'print-a4' : 'print-slip';
  root.innerHTML = html;
  document.body.appendChild(root);

  await waitForImages(root);
  const oldTitle = document.title;
  if (title) document.title = title;          // becomes the PDF file name
  const cleanup = () => {
    document.title = oldTitle;
    root.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 60_000);                 // iOS may not fire afterprint
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
