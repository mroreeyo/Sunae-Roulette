import { businessWindowStart } from './cooldown.ts';
import { distanceMeters, walkMinutes } from './geo.ts';
import type { Filters, IsoDate, LatLng, Meal, Place, PlacePref, Rng } from './types.ts';
import { buildWeightContext, placeWeight } from './weights.ts';

export interface RecommendInput {
  places: readonly Place[];
  meals: readonly Meal[];
  prefs: readonly PlacePref[];
  filters?: Filters;
  /** Places passed over with "다시 돌리기" in the current session. */
  sessionExcludedIds?: readonly string[];
  today: IsoDate;
  /** Business days during which a visited place is not recommended again. */
  cooldownDays: number;
  base: LatLng;
  rng: Rng;
}

export interface Candidate {
  place: Place;
  weight: number;
  /** Null when the place has no location. */
  walkMinutes: number | null;
}

export type RecommendResult =
  | { status: 'ok'; pick: Candidate; candidates: Candidate[]; appliedCooldownDays: number }
  /** Every place that passes the filters was skipped in this session. */
  | { status: 'exhausted' }
  /** No place passes the filters, or nothing is left even with the shortest cooldown. */
  | { status: 'no-match' };

export function recommend(input: RecommendInput): RecommendResult {
  const { places, meals, prefs, filters = {}, sessionExcludedIds = [], today, cooldownDays, base, rng } = input;
  if (!Number.isInteger(cooldownDays) || cooldownDays < 1) {
    throw new RangeError(`cooldownDays must be a positive integer: ${cooldownDays}`);
  }

  const prefById = new Map(prefs.map((p) => [p.placeId, p]));
  const sessionExcluded = new Set(sessionExcludedIds);

  const eligible: Array<{ place: Place; walkMinutes: number | null }> = [];
  for (const place of places) {
    const minutes =
      place.lat === null || place.lng === null
        ? null
        : walkMinutes(distanceMeters(base, { lat: place.lat, lng: place.lng }));
    if (passesFilters(place, minutes, prefById.get(place.id), filters)) {
      eligible.push({ place, walkMinutes: minutes });
    }
  }
  if (eligible.length === 0) return { status: 'no-match' };

  const pool = eligible.filter((e) => !sessionExcluded.has(e.place.id));

  const favorites = new Set(prefs.filter((p) => p.isFavorite).map((p) => p.placeId));
  const ctx = buildWeightContext(meals, favorites, today);

  for (let days = cooldownDays; days >= 1 && pool.length > 0; days -= 1) {
    const cooledDown = visitedSince(meals, businessWindowStart(today, days), today);
    const candidates = pool
      .filter((e) => !cooledDown.has(e.place.id))
      .map((e) => ({ ...e, weight: placeWeight(e.place, ctx) }))
      .sort(byWeightThenId);
    if (candidates.length > 0) {
      return { status: 'ok', pick: pickWeighted(candidates, rng), candidates, appliedCooldownDays: days };
    }
  }

  const skippedSomething = eligible.some((e) => sessionExcluded.has(e.place.id));
  return skippedSomething ? { status: 'exhausted' } : { status: 'no-match' };
}

/** The picked place first, then the highest-weighted others, up to `size` slots. */
export function buildWheel(
  result: Extract<RecommendResult, { status: 'ok' }>,
  size = 8,
): Candidate[] {
  const others = result.candidates.filter((c) => c.place.id !== result.pick.place.id);
  return [result.pick, ...others.slice(0, Math.max(0, size - 1))];
}

function passesFilters(
  place: Place,
  minutes: number | null,
  pref: PlacePref | undefined,
  filters: Filters,
): boolean {
  if (!place.isActive || pref?.isHidden) return false;
  if (filters.excludedCategories?.includes(place.category)) return false;
  if (filters.includedCategories?.length && !filters.includedCategories.includes(place.category)) {
    return false;
  }
  // A place without a location cannot prove it is close enough.
  if (filters.maxWalkMinutes !== undefined && (minutes === null || minutes > filters.maxWalkMinutes)) {
    return false;
  }

  const tags = pref?.tags ?? [];
  if (filters.requiredTags?.length && tags.length > 0) {
    return filters.requiredTags.every((tag) => tags.includes(tag));
  }
  return true;
}

function visitedSince(meals: readonly Meal[], start: IsoDate, today: IsoDate): Set<string> {
  const ids = new Set<string>();
  for (const meal of meals) {
    if (meal.eatenOn >= start && meal.eatenOn <= today) ids.add(meal.placeId);
  }
  return ids;
}

function byWeightThenId(a: Candidate, b: Candidate): number {
  return b.weight - a.weight || (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0);
}

function pickWeighted(candidates: readonly Candidate[], rng: Rng): Candidate {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let threshold = rng() * total;
  for (const candidate of candidates) {
    threshold -= candidate.weight;
    if (threshold < 0) return candidate;
  }
  // Floating-point rounding can leave a tiny remainder; fall back to the last one.
  return candidates[candidates.length - 1]!;
}
