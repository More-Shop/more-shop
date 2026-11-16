const money2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

/** 1234.5 -> "1,234.50" */
export const fmt2 = (n: number | string | null | undefined) => money2.format(Number(n ?? 0));
/** 1234 -> "1,234", 12.5 -> "12.5" (for menu prices) */
export const fmtPrice = (n: number | string | null | undefined) => money0.format(Number(n ?? 0));
export const baht = (n: number | string | null | undefined) => `฿${fmt2(n)}`;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Today as YYYY-MM-DD in the given IANA time zone. */
export function todayISO(timeZone = 'Asia/Bangkok', d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "2026-11-16" -> "16 พ.ย. 2569" (Thai Buddhist calendar) */
export function thaiDate(iso: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!iso) return '';
  const d = iso.length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: style, year: 'numeric' }).format(d);
}

export function thaiDateTime(iso: string | null | undefined, timeZone = 'Asia/Bangkok'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone, day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function timeHM(iso: string | null | undefined, timeZone = 'Asia/Bangkok'): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('th-TH', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม',
  'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const buddhistYear = (y: number) => y + 543;

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function readGroup(n: string): string {
  // n: up to 6 digits, no leading zeros required
  let out = '';
  const len = n.length;
  for (let i = 0; i < len; i++) {
    const d = Number(n[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else if (pos === 1 && d === 1) out += 'สิบ';
    else out += DIGITS[d] + PLACES[pos];
  }
  return out;
}

function readInteger(s: string): string {
  s = s.replace(/^0+/, '');
  if (!s) return '';
  if (s.length <= 6) return readGroup(s);
  const head = s.slice(0, s.length - 6);
  const tail = s.slice(-6);
  return readInteger(head) + 'ล้าน' + readGroup(tail);
}

/** 1234.5 -> "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์" — used on receipts and tax documents. */
export function bahtText(amount: number): string {
  const [i, f] = Math.abs(round2(amount)).toFixed(2).split('.');
  const intText = readInteger(i);
  const satang = readInteger(f);
  if (!intText && !satang) return 'ศูนย์บาทถ้วน';
  return (amount < 0 ? 'ลบ' : '') + (intText ? intText + 'บาท' : '') + (satang ? satang + 'สตางค์' : 'ถ้วน');
}

export function branchLabel(code: string | null | undefined): string {
  if (!code || code === '00000') return 'สำนักงานใหญ่';
  return `สาขาที่ ${code}`;
}

export function errorMessage(e: unknown): string {
  if (!e) return 'เกิดข้อผิดพลาด';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  return m || 'เกิดข้อผิดพลาด';
}
