export type Role = 'owner' | 'manager' | 'staff';
export type OrderStatus = 'open' | 'paid' | 'cancelled';
export type ItemStatus = 'pending' | 'sent' | 'served' | 'void';
export type Source = 'pos' | 'qr' | 'line';
export type BookingStatus = 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';
export type EntryType = 'income' | 'expense';

export interface Store {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  branch_code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  theme_color: string;
  timezone: string;
  currency: string;
  vat_registered: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  service_charge_rate: number;
  promptpay_id: string | null;
  paper_width: 58 | 80;
  receipt_header: string | null;
  receipt_footer: string | null;
  open_time: string | null;
  close_time: string | null;
  booking_enabled: boolean;
  qr_order_enabled: boolean;
  booking_slot_minutes: number;
  line_oa_basic_id: string | null;
  line_liff_id: string | null;
  line_login_channel_id: string | null;
  drive_folder_id: string | null;
  drive_upload_url: string | null;
}

export interface Category { id: string; store_id: string; name: string; sort: number; active: boolean }

export interface MenuItem {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  available: boolean;
  sort: number;
}

export interface DiningTable {
  id: string;
  store_id: string;
  code: string;
  zone: string | null;
  seats: number;
  active: boolean;
  sort: number;
  qr_token: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  unit_price: number;
  qty: number;
  note: string | null;
  status: ItemStatus;
  round: number;
  created_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  order_no: string;
  table_id: string | null;
  table_code: string | null;
  source: Source;
  status: OrderStatus;
  customer_name: string | null;
  line_user_id: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  service_charge: number;
  vat: number;
  total: number;
  payment_method: string | null;
  paid_amount: number | null;
  change_amount: number | null;
  receipt_no: string | null;
  buyer_name: string | null;
  buyer_tax_id: string | null;
  buyer_branch: string | null;
  buyer_address: string | null;
  paid_at: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

export interface Booking {
  id: string;
  store_id: string;
  table_id: string | null;
  booking_date: string;
  booking_time: string;
  party_size: number;
  customer_name: string;
  phone: string | null;
  note: string | null;
  line_user_id: string | null;
  source: Source;
  status: BookingStatus;
  created_at: string;
}

export interface Account {
  id: string;
  store_id: string;
  code: string;
  name: string;
  type: EntryType;
  pl_group: 'revenue' | 'other_income' | 'cogs' | 'operating' | 'finance' | 'tax';
  active: boolean;
}

export interface LedgerEntry {
  id: string;
  store_id: string;
  entry_date: string;
  type: EntryType;
  account_code: string;
  description: string;
  amount: number;
  vat_amount: number;
  counterparty_name: string | null;
  counterparty_tax_id: string | null;
  counterparty_branch: string | null;
  doc_no: string | null;
  payment_method: string | null;
  attachment_url: string | null;
  order_id: string | null;
  voided: boolean;
  created_at: string;
}

/** Shape returned by the public_store() function (customer pages). */
export interface PublicStore {
  store: Pick<Store, 'id' | 'slug' | 'name' | 'logo_url' | 'theme_color' | 'address' | 'phone' | 'open_time' |
    'close_time' | 'currency' | 'vat_registered' | 'vat_rate' | 'prices_include_vat' | 'service_charge_rate' |
    'booking_enabled' | 'qr_order_enabled' | 'booking_slot_minutes' | 'line_liff_id' | 'line_oa_basic_id' | 'timezone'>;
  categories: { id: string; name: string }[];
  items: Pick<MenuItem, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'available'>[];
  tables: { id: string; code: string; zone: string | null; seats: number; occupied: boolean }[];
}

export const PAYMENT_METHODS: Record<string, string> = {
  cash: 'เงินสด',
  promptpay: 'พร้อมเพย์',
  transfer: 'โอนเงิน',
  card: 'บัตรเครดิต',
  other: 'อื่น ๆ',
};
