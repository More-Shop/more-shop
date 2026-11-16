-- =====================================================================
-- More Shop — initial schema
-- Multi-store (multi-tenant): every row belongs to one store, and Row
-- Level Security limits each signed-in user to the stores they are a
-- member of. Customers (QR / LINE) never touch tables directly; they go
-- through the SECURITY DEFINER functions prefixed with `public_`.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.member_role    as enum ('owner', 'manager', 'staff');
create type public.order_status   as enum ('open', 'paid', 'cancelled');
create type public.item_status    as enum ('pending', 'sent', 'served', 'void');
create type public.order_source   as enum ('pos', 'qr', 'line');
create type public.booking_status as enum ('pending', 'confirmed', 'seated', 'cancelled', 'no_show');
create type public.entry_type     as enum ('income', 'expense');

-- ---------------------------------------------------------------------
-- Stores & membership
-- ---------------------------------------------------------------------
create table public.stores (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name                 text not null check (length(trim(name)) > 0),
  legal_name           text,                         -- ชื่อผู้ประกอบการ / นิติบุคคล
  tax_id               text check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  branch_code          text not null default '00000' check (branch_code ~ '^[0-9]{5}$'), -- 00000 = สำนักงานใหญ่
  address              text,
  phone                text,
  email                text,
  logo_url             text,
  theme_color          text not null default '#ea580c' check (theme_color ~ '^#[0-9a-fA-F]{6}$'),
  timezone             text not null default 'Asia/Bangkok',
  currency             text not null default 'THB',
  vat_registered       boolean not null default false,
  vat_rate             numeric(5,2) not null default 7 check (vat_rate >= 0 and vat_rate < 100),
  prices_include_vat   boolean not null default true,
  service_charge_rate  numeric(5,2) not null default 0 check (service_charge_rate >= 0 and service_charge_rate < 100),
  promptpay_id         text,                         -- เบอร์มือถือ / เลขบัตรประชาชน / เลขผู้เสียภาษี
  paper_width          int not null default 80 check (paper_width in (58, 80)),
  receipt_header       text,
  receipt_footer       text default 'ขอบคุณที่ใช้บริการ',
  open_time            time,
  close_time           time,
  booking_enabled      boolean not null default true,
  qr_order_enabled     boolean not null default true,
  booking_slot_minutes int not null default 120 check (booking_slot_minutes between 15 and 600),
  line_oa_basic_id     text,                         -- เช่น @moreshop
  line_liff_id         text,
  line_login_channel_id text,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.store_members (
  store_id   uuid not null references public.stores (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index on public.store_members (user_id);

-- Secrets are kept apart so that no customer-facing function can ever
-- return them. Only owners can read or write; edge functions use the
-- service role.
create table public.store_secrets (
  store_id                  uuid primary key references public.stores (id) on delete cascade,
  line_channel_secret       text,
  line_channel_access_token text,
  line_staff_target_id      text,   -- LINE group/user id that gets new-order alerts
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Menu & tables
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  name       text not null,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.categories (store_id, sort);

create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name        text not null,
  description text,
  price       numeric(12,2) not null check (price >= 0),
  image_url   text,
  available   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.menu_items (store_id, category_id, sort);

create table public.dining_tables (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  code       text not null,                 -- หมายเลขโต๊ะที่ลูกค้าเห็น เช่น 1, A3
  zone       text,
  seats      int not null default 4 check (seats > 0),
  active     boolean not null default true,
  sort       int not null default 0,
  qr_token   text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now(),
  unique (store_id, code)
);

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  order_no        text not null,              -- เลขคิวรายวัน เช่น 0007
  table_id        uuid references public.dining_tables (id) on delete set null,
  table_code      text,                       -- snapshot ของหมายเลขโต๊ะ
  source          public.order_source not null default 'pos',
  status          public.order_status not null default 'open',
  customer_name   text,
  line_user_id    text,
  note            text,
  subtotal        numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0,
  service_charge  numeric(12,2) not null default 0,
  vat             numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  payment_method  text,                       -- cash | promptpay | card | transfer | other
  paid_amount     numeric(12,2),
  change_amount   numeric(12,2),
  receipt_no      text,
  buyer_name      text,                       -- สำหรับใบกำกับภาษีเต็มรูป (ถ้าลูกค้าขอ)
  buyer_tax_id    text,
  buyer_branch    text,
  buyer_address   text,
  paid_at         timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.orders (store_id, status, created_at desc);
create index on public.orders (store_id, paid_at);
-- One open bill per table at a time.
create unique index orders_one_open_per_table on public.orders (table_id) where status = 'open' and table_id is not null;

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  store_id     uuid not null references public.stores (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  name         text not null,
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  qty          int not null check (qty > 0 and qty <= 999),
  note         text,
  status       public.item_status not null default 'sent',
  round        int not null default 1,
  created_at   timestamptz not null default now()
);
create index on public.order_items (order_id);
create index on public.order_items (store_id, status);

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------
create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  table_id      uuid references public.dining_tables (id) on delete set null,
  booking_date  date not null,
  booking_time  time not null,
  party_size    int not null default 2 check (party_size between 1 and 100),
  customer_name text not null,
  phone         text,
  note          text,
  line_user_id  text,
  source        public.order_source not null default 'pos',
  status        public.booking_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.bookings (store_id, booking_date, booking_time);

-- ---------------------------------------------------------------------
-- Accounting
-- ---------------------------------------------------------------------
-- Chart of accounts (ผังบัญชี). Seeded per store, stores can add their own.
create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  code       text not null,
  name       text not null,
  type       public.entry_type not null,
  -- Grouping used by the income statement (งบกำไรขาดทุน).
  pl_group   text not null default 'operating'
             check (pl_group in ('revenue', 'other_income', 'cogs', 'operating', 'finance', 'tax')),
  active     boolean not null default true,
  unique (store_id, code)
);

create table public.ledger_entries (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  entry_date          date not null,
  type                public.entry_type not null,
  account_code        text not null,
  description         text not null,
  amount              numeric(12,2) not null check (amount >= 0),     -- ยอดรวม (รวม VAT ถ้ามี)
  vat_amount          numeric(12,2) not null default 0 check (vat_amount >= 0),
  counterparty_name   text,     -- ผู้ขาย / ผู้ซื้อ
  counterparty_tax_id text,
  counterparty_branch text,
  doc_no              text,     -- เลขที่ใบกำกับ / ใบเสร็จ
  payment_method      text,
  attachment_url      text,
  order_id            uuid unique references public.orders (id) on delete set null,
  voided              boolean not null default false,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  check (vat_amount <= amount)
);
create index on public.ledger_entries (store_id, entry_date);

-- Running document numbers (per store / kind / period).
create table public.doc_counters (
  store_id uuid not null references public.stores (id) on delete cascade,
  kind     text not null,
  period   text not null,
  last_no  int  not null default 0,
  primary key (store_id, kind, period)
);

-- =====================================================================
-- Helper functions
-- =====================================================================
create or replace function public.is_member(p_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_members m
                 where m.store_id = p_store and m.user_id = auth.uid());
$$;

create or replace function public.has_role(p_store uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_members m
                 where m.store_id = p_store and m.user_id = auth.uid() and m.role = any (p_roles));
$$;

create or replace function public.is_service_role()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger stores_touch     before update on public.stores        for each row execute function public.touch_updated_at();
create trigger menu_touch       before update on public.menu_items    for each row execute function public.touch_updated_at();
create trigger orders_touch     before update on public.orders        for each row execute function public.touch_updated_at();
create trigger bookings_touch   before update on public.bookings      for each row execute function public.touch_updated_at();
create trigger secrets_touch    before update on public.store_secrets for each row execute function public.touch_updated_at();

-- Next running number, e.g. next_doc_no(store, 'receipt', '202611') -> 15
create or replace function public.next_doc_no(p_store uuid, p_kind text, p_period text)
returns int language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.doc_counters as c (store_id, kind, period, last_no)
  values (p_store, p_kind, p_period, 1)
  on conflict (store_id, kind, period) do update set last_no = c.last_no + 1
  returning last_no into v;
  return v;
end $$;
revoke all on function public.next_doc_no(uuid, text, text) from public, anon, authenticated;

create or replace function public.store_now(p_store uuid)
returns timestamp language sql stable security definer set search_path = '' as $$
  select now() at time zone coalesce((select s.timezone from public.stores s where s.id = p_store), 'Asia/Bangkok');
$$;

-- Recalculate the money columns of an order from its items and the
-- store's VAT / service-charge settings.
create or replace function public.recalc_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders; s public.stores;
  v_sub numeric(12,2); v_base numeric(12,2); v_svc numeric(12,2); v_vat numeric(12,2); v_total numeric(12,2);
begin
  select * into o from public.orders where id = p_order;
  if not found or o.status <> 'open' then return; end if;   -- paid bills never change
  select * into s from public.stores where id = o.store_id;

  select coalesce(sum(unit_price * qty), 0) into v_sub
  from public.order_items where order_id = p_order and status <> 'void';

  v_base := greatest(v_sub - coalesce(o.discount, 0), 0);
  v_svc  := round(v_base * s.service_charge_rate / 100, 2);
  if s.vat_registered and s.vat_rate > 0 then
    if s.prices_include_vat then
      v_total := v_base + v_svc;
      v_vat   := round(v_total * s.vat_rate / (100 + s.vat_rate), 2);
    else
      v_vat   := round((v_base + v_svc) * s.vat_rate / 100, 2);
      v_total := v_base + v_svc + v_vat;
    end if;
  else
    v_vat := 0; v_total := v_base + v_svc;
  end if;

  update public.orders
     set subtotal = v_sub, service_charge = v_svc, vat = v_vat, total = v_total
   where id = p_order;
end $$;
revoke all on function public.recalc_order(uuid) from public, anon, authenticated;

create or replace function public.order_items_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalc_order(coalesce(new.order_id, old.order_id));
  return null;
end $$;
create trigger order_items_recalc after insert or update or delete on public.order_items
  for each row execute function public.order_items_recalc();

create or replace function public.orders_discount_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.discount is distinct from old.discount then perform public.recalc_order(new.id); end if;
  return null;
end $$;
create trigger orders_discount_recalc after update of discount on public.orders
  for each row execute function public.orders_discount_recalc();

-- Fill store_id / order number / table snapshot on new orders.
create or replace function public.orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_now timestamp; v_code text;
begin
  v_now := public.store_now(new.store_id);
  if new.order_no is null or new.order_no = '' then
    new.order_no := lpad(public.next_doc_no(new.store_id, 'order', to_char(v_now, 'YYYYMMDD'))::text, 4, '0');
  end if;
  if new.table_id is not null then
    select t.code into v_code from public.dining_tables t where t.id = new.table_id and t.store_id = new.store_id;
    if v_code is null then raise exception 'table does not belong to this store'; end if;
    new.table_code := v_code;
  end if;
  return new;
end $$;
create trigger orders_before_insert before insert on public.orders
  for each row execute function public.orders_before_insert();

-- Items always carry the store of their order (prevents cross-store mixing).
create or replace function public.order_items_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select o.store_id into new.store_id from public.orders o where o.id = new.order_id;
  if new.store_id is null then raise exception 'order not found'; end if;
  if new.menu_item_id is not null and not exists (
       select 1 from public.menu_items m where m.id = new.menu_item_id and m.store_id = new.store_id) then
    raise exception 'menu item does not belong to this store';
  end if;
  return new;
end $$;
create trigger order_items_before_insert before insert on public.order_items
  for each row execute function public.order_items_before_insert();

-- =====================================================================
-- Store lifecycle
-- =====================================================================
create or replace function public.seed_accounts(p_store uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.accounts (store_id, code, name, type, pl_group) values
    (p_store, '4100', 'รายได้จากการขายอาหารและเครื่องดื่ม', 'income',  'revenue'),
    (p_store, '4200', 'รายได้ค่าบริการ',                     'income',  'revenue'),
    (p_store, '4900', 'รายได้อื่น',                          'income',  'other_income'),
    (p_store, '5100', 'ต้นทุนวัตถุดิบ',                       'expense', 'cogs'),
    (p_store, '5110', 'ค่าบรรจุภัณฑ์',                        'expense', 'cogs'),
    (p_store, '5200', 'เงินเดือนและค่าแรง',                  'expense', 'operating'),
    (p_store, '5300', 'ค่าเช่า',                             'expense', 'operating'),
    (p_store, '5400', 'ค่าน้ำ ค่าไฟ ค่าแก๊ส',                 'expense', 'operating'),
    (p_store, '5410', 'ค่าโทรศัพท์และอินเทอร์เน็ต',          'expense', 'operating'),
    (p_store, '5500', 'ค่าการตลาดและโฆษณา',                  'expense', 'operating'),
    (p_store, '5600', 'ค่าซ่อมแซมและบำรุงรักษา',             'expense', 'operating'),
    (p_store, '5700', 'ค่าธรรมเนียมธนาคาร/บัตร/แพลตฟอร์ม',   'expense', 'operating'),
    (p_store, '5800', 'ค่าใช้จ่ายเบ็ดเตล็ด',                  'expense', 'operating'),
    (p_store, '5900', 'ดอกเบี้ยจ่าย',                         'expense', 'finance'),
    (p_store, '5950', 'ภาษีเงินได้',                          'expense', 'tax')
  on conflict (store_id, code) do nothing;
$$;
revoke all on function public.seed_accounts(uuid) from public, anon, authenticated;

-- Any signed-in user can open a new store and becomes its owner.
create or replace function public.create_store(p_store jsonb)
returns public.stores language plpgsql security definer set search_path = '' as $$
declare s public.stores;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.stores (
    slug, name, legal_name, tax_id, branch_code, address, phone, email, logo_url, theme_color,
    vat_registered, vat_rate, prices_include_vat, service_charge_rate, promptpay_id,
    paper_width, receipt_header, receipt_footer, open_time, close_time, created_by)
  values (
    lower(trim(p_store->>'slug')), trim(p_store->>'name'), nullif(p_store->>'legal_name', ''),
    nullif(p_store->>'tax_id', ''), coalesce(nullif(p_store->>'branch_code', ''), '00000'),
    nullif(p_store->>'address', ''), nullif(p_store->>'phone', ''), nullif(p_store->>'email', ''),
    nullif(p_store->>'logo_url', ''), coalesce(nullif(p_store->>'theme_color', ''), '#ea580c'),
    coalesce((p_store->>'vat_registered')::boolean, false), coalesce((p_store->>'vat_rate')::numeric, 7),
    coalesce((p_store->>'prices_include_vat')::boolean, true),
    coalesce((p_store->>'service_charge_rate')::numeric, 0), nullif(p_store->>'promptpay_id', ''),
    coalesce((p_store->>'paper_width')::int, 80), nullif(p_store->>'receipt_header', ''),
    coalesce(nullif(p_store->>'receipt_footer', ''), 'ขอบคุณที่ใช้บริการ'),
    nullif(p_store->>'open_time', '')::time, nullif(p_store->>'close_time', '')::time, auth.uid())
  returning * into s;

  insert into public.store_members (store_id, user_id, role) values (s.id, auth.uid(), 'owner');
  insert into public.store_secrets (store_id) values (s.id);
  perform public.seed_accounts(s.id);
  return s;
end $$;
revoke all on function public.create_store(jsonb) from public, anon;
grant execute on function public.create_store(jsonb) to authenticated;

-- Owners add staff by e-mail (the person must have signed up first).
create or replace function public.add_store_member(p_store uuid, p_email text, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.has_role(p_store, array['owner']::public.member_role[]) then
    raise exception 'only the store owner can add members';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'ไม่พบผู้ใช้อีเมลนี้ — ให้พนักงานสมัครสมาชิกก่อน' using errcode = 'P0002';
  end if;
  insert into public.store_members (store_id, user_id, role) values (p_store, v_user, p_role)
  on conflict (store_id, user_id) do update set role = excluded.role;
end $$;
revoke all on function public.add_store_member(uuid, text, public.member_role) from public, anon;
grant execute on function public.add_store_member(uuid, text, public.member_role) to authenticated;

create or replace function public.list_store_members(p_store uuid)
returns table (user_id uuid, email text, role public.member_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.store_members m join auth.users u on u.id = m.user_id
  where m.store_id = p_store and public.is_member(p_store)
  order by m.created_at;
$$;
revoke all on function public.list_store_members(uuid) from public, anon;
grant execute on function public.list_store_members(uuid) to authenticated;

-- Never let a store end up without an owner.
create or replace function public.keep_one_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if exists (select 1 from public.stores where id = old.store_id)
       and not exists (select 1 from public.store_members
                       where store_id = old.store_id and role = 'owner' and user_id <> old.user_id) then
      raise exception 'ร้านต้องมีเจ้าของอย่างน้อย 1 คน';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_one_owner before update or delete on public.store_members
  for each row execute function public.keep_one_owner();

-- =====================================================================
-- Staff-side order actions
-- =====================================================================
-- Send selected items to the kitchen (POS) — creates the bill if needed.
create or replace function public.pos_add_items(
  p_store uuid, p_order uuid, p_table uuid, p_items jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_round int; it jsonb; m public.menu_items;
begin
  if not public.is_member(p_store) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  v_order := p_order;
  if v_order is null and p_table is not null then
    select id into v_order from public.orders
     where store_id = p_store and table_id = p_table and status = 'open' for update;
  end if;
  if v_order is null then
    insert into public.orders (store_id, table_id, source, note, created_by)
    values (p_store, p_table, 'pos', p_note, auth.uid()) returning id into v_order;
  elsif not exists (select 1 from public.orders where id = v_order and store_id = p_store and status = 'open') then
    raise exception 'order is not open';
  end if;

  select coalesce(max(round), 0) + 1 into v_round from public.order_items where order_id = v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'menu_item_id') is not null then
      select * into m from public.menu_items where id = (it->>'menu_item_id')::uuid and store_id = p_store;
      if not found then raise exception 'menu item not found'; end if;
      insert into public.order_items (order_id, menu_item_id, name, unit_price, qty, note, status, round)
      values (v_order, m.id, m.name,
              coalesce((it->>'unit_price')::numeric, m.price),   -- staff may override price
              greatest(coalesce((it->>'qty')::int, 1), 1), nullif(it->>'note', ''), 'sent', v_round);
    else -- open item (รายการพิเศษ)
      insert into public.order_items (order_id, name, unit_price, qty, note, status, round)
      values (v_order, coalesce(nullif(it->>'name', ''), 'รายการอื่น'), coalesce((it->>'unit_price')::numeric, 0),
              greatest(coalesce((it->>'qty')::int, 1), 1), nullif(it->>'note', ''), 'sent', v_round);
    end if;
  end loop;
  return v_order;
end $$;
revoke all on function public.pos_add_items(uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.pos_add_items(uuid, uuid, uuid, jsonb, text) to authenticated;

-- Close a bill: assigns the receipt number and books the sale into the ledger.
create or replace function public.checkout_order(
  p_order uuid, p_payment_method text, p_paid_amount numeric, p_discount numeric default 0,
  p_buyer jsonb default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.stores; v_now timestamp; v_no int; v_prefix text; v_acc text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not public.is_member(o.store_id) then raise exception 'forbidden'; end if;
  if o.status <> 'open' then raise exception 'บิลนี้ปิดไปแล้ว'; end if;
  if exists (select 1 from public.order_items where order_id = p_order and status = 'pending') then
    raise exception 'ยังมีรายการที่ลูกค้าสั่งรอยืนยัน';
  end if;
  select * into s from public.stores where id = o.store_id;

  update public.orders set discount = greatest(coalesce(p_discount, 0), 0) where id = p_order;
  perform public.recalc_order(p_order);
  select * into o from public.orders where id = p_order;
  if o.total <= 0 and not exists (select 1 from public.order_items where order_id = p_order and status <> 'void') then
    raise exception 'บิลไม่มีรายการ';
  end if;
  if coalesce(p_paid_amount, o.total) < o.total then raise exception 'ยอดรับเงินไม่พอ'; end if;

  v_now := public.store_now(o.store_id);
  v_prefix := case when s.vat_registered then 'INV' else 'RC' end;
  v_no := public.next_doc_no(o.store_id, 'receipt', to_char(v_now, 'YYYYMM'));

  update public.orders set
    status = 'paid',
    payment_method = coalesce(nullif(p_payment_method, ''), 'cash'),
    paid_amount = coalesce(p_paid_amount, o.total),
    change_amount = coalesce(p_paid_amount, o.total) - o.total,
    receipt_no = v_prefix || to_char(v_now, 'YYMM') || '-' || lpad(v_no::text, 5, '0'),
    paid_at = now(),
    buyer_name = nullif(p_buyer->>'name', ''),
    buyer_tax_id = nullif(p_buyer->>'tax_id', ''),
    buyer_branch = nullif(p_buyer->>'branch', ''),
    buyer_address = nullif(p_buyer->>'address', '')
  where id = p_order returning * into o;

  update public.order_items set status = 'served' where order_id = p_order and status = 'sent';

  select code into v_acc from public.accounts where store_id = o.store_id and code = '4100';
  insert into public.ledger_entries (store_id, entry_date, type, account_code, description, amount, vat_amount,
    counterparty_name, counterparty_tax_id, counterparty_branch, doc_no, payment_method, order_id, created_by)
  values (o.store_id, v_now::date, 'income', coalesce(v_acc, '4100'),
    'ขายสินค้า/อาหาร' || coalesce(' โต๊ะ ' || o.table_code, '') || ' บิล #' || o.order_no,
    o.total, o.vat, coalesce(o.buyer_name, 'ลูกค้าทั่วไป'), o.buyer_tax_id, o.buyer_branch,
    o.receipt_no, o.payment_method, o.id, auth.uid());
  return o;
end $$;
revoke all on function public.checkout_order(uuid, text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.checkout_order(uuid, text, numeric, numeric, jsonb) to authenticated;

-- Void a paid bill (owner / manager). The receipt number is kept and
-- the ledger line is marked void so the running numbers stay intact.
create or replace function public.void_order(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not public.has_role(o.store_id, array['owner', 'manager']::public.member_role[]) then
    raise exception 'forbidden';
  end if;
  update public.orders set status = 'cancelled',
         note = trim(coalesce(note, '') || ' [ยกเลิก: ' || coalesce(p_reason, '-') || ']')
   where id = p_order;
  update public.ledger_entries set voided = true where order_id = p_order;
end $$;
revoke all on function public.void_order(uuid, text) from public, anon;
grant execute on function public.void_order(uuid, text) to authenticated;

-- Move an open bill to another (free) table.
create or replace function public.move_order_table(p_order uuid, p_table uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_code text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or not public.is_member(o.store_id) then raise exception 'forbidden'; end if;
  select code into v_code from public.dining_tables where id = p_table and store_id = o.store_id;
  if v_code is null then raise exception 'table not found'; end if;
  if exists (select 1 from public.orders where table_id = p_table and status = 'open' and id <> p_order) then
    raise exception 'โต๊ะนี้มีบิลเปิดอยู่แล้ว';
  end if;
  update public.orders set table_id = p_table, table_code = v_code where id = p_order;
end $$;
revoke all on function public.move_order_table(uuid, uuid) from public, anon;
grant execute on function public.move_order_table(uuid, uuid) to authenticated;

-- =====================================================================
-- Customer-facing functions (anon) — QR at the table and LINE LIFF
-- =====================================================================
create or replace function public.public_store(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.stores; v jsonb;
begin
  select * into s from public.stores where slug = lower(p_slug);
  if not found then return null; end if;
  select jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'logo_url', s.logo_url, 'theme_color', s.theme_color,
      'address', s.address, 'phone', s.phone, 'open_time', s.open_time, 'close_time', s.close_time,
      'currency', s.currency, 'vat_registered', s.vat_registered, 'vat_rate', s.vat_rate,
      'prices_include_vat', s.prices_include_vat, 'service_charge_rate', s.service_charge_rate,
      'booking_enabled', s.booking_enabled, 'qr_order_enabled', s.qr_order_enabled,
      'booking_slot_minutes', s.booking_slot_minutes,
      'line_liff_id', s.line_liff_id, 'line_oa_basic_id', s.line_oa_basic_id, 'timezone', s.timezone),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name)
                            from public.categories c where c.store_id = s.id and c.active), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', m.id, 'category_id', m.category_id, 'name', m.name, 'description', m.description,
                              'price', m.price, 'image_url', m.image_url, 'available', m.available)
                            order by m.sort, m.name)
                       from public.menu_items m where m.store_id = s.id), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', t.id, 'code', t.code, 'zone', t.zone, 'seats', t.seats,
                              'occupied', exists (select 1 from public.orders o where o.table_id = t.id and o.status = 'open'))
                            order by t.sort, t.code)
                        from public.dining_tables t where t.store_id = s.id and t.active), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Resolve the table behind a QR code (the token itself is never listed publicly).
create or replace function public.public_table(p_slug text, p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'code', t.code, 'zone', t.zone, 'seats', t.seats)
  from public.dining_tables t join public.stores s on s.id = t.store_id
  where s.slug = lower(p_slug) and t.qr_token = p_token and t.active;
$$;

-- Tables already booked around a given date/time (for the booking picker).
create or replace function public.public_table_availability(p_slug text, p_date date, p_time time)
returns table (table_id uuid, booked boolean)
language sql stable security definer set search_path = '' as $$
  select t.id,
         exists (select 1 from public.bookings b
                 where b.table_id = t.id and b.booking_date = p_date
                   and b.status in ('pending', 'confirmed', 'seated')
                   and abs(extract(epoch from (b.booking_time - p_time))) < s.booking_slot_minutes * 60)
  from public.stores s join public.dining_tables t on t.store_id = s.id and t.active
  where s.slug = lower(p_slug);
$$;

-- Customer order. Prices always come from the menu, never from the client.
-- p_table_token: the secret printed in the table QR code.
-- p_table_id   : table picked in LINE (only accepted for source = 'line').
-- p_line_user_id is only trusted when called by the line-liff edge
-- function with the service role (after it verified the LINE ID token).
create or replace function public.public_place_order(
  p_slug text, p_items jsonb, p_table_token text default null, p_table_id uuid default null,
  p_note text default null, p_customer_name text default null,
  p_source public.order_source default 'qr', p_line_user_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.stores; t public.dining_tables; v_order uuid; v_round int; it jsonb; m public.menu_items;
  v_qty int; v_count int := 0; v_line text;
begin
  select * into s from public.stores where slug = lower(p_slug);
  if not found then raise exception 'store not found'; end if;
  if not s.qr_order_enabled then raise exception 'ร้านปิดรับออเดอร์ออนไลน์ชั่วคราว'; end if;
  if p_source = 'pos' then raise exception 'invalid source'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid items';
  end if;

  if p_table_token is not null then
    select * into t from public.dining_tables where qr_token = p_table_token and store_id = s.id and active;
  elsif p_table_id is not null and p_source = 'line' and public.is_service_role() then
    select * into t from public.dining_tables where id = p_table_id and store_id = s.id and active;
  end if;
  if t.id is null then raise exception 'ไม่พบโต๊ะ'; end if;

  v_line := case when public.is_service_role() then p_line_user_id else null end;

  -- Light flood guard: at most 60 items waiting for staff per table.
  if (select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id
       where o.table_id = t.id and o.status = 'open' and oi.status = 'pending') >= 60 then
    raise exception 'มีรายการรอยืนยันจำนวนมาก กรุณาเรียกพนักงาน';
  end if;

  select id into v_order from public.orders where table_id = t.id and status = 'open' for update;
  if v_order is null then
    begin
      insert into public.orders (store_id, table_id, source, customer_name, line_user_id, note)
      values (s.id, t.id, p_source, nullif(trim(p_customer_name), ''), v_line, nullif(trim(p_note), ''))
      returning id into v_order;
    exception when unique_violation then
      select id into v_order from public.orders where table_id = t.id and status = 'open' for update;
    end;
  else
    update public.orders set
      line_user_id = coalesce(line_user_id, v_line),
      customer_name = coalesce(customer_name, nullif(trim(p_customer_name), '')),
      note = case when nullif(trim(p_note), '') is null then note
                  else trim(coalesce(note || ' | ', '') || trim(p_note)) end
    where id = v_order;
  end if;

  select coalesce(max(round), 0) + 1 into v_round from public.order_items where order_id = v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into m from public.menu_items
     where id = (it->>'menu_item_id')::uuid and store_id = s.id and available;
    if not found then raise exception 'เมนูบางรายการหมดหรือไม่มีในร้าน'; end if;
    v_qty := least(greatest(coalesce((it->>'qty')::int, 1), 1), 50);
    insert into public.order_items (order_id, menu_item_id, name, unit_price, qty, note, status, round)
    values (v_order, m.id, m.name, m.price, v_qty, left(nullif(trim(it->>'note'), ''), 200), 'pending', v_round);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('order_id', v_order, 'table_code', t.code, 'items', v_count, 'round', v_round,
                            'order_no', (select order_no from public.orders where id = v_order));
end $$;

-- Customer can follow their bill with the (unguessable) order id.
create or replace function public.public_order(p_order uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'table_code', o.table_code, 'status', o.status,
    'subtotal', o.subtotal, 'discount', o.discount, 'service_charge', o.service_charge, 'vat', o.vat, 'total', o.total,
    'store', jsonb_build_object('name', s.name, 'slug', s.slug, 'logo_url', s.logo_url, 'theme_color', s.theme_color),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unit_price', i.unit_price,
                                                            'status', i.status, 'note', i.note) order by i.created_at)
                       from public.order_items i where i.order_id = o.id and i.status <> 'void'), '[]'::jsonb))
  from public.orders o join public.stores s on s.id = o.store_id
  where o.id = p_order;
$$;

create or replace function public.public_create_booking(
  p_slug text, p_table_id uuid, p_date date, p_time time, p_party int, p_name text,
  p_phone text default null, p_note text default null, p_source public.order_source default 'qr',
  p_line_user_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.stores; t public.dining_tables; b public.bookings; v_now timestamp;
begin
  select * into s from public.stores where slug = lower(p_slug);
  if not found then raise exception 'store not found'; end if;
  if not s.booking_enabled then raise exception 'ร้านปิดรับจองชั่วคราว'; end if;
  if p_source = 'pos' then raise exception 'invalid source'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'กรุณากรอกชื่อผู้จอง'; end if;
  if p_party is null or p_party < 1 or p_party > 100 then raise exception 'จำนวนคนไม่ถูกต้อง'; end if;

  v_now := public.store_now(s.id);
  if (p_date + p_time) < v_now then raise exception 'ไม่สามารถจองเวลาที่ผ่านมาแล้ว'; end if;
  if p_date > v_now::date + 90 then raise exception 'จองล่วงหน้าได้ไม่เกิน 90 วัน'; end if;
  if s.open_time is not null and s.close_time is not null and s.open_time < s.close_time
     and (p_time < s.open_time or p_time >= s.close_time) then
    raise exception 'เวลาที่เลือกอยู่นอกเวลาทำการ';
  end if;

  if p_table_id is not null then
    select * into t from public.dining_tables where id = p_table_id and store_id = s.id and active;
    if not found then raise exception 'ไม่พบโต๊ะ'; end if;
    perform 1 from public.dining_tables where id = t.id for update;   -- serialise bookings per table
    if exists (select 1 from public.bookings x
               where x.table_id = t.id and x.booking_date = p_date and x.status in ('pending', 'confirmed', 'seated')
                 and abs(extract(epoch from (x.booking_time - p_time))) < s.booking_slot_minutes * 60) then
      raise exception 'โต๊ะนี้ถูกจองในช่วงเวลานี้แล้ว';
    end if;
  end if;

  -- Flood guard per phone/LINE user.
  if (select count(*) from public.bookings x where x.store_id = s.id and x.status = 'pending'
        and x.created_at > now() - interval '1 hour'
        and ((p_phone is not null and x.phone = p_phone)
          or (public.is_service_role() and p_line_user_id is not null and x.line_user_id = p_line_user_id))) >= 5 then
    raise exception 'จองบ่อยเกินไป กรุณาติดต่อร้าน';
  end if;

  insert into public.bookings (store_id, table_id, booking_date, booking_time, party_size, customer_name,
                               phone, note, line_user_id, source)
  values (s.id, t.id, p_date, p_time, p_party, left(trim(p_name), 100), left(nullif(trim(p_phone), ''), 30),
          left(nullif(trim(p_note), ''), 500),
          case when public.is_service_role() then p_line_user_id end, p_source)
  returning * into b;
  return jsonb_build_object('booking_id', b.id, 'table_code', t.code, 'date', b.booking_date,
                            'time', b.booking_time, 'party_size', b.party_size, 'status', b.status);
end $$;

grant execute on function public.public_store(text) to anon, authenticated;
grant execute on function public.public_table(text, text) to anon, authenticated;
grant execute on function public.public_table_availability(text, date, time) to anon, authenticated;
grant execute on function public.public_place_order(text, jsonb, text, uuid, text, text, public.order_source, text) to anon, authenticated;
grant execute on function public.public_order(uuid) to anon, authenticated;
grant execute on function public.public_create_booking(text, uuid, date, time, int, text, text, text, public.order_source, text) to anon, authenticated;

-- Internal helpers are not part of the API.
revoke all on function public.store_now(uuid) from public, anon;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.keep_one_owner() from public, anon, authenticated;
revoke all on function public.order_items_recalc() from public, anon, authenticated;
revoke all on function public.orders_discount_recalc() from public, anon, authenticated;
revoke all on function public.orders_before_insert() from public, anon, authenticated;
revoke all on function public.order_items_before_insert() from public, anon, authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.stores          enable row level security;
alter table public.store_members   enable row level security;
alter table public.store_secrets   enable row level security;
alter table public.categories      enable row level security;
alter table public.menu_items      enable row level security;
alter table public.dining_tables   enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.bookings        enable row level security;
alter table public.accounts        enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.doc_counters    enable row level security;

-- stores: members read; owner/manager edit; owner delete. Insert via create_store().
create policy stores_read   on public.stores for select to authenticated using (public.is_member(id));
create policy stores_update on public.stores for update to authenticated
  using (public.has_role(id, array['owner', 'manager']::public.member_role[]))
  with check (public.has_role(id, array['owner', 'manager']::public.member_role[]));
create policy stores_delete on public.stores for delete to authenticated
  using (public.has_role(id, array['owner']::public.member_role[]));

create policy members_read on public.store_members for select to authenticated using (public.is_member(store_id));
create policy members_owner_write on public.store_members for all to authenticated
  using (public.has_role(store_id, array['owner']::public.member_role[]))
  with check (public.has_role(store_id, array['owner']::public.member_role[]));
-- Anyone may leave a store they belong to.
create policy members_leave on public.store_members for delete to authenticated using (user_id = auth.uid());

create policy secrets_owner on public.store_secrets for all to authenticated
  using (public.has_role(store_id, array['owner']::public.member_role[]))
  with check (public.has_role(store_id, array['owner']::public.member_role[]));

-- Menu / tables: everyone in the store reads, owner+manager edit.
do $$
declare tbl text;
begin
  foreach tbl in array array['categories', 'menu_items', 'dining_tables'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_member(store_id))', tbl);
    execute format($p$create policy %1$s_write on public.%1$s for all to authenticated
                      using (public.has_role(store_id, array['owner','manager']::public.member_role[]))
                      with check (public.has_role(store_id, array['owner','manager']::public.member_role[]))$p$, tbl);
  end loop;
end $$;
-- Staff may mark dishes sold out / back in stock.
create policy menu_items_staff_stock on public.menu_items for update to authenticated
  using (public.is_member(store_id)) with check (public.is_member(store_id));

-- Orders & bookings: every member works with them; only owner/manager delete.
do $$
declare tbl text;
begin
  foreach tbl in array array['orders', 'order_items', 'bookings'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_member(store_id))', tbl);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_member(store_id))', tbl);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_member(store_id)) with check (public.is_member(store_id))', tbl);
    execute format($p$create policy %1$s_delete on public.%1$s for delete to authenticated
                      using (public.has_role(store_id, array['owner','manager']::public.member_role[]))$p$, tbl);
  end loop;
end $$;

-- Paid bills are locked: money columns can only change through the functions above.
create or replace function public.orders_lock_paid()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'paid' and current_user = 'authenticated'
     and (new.total, new.subtotal, new.discount, new.vat, new.receipt_no, new.paid_at, new.status)
         is distinct from (old.total, old.subtotal, old.discount, old.vat, old.receipt_no, old.paid_at, old.status) then
    raise exception 'บิลที่ชำระแล้วแก้ไขไม่ได้ — ใช้การยกเลิกบิลแทน';
  end if;
  if old.status = 'open' and new.status = 'paid' and current_user = 'authenticated' then
    raise exception 'ใช้ checkout_order() เพื่อปิดบิล';
  end if;
  return new;
end $$;
create trigger orders_lock_paid before update on public.orders
  for each row execute function public.orders_lock_paid();

-- Direct inserts by staff always start as an open bill.
create or replace function public.orders_guard_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    new.status := 'open'; new.receipt_no := null; new.paid_at := null;
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
create trigger orders_guard_insert before insert on public.orders
  for each row execute function public.orders_guard_insert();

-- Items of a closed bill cannot be touched directly.
create or replace function public.order_items_lock()
returns trigger language plpgsql set search_path = '' as $$
declare v_status public.order_status;
begin
  if current_user = 'authenticated' then
    select status into v_status from public.orders where id = coalesce(new.order_id, old.order_id);
    if v_status is distinct from 'open' then
      raise exception 'บิลนี้ปิดแล้ว แก้ไขรายการไม่ได้';
    end if;
    if tg_op = 'UPDATE' and new.order_id <> old.order_id then raise exception 'cannot move items'; end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger order_items_lock before insert or update or delete on public.order_items
  for each row execute function public.order_items_lock();

-- Staff (not owner/manager) may only flip the sold-out switch on a dish.
create or replace function public.menu_items_staff_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and not public.has_role(old.store_id, array['owner','manager']::public.member_role[])
     and (to_jsonb(new) - 'available' - 'updated_at') is distinct from (to_jsonb(old) - 'available' - 'updated_at') then
    raise exception 'พนักงานเปลี่ยนได้เฉพาะสถานะของหมด/มีของ';
  end if;
  return new;
end $$;
create trigger menu_items_staff_guard before update on public.menu_items
  for each row execute function public.menu_items_staff_guard();

-- Accounting: owner + manager only.
do $$
declare tbl text;
begin
  foreach tbl in array array['accounts', 'ledger_entries'] loop
    execute format($p$create policy %1$s_rw on public.%1$s for all to authenticated
                      using (public.has_role(store_id, array['owner','manager']::public.member_role[]))
                      with check (public.has_role(store_id, array['owner','manager']::public.member_role[]))$p$, tbl);
  end loop;
end $$;
-- doc_counters: no policy => no direct access (functions only).

-- =====================================================================
-- Grants (Supabase gives these by default; repeated for clarity)
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.doc_counters from anon, authenticated;
revoke all on all tables in schema public from anon;

-- =====================================================================
-- Realtime (new orders pop up on every tablet in the store)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_items, public.bookings;
  end if;
end $$;

-- =====================================================================
-- Storage: one public bucket for menu photos and logos.
-- Path convention: <store_id>/<file>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy store_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'store-media'
              and public.is_member(((storage.foldername(name))[1])::uuid));
create policy store_media_update on storage.objects for update to authenticated
  using (bucket_id = 'store-media' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy store_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'store-media'
         and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.member_role[]));
