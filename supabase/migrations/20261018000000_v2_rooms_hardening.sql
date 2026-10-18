-- v2 review fixes: a vote stays in its room, and a room past its deadline takes no newcomers.

-- A vote may only change its candidate, and only while its own room is open. Without this, an
-- update could move a vote from a closed room into an open one and change the closed tally.
drop policy "votes: change your vote in an open room" on public.votes;
create policy "votes: change your vote in an open room" on public.votes
  for update to authenticated
  using (voter_id = (select auth.uid()) and public.is_room_open(room_id))
  with check (voter_id = (select auth.uid()) and public.is_room_open(room_id));

create function public.votes_keep_room_and_voter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.room_id is distinct from old.room_id or new.voter_id is distinct from old.voter_id then
    raise exception 'a vote cannot move to another room or voter' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger votes_keep_room_and_voter
  before update on public.votes
  for each row execute function public.votes_keep_room_and_voter();

-- Newcomers are turned away once the deadline has passed, not only after the closing job ran.
-- A member rejoining a finished room keeps the nickname that room showed.
create or replace function public.join_room(p_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_room public.rooms;
  v_open boolean;
  v_member boolean;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if char_length(v_nickname) not between 1 and 20 then
    raise exception 'nickname must be 1 to 20 characters' using errcode = '22023';
  end if;

  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  v_open := v_room.status = 'open' and v_room.deadline_at > now();
  v_member := exists (select 1 from public.room_members where room_id = v_room.id and user_id = v_user);
  if not v_open and not v_member then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  if not v_member then
    insert into public.room_members (room_id, user_id, nickname) values (v_room.id, v_user, v_nickname);
  elsif v_open then
    update public.room_members set nickname = v_nickname where room_id = v_room.id and user_id = v_user;
  end if;

  return v_room.id;
end;
$$;
