import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink, Image as ImageIcon, Maximize2, Printer, Share2, X } from 'lucide-react';
import { Modal, Spinner, toast } from './ui';

/**
 * Show a QR code on screen with everything needed to hand it to customers:
 * copy the link, copy / share / download the QR picture, print it, or show
 * it full-screen so a customer can scan the tablet directly.
 */
export default function QrShareModal({ open, onClose, title, heading, caption, url, storeName, onPrint }: {
  open: boolean;
  onClose: () => void;
  /** Modal title, e.g. "QR จองโต๊ะ" */
  title: string;
  /** Big text on the picture, e.g. "สแกนเพื่อจองโต๊ะ" */
  heading: string;
  caption?: string;
  url: string;
  storeName: string;
  onPrint?: () => Promise<void> | void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [card, setCard] = useState<Blob | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQr(null); setCard(null);
    (async () => {
      const data = await QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
      if (cancelled) return;
      setQr(data);
      const blob = await renderCard(data, storeName, heading, caption ?? '');
      if (!cancelled) setCard(blob);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, url, storeName, heading, caption]);

  const fileName = `QR-${storeName}-${heading}.png`.replace(/[\\/:*?"<>|\s]+/g, '-');

  async function copyLink() {
    try { await navigator.clipboard.writeText(url); toast.ok('คัดลอกลิงก์แล้ว — วางในแชท LINE / Facebook ได้เลย'); }
    catch { toast.err('คัดลอกไม่ได้ — กดค้างที่ลิงก์แล้วเลือก “คัดลอก”'); }
  }
  async function copyImage() {
    if (!card) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': card })]);
      toast.ok('คัดลอกรูป QR แล้ว — วางในแชทได้เลย');
    } catch { download(); toast.ok('อุปกรณ์นี้คัดลอกรูปไม่ได้ จึงดาวน์โหลดรูปให้แทน'); }
  }
  function download() {
    if (!card) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(card);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function share() {
    const file = card ? new File([card], fileName, { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: storeName, text: `${heading}\n${url}` });
      else if (navigator.share) await navigator.share({ title: storeName, text: heading, url });
      else { await copyLink(); }
    } catch { /* user closed the share sheet */ }
  }
  async function print() {
    if (!onPrint) return;
    setBusy(true);
    try { await onPrint(); } finally { setBusy(false); }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <>
      <Modal open={open && !full} onClose={onClose} title={title}>
        <div className="flex flex-col items-center gap-3">
          <div className="text-center">
            <div className="font-bold">{storeName}</div>
            <div className="text-sm text-slate-500">{heading}</div>
          </div>
          <div className="flex h-64 w-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2">
            {qr ? <img src={qr} alt="QR code" className="h-full w-full" /> : <Spinner />}
          </div>
          {caption && <div className="text-sm text-slate-500">{caption}</div>}
          <div className="flex w-full gap-2">
            <input className="input bg-slate-50 font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn-secondary shrink-0" onClick={copyLink}><Copy className="h-4 w-4" /> คัดลอกลิงก์</button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            <button className="btn-primary" onClick={() => setFull(true)} disabled={!qr}><Maximize2 className="h-4 w-4" /> แสดงให้ลูกค้าสแกน</button>
            <button className="btn-secondary" onClick={copyImage} disabled={!card}><ImageIcon className="h-4 w-4" /> คัดลอกรูป QR</button>
            {canShare && <button className="btn-secondary" onClick={share} disabled={!card}><Share2 className="h-4 w-4" /> แชร์</button>}
            <button className="btn-secondary" onClick={download} disabled={!card}><Download className="h-4 w-4" /> ดาวน์โหลดรูป</button>
            {onPrint && <button className="btn-secondary" onClick={print} disabled={busy}>{busy ? <Spinner /> : <Printer className="h-4 w-4" />} พิมพ์</button>}
            <a className="btn-ghost" href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> เปิดลิงก์</a>
          </div>
        </div>
      </Modal>
      {open && full && qr && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-white p-6" onClick={() => setFull(false)}>
          <button className="btn-ghost absolute right-4 top-4" aria-label="ปิด"><X className="h-6 w-6" /></button>
          <div className="text-center">
            <div className="text-2xl font-bold">{storeName}</div>
            <div className="text-xl text-brand-700">{heading}</div>
          </div>
          <img src={qr} alt="QR code" className="aspect-square w-[min(80vw,70vh)]" />
          {caption && <div className="text-slate-500">{caption}</div>}
          <div className="text-xs text-slate-400">แตะที่ใดก็ได้เพื่อปิด</div>
        </div>
      )}
    </>
  );
}

/** A shareable picture: store name, heading, QR and caption on white. */
async function renderCard(qrDataUrl: string, storeName: string, heading: string, caption: string): Promise<Blob | null> {
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = qrDataUrl;
  });
  const W = 800, H = 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0f172a'; g.textAlign = 'center';
  const font = '"Noto Sans Thai", Tahoma, sans-serif';
  g.font = `700 52px ${font}`; g.fillText(storeName, W / 2, 100, W - 80);
  g.fillStyle = '#c2410c'; g.font = `600 40px ${font}`; g.fillText(heading, W / 2, 165, W - 80);
  g.drawImage(img, 100, 210, 600, 600);
  if (caption) { g.fillStyle = '#475569'; g.font = `400 30px ${font}`; g.fillText(caption, W / 2, 880, W - 80); }
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}
