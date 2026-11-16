import QRCode from 'qrcode';
import { esc } from '@/lib/print';
import { bahtText, branchLabel, fmt2, thaiDateTime } from '@/lib/format';
import { formatTaxId } from '@/lib/taxid';
import { promptPayPayload } from '@/lib/promptpay';
import { PAYMENT_METHODS, type Order, type OrderItem, type Store } from '@/lib/types';

const qr = (text: string, width = 220) => QRCode.toDataURL(text, { margin: 1, width, errorCorrectionLevel: 'M' });

const line = (left: string, right: string, cls = '') =>
  `<div class="row ${cls}"><span>${left}</span><span>${right}</span></div>`;

function storeHeader(store: Store, withTax: boolean) {
  return `
    ${store.logo_url ? `<img class="logo" src="${esc(store.logo_url)}" alt="">` : ''}
    <div class="center strong big">${esc(store.name)}</div>
    ${store.legal_name && store.legal_name !== store.name ? `<div class="center">${esc(store.legal_name)}</div>` : ''}
    ${store.address ? `<div class="center small">${esc(store.address)}</div>` : ''}
    ${store.phone ? `<div class="center small">โทร ${esc(store.phone)}</div>` : ''}
    ${withTax && store.tax_id ? `<div class="center small">เลขประจำตัวผู้เสียภาษี ${esc(formatTaxId(store.tax_id))}<br>${esc(branchLabel(store.branch_code))}</div>` : ''}
    ${store.receipt_header ? `<div class="center small">${esc(store.receipt_header)}</div>` : ''}`;
}

function itemsBlock(items: OrderItem[]) {
  return items.filter((i) => i.status !== 'void').map((i) => `
    <div class="row"><span>${i.qty} × ${esc(i.name)}</span><span>${fmt2(i.unit_price * i.qty)}</span></div>
    ${i.note ? `<div class="small muted indent">- ${esc(i.note)}</div>` : ''}`).join('');
}

function totalsBlock(store: Store, o: Order) {
  const vatLabel = store.prices_include_vat ? `VAT ${Number(store.vat_rate)}% (รวมในราคา)` : `VAT ${Number(store.vat_rate)}%`;
  return `
    ${line('รวมค่าสินค้า', fmt2(o.subtotal))}
    ${Number(o.discount) > 0 ? line('ส่วนลด', '-' + fmt2(o.discount)) : ''}
    ${Number(o.service_charge) > 0 ? line(`ค่าบริการ ${Number(store.service_charge_rate)}%`, fmt2(o.service_charge)) : ''}
    ${store.vat_registered ? line(vatLabel, fmt2(o.vat)) : ''}
    ${store.vat_registered ? line('มูลค่าก่อนภาษี', fmt2(Number(o.total) - Number(o.vat)), 'small muted') : ''}
    <div class="hr"></div>
    ${line('ยอดสุทธิ', fmt2(o.total), 'strong big')}`;
}

/** Receipt / abbreviated tax invoice (or full tax invoice when buyer details exist). */
export async function receiptHtml(store: Store, o: Order, items: OrderItem[], cashier?: string) {
  const full = store.vat_registered && Boolean(o.buyer_name && o.buyer_tax_id);
  const title = !store.vat_registered ? 'ใบเสร็จรับเงิน'
    : full ? 'ใบกำกับภาษี / ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ';
  return `
  <div class="slip">
    ${storeHeader(store, true)}
    <div class="hr"></div>
    <div class="center strong">${title}</div>
    ${store.vat_registered ? '<div class="center small">(VAT Included)</div>' : ''}
    ${line('เลขที่', esc(o.receipt_no ?? '-'))}
    ${line('วันที่', esc(thaiDateTime(o.paid_at ?? o.created_at, store.timezone)))}
    ${line(o.table_code ? `โต๊ะ ${esc(o.table_code)}` : 'กลับบ้าน', `บิล #${esc(o.order_no)}`)}
    ${cashier ? line('พนักงาน', esc(cashier), 'small') : ''}
    ${full ? `<div class="hr"></div>
      <div class="small">ผู้ซื้อ: ${esc(o.buyer_name)}</div>
      <div class="small">เลขผู้เสียภาษี: ${esc(formatTaxId(o.buyer_tax_id))} ${esc(o.buyer_branch ? branchLabel(o.buyer_branch) : '')}</div>
      ${o.buyer_address ? `<div class="small">${esc(o.buyer_address)}</div>` : ''}` : ''}
    <div class="hr"></div>
    ${itemsBlock(items)}
    <div class="hr"></div>
    ${totalsBlock(store, o)}
    <div class="small center muted">(${bahtText(Number(o.total))})</div>
    <div class="hr"></div>
    ${line(PAYMENT_METHODS[o.payment_method ?? 'cash'] ?? esc(o.payment_method), fmt2(o.paid_amount ?? o.total))}
    ${Number(o.change_amount) > 0 ? line('เงินทอน', fmt2(o.change_amount)) : ''}
    <div class="hr"></div>
    ${store.receipt_footer ? `<div class="center">${esc(store.receipt_footer)}</div>` : ''}
  </div>`;
}

/** Check-bill slip printed before payment, with a PromptPay QR for the exact amount. */
export async function preBillHtml(store: Store, o: Order, items: OrderItem[]) {
  const pp = store.promptpay_id ? await qr(promptPayPayload(store.promptpay_id, Number(o.total)), 260) : null;
  return `
  <div class="slip">
    ${storeHeader(store, false)}
    <div class="hr"></div>
    <div class="center strong">ใบแจ้งค่าอาหาร (ยังไม่ใช่ใบเสร็จ)</div>
    ${line(o.table_code ? `โต๊ะ ${esc(o.table_code)}` : 'กลับบ้าน', `บิล #${esc(o.order_no)}`)}
    ${line('เวลา', esc(thaiDateTime(new Date().toISOString(), store.timezone)))}
    <div class="hr"></div>
    ${itemsBlock(items)}
    <div class="hr"></div>
    ${totalsBlock(store, o)}
    ${pp ? `<div class="center" style="margin-top:3mm">
        <div class="strong">สแกนจ่ายด้วยพร้อมเพย์</div>
        <img class="qr" src="${pp}" alt="PromptPay">
        <div class="small">${fmt2(o.total)} บาท</div></div>` : ''}
  </div>`;
}

/** Kitchen / bar ticket for one round of items. */
export function kitchenTicketHtml(store: Store, o: Pick<Order, 'order_no' | 'table_code' | 'source' | 'customer_name' | 'note'>,
  items: Pick<OrderItem, 'name' | 'qty' | 'note'>[], round?: number) {
  const src = o.source === 'qr' ? ' (QR)' : o.source === 'line' ? ' (LINE)' : '';
  return `
  <div class="slip kitchen">
    <div class="center strong huge">${o.table_code ? `โต๊ะ ${esc(o.table_code)}` : 'กลับบ้าน'}</div>
    ${line(`บิล #${esc(o.order_no)}${round ? ` · รอบ ${round}` : ''}`, esc(thaiDateTime(new Date().toISOString(), store.timezone)))}
    ${o.customer_name ? `<div>ลูกค้า: ${esc(o.customer_name)}${src}</div>` : src ? `<div>ช่องทาง${src}</div>` : ''}
    <div class="hr"></div>
    ${items.map((i) => `
      <div class="k-item"><span class="k-qty">${i.qty}</span><span>${esc(i.name)}</span></div>
      ${i.note ? `<div class="k-note">** ${esc(i.note)}</div>` : ''}`).join('')}
    ${o.note ? `<div class="hr"></div><div class="k-note">หมายเหตุ: ${esc(o.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="center small">${esc(store.name)}</div>
  </div>`;
}

/** Table card with the QR code customers scan to order. */
export async function tableQrHtml(store: Store, tables: { code: string; url: string; zone?: string | null }[]) {
  const parts = await Promise.all(tables.map(async (t) => `
    <div class="slip qr-card">
      ${store.logo_url ? `<img class="logo" src="${esc(store.logo_url)}" alt="">` : ''}
      <div class="center strong big">${esc(store.name)}</div>
      <div class="center huge strong">โต๊ะ ${esc(t.code)}</div>
      ${t.zone ? `<div class="center">${esc(t.zone)}</div>` : ''}
      <div class="center"><img class="qr" src="${await qr(t.url, 320)}" alt="QR"></div>
      <div class="center strong">สแกนเพื่อดูเมนูและสั่งอาหาร</div>
      <div class="center small">Scan to order</div>
    </div>`));
  return parts.join('<div class="cut"></div>');
}

/** Generic QR slip (LINE OA add-friend / booking link). */
export async function linkQrHtml(store: Store, heading: string, url: string, caption?: string) {
  return `
    <div class="slip qr-card">
      <div class="center strong big">${esc(store.name)}</div>
      <div class="center strong">${esc(heading)}</div>
      <div class="center"><img class="qr" src="${await qr(url, 320)}" alt="QR"></div>
      ${caption ? `<div class="center small">${esc(caption)}</div>` : ''}
    </div>`;
}
