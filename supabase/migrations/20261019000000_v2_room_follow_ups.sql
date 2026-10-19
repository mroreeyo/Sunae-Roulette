-- v2 follow-ups after a vote: the host can close a room early, and a member can put the result
-- in their own history after the room closed.

-- Closing one room, shared by the pg_cron job and the host's early close. The caller locks the
-- room row first. Not granted to anyone: only the functions below call it.
create function public.close_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deadline timestamptz;
  v_winner uuid;
begin
  select deadline_at into v_deadline from public.rooms where id = p_room_id and status = 'open';
  if not found then
    return;
  end if;

  select c.place_id into v_winner
  from public.room_candidates c
  join public.votes v on v.room_id = c.room_id and v.candidate_id = c.id
  where c.room_id = p_room_id
  group by c.id, c.place_id, c.weight, c.position
  order by count(*) desc, c.weight desc, c.position asc
  limit 1;

  if v_winner is not null then
    insert into public.meals (user_id, place_id, eaten_on, room_id)
    select v.voter_id, v_winner, (v_deadline at time zone 'Asia/Seoul')::date, p_room_id
    from public.votes v
    where v.room_id = p_room_id
    on conflict (user_id, eaten_on) do nothing;
  end if;

  update public.rooms set status = 'closed', winner_place_id = v_winner where id = p_room_id;
end;
$$;

revoke execute on function public.close_room(uuid) from public, anon, authenticated;

create or replace function public.close_due_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room record;
  v_closed integer := 0;
begin
  for v_room in
    select id from public.rooms
    where status = 'open' and deadline_at <= now()
    order by deadline_at
    for update skip locked
  loop
    perform public.close_room(v_room.id);
    v_closed := v_closed + 1;
  end loop;
  return v_closed;
end;
$$;

-- The host ends the vote now, for example once everyone has voted. The deadline stays as it was,
-- so the meals land on the lunch the room was made for, even when a room made the evening
-- before for the next day's lunch closes early. Closing a room that is already closed does
-- nothing.
create function public.close_room_now(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'only the host can close the room' using errcode = '42501';
  end if;
  if v_room.status = 'closed' then
    return;
  end if;

  perform public.close_room(p_room_id);
end;
$$;

revoke execute on function public.close_room_now(uuid) from public, anon;
grant execute on function public.close_room_now(uuid) to authenticated;

-- "I ate there too": a member of a closed room records its winner as their meal on the room's
-- date, replacing whatever they had recorded that day. Members who did not vote, or who had
-- already recorded another place, use this; the server picks the place and the date, so a
-- client cannot attach a meal to a room it was not in.
create function public.record_room_meal(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found
     or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_user) then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.status <> 'closed' or v_room.winner_place_id is null then
    raise exception 'the room has no result yet' using errcode = '22023';
  end if;

  -- Like a corrected meal, a team meal stays out of the roulette's decision metrics.
  insert into public.meals (user_id, place_id, eaten_on, room_id)
  values (v_user, v_room.winner_place_id, (v_room.deadline_at at time zone 'Asia/Seoul')::date, p_room_id)
  on conflict (user_id, eaten_on) do update
    set place_id = excluded.place_id, room_id = excluded.room_id, spin_count = null, decision_seconds = null;
end;
$$;

revoke execute on function public.record_room_meal(uuid) from public, anon;
grant execute on function public.record_room_meal(uuid) to authenticated;

-- meals.room_id marks a meal as a room's result, so only the room functions above may set it.
-- Clients may still record or correct their own meals: a meal moved to another place is no
-- longer the room's result and loses its room_id.
create function public.meals_room_id_from_rooms_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The room functions run as their owner; requests from the app run as anon or authenticated.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.room_id is not null then
      raise exception 'room_id is set by the room functions only' using errcode = '42501';
    end if;
  elsif new.room_id is distinct from old.room_id and new.room_id is not null then
    raise exception 'room_id is set by the room functions only' using errcode = '42501';
  elsif new.place_id is distinct from old.place_id then
    new.room_id := null;
  end if;
  return new;
end;
$$;

create trigger meals_room_id_from_rooms_only
  before insert or update on public.meals
  for each row execute function public.meals_room_id_from_rooms_only();
