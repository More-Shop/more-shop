-- =====================================================================
-- Feature switches (เปิด/ปิดฟังก์ชัน) for the accounting & tax system.
--  * platform_settings.features : default for every store
--  * stores.features            : per-store overrides
-- A key that is missing means "on". Only platform admins can change them;
-- the app hides switched-off functions.
-- =====================================================================

alter table public.stores add column features jsonb not null default '{}'::jsonb
  check (jsonb_typeof(features) = 'object');

insert into public.platform_settings (key, value) values ('features', '{}'::jsonb)
on conflict (key) do nothing;

-- Owners/managers may edit their store row, but not the feature switches.
create or replace function public.stores_guard_features()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.features is distinct from old.features and current_user = 'authenticated'
     and not public.is_platform_admin() then
    raise exception 'เปิด/ปิดฟังก์ชันได้เฉพาะผู้ดูแลระบบ';
  end if;
  return new;
end $$;
create trigger stores_guard_features before update on public.stores
  for each row execute function public.stores_guard_features();
revoke all on function public.stores_guard_features() from public, anon, authenticated;

-- Keep only boolean values.
create or replace function public.clean_features(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e(k, v)
  where jsonb_typeof(v) = 'boolean' and k ~ '^[a-z_]{2,40}$';
$$;

create or replace function public.platform_features()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.platform_settings where key = 'features'), '{}'::jsonb);
$$;
revoke all on function public.platform_features() from public, anon;
grant execute on function public.platform_features() to authenticated;

create or replace function public.admin_set_default_features(p_features jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  insert into public.platform_settings (key, value, updated_at, updated_by)
  values ('features', public.clean_features(p_features), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function public.admin_set_store_features(p_store uuid, p_features jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  update public.stores set features = public.clean_features(p_features) where id = p_store;
  if not found then raise exception 'ไม่พบร้าน'; end if;
end $$;

revoke all on function public.admin_set_default_features(jsonb) from public, anon;
revoke all on function public.admin_set_store_features(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_default_features(jsonb) to authenticated;
grant execute on function public.admin_set_store_features(uuid, jsonb) to authenticated;
