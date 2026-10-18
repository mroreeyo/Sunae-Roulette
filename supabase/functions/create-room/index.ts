// create-room: previews a team room's candidates and creates the room (TRD, Edge Functions v2).
// The candidates follow the roulette rules from packages/core, with a cooldown built from the
// host's meals and the meals of everyone who voted in the host's rooms in the last 30 days.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import {
  addDays,
  buildWeightContext,
  defaultRoomDeadline,
  pickRoomCandidates,
  placeWeight,
  ROOM_CANDIDATE_COUNT,
  toSeoulDate,
  type Meal,
  type Place,
  type PlacePref,
} from '@lunch/core';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DEFAULT_COOLDOWN_DAYS = 5;
/** Enough history for the 10-business-day fresh bonus and the 30-day team window. */
const HISTORY_CALENDAR_DAYS = 45;
const TEAM_WINDOW_DAYS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
/** A custom deadline must leave time to vote and still be today-ish. */
const MAX_DEADLINE_MS = 12 * 60 * 60 * 1000;
/** Rooms one person may make in a short window, so an anonymous user cannot flood the table. */
const ROOM_LIMIT = 5;
const ROOM_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type Json = Record<string, unknown>;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

/** Uniform over the alphabet: bytes past the last full multiple of its length are drawn again. */
function newCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
      if (byte < limit && code.length < CODE_LENGTH) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

interface PlaceRecord {
  id: string;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

/** Everything the candidate rules need, seen from the host's side. */
async function loadContext(admin: SupabaseClient, hostId: string) {
  const today = toSeoulDate(new Date());
  const config = check(await admin.from('app_config').select('base_lat, base_lng').single());
  const places = check(
    await admin.from('places').select('id, name, category, lat, lng, address').eq('is_active', true).returns<PlaceRecord[]>(),
  );
  const prefs = check(await admin.from('user_place_prefs').select('place_id, is_favorite, is_hidden, tags').eq('user_id', hostId));
  const profile = check(await admin.from('profiles').select('cooldown_days').eq('id', hostId).maybeSingle());

  // People who voted in the host's recent rooms may come again, so their meals count too.
  const since = new Date(Date.now() - TEAM_WINDOW_DAYS * 86_400_000).toISOString();
  const recentRooms = check(await admin.from('rooms').select('id').eq('host_id', hostId).gte('created_at', since)) as { id: string }[];
  const voters = recentRooms.length
    ? (check(await admin.from('votes').select('voter_id').in('room_id', recentRooms.map((r) => r.id))) as { voter_id: string }[])
    : [];
  const userIds = [...new Set([hostId, ...voters.map((v) => v.voter_id)])];
  const meals = check(
    await admin
      .from('meals')
      .select('place_id, eaten_on, places(category)')
      .in('user_id', userIds)
      .gte('eaten_on', addDays(today, -HISTORY_CALENDAR_DAYS)),
  ) as unknown as { place_id: string; eaten_on: string; places: { category: string } | null }[];

  return {
    today,
    base: { lat: config.base_lat as number, lng: config.base_lng as number },
    places: places.map((p): Place & { address: string | null } => ({
      id: p.id,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      isActive: true,
    })),
    prefs: (prefs as { place_id: string; is_favorite: boolean; is_hidden: boolean; tags: string[] | null }[]).map(
      (p): PlacePref => ({ placeId: p.place_id, isFavorite: p.is_favorite, isHidden: p.is_hidden, tags: p.tags ?? [] }),
    ),
    meals: meals.map((m): Meal => ({ placeId: m.place_id, eatenOn: m.eaten_on, category: m.places?.category ?? '기타' })),
    cooldownDays: (profile?.cooldown_days as number | undefined) ?? DEFAULT_COOLDOWN_DAYS,
  };
}

function candidateJson(place: Place & { address: string | null }, weight: number, walkMinutes: number | null): Json {
  return {
    place_id: place.id,
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    weight,
    walk_minutes: walkMinutes,
  };
}

async function preview(admin: SupabaseClient, hostId: string, body: Json): Promise<Json> {
  const ctx = await loadContext(admin, hostId);
  const excludeIds = Array.isArray(body.exclude_place_ids) ? body.exclude_place_ids.filter((id) => typeof id === 'string') : [];
  const picked = pickRoomCandidates({ ...ctx, rng: Math.random, excludeIds });
  const byId = new Map(ctx.places.map((p) => [p.id, p]));
  return {
    candidates: picked.map((c) => candidateJson(byId.get(c.place.id)!, c.weight, c.walkMinutes)),
    deadline_at: defaultRoomDeadline(new Date()).toISOString(),
  };
}

function parseDeadline(value: unknown): Date {
  const now = Date.now();
  if (value === undefined || value === null) return defaultRoomDeadline(new Date(now));
  const deadline = new Date(String(value));
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= now || deadline.getTime() > now + MAX_DEADLINE_MS) {
    throw new HttpError(400, 'deadline_at must be within the next 12 hours');
  }
  return deadline;
}

async function create(admin: SupabaseClient, hostId: string, body: Json): Promise<Json> {
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (nickname.length < 1 || nickname.length > 20) throw new HttpError(400, 'nickname must be 1 to 20 characters');
  const placeIds = Array.isArray(body.place_ids) ? [...new Set(body.place_ids.filter((id) => typeof id === 'string'))] : [];
  if (placeIds.length < 1 || placeIds.length > ROOM_CANDIDATE_COUNT) {
    throw new HttpError(400, `place_ids must hold 1 to ${ROOM_CANDIDATE_COUNT} places`);
  }
  const deadline = parseDeadline(body.deadline_at);

  const recent = await admin
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('host_id', hostId)
    .gte('created_at', new Date(Date.now() - ROOM_LIMIT_WINDOW_MS).toISOString());
  if (recent.error) throw new Error(recent.error.message);
  if ((recent.count ?? 0) >= ROOM_LIMIT) throw new HttpError(429, 'too many rooms, try again later');

  const ctx = await loadContext(admin, hostId);
  const byId = new Map(ctx.places.map((p) => [p.id, p]));
  const chosen = placeIds.map((id) => byId.get(id));
  if (chosen.some((p) => !p)) throw new HttpError(400, 'every place must be an active place');
  const favorites = new Set(ctx.prefs.filter((p) => p.isFavorite).map((p) => p.placeId));
  const weightCtx = buildWeightContext(ctx.meals, favorites, ctx.today);

  let room: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt += 1) {
    const result = await admin
      .from('rooms')
      .insert({ code: newCode(), host_id: hostId, deadline_at: deadline.toISOString() })
      .select('id, code')
      .single();
    if (!result.error) room = result.data;
    else if (result.error.code !== '23505') throw new Error(result.error.message);
  }
  if (!room) throw new Error('could not find a free room code');

  try {
    check(await admin.from('room_members').insert({ room_id: room.id, user_id: hostId, nickname }));
    check(
      await admin.from('room_candidates').insert(
        chosen.map((place, index) => ({
          room_id: room!.id,
          place_id: place!.id,
          added_by: hostId,
          position: index + 1,
          weight: placeWeight(place!, weightCtx),
        })),
      ),
    );
  } catch (error) {
    // Members and candidates go with the room (on delete cascade).
    const cleanup = await admin.from('rooms').delete().eq('id', room.id);
    if (cleanup.error) console.error(`could not remove half-made room ${room.id}`, cleanup.error);
    throw error;
  }
  return { room_id: room.id, code: room.code, deadline_at: deadline.toISOString() };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authorization = request.headers.get('Authorization') ?? '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: auth } = await userClient.auth.getUser(authorization.replace(/^Bearer /, ''));
    if (!auth.user) throw new HttpError(401, 'sign in first');

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Json;
    return json(body.preview === true ? await preview(admin, auth.user.id, body) : await create(admin, auth.user.id, body));
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'could not create the room' }, 500);
  }
});
