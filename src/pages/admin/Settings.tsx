import { useState } from 'react';
import { Copy, ExternalLink, MessageCircle, Printer } from 'lucide-react';
import { supabase, must } from '@/lib/supabase';
import { useCurrentStore } from '@/lib/store';
import { SUPABASE_URL, publicBaseUrl, publicLink } from '@/lib/config';
import { printHtml } from '@/lib/print';
import { receiptHtml, kitchenTicketHtml } from '@/print/templates';
import StoreForm, { type StoreFormValues } from '@/components/StoreForm';
import { Field, PageHeader, Spinner, toast, useLoad } from '@/components/ui';
import type { Order, OrderItem, Store } from '@/lib/types';

function toForm(s: Store): StoreFormValues {
  return {
    name: s.name, slug: s.slug, legal_name: s.legal_name ?? '', tax_id: s.tax_id ?? '', branch_code: s.branch_code,
    address: s.address ?? '', phone: s.phone ?? '', email: s.email ?? '', logo_url: s.logo_url ?? '', theme_color: s.theme_color,
    vat_registered: s.vat_registered, vat_rate: Number(s.vat_rate), prices_include_vat: s.prices_include_vat,
    service_charge_rate: Number(s.service_charge_rate), promptpay_id: s.promptpay_id ?? '', paper_width: s.paper_width,
    receipt_header: s.receipt_header ?? '', receipt_footer: s.receipt_footer ?? '', open_time: s.open_time?.slice(0, 5) ?? '',
    close_time: s.close_time?.slice(0, 5) ?? '', booking_enabled: s.booking_enabled, qr_order_enabled: s.qr_order_enabled,
    booking_slot_minutes: s.booking_slot_minutes, drive_folder_id: s.drive_folder_id ?? '', drive_upload_url: s.drive_upload_url ?? '',
  };
}

export default function Settings() {
  const { store, can, reload } = useCurrentStore();

  async function testPrint() {
    const now = new Date().toISOString();
    const items = [
      { id: '1', name: 'ข้าวผัดกุ้ง', qty: 2, unit_price: 80, status: 'served', note: 'ไม่เผ็ด' },
      { id: '2', name: 'ชาไทยเย็น', qty: 1, unit_price: 45, status: 'served', note: null },
    ] as OrderItem[];
    const order = {
      order_no: '0001', table_code: '5', source: 'pos', status: 'paid', receipt_no: 'TEST-00001', created_at: now, paid_at: now,
      subtotal: 205, discount: 0, service_charge: 0, vat: store.vat_registered ? 13.41 : 0, total: 205, payment_method: 'cash',
      paid_amount: 500, change_amount: 295, note: null, customer_name: null,
    } as unknown as Order;
    await printHtml(await receiptHtml(store, order, items) + '<div class="cut"></div>' + kitchenTicketHtml(store, order, items, 1),
      store.paper_width, 'ทดสอบเครื่องพิมพ์');
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="ตั้งค่าร้าน" subtitle={`ลิงก์เมนูลูกค้า: ${publicLink(`s/${store.slug}`)}`}
        actions={<button className="btn-secondary" onClick={testPrint}><Printer className="h-4 w-4" /> ทดสอบพิมพ์ใบเสร็จ</button>} />
      <StoreForm key={store.id} savedStore={store} initial={toForm(store)} submitLabel="บันทึกการตั้งค่า"
        onSubmit={async (v) => {
          must(await supabase.from('stores').update({
            ...v, tax_id: v.tax_id || null, legal_name: v.legal_name || null, address: v.address || null, phone: v.phone || null,
            email: v.email || null, logo_url: v.logo_url || null, promptpay_id: v.promptpay_id || null,
            receipt_header: v.receipt_header || null, open_time: v.open_time || null, close_time: v.close_time || null,
            drive_folder_id: v.drive_folder_id || null, drive_upload_url: v.drive_upload_url || null,
          }).eq('id', store.id).select('id'));
          await reload();
          toast.ok('บันทึกแล้ว');
        }} />
      <LineSettings />
      {can('owner') && <DangerZone />}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input className="input bg-slate-50 font-mono text-xs" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-secondary px-3" onClick={() => navigator.clipboard.writeText(value).then(() => toast.ok('คัดลอกแล้ว'))} aria-label="คัดลอก"><Copy className="h-4 w-4" /></button>
      </div>
    </Field>
  );
}

function LineSettings() {
  const { store, can, reload } = useCurrentStore();
  const isOwner = can('owner');
  const [f, setF] = useState({
    line_oa_basic_id: store.line_oa_basic_id ?? '', line_liff_id: store.line_liff_id ?? '', line_login_channel_id: store.line_login_channel_id ?? '',
  });
  const [secret, setSecret] = useState({ line_channel_secret: '', line_channel_access_token: '', line_staff_target_id: '' });
  const [secretsSet] = useLoad(async () => {
    if (!isOwner) return null;
    const r = must(await supabase.from('store_secrets').select('line_channel_secret, line_channel_access_token, line_staff_target_id').eq('store_id', store.id).maybeSingle()) as Record<string, string | null> | null;
    return { secret: Boolean(r?.line_channel_secret), token: Boolean(r?.line_channel_access_token), staff: r?.line_staff_target_id ?? '' };
  }, [store.id, isOwner]);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      must(await supabase.from('stores').update({
        line_oa_basic_id: f.line_oa_basic_id.trim() || null, line_liff_id: f.line_liff_id.trim() || null,
        line_login_channel_id: f.line_login_channel_id.trim() || null,
      }).eq('id', store.id).select('id'));
      if (isOwner) {
        const patch: Record<string, string | null> = {};
        if (secret.line_channel_secret) patch.line_channel_secret = secret.line_channel_secret.trim();
        if (secret.line_channel_access_token) patch.line_channel_access_token = secret.line_channel_access_token.trim();
        if (secret.line_staff_target_id || secretsSet?.staff) patch.line_staff_target_id = secret.line_staff_target_id.trim() || secretsSet?.staff || null;
        if (Object.keys(patch).length) must(await supabase.from('store_secrets').upsert({ store_id: store.id, ...patch }).select('store_id'));
        setSecret({ line_channel_secret: '', line_channel_access_token: '', line_staff_target_id: '' });
      }
      await reload();
      toast.ok('บันทึกการตั้งค่า LINE แล้ว');
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  }

  const liffEndpoint = `${publicBaseUrl()}?liff=${store.slug}`;
  const webhook = `${SUPABASE_URL}/functions/v1/line-webhook?store=${store.slug}`;

  return (
    <section className="card mt-5 p-5">
      <h3 className="flex items-center gap-2 font-bold"><MessageCircle className="h-5 w-5 text-green-600" /> LINE Official Account (จองโต๊ะ & สั่งอาหารผ่าน LINE)</h3>
      <p className="mb-4 text-sm text-slate-500">ทำตามขั้นตอนใน <code>docs/LINE_OA.md</code> — ลูกค้ากดเมนูใน LINE OA → เลือกหมายเลขโต๊ะ → จองหรือสั่งอาหาร</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CopyRow label="① LIFF Endpoint URL (ใส่ใน LINE Developers → LIFF)" value={liffEndpoint} />
        <CopyRow label="② Webhook URL (ใส่ใน Messaging API)" value={webhook} />
        <Field label="LINE OA Basic ID" hint="เช่น @moreshop (ใช้ทำ QR เพิ่มเพื่อน)"><input className="input" value={f.line_oa_basic_id} onChange={(e) => setF({ ...f, line_oa_basic_id: e.target.value })} /></Field>
        <Field label="LIFF ID" hint="เช่น 2001234567-AbCdEfGh"><input className="input" value={f.line_liff_id} onChange={(e) => setF({ ...f, line_liff_id: e.target.value })} /></Field>
        <Field label="LINE Login Channel ID" hint="ช่อง LINE Login ที่สร้าง LIFF (ใช้ตรวจสอบตัวตนลูกค้า)"><input className="input" value={f.line_login_channel_id} onChange={(e) => setF({ ...f, line_login_channel_id: e.target.value })} /></Field>
        {isOwner && <>
          <Field label="Messaging API · Channel secret" hint={secretsSet?.secret ? '✓ ตั้งค่าแล้ว — ใส่ใหม่เพื่อเปลี่ยน' : 'ยังไม่ได้ตั้งค่า'}>
            <input className="input" type="password" autoComplete="off" value={secret.line_channel_secret} onChange={(e) => setSecret({ ...secret, line_channel_secret: e.target.value })} />
          </Field>
          <Field label="Messaging API · Channel access token (long-lived)" hint={secretsSet?.token ? '✓ ตั้งค่าแล้ว — ใส่ใหม่เพื่อเปลี่ยน' : 'ยังไม่ได้ตั้งค่า'}>
            <input className="input" type="password" autoComplete="off" value={secret.line_channel_access_token} onChange={(e) => setSecret({ ...secret, line_channel_access_token: e.target.value })} />
          </Field>
          <Field label="ส่งแจ้งเตือนออเดอร์/จองใหม่ไปที่ (Group ID / User ID)" hint={secretsSet?.staff ? `ปัจจุบัน: ${secretsSet.staff}` : 'พิมพ์ “staff-id” ในกลุ่ม LINE ของพนักงานที่มีบอทอยู่ เพื่อรับรหัสกลุ่ม'}>
            <input className="input" value={secret.line_staff_target_id} onChange={(e) => setSecret({ ...secret, line_staff_target_id: e.target.value })} />
          </Field>
        </>}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {store.line_liff_id && <a className="btn-secondary" href={`https://liff.line.me/${store.line_liff_id}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> ทดสอบเปิด LIFF</a>}
        <button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner />} บันทึก LINE</button>
      </div>
    </section>
  );
}

function DangerZone() {
  const { store, selectStore, reload } = useCurrentStore();
  async function remove() {
    const typed = prompt(`ลบร้านและข้อมูลทั้งหมด (เมนู ออเดอร์ บัญชี) อย่างถาวร\nพิมพ์รหัสร้าน “${store.slug}” เพื่อยืนยัน`);
    if (typed !== store.slug) return;
    try {
      must(await supabase.from('stores').delete().eq('id', store.id).select('id'));
      selectStore(null); await reload();
    } catch (e) { toast.err((e as Error).message); }
  }
  return (
    <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
      <h3 className="font-bold text-red-700">ลบร้าน</h3>
      <p className="mb-3 text-sm text-red-600">ข้อมูลทั้งหมดของร้านนี้จะถูกลบถาวร — ควรดาวน์โหลดรายงานบัญชีเก็บไว้ก่อน (กฎหมายกำหนดให้เก็บเอกสารบัญชี 5 ปี)</p>
      <button className="btn-danger" onClick={remove}>ลบร้านนี้</button>
    </section>
  );
}
