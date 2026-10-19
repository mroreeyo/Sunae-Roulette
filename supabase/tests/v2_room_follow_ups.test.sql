begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Fixtures (as the migration owner, bypassing RLS) ---------------------------
-- A hosts the room, B votes, C joins without voting, D never joins.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'a@followups.test'),
  ('00000000-0000-0000-0000-0000000001b1', 'b@followups.test'),
  ('00000000-0000-0000-0000-0000000001c1', 'c@followups.test'),
  ('00000000-0000-0000-0000-0000000001d1', 'd@followups.test');

insert into public.places (id, source, source_id, name, category, lat, lng) values
  ('21000000-0000-0000-0000-000000000001', 'public', 'followup-p1', '후보가', '한식', 37.378, 127.114),
  ('21000000-0000-0000-0000-000000000002', 'public', 'followup-p2', '후보나', '중식', 37.378, 127.114);

insert into public.rooms (id, code, host_id, deadline_at) values
  ('31000000-0000-0000-0000-000000000001', 'QRSTUVWX', '00000000-0000-0000-0000-0000000001a1', now() + interval '1 hour');

insert into public.room_members (room_id, user_id, nickname) values
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000001a1', '진행자'),
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000001b1', '비'),
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000001c1', '씨');

insert into public.room_candidates (id, room_id, place_id, position, weight) values
  ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 1, 1.0),
  ('41000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', 2, 1.0);

insert into public.votes (room_id, voter_id, candidate_id) values
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000001b1', '41000000-0000-0000-0000-000000000002');

-- C already ate somewhere else on the room's lunch date (the Seoul date of its deadline).
insert into public.meals (user_id, place_id, eaten_on, spin_count, decision_seconds)
values ('00000000-0000-0000-0000-0000000001c1', '21000000-0000-0000-0000-000000000001', ((now() + interval '1 hour') at time zone 'Asia/Seoul')::date, 3, 40);

set local role authenticated;

-- Before closing ---------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001c1","role":"authenticated"}';
select throws_ok(
  $$ select public.record_room_meal('31000000-0000-0000-0000-000000000001') $$,
  '22023', null,
  'an open room has no result to record yet'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001b1","role":"authenticated"}';
select throws_ok(
  $$ select public.close_room_now('31000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'a member who is not the host cannot close the room'
);
select throws_ok($$ select public.close_room('31000000-0000-0000-0000-000000000001') $$, '42501', null, 'clients cannot call close_room');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001d1","role":"authenticated"}';
select throws_ok(
  $$ select public.close_room_now('31000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'an outsider cannot close the room'
);

-- The host closes early -------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';
select lives_ok($$ select public.close_room_now('31000000-0000-0000-0000-000000000001') $$, 'the host closes the room early');
select results_eq(
  $$ select status, winner_place_id, deadline_at = now() + interval '1 hour' from public.rooms where id = '31000000-0000-0000-0000-000000000001' $$,
  $$ values ('closed', '21000000-0000-0000-0000-000000000002'::uuid, true) $$,
  'closing early picks the winner and keeps the deadline'
);
select lives_ok($$ select public.close_room_now('31000000-0000-0000-0000-000000000001') $$, 'closing a closed room again does nothing');

reset role;
select results_eq(
  $$ select place_id, room_id, eaten_on from public.meals where user_id = '00000000-0000-0000-0000-0000000001b1' $$,
  $$ values ('21000000-0000-0000-0000-000000000002'::uuid, '31000000-0000-0000-0000-000000000001'::uuid, ((now() + interval '1 hour') at time zone 'Asia/Seoul')::date) $$,
  'the voter gets the winner on the room''s lunch date'
);

-- After closing: "I ate there too" ---------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001b1","role":"authenticated"}';
select throws_ok(
  $$ insert into public.votes (room_id, candidate_id) values ('31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001')
     on conflict (room_id, voter_id) do update set candidate_id = excluded.candidate_id $$,
  '42501', null,
  'no votes after the host closed the room'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001c1","role":"authenticated"}';
select lives_ok($$ select public.record_room_meal('31000000-0000-0000-0000-000000000001') $$, 'a member who did not vote records the result');
select results_eq(
  $$ select place_id, room_id, spin_count, decision_seconds from public.meals where user_id = '00000000-0000-0000-0000-0000000001c1' $$,
  $$ values ('21000000-0000-0000-0000-000000000002'::uuid, '31000000-0000-0000-0000-000000000001'::uuid, null::integer, null::integer) $$,
  'recording replaces that day''s meal and drops the roulette metrics'
);
select lives_ok($$ select public.record_room_meal('31000000-0000-0000-0000-000000000001') $$, 'recording twice is harmless');
select is(
  (select count(*)::int from public.meals where user_id = '00000000-0000-0000-0000-0000000001c1'),
  1,
  'recording twice keeps one meal for the day'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001d1","role":"authenticated"}';
select throws_ok(
  $$ select public.record_room_meal('31000000-0000-0000-0000-000000000001') $$,
  'P0002', null,
  'someone who never joined cannot record the room''s result'
);

-- Only the room functions set meals.room_id ------------------------------------
select throws_ok(
  $$ insert into public.meals (place_id, eaten_on, room_id)
     values ('21000000-0000-0000-0000-000000000001', '2026-10-01', '31000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'a client cannot attach a new meal to a room'
);
select lives_ok(
  $$ insert into public.meals (place_id, eaten_on) values ('21000000-0000-0000-0000-000000000001', '2026-10-01') $$,
  'a client still records its own meal'
);
select throws_ok(
  $$ update public.meals set room_id = '31000000-0000-0000-0000-000000000001' where eaten_on = '2026-10-01' $$,
  '42501', null,
  'a client cannot attach an existing meal to a room'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001b1","role":"authenticated"}';
select lives_ok(
  $$ insert into public.meals (place_id, eaten_on) values ('21000000-0000-0000-0000-000000000001', ((now() + interval '1 hour') at time zone 'Asia/Seoul')::date)
     on conflict (user_id, eaten_on) do update set place_id = excluded.place_id $$,
  'a voter records another place for that day, as the roulette does'
);
select results_eq(
  $$ select place_id, room_id from public.meals where user_id = '00000000-0000-0000-0000-0000000001b1' $$,
  $$ values ('21000000-0000-0000-0000-000000000001'::uuid, null::uuid) $$,
  'a meal moved to another place is no longer the room''s result'
);

select * from finish();
rollback;
