begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures (as the migration owner, bypassing RLS) ---------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

insert into public.places (id, source, source_id, name, category, lat, lng)
values ('10000000-0000-0000-0000-000000000001', 'public', 'pub-1', '공공식당', '한식', 37.378, 127.114);

-- User A ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into public.meals (place_id, eaten_on) values ('10000000-0000-0000-0000-000000000001', '2026-10-14') $$,
  'A can record a meal without sending user_id'
);
select is(
  (select user_id from public.meals),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'meal user_id defaults to auth.uid()'
);
select throws_ok(
  $$ insert into public.meals (place_id, eaten_on) values ('10000000-0000-0000-0000-000000000001', '2026-10-14') $$,
  '23505', null,
  'only one lunch per day'
);
select lives_ok(
  $$ insert into public.places (source, name, category) values ('manual', '직접추가집', '분식') $$,
  'A can add a manual place without a location'
);
select throws_ok(
  $$ insert into public.places (source, source_id, name, category, lat, lng)
     values ('public', 'fake-1', '가짜', '한식', 37.0, 127.0) $$,
  '42501', null,
  'A cannot add a public place'
);
select is_empty(
  $$ update public.places set name = '변경' where source = 'public' returning id $$,
  'A cannot edit a public place'
);
select is(
  (select count(*)::int from public.app_config),
  1,
  'signed-in users can read app_config'
);
select throws_ok(
  $$ select public.import_places('[]'::jsonb, '{}', 'x') $$,
  '42501', null,
  'signed-in users cannot run import_places'
);

-- User B ---------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty($$ select id from public.meals $$, 'B cannot see A''s meals');
select is_empty(
  $$ update public.places set name = '남의것' where source = 'manual' returning id $$,
  'B cannot edit A''s manual place'
);
-- Count only this test's rows so the result does not depend on imported data.
select is(
  (select count(*)::int from public.places where source_id = 'pub-1' or name = '직접추가집'),
  2,
  'B can read every place, including another user''s manual place'
);

-- Anonymous (not signed in) --------------------------------------------------
reset role;
set local role anon;
select is_empty($$ select id from public.places $$, 'anon cannot read places');

-- Import function (as the service role) -------------------------------------
reset role;
set local role service_role;

select is(
  public.import_places(
    '[{"source_id":"pub-2","name":"새식당","category":"중식","category_raw":"중국식","lat":37.379,"lng":127.115,"address":null,"phone":null}]'::jsonb,
    '{}', 'first.csv'
  ) ->> 'added',
  '1',
  'import adds new public places'
);
select is(
  (select miss_count from public.places where source_id = 'pub-1'),
  1,
  'a public place missing from the import gets a miss'
);

select public.import_places('[]'::jsonb, '{pub-2}', 'second.csv');
select is(
  (select is_active from public.places where source_id = 'pub-1'),
  false,
  'a public place missing twice is deactivated'
);
select is(
  (select is_active from public.places where source_id = 'pub-2'),
  false,
  'a closed place is deactivated immediately'
);

select * from finish();
rollback;
