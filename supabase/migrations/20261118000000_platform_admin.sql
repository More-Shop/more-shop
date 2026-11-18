-- =====================================================================
-- Platform administration
--  * Every new sign-up starts as "pending" and cannot use the system until
--    a platform admin approves it (or a store owner adds them as staff).
--  * Platform admins can manage every store (all store policies and
--    functions treat them as an owner) and every account.
--  * Client-side errors are collected in app_errors for troubleshooting.
--
-- Make yourself the first platform admin (run once in the SQL editor):
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = '<your e-mail>';
-- =====================================================================

create type public.account_status as enum ('pending', 'approved', 'suspended');

create table public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  email             text,
  full_name         text,
  phone             text,
  business_name     text,                      -- shop the person says they run (from sign-up form)
  status            public.account_status not null default 'pending',
  admin_note        text,
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.app_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  store_id    uuid references public.stores (id) on delete set null,
  message     text not null,
  page        text,
  user_agent  text,
  context     jsonb,
  resolved    boolean not null default false,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz
);
create index on public.app_errors (resolved, created_at desc);

alter table public.profiles        enable row level security;
alter table public.platform_admins enable row level security;
alter table public.app_errors      enable row level security;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.status = 'approved');
$$;

-- Store access now also requires an approved account; platform admins
-- pass every store check (they can manage everything).
create or replace function public.is_member(p_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or (public.is_approved()
          and exists (select 1 from public.store_members m
                      where m.store_id = p_store and m.user_id = auth.uid()));
$$;

create or replace function public.has_role(p_store uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
      or (public.is_approved()
          and exists (select 1 from public.store_members m
                      where m.store_id = p_store and m.user_id = auth.uid() and m.role = any (p_roles)));
$$;

-- ---------------------------------------------------------------------
-- Profiles follow auth.users
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, full_name, phone, business_name)
  values (new.id, new.email,
          left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
          left(nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), 40),
          left(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), 120))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where user_id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- People who signed up before this migration keep working.
insert into public.profiles (user_id, email, status, status_changed_at)
select u.id, u.email, 'approved', now() from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- Gates on existing functions
-- ---------------------------------------------------------------------
create or replace function public.create_store(p_store jsonb)
returns public.stores language plpgsql security definer set search_path = '' as $$
declare s public.stores;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_approved() then raise exception 'บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ'; end if;
  insert into public.stores (
    slug, name, legal_name, tax_id, branch_code, address, phone, email, logo_url, theme_color,
    vat_registered, vat_rate, prices_include_vat, service_charge_rate, promptpay_id,
    paper_width, receipt_header, receipt_footer, open_time, close_time, drive_folder_id, drive_upload_url, created_by)
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
    nullif(p_store->>'open_time', '')::time, nullif(p_store->>'close_time', '')::time,
    nullif(p_store->>'drive_folder_id', ''), nullif(p_store->>'drive_upload_url', ''), auth.uid())
  returning * into s;

  insert into public.store_members (store_id, user_id, role) values (s.id, auth.uid(), 'owner');
  insert into public.store_secrets (store_id) values (s.id);
  perform public.seed_accounts(s.id);
  return s;
end $$;

-- An owner adding someone as staff vouches for them: approve a pending account.
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
  if exists (select 1 from public.profiles where user_id = v_user and status = 'suspended') then
    raise exception 'บัญชีนี้ถูกระงับโดยผู้ดูแลระบบ';
  end if;
  insert into public.store_members (store_id, user_id, role) values (p_store, v_user, p_role)
  on conflict (store_id, user_id) do update set role = excluded.role;
  update public.profiles set status = 'approved', status_changed_at = now(), status_changed_by = auth.uid(),
         admin_note = coalesce(admin_note, 'อนุมัติอัตโนมัติ: เจ้าของร้านเพิ่มเป็นสมาชิกร้าน')
   where user_id = v_user and status = 'pending';
end $$;

-- ---------------------------------------------------------------------
-- The signed-in user's own account
-- ---------------------------------------------------------------------
create or replace function public.my_account()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', coalesce((select p.status::text from public.profiles p where p.user_id = auth.uid()), 'pending'),
    'is_admin', public.is_platform_admin(),
    'full_name', (select p.full_name from public.profiles p where p.user_id = auth.uid()),
    'admin_note', (select p.admin_note from public.profiles p where p.user_id = auth.uid()))
  where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------
-- Admin: overview, users, stores, errors
-- ---------------------------------------------------------------------
create or replace function public.admin_guard()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'users_pending',   (select count(*) from public.profiles where status = 'pending'),
    'users_approved',  (select count(*) from public.profiles where status = 'approved'),
    'users_suspended', (select count(*) from public.profiles where status = 'suspended'),
    'users_unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'stores',          (select count(*) from public.stores),
    'orders_today',    (select count(*) from public.orders o join public.stores s on s.id = o.store_id
                         where o.status = 'paid' and (o.paid_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date),
    'sales_today',     (select coalesce(sum(o.total), 0) from public.orders o join public.stores s on s.id = o.store_id
                         where o.status = 'paid' and (o.paid_at at time zone s.timezone)::date = (now() at time zone s.timezone)::date),
    'errors_open',     (select count(*) from public.app_errors where not resolved),
    'errors_24h',      (select count(*) from public.app_errors where created_at > now() - interval '24 hours'));
end $$;

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, full_name text, phone text, business_name text,
               status public.account_status, admin_note text, created_at timestamptz,
               last_sign_in_at timestamptz, email_confirmed boolean, is_admin boolean, stores jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
  select u.id, u.email::text, p.full_name, p.phone, p.business_name,
         coalesce(p.status, 'pending'::public.account_status), p.admin_note, u.created_at,
         u.last_sign_in_at, u.email_confirmed_at is not null,
         exists (select 1 from public.platform_admins a where a.user_id = u.id),
         coalesce((select jsonb_agg(jsonb_build_object('store_id', s.id, 'name', s.name, 'slug', s.slug, 'role', m.role)
                                    order by s.name)
                   from public.store_members m join public.stores s on s.id = m.store_id
                   where m.user_id = u.id), '[]'::jsonb)
  from auth.users u left join public.profiles p on p.user_id = u.id
  order by (coalesce(p.status, 'pending') = 'pending') desc, u.created_at desc;
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status public.account_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  if p_user = auth.uid() and p_status <> 'approved' then raise exception 'ระงับบัญชีของตัวเองไม่ได้'; end if;
  insert into public.profiles (user_id, email, status, admin_note, status_changed_at, status_changed_by)
  select u.id, u.email, p_status, nullif(trim(p_note), ''), now(), auth.uid() from auth.users u where u.id = p_user
  on conflict (user_id) do update set status = excluded.status,
    admin_note = coalesce(nullif(trim(p_note), ''), public.profiles.admin_note),
    status_changed_at = now(), status_changed_by = auth.uid();
  if not found then raise exception 'ไม่พบผู้ใช้'; end if;
end $$;

create or replace function public.admin_set_note(p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  update public.profiles set admin_note = nullif(trim(p_note), '') where user_id = p_user;
end $$;

-- For people whose confirmation e-mail never arrived.
create or replace function public.admin_confirm_email(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user;
end $$;

create or replace function public.admin_set_platform_admin(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  if p_on then
    insert into public.platform_admins (user_id) values (p_user) on conflict do nothing;
    update public.profiles set status = 'approved', status_changed_at = now(), status_changed_by = auth.uid()
     where user_id = p_user;
  else
    if (select count(*) from public.platform_admins) <= 1 then
      raise exception 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน';
    end if;
    delete from public.platform_admins where user_id = p_user;
  end if;
end $$;

create or replace function public.admin_list_stores()
returns table (id uuid, name text, slug text, logo_url text, created_at timestamptz, owners jsonb,
               members int, menu_items int, tables int, orders_7d int, sales_7d numeric,
               last_order_at timestamptz, open_bills int, checks jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
  select s.id, s.name, s.slug, s.logo_url, s.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email))
                   from public.store_members m join auth.users u on u.id = m.user_id
                   where m.store_id = s.id and m.role = 'owner'), '[]'::jsonb),
         (select count(*)::int from public.store_members m where m.store_id = s.id),
         (select count(*)::int from public.menu_items x where x.store_id = s.id),
         (select count(*)::int from public.dining_tables x where x.store_id = s.id and x.active),
         (select count(*)::int from public.orders o where o.store_id = s.id and o.status = 'paid' and o.paid_at > now() - interval '7 days'),
         (select coalesce(sum(o.total), 0) from public.orders o where o.store_id = s.id and o.status = 'paid' and o.paid_at > now() - interval '7 days'),
         (select max(o.created_at) from public.orders o where o.store_id = s.id),
         (select count(*)::int from public.orders o where o.store_id = s.id and o.status = 'open'),
         jsonb_build_object(
           'drive_folder',  s.drive_folder_id is not null,
           'drive_script',  s.drive_upload_url is not null,
           'promptpay',     s.promptpay_id is not null,
           'tax_id',        s.tax_id is not null or not s.vat_registered,
           'menu',          exists (select 1 from public.menu_items x where x.store_id = s.id),
           'tables',        exists (select 1 from public.dining_tables x where x.store_id = s.id and x.active),
           'line_liff',     s.line_liff_id is not null and s.line_login_channel_id is not null,
           'line_secret',   coalesce((select k.line_channel_secret is not null and k.line_channel_access_token is not null
                                      from public.store_secrets k where k.store_id = s.id), false),
           'stale_bills',   (select count(*) from public.orders o where o.store_id = s.id and o.status = 'open'
                              and o.created_at < now() - interval '24 hours'),
           'pending_items', (select count(*) from public.order_items i join public.orders o on o.id = i.order_id
                              where o.store_id = s.id and i.status = 'pending' and i.created_at < now() - interval '30 minutes'))
  from public.stores s
  order by s.created_at desc;
end $$;

create or replace function public.admin_list_errors(p_include_resolved boolean default false)
returns table (id bigint, created_at timestamptz, user_email text, store_name text, store_id uuid,
               message text, page text, user_agent text, context jsonb, resolved boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
  select e.id, e.created_at, u.email::text, s.name, e.store_id, e.message, e.page, e.user_agent, e.context, e.resolved
  from public.app_errors e
  left join auth.users u on u.id = e.user_id
  left join public.stores s on s.id = e.store_id
  where p_include_resolved or not e.resolved
  order by e.created_at desc
  limit 300;
end $$;

create or replace function public.admin_resolve_errors(p_ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  update public.app_errors set resolved = true, resolved_by = auth.uid(), resolved_at = now()
   where id = any (p_ids) and not resolved;
end $$;

-- Any page (also customer pages) can report an error it showed to someone.
create or replace function public.log_client_error(p_message text, p_page text default null,
  p_store uuid default null, p_user_agent text default null, p_context jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if nullif(trim(p_message), '') is null then return; end if;
  -- flood guard
  if (select count(*) from public.app_errors where created_at > now() - interval '10 minutes') >= 300 then return; end if;
  if auth.uid() is not null and (select count(*) from public.app_errors
       where user_id = auth.uid() and created_at > now() - interval '10 minutes') >= 40 then return; end if;
  insert into public.app_errors (user_id, store_id, message, page, user_agent, context)
  values (auth.uid(),
          case when p_store is not null and exists (select 1 from public.stores where id = p_store) then p_store end,
          left(p_message, 1000), left(p_page, 300), left(p_user_agent, 300),
          case when p_context is not null and length(p_context::text) <= 4000 then p_context end);
end $$;

-- ---------------------------------------------------------------------
-- Grants & policies
-- ---------------------------------------------------------------------
create policy profiles_self_or_admin on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy platform_admins_read on public.platform_admins for select to authenticated
  using (public.is_platform_admin());
-- app_errors: read/write only through the functions above.

revoke all on public.profiles, public.platform_admins, public.app_errors from anon;
revoke insert, update, delete on public.profiles, public.platform_admins, public.app_errors from authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
revoke all on function public.admin_guard() from public, anon;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.is_approved() from anon;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_account()', 'public.admin_overview()', 'public.admin_list_users()',
    'public.admin_set_user_status(uuid, public.account_status, text)', 'public.admin_set_note(uuid, text)',
    'public.admin_confirm_email(uuid)', 'public.admin_set_platform_admin(uuid, boolean)',
    'public.admin_list_stores()', 'public.admin_list_errors(boolean)', 'public.admin_resolve_errors(bigint[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.log_client_error(text, text, uuid, text, jsonb) to anon, authenticated;
