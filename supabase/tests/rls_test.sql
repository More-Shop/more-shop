-- Behaviour tests for the init migration. Run with:
--   psql -v ON_ERROR_STOP=1 -f supabase_stub.sql -f ../migrations/*.sql -f rls_test.sql
-- Every block raises on failure, so a clean run means all checks passed.
\set QUIET on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@more.shop'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@more.shop'),
  ('00000000-0000-0000-0000-00000000000c', 'staff-a@more.shop');

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- 1. Owner A and owner B each create their own store.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select id as store_a from public.create_store('{"slug":"more-shop","name":"More Shop","tax_id":"0105556000001","vat_registered":true,"service_charge_rate":10,"open_time":"00:00","close_time":"23:59","drive_folder_id":"1AbCdEfGhIjKlMnOpQrStUv"}') \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select id as store_b from public.create_store('{"slug":"cafe-b","name":"Cafe B"}') \gset
-- B cannot see A's store, menu or ledger.
do $$ begin
  if (select count(*) from public.stores) <> 1 then raise exception 'B sees % stores', (select count(*) from public.stores); end if;
  if (select count(*) from public.accounts) <> 15 then raise exception 'accounts not seeded'; end if;
end $$;
reset role;

-- 2. A sets up menu & tables, adds a staff member.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.categories (store_id, name) values (:'store_a', 'อาหาร') returning id as cat \gset
insert into public.menu_items (store_id, category_id, name, price) values (:'store_a', :'cat', 'ข้าวผัด', 60) returning id as item1 \gset
insert into public.menu_items (store_id, category_id, name, price) values (:'store_a', :'cat', 'ชาไทย', 40) returning id as item2 \gset
insert into public.dining_tables (store_id, code) values (:'store_a', '1') returning id as t1, qr_token as tok1 \gset
insert into public.dining_tables (store_id, code) values (:'store_a', '2') returning id as t2 \gset
select public.add_store_member(:'store_a', 'STAFF-A@more.shop', 'staff');
reset role;

-- B cannot write into A's store.
select set_config('my.store_a', :'store_a', false), set_config('my.t2', :'t2', false), set_config('my.item1', :'item1', false);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    insert into public.menu_items (store_id, name, price) values ((select current_setting('my.store_a')::uuid), 'hack', 1);
    raise exception 'B inserted into A';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3. Customer (anon) orders by QR token; prices come from the menu.
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select (public_place_order('more-shop', jsonb_build_array(
          jsonb_build_object('menu_item_id', :'item1', 'qty', 2, 'unit_price', 1),
          jsonb_build_object('menu_item_id', :'item2', 'qty', 1)), :'tok1')) ->> 'order_id' as order1 \gset
do $$ begin
  -- anon cannot read tables directly
  begin perform 1 from public.orders; raise exception 'anon read orders';
  exception when insufficient_privilege then null; end;
end $$;
-- anon cannot pick a table by id (LINE path needs the verified service role)
do $$ begin
  begin
    perform public_place_order('more-shop', jsonb_build_array(jsonb_build_object('menu_item_id', current_setting('my.item1'))),
                               null, current_setting('my.t2')::uuid, null, null, 'line', 'Uspoof');
    raise exception 'anon ordered without token';
  exception when raise_exception then
    if sqlerrm not like '%ไม่พบโต๊ะ%' then raise; end if;
  end;
end $$;
select (public_order(:'order1')) ->> 'total' as public_total \gset
select (public_table('more-shop', :'tok1')) ->> 'code' = '1' as table_ok \gset
\if :table_ok
\else
  \echo 'FAIL: public_table' \q
\endif
reset role;

-- 4. Staff accepts, checks out; totals: 160 + 10% svc = 176 incl. VAT 7% -> vat 11.51
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ declare o public.orders; begin
  select * into o from public.orders;
  if o.subtotal <> 160 or o.service_charge <> 16 or o.total <> 176 or o.vat <> 11.51 then
    raise exception 'bad totals %', row_to_json(o);
  end if;
  begin perform public.checkout_order(o.id, 'cash', 200); raise exception 'checkout with pending items';
  exception when raise_exception then if sqlerrm not like '%รอยืนยัน%' then raise; end if; end;
  update public.order_items set status = 'sent' where order_id = o.id;
  -- staff cannot mark paid directly
  begin update public.orders set status = 'paid' where id = o.id; raise exception 'direct paid';
  exception when raise_exception then if sqlerrm not like '%checkout_order%' then raise; end if; end;
  o := public.checkout_order(o.id, 'cash', 200);
  if o.receipt_no !~ '^INV[0-9]{4}-00001$' or o.change_amount <> 24 then raise exception 'bad checkout %', row_to_json(o); end if;
  -- paid bill is locked
  begin update public.orders set total = 1 where id = o.id; raise exception 'edited paid bill';
  exception when raise_exception then if sqlerrm not like '%แก้ไขไม่ได้%' then raise; end if; end;
  begin insert into public.order_items (order_id, store_id, name, unit_price, qty) values (o.id, o.store_id, 'x', 1, 1);
        raise exception 'added item to paid bill';
  exception when raise_exception then if sqlerrm not like '%ปิดแล้ว%' then raise; end if; end;
  -- staff cannot read the ledger or change prices
  if (select count(*) from public.ledger_entries) <> 0 then raise exception 'staff sees ledger'; end if;
  begin update public.menu_items set price = 1; raise exception 'staff changed price';
  exception when raise_exception then if sqlerrm not like '%ของหมด%' then raise; end if; end;
  update public.menu_items set available = false where name = 'ชาไทย';
  if (select count(*) from public.menu_items where not available) <> 1 then raise exception 'staff sold-out failed'; end if;
end $$;
-- POS flow: new bill on table 2, second round appends to it.
select public.pos_add_items(:'store_a', null, :'t2', jsonb_build_array(jsonb_build_object('menu_item_id', :'item1', 'qty', 1))) as order2 \gset
select public.pos_add_items(:'store_a', null, :'t2', '[{"name":"น้ำแข็ง","unit_price":5,"qty":2}]') = :'order2' as same_bill \gset
\if :same_bill
\else
  \echo 'FAIL: second round created a new bill' \q
\endif
reset role;

-- 5. Owner sees one sale in the ledger with VAT.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ declare e public.ledger_entries; begin
  select * into e from public.ledger_entries;
  if e.amount <> 176 or e.vat_amount <> 11.51 or e.type <> 'income' then raise exception 'bad ledger %', row_to_json(e); end if;
  if (select count(*) from public.list_store_members((select id from public.stores where slug = 'more-shop'))) <> 2 then
    raise exception 'members';
  end if;
  -- the only owner cannot be demoted
  begin update public.store_members set role = 'staff' where role = 'owner'; raise exception 'demoted last owner';
  exception when raise_exception then if sqlerrm not like '%เจ้าของ%' then raise; end if; end;
end $$;
select public.void_order(id, 'ทดสอบ') from public.orders where status = 'paid';
do $$ begin if not (select voided from public.ledger_entries limit 1) then raise exception 'void'; end if; end $$;
reset role;

-- 6. Booking: overlapping slot on the same table is rejected.
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select public_create_booking('more-shop', :'t1', current_date + 1, '18:00', 4, 'คุณเอ', '0812345678') is not null as booked \gset
do $$ begin
  begin
    perform public_create_booking('more-shop', (select (x->>'id')::uuid from jsonb_array_elements(public_store('more-shop')->'tables') x
                                                where x->>'code' = '1'), current_date + 1, '19:00', 2, 'คุณบี');
    raise exception 'double booking';
  exception when raise_exception then if sqlerrm not like '%ถูกจอง%' then raise; end if; end;
  if (select count(*) from public_table_availability('more-shop', current_date + 1, '18:30') where booked) <> 1 then
    raise exception 'availability';
  end if;
  if public_store('more-shop') -> 'store' ? 'tax_id' then raise exception 'public store leaks private fields'; end if;
end $$;
reset role;

-- 7. Service role (LINE edge function) may pick a table and keeps the LINE user id.
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select (public_place_order('more-shop', jsonb_build_array(jsonb_build_object('menu_item_id', :'item1')), null, :'t1',
        null, 'ลูกค้า LINE', 'line', 'Uabc123')) ->> 'order_id' as order3 \gset
reset role;
do $$ begin
  if (select line_user_id from public.orders where status = 'open' and table_code = '1') <> 'Uabc123' then
    raise exception 'line user id not stored';
  end if;
end $$;
\echo ALL_TESTS_PASSED
