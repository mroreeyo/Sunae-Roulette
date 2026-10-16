-- v2 team rooms: rooms, members, candidates, votes, the room functions and the closing job.
-- RLS follows lunch-roulette-TRD.md. Rooms are written only by the create-room Edge Function
-- (service role) and the security definer functions below, never directly by clients.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- 8 characters without 0, O, 1, I and L, so a code is hard to guess and easy to read out.
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  deadline_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  winner_place_id uuid references public.places (id),
  created_at timestamptz not null default now()
);

create index rooms_open_deadline_idx on public.rooms (deadline_at) where status = 'open';
create index rooms_host_idx on public.rooms (host_id, created_at desc);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.room_candidates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  place_id uuid not null references public.places (id),
  added_by uuid references auth.users (id) on delete set null,
  position smallint not null,
  -- Weight when the room was made; breaks ties when the room closes.
  weight double precision not null,
  unique (room_id, id),
  unique (room_id, place_id),
  unique (room_id, position)
);

create table public.votes (
  room_id uuid not null,
  voter_id uuid not null default auth.uid(),
  candidate_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, voter_id),
  -- Only members can vote, and only for a candidate of the same room.
  foreign key (room_id, voter_id) references public.room_members (room_id, user_id) on delete cascade,
  foreign key (room_id, candidate_id) references public.room_candidates (room_id, id) on delete cascade
);

alter table public.meals
  add constraint meals_room_id_fkey foreign key (room_id) references public.rooms (id) on delete set null;

-- Helpers for RLS ------------------------------------------------------------

-- Checking room_members inside its own policy would recurse, so membership is looked up here.
create function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

create function public.is_room_open(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms
    where id = p_room_id and status = 'open' and deadline_at > now()
  );
$$;

revoke execute on function public.is_room_member(uuid) from public, anon;
revoke execute on function public.is_room_open(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_open(uuid) to authenticated;

-- Row level security ---------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_candidates enable row level security;
alter table public.votes enable row level security;

create policy "rooms: members read" on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy "room_members: members read" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));

create policy "room_candidates: members read" on public.room_candidates
  for select to authenticated using (public.is_room_member(room_id));

create policy "votes: members read" on public.votes
  for select to authenticated using (public.is_room_member(room_id));

create policy "votes: vote in an open room" on public.votes
  for insert to authenticated
  with check (voter_id = (select auth.uid()) and public.is_room_open(room_id));

create policy "votes: change your vote in an open room" on public.votes
  for update to authenticated
  using (voter_id = (select auth.uid()))
  with check (voter_id = (select auth.uid()) and public.is_room_open(room_id));

-- Joining --------------------------------------------------------------------

-- The only way to find a room by its code. A code that does not exist, or a closed room the
-- caller never joined, gets the same error, so codes cannot be probed.
create function public.join_room(p_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_room public.rooms;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if char_length(v_nickname) not between 1 and 20 then
    raise exception 'nickname must be 1 to 20 characters' using errcode = '22023';
  end if;

  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found
     or (v_room.status = 'closed'
         and not exists (select 1 from public.room_members where room_id = v_room.id and user_id = v_user)) then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  insert into public.room_members (room_id, user_id, nickname)
  values (v_room.id, v_user, v_nickname)
  on conflict (room_id, user_id) do update set nickname = excluded.nickname;

  return v_room.id;
end;
$$;

revoke execute on function public.join_room(text, text) from public, anon;
grant execute on function public.join_room(text, text) to authenticated;

-- Closing --------------------------------------------------------------------

-- Run every minute by pg_cron. The most voted candidate wins; ties go to the higher weight,
-- then the lower position. A room without votes closes without a winner. Every voter gets the
-- winner as that day's meal unless they already recorded one.
create function public.close_due_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room record;
  v_winner uuid;
  v_closed integer := 0;
begin
  for v_room in
    select id, deadline_at from public.rooms
    where status = 'open' and deadline_at <= now()
    order by deadline_at
    for update skip locked
  loop
    select c.place_id into v_winner
    from public.room_candidates c
    join public.votes v on v.room_id = c.room_id and v.candidate_id = c.id
    where c.room_id = v_room.id
    group by c.id, c.place_id, c.weight, c.position
    order by count(*) desc, c.weight desc, c.position asc
    limit 1;

    if v_winner is not null then
      insert into public.meals (user_id, place_id, eaten_on, room_id)
      select v.voter_id, v_winner, (v_room.deadline_at at time zone 'Asia/Seoul')::date, v_room.id
      from public.votes v
      where v.room_id = v_room.id
      on conflict (user_id, eaten_on) do nothing;
    end if;

    update public.rooms set status = 'closed', winner_place_id = v_winner where id = v_room.id;
    v_closed := v_closed + 1;
  end loop;
  return v_closed;
end;
$$;

revoke execute on function public.close_due_rooms() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('close-due-rooms', '* * * * *', 'select public.close_due_rooms()');

-- Realtime -------------------------------------------------------------------

-- Postgres Changes follow the read policies above, so only members get a room's events.
alter publication supabase_realtime add table public.rooms, public.room_members, public.votes;
