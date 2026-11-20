-- =====================================================================
-- Appearance ("ตกแต่งหน้าร้าน")
--  * platform_settings.appearance: default background gradient for the
--    whole system (back office, admin site, customer pages).
--  * Per-store overrides: background gradient, cover image and welcome
--    text on the customer menu. Editable by platform admins (and owners /
--    managers through the normal stores policy).
-- =====================================================================

create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

insert into public.platform_settings (key, value)
values ('appearance', '{"bg_from":"#fff7ed","bg_to":"#fdba74","bg_angle":135}')
on conflict (key) do nothing;

alter table public.stores
  add column bg_from         text check (bg_from is null or bg_from ~ '^#[0-9a-fA-F]{6}$'),
  add column bg_to           text check (bg_to is null or bg_to ~ '^#[0-9a-fA-F]{6}$'),
  add column bg_angle        int  check (bg_angle is null or bg_angle between 0 and 360),
  add column cover_image_url text,
  add column welcome_text    text check (welcome_text is null or length(welcome_text) <= 200);

-- Anyone (also the login page and customers) can read the look of the system.
create or replace function public.public_appearance()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.platform_settings where key = 'appearance'),
                  '{"bg_from":"#fff7ed","bg_to":"#fdba74","bg_angle":135}'::jsonb);
$$;
grant execute on function public.public_appearance() to anon, authenticated;

create or replace function public.admin_set_appearance(p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  if coalesce(p_value ->> 'bg_from', '') !~ '^#[0-9a-fA-F]{6}$'
     or coalesce(p_value ->> 'bg_to', '') !~ '^#[0-9a-fA-F]{6}$'
     or coalesce((p_value ->> 'bg_angle')::int, -1) not between 0 and 360 then
    raise exception 'ค่าสีหรือทิศทางไม่ถูกต้อง';
  end if;
  insert into public.platform_settings (key, value, updated_at, updated_by)
  values ('appearance', jsonb_build_object('bg_from', p_value ->> 'bg_from', 'bg_to', p_value ->> 'bg_to',
                                           'bg_angle', (p_value ->> 'bg_angle')::int), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.admin_set_appearance(jsonb) from public, anon;
grant execute on function public.admin_set_appearance(jsonb) to authenticated;

-- Customer pages get the store's look too.
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
      'line_liff_id', s.line_liff_id, 'line_oa_basic_id', s.line_oa_basic_id, 'timezone', s.timezone,
      'bg_from', s.bg_from, 'bg_to', s.bg_to, 'bg_angle', s.bg_angle,
      'cover_image_url', s.cover_image_url, 'welcome_text', s.welcome_text),
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
