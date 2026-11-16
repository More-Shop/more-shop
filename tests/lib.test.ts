import { describe, expect, it } from 'vitest';
import { bahtText, fmt2 } from '../src/lib/format';
import { crc16, promptPayPayload } from '../src/lib/promptpay';
import { isValidThaiTaxId } from '../src/lib/taxid';
import { displayableImageUrl, parseDriveFolderId } from '../src/lib/upload';
import { computeTotals } from '../src/lib/totals';
import { cashBook, generalJournal, incomeStatement, salesVatReport } from '../src/lib/reports';
import type { Account, LedgerEntry, Store } from '../src/lib/types';

describe('bahtText', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [1, 'หนึ่งบาทถ้วน'],
    [11, 'สิบเอ็ดบาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [176, 'หนึ่งร้อยเจ็ดสิบหกบาทถ้วน'],
    [1234.5, 'หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์'],
    [1000000, 'หนึ่งล้านบาทถ้วน'],
    [2500001.25, 'สองล้านห้าแสนเอ็ดบาทยี่สิบห้าสตางค์'],
    [0.75, 'เจ็ดสิบห้าสตางค์'],
  ])('%s → %s', (n, t) => expect(bahtText(n)).toBe(t));
});

describe('PromptPay', () => {
  it('CRC16-CCITT matches the reference value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('builds a payload for a mobile number with amount', () => {
    const p = promptPayPayload('081-234-5678', 176);
    expect(p).toContain('0016A000000677010111');
    expect(p).toContain('01130066812345678');
    expect(p).toContain('5406176.00');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(crc16(p.slice(0, -4))).toBe(p.slice(-4));
  });
  it('uses tag 02 for a 13-digit tax id and static QR without amount', () => {
    const p = promptPayPayload('0105556000001');
    expect(p).toContain('02130105556000001');
    expect(p).toContain('010211');
  });
});

describe('tax id', () => {
  it('validates the checksum digit', () => {
    expect(isValidThaiTaxId('0105556000001')).toBe(false);
    expect(isValidThaiTaxId('1101700230708')).toBe(true);
    expect(isValidThaiTaxId('123')).toBe(false);
  });
});

const store = {
  id: 's', slug: 'more-shop', name: 'More Shop', legal_name: 'บริษัท มอร์ ช็อป จำกัด', tax_id: '1101700230708', branch_code: '00000',
  address: 'กรุงเทพฯ', vat_registered: true, vat_rate: 7, prices_include_vat: true, service_charge_rate: 10,
} as unknown as Store;

describe('computeTotals (mirrors public.recalc_order)', () => {
  it('VAT included + 10% service', () => {
    expect(computeTotals(store, 160)).toEqual({ subtotal: 160, discount: 0, service: 16, vat: 11.51, total: 176 });
  });
  it('VAT excluded', () => {
    expect(computeTotals({ ...store, prices_include_vat: false, service_charge_rate: 0 }, 100, 10)).toEqual(
      { subtotal: 100, discount: 10, service: 0, vat: 6.3, total: 96.3 });
  });
  it('not VAT registered', () => {
    expect(computeTotals({ ...store, vat_registered: false, service_charge_rate: 0 }, 99.5).total).toBe(99.5);
  });
});

const entry = (p: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(), store_id: 's', entry_date: '2026-11-01', type: 'income', account_code: '4100', description: '',
  amount: 0, vat_amount: 0, counterparty_name: null, counterparty_tax_id: null, counterparty_branch: null, doc_no: null,
  payment_method: 'cash', attachment_url: null, order_id: null, voided: false, created_at: '2026-11-01T00:00:00Z', ...p,
});
const entries = [
  entry({ order_id: 'o1', amount: 107, vat_amount: 7, doc_no: 'INV2611-00001' }),
  entry({ order_id: 'o2', amount: 214, vat_amount: 14, doc_no: 'INV2611-00002', payment_method: 'promptpay' }),
  entry({ order_id: 'o3', amount: 535, vat_amount: 35, doc_no: 'INV2611-00003', counterparty_name: 'บจก. ลูกค้า', counterparty_tax_id: '1101700230708', counterparty_branch: '00000' }),
  entry({ order_id: 'o4', amount: 999, vat_amount: 65.36, doc_no: 'INV2611-00004', voided: true }),
  entry({ type: 'expense', account_code: '5100', description: 'ซื้อวัตถุดิบ', amount: 321, vat_amount: 21, doc_no: 'TX-9', counterparty_name: 'แม็คโคร', counterparty_tax_id: '1101700230708' }),
  entry({ type: 'expense', account_code: '5300', description: 'ค่าเช่า', amount: 100, entry_date: '2026-11-02' }),
];
const accounts = [
  { code: '4100', name: 'รายได้จากการขาย', type: 'income', pl_group: 'revenue' },
  { code: '5100', name: 'ต้นทุนวัตถุดิบ', type: 'expense', pl_group: 'cogs' },
  { code: '5300', name: 'ค่าเช่า', type: 'expense', pl_group: 'operating' },
] as Account[];

describe('reports', () => {
  it('cash book collapses daily sales and excludes voided receipts', () => {
    const r = cashBook(store, entries, '2026-11-01', '2026-11-30');
    expect(r.subtitle).toBe('เดือน พฤศจิกายน พ.ศ. 2569');
    expect(r.rows[0][2]).toBe('รายได้จากการขาย 3 บิล');
    expect(r.rows[0][3]).toBe('INV2611-00001 – INV2611-00003');
    expect(r.footer).toEqual(['', '', 'รวม', '', 856, 421]);
  });
  it('sales VAT report: abbreviated invoices per day + full tax invoices individually', () => {
    const r = salesVatReport(store, entries, '2026-11-01', '2026-11-30');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].slice(6)).toEqual([300, 21, 321]);
    expect(r.rows[1][3]).toBe('บจก. ลูกค้า');
    expect(r.footer!.slice(6)).toEqual([800, 56, 856]);
    expect(r.notes?.[0]).toContain('INV2611-00004');
  });
  it('income statement nets VAT out', () => {
    const r = incomeStatement(store, entries, accounts, '2026-11-01', '2026-11-30');
    const find = (label: string) => r.rows.find((x) => String(x[0]).startsWith(label))!;
    expect(find('กำไรขั้นต้น')[2]).toBe(500);
    expect(find('กำไร(ขาดทุน)สุทธิ')[2]).toBe(400);
  });
  it('general journal is balanced', () => {
    const r = generalJournal(store, entries, accounts, '2026-11-01', '2026-11-30');
    expect(r.footer![5]).toBe(r.footer![6]);
    expect(fmt2(r.footer![5] as number)).toBe('1,277.00');
  });
});

describe('parseDriveFolderId', () => {
  it('accepts folder links, ?id= links and bare ids', () => {
    expect(parseDriveFolderId('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp_q-R?usp=sharing')).toBe('1AbCdEfGhIjKlMnOp_q-R');
    expect(parseDriveFolderId('https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(parseDriveFolderId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(parseDriveFolderId('1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(parseDriveFolderId('hello world')).toBe('');
  });
});

describe('displayableImageUrl', () => {
  it('turns Google Drive share links into thumbnail URLs', () => {
    expect(displayableImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'))
      .toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1000');
    expect(displayableImageUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'))
      .toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w1000');
    expect(displayableImageUrl('https://example.com/logo.png')).toBe('https://example.com/logo.png');
  });
});
