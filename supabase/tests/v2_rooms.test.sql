begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Fixtures (as the migration owner, bypassing RLS) ---------------------------
-- A hosts room 1, B joins it, C is an outsider who hosts room 2, D arrives after closing.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@rooms.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@rooms.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@rooms.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@rooms.test');

insert into public.places (id, source, source_id, name, category, lat, lng) values
  ('20000000-0000-0000-0000-000000000001', 'public', 'room-p1', '후보1', '한식', 37.378, 127.114),
  ('20000000-0000-0000-0000-000000000002', 'public', 'room-p2', '후보2', '중식', 37.378, 127.114),
  ('20000000-0000-0000-0000-000000000003', 'public', 'room-p3', '후보3', '일식', 37.378, 127.114);

insert into public.rooms (id, code, host_id, deadline_at) values
  ('30000000-0000-0000-0000-000000000001', 'ABCDEFGH', '00000000-0000-0000-0000-0000000000a1', now() + interval '1 hour'),
  ('30000000-0000-0000-0000-000000000002', 'HJKMNPQR', '00000000-0000-0000-0000-0000000000c1', now() + interval '1 hour'),
  ('30000000-0000-0000-0000-000000000003', 'STUVWXYZ', '00000000-0000-0000-0000-0000000000c1', now() - interval '1 minute');

insert into public.room_members (room_id, user_id, nickname) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '진행자'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', '씨'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', '씨');

-- Candidate 2 has the highest weight, so it wins a tie.
insert into public.room_candidates (id, room_id, place_id, position, weight) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 1.0),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 2, 2.0),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 3, 0.5),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 1, 1.0);

-- Outsider C -----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select is_empty($$ select id from public.rooms where code = 'ABCDEFGH' $$, 'a room cannot be read by code without joining');
select is_empty(
  $$ select id from public.room_candidates where room_id = '30000000-0000-0000-0000-000000000001' $$,
  'an outsider cannot read the candidates'
);
select throws_ok($$ select public.join_room('ZZZZZZZZ', '씨') $$, 'P0002', null, 'an unknown code is rejected');
select throws_ok(
  $$ insert into public.votes (room_id, candidate_id) values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'someone who has not joined cannot vote'
);

-- Member B -------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok($$ select public.join_room('ABCDEFGH', '   ') $$, '22023', null, 'a blank nickname is rejected');
select is(
  public.join_room(' abcdefgh ', ' 비 '),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'join_room finds a room by its code, ignoring case and spaces'
);
select is(
  (select nickname from public.room_members where user_id = '00000000-0000-0000-0000-0000000000b1'),
  '비',
  'the nickname is stored trimmed'
);
select is(
  (select count(*)::int from public.room_candidates where room_id = '30000000-0000-0000-0000-000000000001'),
  3,
  'a member reads the candidates'
);
select is(
  (select count(*)::int from public.room_members where room_id = '30000000-0000-0000-0000-000000000001'),
  2,
  'a member sees who else joined'
);
select lives_ok(
  $$ insert into public.votes (room_id, candidate_id) values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002') $$,
  'a member votes without sending voter_id'
);
select lives_ok(
  $$ insert into public.votes (room_id, candidate_id) values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')
     on conflict (room_id, voter_id) do update set candidate_id = excluded.candidate_id $$,
  'voting again changes the vote'
);
select results_eq(
  $$ select candidate_id from public.votes where voter_id = '00000000-0000-0000-0000-0000000000b1' $$,
  $$ values ('40000000-0000-0000-0000-000000000001'::uuid) $$,
  'one person has one vote'
);
select throws_ok(
  $$ insert into public.votes (room_id, voter_id, candidate_id)
     values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'a member cannot vote for someone else'
);
select throws_ok(
  $$ update public.votes set candidate_id = '40000000-0000-0000-0000-000000000004' where voter_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '23503', null,
  'a vote cannot point at another room''s candidate'
);
select lives_ok($$ select public.join_room('HJKMNPQR', '비') $$, 'B also joins room 2');
select throws_ok(
  $$ update public.votes
     set room_id = '30000000-0000-0000-0000-000000000002', candidate_id = '40000000-0000-0000-0000-000000000004'
     where voter_id = '00000000-0000-0000-0000-0000000000b1' and room_id = '30000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'a vote cannot be moved into another room'
);
select throws_ok(
  $$ insert into public.rooms (code, host_id, deadline_at) values ('BBBBBBBB', '00000000-0000-0000-0000-0000000000b1', now()) $$,
  '42501', null,
  'clients cannot create rooms directly'
);
select throws_ok($$ select public.close_due_rooms() $$, '42501', null, 'clients cannot close rooms');

-- Host A votes, then the deadline passes ------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ insert into public.votes (room_id, candidate_id) values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002') $$,
  'the host votes too'
);

reset role;
update public.rooms set deadline_at = '2026-10-15 02:40:00+00' where id = '30000000-0000-0000-0000-000000000001';
-- B already recorded lunch that day, so B's own record stays.
insert into public.meals (user_id, place_id, eaten_on)
values ('00000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000003', '2026-10-15');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is_empty(
  $$ update public.votes set candidate_id = '40000000-0000-0000-0000-000000000002'
     where voter_id = '00000000-0000-0000-0000-0000000000b1' and room_id = '30000000-0000-0000-0000-000000000001'
     returning candidate_id $$,
  'votes cannot change after the deadline'
);
select throws_ok(
  $$ insert into public.votes (room_id, candidate_id) values ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002')
     on conflict (room_id, voter_id) do update set candidate_id = excluded.candidate_id $$,
  '42501', null,
  'voting again through upsert is refused after the deadline'
);

-- Room 3 is past its deadline but the closing job has not run yet.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$ select public.join_room('STUVWXYZ', '디') $$, 'P0002', null, 'no newcomers once the deadline has passed');

-- Closing (as the pg_cron job does) -----------------------------------------
-- Other rooms in the local database may be due too, so only this test's rooms are checked.
reset role;
select lives_ok($$ select public.close_due_rooms() $$, 'close_due_rooms runs');
select results_eq(
  $$ select status, winner_place_id from public.rooms where id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('closed', '20000000-0000-0000-0000-000000000002'::uuid) $$,
  'a 1:1 tie goes to the candidate with the higher weight'
);
select results_eq(
  $$ select place_id, room_id from public.meals where user_id = '00000000-0000-0000-0000-0000000000a1' and eaten_on = '2026-10-15' $$,
  $$ values ('20000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000001'::uuid) $$,
  'a voter gets the winner as that day''s meal, linked to the room'
);
select results_eq(
  $$ select place_id from public.meals where user_id = '00000000-0000-0000-0000-0000000000b1' and eaten_on = '2026-10-15' $$,
  $$ values ('20000000-0000-0000-0000-000000000003'::uuid) $$,
  'a voter who already recorded that day keeps their own meal'
);
select results_eq(
  $$ select status, winner_place_id from public.rooms where id = '30000000-0000-0000-0000-000000000003' $$,
  $$ values ('closed', null::uuid) $$,
  'a room without votes closes without a winner'
);

-- After closing ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$ select public.join_room('ABCDEFGH', '디') $$, 'P0002', null, 'a closed room cannot be joined by someone new');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(
  public.join_room('ABCDEFGH', '새이름'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'a member can come back to a closed room to see the result'
);
select is(
  (select nickname from public.room_members
   where room_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-0000000000b1'),
  '비',
  'coming back does not change the nickname a closed room showed'
);

select * from finish();
rollback;
