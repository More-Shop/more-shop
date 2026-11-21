// Switchable functions of the accounting & tax system (ตั้งได้ในหน้าผู้ดูแลระบบ → ฟีเจอร์).
// A missing key means "on".

export const FEATURES = [
  { key: 'ledger', group: 'บัญชี', label: 'หน้ารายรับ-รายจ่าย', desc: 'เมนู “รายรับ-รายจ่าย” ในระบบร้าน' },
  { key: 'ledger_manual', group: 'บัญชี', label: 'บันทึกรายรับ/รายจ่ายเอง', desc: 'ปุ่ม + รายรับ / + รายจ่าย และแก้ไข/ลบรายการ (ยอดขายจากบิลยังลงบัญชีอัตโนมัติ)' },
  { key: 'ledger_attachments', group: 'บัญชี', label: 'แนบรูปใบเสร็จรายจ่าย', desc: 'ปุ่มแนบไฟล์/ถ่ายรูปใบเสร็จในรายการบัญชี' },
  { key: 'chart_of_accounts', group: 'บัญชี', label: 'ผังบัญชี', desc: 'ดูและเพิ่มหมวดบัญชีของร้าน' },
  { key: 'reports', group: 'รายงาน', label: 'หน้ารายงานบัญชี/ภาษี', desc: 'เมนู “รายงานบัญชี/ภาษี” ทั้งหน้า' },
  { key: 'report_cashbook', group: 'รายงาน', label: 'รายงานเงินสดรับ-จ่าย', desc: 'สำหรับบุคคลธรรมดา (ภ.ง.ด.90/94)' },
  { key: 'report_sales_vat', group: 'รายงาน', label: 'รายงานภาษีขาย', desc: 'ประกอบ ภ.พ.30 (ร้านจด VAT)' },
  { key: 'report_purchase_vat', group: 'รายงาน', label: 'รายงานภาษีซื้อ', desc: 'ประกอบ ภ.พ.30 (ร้านจด VAT)' },
  { key: 'report_income_statement', group: 'รายงาน', label: 'งบกำไรขาดทุน', desc: 'Income Statement' },
  { key: 'report_journal', group: 'รายงาน', label: 'สมุดรายวันทั่วไป', desc: 'General Journal เดบิต/เครดิต' },
  { key: 'report_daily_sales', group: 'รายงาน', label: 'สรุปยอดขายรายวัน', desc: 'แยกตามช่องทางชำระเงิน' },
  { key: 'export_pdf', group: 'ส่งออกเอกสาร', label: 'พิมพ์ / PDF', desc: 'พิมพ์รายงาน A4 หรือบันทึกเป็น PDF' },
  { key: 'export_csv', group: 'ส่งออกเอกสาร', label: 'ดาวน์โหลด CSV / Excel', desc: 'ส่งไฟล์ให้สำนักงานบัญชี' },
  { key: 'full_tax_invoice', group: 'ภาษีหน้าร้าน', label: 'ใบกำกับภาษีเต็มรูป', desc: 'ตัวเลือก “ลูกค้าขอใบกำกับภาษีเต็มรูป” ตอนชำระเงิน' },
  { key: 'tax_settings', group: 'ภาษีหน้าร้าน', label: 'ร้านแก้ข้อมูลภาษี/VAT เอง', desc: 'ปิด = ช่องข้อมูลภาษี VAT ค่าบริการ ในหน้าตั้งค่าร้านแก้ไม่ได้ (ผู้ดูแลระบบยังแก้ได้)' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];
export type FeatureMap = Partial<Record<FeatureKey, boolean>>;

export const FEATURE_GROUPS = [...new Set(FEATURES.map((f) => f.group))];

/** Store override → system default → on. */
export function isOn(key: FeatureKey, defaults: FeatureMap | null | undefined, store: FeatureMap | null | undefined): boolean {
  const s = store?.[key];
  if (typeof s === 'boolean') return s;
  const d = defaults?.[key];
  return typeof d === 'boolean' ? d : true;
}

export const REPORT_FEATURE: Record<string, FeatureKey> = {
  cashbook: 'report_cashbook', sales_vat: 'report_sales_vat', purchase_vat: 'report_purchase_vat',
  income_statement: 'report_income_statement', journal: 'report_journal', daily_sales: 'report_daily_sales',
};
