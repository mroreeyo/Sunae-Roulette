-- v1 schema: global config, places, personal prefs, meals, import logs.
-- RLS follows the policy table in lunch-roulette-TRD.md.

create table public.app_config (
  id smallint primary key default 1 check (id = 1),
  base_name text not null default '수내역',
  base_lat double precision not null,
  base_lng double precision not null,
  radius_m integer not null default 500 check (radius_m > 0)
);

-- 수내역 (approximate station centre).
insert into public.app_config (base_name, base_lat, base_lng, radius_m)
values ('수내역', 37.3784, 127.1143, 500);

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname text,
  cooldown_days integer not null default 5 check (cooldown_days between 3 and 10),
  created_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('public', 'manual')),
  source_id text unique,
  name text not null,
  category text not null,
  category_raw text,
  lat double precision,
  lng double precision,
  address text,
  phone text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  miss_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (source = 'manual' or (source_id is not null and lat is not null and lng is not null)),
  check ((lat is null) = (lng is null))
);

create index places_active_idx on public.places (is_active);

create table public.user_place_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  is_favorite boolean not null default false,
  is_hidden boolean not null default false,
  tags text[] not null default '{}',
  primary key (user_id, place_id)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid not null references public.places (id),
  eaten_on date not null default (now() at time zone 'Asia/Seoul')::date,
  room_id uuid,
  spin_count integer check (spin_count >= 1),
  decision_seconds integer check (decision_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, eaten_on)
);

create index meals_user_eaten_on_idx on public.meals (user_id, eaten_on desc);

create table public.import_logs (
  id bigint generated always as identity primary key,
  file_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_read integer,
  added integer,
  updated integer,
  deactivated integer,
  skipped integer,
  message text
);

-- Row level security -------------------------------------------------------

alter table public.app_config enable row level security;
alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.user_place_prefs enable row level security;
alter table public.meals enable row level security;
alter table public.import_logs enable row level security;

create policy "app_config: signed-in users read"
  on public.app_config for select to authenticated using (true);

create policy "profiles: own row"
  on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "places: signed-in users read"
  on public.places for select to authenticated using (true);

create policy "places: add own manual place"
  on public.places for insert to authenticated
  with check (source = 'manual' and source_id is null and created_by = (select auth.uid()));

-- Deleting is done by setting is_active = false, because meals may reference the place.
create policy "places: edit own manual place"
  on public.places for update to authenticated
  using (source = 'manual' and created_by = (select auth.uid()))
  with check (source = 'manual' and source_id is null and created_by = (select auth.uid()));

create policy "user_place_prefs: own rows"
  on public.user_place_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "meals: own rows"
  on public.meals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- import_logs has no policies: only the service role can read or write it.

-- Public data import -------------------------------------------------------

-- Called by scripts/import-places with the service role. One call is one transaction.
create function public.import_places(p_records jsonb, p_closed_ids text[], p_file_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_log_id bigint;
  v_added integer;
  v_updated integer;
  v_closed integer;
  v_missed integer;
begin
  insert into public.import_logs (file_name, rows_read)
  values (p_file_name, jsonb_array_length(p_records))
  returning id into v_log_id;

  with incoming as (
    select *
    from jsonb_to_recordset(p_records) as r(
      source_id text, name text, category text, category_raw text,
      lat double precision, lng double precision, address text, phone text
    )
  ),
  upserted as (
    insert into public.places as p
      (source, source_id, name, category, category_raw, lat, lng, address, phone,
       is_active, last_seen_at, miss_count, created_by)
    select 'public', source_id, name, category, category_raw, lat, lng, address, phone,
           true, now(), 0, null
    from incoming
    on conflict (source_id) do update set
      name = excluded.name,
      category = excluded.category,
      category_raw = excluded.category_raw,
      lat = excluded.lat,
      lng = excluded.lng,
      address = excluded.address,
      phone = excluded.phone,
      is_active = true,
      last_seen_at = now(),
      miss_count = 0
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  into v_added, v_updated
  from upserted;

  update public.places
  set is_active = false
  where source = 'public' and is_active and source_id = any (p_closed_ids);
  get diagnostics v_closed = row_count;

  -- Rows missing from this import twice in a row are deactivated.
  with missed as (
    update public.places as p
    set miss_count = p.miss_count + 1,
        is_active = p.miss_count + 1 < 2
    where p.source = 'public'
      and p.is_active
      and not exists (
        select 1 from jsonb_array_elements(p_records) as r
        where r ->> 'source_id' = p.source_id
      )
    returning p.is_active
  )
  select count(*) filter (where not is_active) into v_missed from missed;

  update public.import_logs
  set finished_at = now(),
      added = v_added,
      updated = v_updated,
      deactivated = v_closed + v_missed,
      message = 'ok'
  where id = v_log_id;

  return jsonb_build_object(
    'added', v_added, 'updated', v_updated,
    'deactivated_closed', v_closed, 'deactivated_missing', v_missed
  );
end;
$$;

revoke execute on function public.import_places(jsonb, text[], text) from public, anon, authenticated;
