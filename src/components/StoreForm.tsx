import { useState, type FormEvent, type ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';
import { Field, ErrorBox, Spinner, Toggle } from './ui';
import { isValidThaiTaxId } from '@/lib/taxid';
import { uploadStoreFile } from '@/lib/upload';

export interface StoreFormValues {
  name: string;
  slug: string;
  legal_name: string;
  tax_id: string;
  branch_code: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  theme_color: string;
  vat_registered: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  service_charge_rate: number;
  promptpay_id: string;
  paper_width: 58 | 80;
  receipt_header: string;
  receipt_footer: string;
  open_time: string;
  close_time: string;
  booking_enabled: boolean;
  qr_order_enabled: boolean;
  booking_slot_minutes: number;
}

export const emptyStoreForm: StoreFormValues = {
  name: '', slug: '', legal_name: '', tax_id: '', branch_code: '00000', address: '', phone: '', email: '',
  logo_url: '', theme_color: '#ea580c', vat_registered: false, vat_rate: 7, prices_include_vat: true,
  service_charge_rate: 0, promptpay_id: '', paper_width: 80, receipt_header: '', receipt_footer: 'ขอบคุณที่ใช้บริการ',
  open_time: '10:00', close_time: '22:00', booking_enabled: true, qr_order_enabled: true, booking_slot_minutes: 120,
};

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="font-bold text-slate-900">{title}</h3>
      {desc && <p className="mb-4 text-sm text-slate-500">{desc}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function StoreForm({ initial, onSubmit, submitLabel, storeId }: {
  initial: StoreFormValues; onSubmit: (v: StoreFormValues) => Promise<void>; submitLabel: string; storeId?: string;
}) {
  const [v, setV] = useState<StoreFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const set = <K extends keyof StoreFormValues>(k: K, val: StoreFormValues[K]) => setV((x) => ({ ...x, [k]: val }));

  const taxIdBad = v.tax_id !== '' && !isValidThaiTaxId(v.tax_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(v.slug)) { setError('รหัสร้าน (URL) ใช้ a-z, 0-9 และ - อย่างน้อย 2 ตัวอักษร'); return; }
    if (v.tax_id && !/^\d{13}$/.test(v.tax_id)) { setError('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก'); return; }
    if (v.vat_registered && !v.tax_id) { setError('ร้านที่จด VAT ต้องกรอกเลขประจำตัวผู้เสียภาษี'); return; }
    setBusy(true);
    try { await onSubmit(v); }
    catch (err) {
      const m = (err as Error).message;
      setError(m.includes('stores_slug_key') || m.includes('duplicate') ? 'รหัสร้าน (URL) นี้ถูกใช้แล้ว กรุณาเปลี่ยน' : m);
    } finally { setBusy(false); }
  }

  async function onLogo(file: File | undefined) {
    if (!file || !storeId) return;
    setUploading(true);
    try { set('logo_url', await uploadStoreFile(storeId, file, 'logo')); }
    catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorBox error={error} />
      <Section title="ข้อมูลร้าน" desc="ชื่อและโลโก้จะแสดงบนหน้าสั่งอาหาร ใบเสร็จ และ LINE">
        <Field label="ชื่อร้าน *">
          <input className="input" required value={v.name} onChange={(e) => {
            set('name', e.target.value);
            if (!slugTouched) set('slug', slugify(e.target.value));
          }} placeholder="More Shop" />
        </Field>
        <Field label="รหัสร้านสำหรับลิงก์ (URL) *" hint="ภาษาอังกฤษตัวเล็ก/ตัวเลข/ขีด เช่น more-shop">
          <input className="input" required value={v.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} placeholder="more-shop" />
        </Field>
        <Field label="เบอร์โทรร้าน"><input className="input" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="อีเมลร้าน" hint="อีเมลติดต่อของร้านนี้ (แยกจากร้านอื่น)"><input className="input" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="ที่อยู่" className="sm:col-span-2"><textarea className="input" rows={2} value={v.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="โลโก้ร้าน" hint={storeId ? 'อัปโหลดรูป หรือวางลิงก์รูป' : 'วางลิงก์รูปได้เลย หรืออัปโหลดภายหลังในหน้าตั้งค่า'}>
          <div className="flex items-center gap-2">
            {v.logo_url && <img src={v.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />}
            <input className="input" value={v.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://…" />
            {storeId && (
              <label className="btn-secondary shrink-0 cursor-pointer px-3">
                {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              </label>
            )}
          </div>
        </Field>
        <Field label="สีประจำร้าน">
          <div className="flex items-center gap-2">
            <input type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200" value={v.theme_color} onChange={(e) => set('theme_color', e.target.value)} />
            <input className="input" value={v.theme_color} onChange={(e) => set('theme_color', e.target.value)} pattern="#[0-9a-fA-F]{6}" />
          </div>
        </Field>
      </Section>

      <Section title="ข้อมูลภาษี" desc="ใช้พิมพ์บนใบเสร็จ/ใบกำกับภาษี และหัวรายงานยื่นสรรพากร">
        <Field label="ชื่อผู้ประกอบการ / นิติบุคคล" hint="เช่น บริษัท มอร์ ช็อป จำกัด หรือ ชื่อ-นามสกุลเจ้าของ">
          <input className="input" value={v.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
        </Field>
        <Field label="เลขประจำตัวผู้เสียภาษี (13 หลัก)" hint={taxIdBad ? <span className="text-amber-600">เลขนี้ไม่ผ่านการตรวจสอบหลักสุดท้าย — โปรดตรวจอีกครั้ง</span> : undefined}>
          <input className="input" inputMode="numeric" maxLength={13} value={v.tax_id} onChange={(e) => set('tax_id', e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="สาขา" hint="00000 = สำนักงานใหญ่">
          <input className="input" inputMode="numeric" maxLength={5} value={v.branch_code} onChange={(e) => set('branch_code', e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </Field>
        <div className="space-y-3 pt-6">
          <Toggle checked={v.vat_registered} onChange={(x) => set('vat_registered', x)} label="จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)" />
          {v.vat_registered && <Toggle checked={v.prices_include_vat} onChange={(x) => set('prices_include_vat', x)} label="ราคาเมนูรวม VAT แล้ว" />}
        </div>
        {v.vat_registered && (
          <Field label="อัตรา VAT (%)"><input className="input" type="number" step="0.01" min={0} max={30} value={v.vat_rate} onChange={(e) => set('vat_rate', Number(e.target.value))} /></Field>
        )}
        <Field label="ค่าบริการ / Service charge (%)" hint="ใส่ 0 ถ้าไม่เก็บ">
          <input className="input" type="number" step="0.01" min={0} max={30} value={v.service_charge_rate} onChange={(e) => set('service_charge_rate', Number(e.target.value))} />
        </Field>
      </Section>

      <Section title="การรับเงินและใบเสร็จ">
        <Field label="พร้อมเพย์ (เบอร์มือถือ / เลขผู้เสียภาษี)" hint="ใช้สร้าง QR จ่ายเงินพร้อมยอด บนใบแจ้งค่าอาหาร">
          <input className="input" inputMode="numeric" value={v.promptpay_id} onChange={(e) => set('promptpay_id', e.target.value.replace(/[^\d]/g, ''))} />
        </Field>
        <Field label="ขนาดกระดาษเครื่องพิมพ์ใบเสร็จ">
          <select className="input" value={v.paper_width} onChange={(e) => set('paper_width', Number(e.target.value) as 58 | 80)}>
            <option value={80}>80 มม. (มาตรฐานร้านอาหาร)</option>
            <option value={58}>58 มม. (เครื่องพกพา)</option>
          </select>
        </Field>
        <Field label="ข้อความหัวใบเสร็จ"><input className="input" value={v.receipt_header} onChange={(e) => set('receipt_header', e.target.value)} placeholder="เช่น เปิดทุกวัน 10:00–22:00" /></Field>
        <Field label="ข้อความท้ายใบเสร็จ"><input className="input" value={v.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} /></Field>
      </Section>

      <Section title="เวลาทำการ การจอง และการสั่งออนไลน์">
        <Field label="เวลาเปิด"><input className="input" type="time" value={v.open_time} onChange={(e) => set('open_time', e.target.value)} /></Field>
        <Field label="เวลาปิด"><input className="input" type="time" value={v.close_time} onChange={(e) => set('close_time', e.target.value)} /></Field>
        <Field label="ระยะเวลาต่อการจอง 1 รอบ (นาที)" hint="ใช้กันการจองโต๊ะเดียวกันซ้อนเวลา">
          <input className="input" type="number" min={15} max={600} step={15} value={v.booking_slot_minutes} onChange={(e) => set('booking_slot_minutes', Number(e.target.value))} />
        </Field>
        <div className="space-y-3 pt-6">
          <Toggle checked={v.booking_enabled} onChange={(x) => set('booking_enabled', x)} label="เปิดรับจองโต๊ะออนไลน์ (LINE / ลิงก์)" />
          <Toggle checked={v.qr_order_enabled} onChange={(x) => set('qr_order_enabled', x)} label="เปิดให้ลูกค้าสั่งอาหารเอง (QR / LINE)" />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end bg-gradient-to-t from-slate-50 via-slate-50 px-1 pb-2 pt-4">
        <button className="btn-primary px-8 py-3" disabled={busy}>{busy && <Spinner />}{submitLabel}</button>
      </div>
    </form>
  );
}
