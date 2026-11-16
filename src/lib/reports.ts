// Accounting / tax reports built from ledger entries. Pure functions so they
// can be unit-tested and rendered on screen, printed on A4 or exported to CSV.
//
// - รายงานเงินสดรับ-จ่าย  : cash receipts & payments book for individuals
//   (บุคคลธรรมดา) with business income who deduct actual expenses.
// - รายงานภาษีขาย / ภาษีซื้อ : monthly output / input VAT reports for VAT
//   registrants (ภ.พ.30 supporting schedules).
// - งบกำไรขาดทุน          : income statement by function (IFRS / TFRS for NPAEs layout).
// - สมุดรายวันทั่วไป        : double-entry general journal for the accountant.
// - สรุปยอดขายรายวัน       : daily sales summary by payment method.

import { branchLabel, buddhistYear, round2, thaiDate, THAI_MONTHS } from './format';
import { formatTaxId } from './taxid';
import { PAYMENT_METHODS, type Account, type LedgerEntry, type Store } from './types';

export type Cell = string | number;
export interface Report {
  title: string;
  subtitle: string;
  meta: [string, string][];
  columns: { label: string; num?: boolean }[];
  rows: Cell[][];
  footer?: Cell[];
  notes?: string[];
  signatures?: string[];
  /** rows that are section headings / subtotals (indexes) — for styling */
  emphasis?: number[];
}

export type ReportKey = 'cashbook' | 'sales_vat' | 'purchase_vat' | 'income_statement' | 'journal' | 'daily_sales';

export const REPORTS: { key: ReportKey; label: string; desc: string; vatOnly?: boolean }[] = [
  { key: 'cashbook', label: 'รายงานเงินสดรับ-จ่าย', desc: 'สำหรับบุคคลธรรมดาที่มีเงินได้จากธุรกิจและหักค่าใช้จ่ายตามจริง (ใช้ประกอบ ภ.ง.ด.90/94)' },
  { key: 'sales_vat', label: 'รายงานภาษีขาย', desc: 'รายเดือน ประกอบการยื่น ภ.พ.30 (เฉพาะร้านที่จด VAT)', vatOnly: true },
  { key: 'purchase_vat', label: 'รายงานภาษีซื้อ', desc: 'รายเดือน ประกอบการยื่น ภ.พ.30 (เฉพาะร้านที่จด VAT)', vatOnly: true },
  { key: 'income_statement', label: 'งบกำไรขาดทุน', desc: 'Income Statement จำแนกตามหน้าที่ ตามหลักการบัญชีสากล' },
  { key: 'journal', label: 'สมุดรายวันทั่วไป', desc: 'General Journal แบบบัญชีคู่ (เดบิต/เครดิต) ส่งต่อให้สำนักงานบัญชี' },
  { key: 'daily_sales', label: 'สรุปยอดขายรายวัน', desc: 'ยอดขายแยกตามช่องทางชำระเงิน' },
];

const live = (es: LedgerEntry[]) => es.filter((e) => !e.voided);
const n = (v: unknown) => Number(v ?? 0);
const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

export function periodLabel(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const lastDay = new Date(ty, tm, 0).getDate();
  if (fy === ty && fm === tm && from.endsWith('-01') && td === lastDay) return `เดือน ${THAI_MONTHS[fm - 1]} พ.ศ. ${buddhistYear(fy)}`;
  if (fy === ty && fm === 1 && tm === 12 && from.endsWith('-01') && td === 31) return `ปี พ.ศ. ${buddhistYear(fy)} (1 ม.ค. – 31 ธ.ค.)`;
  return `${thaiDate(from, 'long')} ถึง ${thaiDate(to, 'long')}`;
}

function taxpayerMeta(store: Store): [string, string][] {
  return [
    ['ชื่อผู้ประกอบการ', store.legal_name || store.name],
    ['เลขประจำตัวผู้เสียภาษีอากร', formatTaxId(store.tax_id) || '-'],
    ['ชื่อสถานประกอบการ', store.name],
    ['สำนักงานใหญ่/สาขา', branchLabel(store.branch_code)],
    ['ที่อยู่', store.address || '-'],
  ];
}

/** Sales from bills are collapsed to one line per day (with the receipt number range). */
function salesByDay(entries: LedgerEntry[]) {
  const map = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    if (e.type !== 'income' || !e.order_id) continue;
    if (!map.has(e.entry_date)) map.set(e.entry_date, []);
    map.get(e.entry_date)!.push(e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, es]) => {
    const docs = es.map((e) => e.doc_no ?? '').filter(Boolean).sort();
    return {
      date, count: es.length, amount: sum(es.map((e) => n(e.amount))), vat: sum(es.map((e) => n(e.vat_amount))),
      docRange: docs.length ? (docs.length > 1 ? `${docs[0]} – ${docs[docs.length - 1]}` : docs[0]) : '',
      entries: es,
    };
  });
}

export function cashBook(store: Store, entries: LedgerEntry[], from: string, to: string): Report {
  const es = live(entries);
  type Line = { date: string; desc: string; doc: string; inc: number; exp: number };
  const lines: Line[] = [];
  for (const d of salesByDay(es)) {
    lines.push({ date: d.date, desc: `รายได้จากการขาย ${d.count} บิล`, doc: d.docRange, inc: d.amount, exp: 0 });
  }
  for (const e of es) {
    if (e.type === 'income' && e.order_id) continue;
    lines.push({
      date: e.entry_date, desc: e.description + (e.counterparty_name ? ` (${e.counterparty_name})` : ''),
      doc: e.doc_no ?? '', inc: e.type === 'income' ? n(e.amount) : 0, exp: e.type === 'expense' ? n(e.amount) : 0,
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || b.inc - a.inc);
  const totalIn = sum(lines.map((l) => l.inc));
  const totalOut = sum(lines.map((l) => l.exp));
  return {
    title: 'รายงานเงินสดรับ-จ่าย',
    subtitle: periodLabel(from, to),
    meta: taxpayerMeta(store),
    columns: [{ label: 'ลำดับ' }, { label: 'วัน เดือน ปี' }, { label: 'รายการ' }, { label: 'เลขที่เอกสาร' },
      { label: 'รายรับ (บาท)', num: true }, { label: 'รายจ่าย (บาท)', num: true }],
    rows: lines.map((l, i) => [i + 1, thaiDate(l.date), l.desc, l.doc, l.inc || '', l.exp || '']),
    footer: ['', '', 'รวม', '', totalIn, totalOut],
    notes: [`เงินได้สุทธิ (รายรับ - รายจ่าย) ${fmtN(round2(totalIn - totalOut))} บาท`,
      'จัดทำตามรูปแบบรายงานเงินสดรับ-จ่ายของผู้มีเงินได้ที่เป็นบุคคลธรรมดา ให้ลงรายการภายใน 15 วันนับแต่วันที่ได้รับหรือจ่ายเงิน และเก็บเอกสารประกอบไว้ไม่น้อยกว่า 5 ปี'],
    signatures: ['ผู้จัดทำ', 'ผู้ประกอบการ'],
  };
}

export function salesVatReport(store: Store, entries: LedgerEntry[], from: string, to: string): Report {
  const es = live(entries);
  const rows: Cell[][] = [];
  let i = 0;
  const vr = n(store.vat_rate);
  for (const d of salesByDay(es)) {
    const full = d.entries.filter((e) => e.counterparty_tax_id);
    const abbr = d.entries.filter((e) => !e.counterparty_tax_id);
    if (abbr.length) {
      const docs = abbr.map((e) => e.doc_no ?? '').filter(Boolean).sort();
      const amt = sum(abbr.map((e) => n(e.amount)));
      const vat = sum(abbr.map((e) => n(e.vat_amount)));
      rows.push([++i, thaiDate(d.date), docs.length > 1 ? `${docs[0]} – ${docs.at(-1)}` : docs[0] ?? '',
        `ลูกค้าทั่วไป (ใบกำกับภาษีอย่างย่อ ${abbr.length} ฉบับ)`, '', '', round2(amt - vat), vat, amt]);
    }
    for (const e of full) {
      rows.push([++i, thaiDate(d.date), e.doc_no ?? '', e.counterparty_name ?? '', formatTaxId(e.counterparty_tax_id),
        branchLabel(e.counterparty_branch), round2(n(e.amount) - n(e.vat_amount)), n(e.vat_amount), n(e.amount)]);
    }
  }
  // Other taxable income entered by hand.
  for (const e of es.filter((x) => x.type === 'income' && !x.order_id && n(x.vat_amount) > 0)) {
    rows.push([++i, thaiDate(e.entry_date), e.doc_no ?? '', e.counterparty_name ?? e.description, formatTaxId(e.counterparty_tax_id),
      e.counterparty_tax_id ? branchLabel(e.counterparty_branch) : '', round2(n(e.amount) - n(e.vat_amount)), n(e.vat_amount), n(e.amount)]);
  }
  const voided = entries.filter((e) => e.voided && e.type === 'income' && e.doc_no).map((e) => e.doc_no);
  return {
    title: 'รายงานภาษีขาย',
    subtitle: `${periodLabel(from, to)} · อัตราภาษี ${vr}%`,
    meta: taxpayerMeta(store),
    columns: [{ label: 'ลำดับ' }, { label: 'วัน เดือน ปี' }, { label: 'เลขที่ใบกำกับภาษี' }, { label: 'ชื่อผู้ซื้อสินค้า/ผู้รับบริการ' },
      { label: 'เลขประจำตัวผู้เสียภาษีของผู้ซื้อ' }, { label: 'สถานประกอบการ' }, { label: 'มูลค่าสินค้าหรือบริการ', num: true },
      { label: 'จำนวนเงินภาษีมูลค่าเพิ่ม', num: true }, { label: 'รวม', num: true }],
    rows,
    footer: ['', '', '', 'รวม', '', '', sum(rows.map((r) => n(r[6]))), sum(rows.map((r) => n(r[7]))), sum(rows.map((r) => n(r[8])))],
    notes: voided.length ? [`ใบกำกับภาษีที่ยกเลิก: ${voided.join(', ')}`] : undefined,
    signatures: ['ผู้จัดทำ', 'ผู้ประกอบการ'],
  };
}

export function purchaseVatReport(store: Store, entries: LedgerEntry[], from: string, to: string): Report {
  const es = live(entries).filter((e) => e.type === 'expense' && n(e.vat_amount) > 0)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const rows: Cell[][] = es.map((e, i) => [i + 1, thaiDate(e.entry_date), e.doc_no ?? '', e.counterparty_name ?? e.description,
    formatTaxId(e.counterparty_tax_id), branchLabel(e.counterparty_branch), round2(n(e.amount) - n(e.vat_amount)), n(e.vat_amount), n(e.amount)]);
  return {
    title: 'รายงานภาษีซื้อ',
    subtitle: `${periodLabel(from, to)} · อัตราภาษี ${n(store.vat_rate)}%`,
    meta: taxpayerMeta(store),
    columns: [{ label: 'ลำดับ' }, { label: 'วัน เดือน ปี' }, { label: 'เลขที่ใบกำกับภาษี' }, { label: 'ชื่อผู้ขายสินค้า/ผู้ให้บริการ' },
      { label: 'เลขประจำตัวผู้เสียภาษีของผู้ขาย' }, { label: 'สถานประกอบการ' }, { label: 'มูลค่าสินค้าหรือบริการ', num: true },
      { label: 'จำนวนเงินภาษีมูลค่าเพิ่ม', num: true }, { label: 'รวม', num: true }],
    rows,
    footer: ['', '', '', 'รวม', '', '', sum(rows.map((r) => n(r[6]))), sum(rows.map((r) => n(r[7]))), sum(rows.map((r) => n(r[8])))],
    notes: es.some((e) => !e.counterparty_tax_id) ? ['มีรายการที่ยังไม่ได้ระบุเลขผู้เสียภาษีของผู้ขาย — ภาษีซื้อที่ใบกำกับไม่ครบถ้วนอาจขอคืนไม่ได้'] : undefined,
    signatures: ['ผู้จัดทำ', 'ผู้ประกอบการ'],
  };
}

/** Amount excluding VAT that is recoverable (VAT registrants only). */
const netOfVat = (store: Store, e: LedgerEntry) => round2(n(e.amount) - (store.vat_registered ? n(e.vat_amount) : 0));

export function incomeStatement(store: Store, entries: LedgerEntry[], accounts: Account[], from: string, to: string): Report {
  const es = live(entries);
  const byCode = new Map<string, number>();
  for (const e of es) byCode.set(e.account_code, round2((byCode.get(e.account_code) ?? 0) + netOfVat(store, e)));
  const acc = (code: string) => accounts.find((a) => a.code === code);
  const group = (g: Account['pl_group']) => [...byCode.entries()]
    .map(([code, amt]) => ({ code, amt, a: acc(code) }))
    .filter((x) => (x.a?.pl_group ?? (x.code.startsWith('4') ? 'revenue' : 'operating')) === g)
    .sort((a, b) => a.code.localeCompare(b.code));

  const rows: Cell[][] = [];
  const emphasis: number[] = [];
  const head = (label: string) => { emphasis.push(rows.length); rows.push([label, '', '']); };
  const lineItems = (xs: ReturnType<typeof group>) => xs.forEach((x) => rows.push([`    ${x.code} ${x.a?.name ?? ''}`, x.amt, '']));
  const subtotal = (label: string, v: number) => { emphasis.push(rows.length); rows.push([label, '', v]); };

  const rev = group('revenue'); const cogs = group('cogs'); const opx = group('operating');
  const oth = group('other_income'); const fin = group('finance'); const tax = group('tax');
  const tRev = sum(rev.map((x) => x.amt)); const tCogs = sum(cogs.map((x) => x.amt));
  const gross = round2(tRev - tCogs);
  const tOpx = sum(opx.map((x) => x.amt)); const tOth = sum(oth.map((x) => x.amt));
  const opProfit = round2(gross - tOpx);
  const tFin = sum(fin.map((x) => x.amt));
  const pbt = round2(opProfit + tOth - tFin);
  const tTax = sum(tax.map((x) => x.amt));

  head('รายได้ (Revenue)'); lineItems(rev); subtotal('รวมรายได้จากการขายและบริการ', tRev);
  head('ต้นทุนขาย (Cost of sales)'); lineItems(cogs); subtotal('รวมต้นทุนขาย', tCogs);
  subtotal('กำไรขั้นต้น (Gross profit)', gross);
  head('ค่าใช้จ่ายในการดำเนินงาน (Operating expenses)'); lineItems(opx); subtotal('รวมค่าใช้จ่ายในการดำเนินงาน', tOpx);
  subtotal('กำไร(ขาดทุน)จากการดำเนินงาน (Operating profit)', opProfit);
  if (oth.length) { head('รายได้อื่น (Other income)'); lineItems(oth); }
  if (fin.length) { head('ต้นทุนทางการเงิน (Finance costs)'); lineItems(fin); }
  subtotal('กำไร(ขาดทุน)ก่อนภาษีเงินได้ (Profit before tax)', pbt);
  if (tax.length) { head('ภาษีเงินได้ (Income tax expense)'); lineItems(tax); }
  subtotal('กำไร(ขาดทุน)สุทธิ (Net profit)', round2(pbt - tTax));

  return {
    title: 'งบกำไรขาดทุน (Income Statement)',
    subtitle: `สำหรับงวด ${periodLabel(from, to)} · หน่วย: บาท`,
    meta: [['กิจการ', store.legal_name || store.name], ['เลขประจำตัวผู้เสียภาษีอากร', formatTaxId(store.tax_id) || '-']],
    columns: [{ label: 'รายการ' }, { label: 'จำนวนเงิน', num: true }, { label: 'รวม', num: true }],
    rows,
    emphasis,
    notes: [store.vat_registered ? 'รายได้และค่าใช้จ่ายแสดงด้วยมูลค่าไม่รวมภาษีมูลค่าเพิ่ม' : 'กิจการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม: ภาษีซื้อรวมเป็นต้นทุน/ค่าใช้จ่าย',
      'จัดทำจากรายการรับ-จ่ายที่บันทึกในระบบ (เกณฑ์เงินสด) — ควรให้ผู้สอบบัญชีตรวจสอบก่อนยื่นงบการเงินประจำปี'],
    signatures: ['ผู้จัดทำ', 'ผู้ประกอบการ'],
  };
}

export function generalJournal(store: Store, entries: LedgerEntry[], accounts: Account[], from: string, to: string): Report {
  const es = live(entries).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
  const name = (code: string) => accounts.find((a) => a.code === code)?.name ?? '';
  const cashAcc = (pm: string | null) => (pm === 'cash' || !pm ? ['1000', 'เงินสด'] : ['1010', 'เงินฝากธนาคาร/รับชำระทางอิเล็กทรอนิกส์']);
  const rows: Cell[][] = [];
  for (const e of es) {
    const vat = store.vat_registered ? n(e.vat_amount) : 0;
    const net = round2(n(e.amount) - vat);
    const [cCode, cName] = cashAcc(e.payment_method);
    const base = [thaiDate(e.entry_date), e.doc_no ?? ''];
    if (e.type === 'income') {
      rows.push([...base, cCode, cName, e.description, n(e.amount), '']);
      rows.push([...base, e.account_code, name(e.account_code), '', '', net]);
      if (vat) rows.push([...base, '2150', 'ภาษีขาย', '', '', vat]);
    } else {
      rows.push([...base, e.account_code, name(e.account_code), e.description, net, '']);
      if (vat) rows.push([...base, '1150', 'ภาษีซื้อ', '', vat, '']);
      rows.push([...base, cCode, cName, '', '', n(e.amount)]);
    }
  }
  return {
    title: 'สมุดรายวันทั่วไป (General Journal)',
    subtitle: periodLabel(from, to),
    meta: [['กิจการ', store.legal_name || store.name], ['เลขประจำตัวผู้เสียภาษีอากร', formatTaxId(store.tax_id) || '-']],
    columns: [{ label: 'วันที่' }, { label: 'เลขที่เอกสาร' }, { label: 'รหัสบัญชี' }, { label: 'ชื่อบัญชี' }, { label: 'คำอธิบาย' },
      { label: 'เดบิต', num: true }, { label: 'เครดิต', num: true }],
    rows,
    footer: ['', '', '', '', 'รวม', sum(rows.map((r) => n(r[5]))), sum(rows.map((r) => n(r[6])))],
  };
}

export function dailySales(store: Store, entries: LedgerEntry[], from: string, to: string): Report {
  const methods = Object.keys(PAYMENT_METHODS);
  const rows: Cell[][] = salesByDay(live(entries)).map((d) => [
    thaiDate(d.date), d.count, ...methods.map((m) => sum(d.entries.filter((e) => (e.payment_method ?? 'cash') === m).map((e) => n(e.amount))) || ''),
    d.vat, d.amount,
  ]);
  const col = (i: number) => sum(rows.map((r) => n(r[i])));
  return {
    title: 'สรุปยอดขายรายวัน',
    subtitle: periodLabel(from, to),
    meta: [['ร้าน', store.name]],
    columns: [{ label: 'วันที่' }, { label: 'จำนวนบิล', num: true }, ...methods.map((m) => ({ label: PAYMENT_METHODS[m], num: true })),
      { label: 'VAT', num: true }, { label: 'ยอดขายรวม', num: true }],
    rows,
    footer: ['รวม', col(1), ...methods.map((_, i) => col(i + 2)), col(methods.length + 2), col(methods.length + 3)],
  };
}

export function buildReport(key: ReportKey, store: Store, entries: LedgerEntry[], accounts: Account[], from: string, to: string): Report {
  switch (key) {
    case 'cashbook': return cashBook(store, entries, from, to);
    case 'sales_vat': return salesVatReport(store, entries, from, to);
    case 'purchase_vat': return purchaseVatReport(store, entries, from, to);
    case 'income_statement': return incomeStatement(store, entries, accounts, from, to);
    case 'journal': return generalJournal(store, entries, accounts, from, to);
    case 'daily_sales': return dailySales(store, entries, from, to);
  }
}

const fmtN = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtCell = (c: Cell, num?: boolean) => (num && typeof c === 'number' ? fmtN(c) : String(c));

/** CSV rows (numbers left unformatted so Excel can sum them). */
export function reportToCsv(r: Report): Cell[][] {
  return [
    [r.title], [r.subtitle], ...r.meta.map(([k, v]) => [k, v]), [],
    r.columns.map((c) => c.label), ...r.rows, ...(r.footer ? [r.footer] : []),
    ...(r.notes ?? []).map((x) => [x]),
  ];
}
