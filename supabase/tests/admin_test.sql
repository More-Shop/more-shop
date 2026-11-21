-- Platform admin / account approval tests. Run after rls_test.sql.
\set QUIET on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'new@more.shop', '{"full_name":"คุณใหม่","business_name":"ร้านใหม่"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@more.shop', '{}');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');

-- 1. A new sign-up is pending: cannot create a store, cannot call admin functions.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  if public.my_account() ->> 'status' <> 'pending' then raise exception 'new user not pending'; end if;
  begin perform public.create_store('{"slug":"pending-shop","name":"P"}'); raise exception 'pending created store';
  exception when raise_exception then if sqlerrm not like '%อนุมัติ%' then raise; end if; end;
  begin perform * from public.admin_list_users(); raise exception 'non-admin listed users';
  exception when raise_exception then if sqlerrm not like '%ผู้ดูแลระบบ%' then raise; end if; end;
  if (select count(*) from public.profiles) <> 1 then raise exception 'user sees other profiles'; end if;
end $$;
reset role;

-- 2. Admin sees everything, approves the new user, manages another store.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ declare u record; begin
  if (public.my_account() ->> 'is_admin')::boolean is not true then raise exception 'admin flag'; end if;
  if (select count(*) from public.stores) <> 2 then raise exception 'admin should see all stores'; end if;
  select * into u from public.admin_list_users() where email = 'new@more.shop';
  if u.status <> 'pending' or u.business_name <> 'ร้านใหม่' then raise exception 'bad user row %', row_to_json(u); end if;
  perform public.admin_set_user_status(u.user_id, 'approved', 'ตรวจแล้ว');
  update public.stores set receipt_footer = 'แก้โดยแอดมิน' where slug = 'cafe-b';
  if (select receipt_footer from public.stores where slug = 'cafe-b') <> 'แก้โดยแอดมิน' then raise exception 'admin edit'; end if;
  if (select count(*) from public.admin_list_stores()) <> 2 then raise exception 'store list'; end if;
  if (public.admin_overview() ->> 'stores')::int <> 2 then raise exception 'overview'; end if;
  begin perform public.admin_set_platform_admin('00000000-0000-0000-0000-0000000000ad', false); raise exception 'removed last admin';
  exception when raise_exception then if sqlerrm not like '%อย่างน้อย%' then raise; end if; end;
end $$;
reset role;

-- 3. Approved user can now create a store.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select public.create_store('{"slug":"approved-shop","name":"A"}') is not null as ok \gset
reset role;

-- 4. Suspended owner loses access to their store.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select public.admin_set_user_status('00000000-0000-0000-0000-00000000000b', 'suspended', 'ทดสอบ');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from public.stores) <> 0 then raise exception 'suspended user still sees store'; end if;
end $$;
reset role;

-- 5. Owner adding a pending person as staff approves them.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'cashier2@more.shop');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.add_store_member((select id from public.stores where slug = 'more-shop'), 'cashier2@more.shop', 'staff');
reset role;
do $$ begin
  if (select status from public.profiles where email = 'cashier2@more.shop') <> 'approved' then raise exception 'staff not auto-approved'; end if;
end $$;

-- 6. Errors can be reported anonymously and are listed for admins only.
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select public.log_client_error('ทดสอบ error', '#/s/more-shop', null, 'test-agent', '{"k":1}');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ declare n int; begin
  select count(*) into n from public.admin_list_errors(false) where message = 'ทดสอบ error';
  if n <> 1 then raise exception 'error not logged'; end if;
  perform public.admin_resolve_errors(array(select id from public.admin_list_errors(false)));
  if (select count(*) from public.admin_list_errors(false)) <> 0 then raise exception 'resolve'; end if;
end $$;
reset role;
\echo ADMIN_TESTS_PASSED

-- 7. Appearance: everyone reads it, only admins change it; stores carry their own look.
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  if public.public_appearance() ->> 'bg_from' <> '#fff7ed' then raise exception 'default appearance'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform public.admin_set_appearance('{"bg_from":"#000000","bg_to":"#ffffff","bg_angle":90}'); raise exception 'owner changed platform look';
  exception when raise_exception then if sqlerrm not like '%ผู้ดูแลระบบ%' then raise; end if; end;
  update public.stores set bg_from = '#ecfeff', bg_to = '#67e8f9', bg_angle = 45, welcome_text = 'ยินดีต้อนรับ' where slug = 'more-shop';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ begin
  begin perform public.admin_set_appearance('{"bg_from":"red","bg_to":"#ffffff","bg_angle":90}'); raise exception 'bad colour accepted';
  exception when raise_exception then if sqlerrm not like '%ไม่ถูกต้อง%' then raise; end if; end;
  perform public.admin_set_appearance('{"bg_from":"#fdf2f8","bg_to":"#f9a8d4","bg_angle":180}');
  update public.stores set cover_image_url = 'https://example.com/cover.jpg' where slug = 'cafe-b';   -- admin edits any store
end $$;
reset role;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  if (public.public_appearance() ->> 'bg_angle')::int <> 180 then raise exception 'appearance not saved'; end if;
  if public.public_store('more-shop') -> 'store' ->> 'bg_to' <> '#67e8f9' then raise exception 'store bg not public'; end if;
  if public.public_store('cafe-b') -> 'store' ->> 'cover_image_url' is null then raise exception 'cover'; end if;
end $$;
reset role;
\echo APPEARANCE_TESTS_PASSED

-- 8. VAT นอก (prices exclude VAT): VAT is added on top of the menu price.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$
declare s public.stores; m uuid; o uuid; r public.orders;
begin
  update public.stores set vat_registered = true, vat_rate = 7, prices_include_vat = false, service_charge_rate = 0,
         tax_id = '1101700230708' where slug = 'cafe-b' returning * into s;
  insert into public.menu_items (store_id, name, price) values (s.id, 'กาแฟ', 100) returning id into m;
  o := public.pos_add_items(s.id, null, null, jsonb_build_array(jsonb_build_object('menu_item_id', m, 'qty', 1)));
  r := public.checkout_order(o, 'cash', 107);
  if r.subtotal <> 100 or r.vat <> 7 or r.total <> 107 or r.receipt_no !~ '^INV' then
    raise exception 'VAT นอก totals wrong: %', row_to_json(r);
  end if;
end $$;
reset role;
\echo VAT_EXCLUSIVE_TEST_PASSED

-- 9. Feature switches: only admins change them; values are cleaned.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin update public.stores set features = '{"ledger": true}' where slug = 'more-shop'; raise exception 'owner changed features';
  exception when raise_exception then if sqlerrm not like '%ผู้ดูแลระบบ%' then raise; end if; end;
  begin perform public.admin_set_default_features('{"ledger": false}'); raise exception 'owner set defaults';
  exception when raise_exception then if sqlerrm not like '%ผู้ดูแลระบบ%' then raise; end if; end;
  update public.stores set receipt_footer = 'ยังแก้ข้อมูลอื่นได้' where slug = 'more-shop';   -- other columns still editable
  if public.platform_features() <> '{}'::jsonb then raise exception 'default features'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ begin
  perform public.admin_set_default_features('{"report_journal": false, "junk": "x", "BAD KEY": true}');
  if public.platform_features() <> '{"report_journal": false}'::jsonb then raise exception 'clean defaults: %', public.platform_features(); end if;
  perform public.admin_set_store_features((select id from public.stores where slug = 'more-shop'), '{"ledger": false, "export_csv": true}');
  if (select features from public.stores where slug = 'more-shop') <> '{"ledger": false, "export_csv": true}'::jsonb then raise exception 'store features'; end if;
end $$;
reset role;
\echo FEATURE_TESTS_PASSED
