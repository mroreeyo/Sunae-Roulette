import { describe, expect, it } from 'vitest';
import { buildWheel, recommend, type RecommendInput } from './recommend.ts';
import type { Meal, Place, PlacePref, Rng } from './types.ts';

/** Deterministic PRNG so every run sees the same sequence. */
function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const BASE = { lat: 37.3786, lng: 127.1144 };
// Monday. The previous business day is Friday 2026-10-16.
const TODAY = '2026-10-19';

/** latOffset 0.001 ≈ 111 m ≈ 2.2 walking minutes. */
function place(id: string, category: string, latOffset = 0.001): Place {
  return { id, name: id, category, lat: BASE.lat + latOffset, lng: BASE.lng, isActive: true };
}

function meal(placeId: string, category: string, eatenOn: string): Meal {
  return { placeId, category, eatenOn };
}

function pref(placeId: string, overrides: Partial<PlacePref> = {}): PlacePref {
  return { placeId, isFavorite: false, isHidden: false, tags: [], ...overrides };
}

function input(overrides: Partial<RecommendInput>): RecommendInput {
  return {
    places: [],
    meals: [],
    prefs: [],
    today: TODAY,
    cooldownDays: 5,
    base: BASE,
    rng: seededRng(1),
    ...overrides,
  };
}

function okResult(overrides: Partial<RecommendInput>) {
  const result = recommend(input(overrides));
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
  return result;
}

function weightsById(overrides: Partial<RecommendInput>): Record<string, number> {
  return Object.fromEntries(okResult(overrides).candidates.map((c) => [c.place.id, c.weight]));
}

describe('recommend: hard filters', () => {
  it('excludes places visited within the cooldown window but not before it', () => {
    const places = [place('inside', '한식'), place('outside', '일식'), place('never', '중식')];
    const meals = [
      meal('inside', '한식', '2026-10-13'), // 5th business day back, still inside
      meal('outside', '일식', '2026-10-12'), // 6th business day back
    ];
    const ids = okResult({ places, meals }).candidates.map((c) => c.place.id);
    expect(ids).not.toContain('inside');
    expect(ids).toEqual(expect.arrayContaining(['outside', 'never']));
  });

  it('drops inactive and hidden places', () => {
    const places = [place('a', '한식'), { ...place('b', '한식'), isActive: false }, place('c', '한식')];
    const ids = okResult({ places, prefs: [pref('c', { isHidden: true })] }).candidates.map((c) => c.place.id);
    expect(ids).toEqual(['a']);
  });

  it('applies category and walking-distance filters', () => {
    const places = [place('near', '한식', 0.001), place('far', '한식', 0.003), place('jp', '일식')];
    const ids = okResult({
      places,
      filters: { maxWalkMinutes: 5, excludedCategories: ['일식'] },
    }).candidates.map((c) => c.place.id);
    expect(ids).toEqual(['near']);
  });

  it('keeps places without a location unless a walking-distance filter is on', () => {
    const places = [place('near', '한식'), { ...place('manual', '한식'), lat: null, lng: null }];
    const all = okResult({ places }).candidates;
    expect(all.find((c) => c.place.id === 'manual')?.walkMinutes).toBeNull();
    const filtered = okResult({ places, filters: { maxWalkMinutes: 5 } }).candidates.map((c) => c.place.id);
    expect(filtered).toEqual(['near']);
  });

  it('keeps untagged places when a tag is required', () => {
    const places = [place('solo', '한식'), place('group', '한식'), place('unknown', '한식')];
    const prefs = [pref('solo', { tags: ['혼밥'] }), pref('group', { tags: ['단체'] })];
    const ids = okResult({ places, prefs, filters: { requiredTags: ['혼밥'] } }).candidates.map((c) => c.place.id);
    expect(ids.sort()).toEqual(['solo', 'unknown']);
  });

  it('skips places passed over in this session', () => {
    const places = [place('a', '한식'), place('b', '일식')];
    const ids = okResult({ places, sessionExcludedIds: ['a'] }).candidates.map((c) => c.place.id);
    expect(ids).toEqual(['b']);
  });
});

describe('recommend: weights', () => {
  it('penalizes the last meal category by x0.3 even when the last meal was before the weekend', () => {
    const places = [place('k1', '한식'), place('j1', '일식')];
    const meals = [meal('k0', '한식', '2026-10-16')]; // Friday
    const w = weightsById({ places, meals });
    expect(w.k1).toBeCloseTo(0.3 * 1.2);
    expect(w.j1).toBeCloseTo(1.2);
  });

  it('applies x0.6 to other categories eaten within 3 business days', () => {
    const places = [place('c1', '중식'), place('k1', '한식')];
    const meals = [meal('c0', '중식', '2026-10-15'), meal('k0', '한식', '2026-10-16')];
    const w = weightsById({ places, meals });
    expect(w.c1).toBeCloseTo(0.6 * 1.2);
  });

  it('does not stack the two category penalties', () => {
    const places = [place('k1', '한식')];
    const meals = [meal('k0', '한식', '2026-10-15'), meal('k9', '한식', '2026-10-16')];
    expect(weightsById({ places, meals }).k1).toBeCloseTo(0.3 * 1.2);
  });

  it('multiplies the favorite bonus with the category penalty', () => {
    const places = [place('k1', '한식')];
    const meals = [meal('k1', '한식', '2026-10-06'), meal('k0', '한식', '2026-10-16')];
    const w = weightsById({ places, meals, prefs: [pref('k1', { isFavorite: true })] });
    // k1 was visited 10 business days ago (2026-10-06), so no fresh bonus.
    expect(w.k1).toBeCloseTo(0.3 * 1.5);
  });

  it('gives the fresh bonus only to places not visited within 10 business days', () => {
    const places = [place('recent', '양식'), place('old', '분식')];
    const meals = [
      meal('recent', '양식', '2026-10-06'), // 10th business day back, still inside
      meal('old', '분식', '2026-10-05'), // 11th business day back
      meal('other', '한식', '2026-10-16'), // keeps 양식/분식 out of the category penalties
    ];
    const w = weightsById({ places, meals, cooldownDays: 3 });
    expect(w.recent).toBeCloseTo(1);
    expect(w.old).toBeCloseTo(1.2);
  });
});

describe('recommend: empty results', () => {
  it('relaxes the cooldown one business day at a time', () => {
    const places = [place('a', '한식'), place('b', '일식')];
    const meals = [meal('a', '한식', '2026-10-13'), meal('b', '일식', '2026-10-19')];
    const result = okResult({ places, meals });
    expect(result.appliedCooldownDays).toBe(4);
    expect(result.candidates.map((c) => c.place.id)).toEqual(['a']);
  });

  it('reports exhausted when every eligible place was skipped in this session', () => {
    const places = [place('a', '한식'), place('b', '일식')];
    expect(recommend(input({ places, sessionExcludedIds: ['a', 'b'] })).status).toBe('exhausted');
  });

  it('reports no-match when filters remove everything', () => {
    const places = [place('a', '한식')];
    const result = recommend(input({ places, sessionExcludedIds: ['a'], filters: { excludedCategories: ['한식'] } }));
    expect(result.status).toBe('no-match');
  });

  it('reports no-match when only today\'s place remains', () => {
    const places = [place('a', '한식')];
    expect(recommend(input({ places, meals: [meal('a', '한식', TODAY)] })).status).toBe('no-match');
  });

  it('rejects a non-positive cooldown', () => {
    expect(() => recommend(input({ cooldownDays: 0 }))).toThrow(RangeError);
  });
});

describe('recommend: randomness', () => {
  const places = [place('a', '한식'), place('b', '일식'), place('c', '중식'), place('d', '양식')];
  const meals = [meal('x', '한식', '2026-10-16'), meal('y', '중식', '2026-10-15')];
  const prefs = [pref('d', { isFavorite: true })];

  it('returns the same pick for the same seed', () => {
    const first = okResult({ places, meals, prefs, rng: seededRng(42) }).pick.place.id;
    const second = okResult({ places, meals, prefs, rng: seededRng(42) }).pick.place.id;
    expect(first).toBe(second);
  });

  // 1.5 percentage points is about 3 standard deviations at p = 0.5 with 10,000 draws.
  it('matches the expected probabilities within 1.5 percentage points over 10,000 draws', () => {
    const rng = seededRng(7);
    const { candidates } = okResult({ places, meals, prefs });
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    const counts = new Map<string, number>();
    const draws = 10_000;
    for (let i = 0; i < draws; i += 1) {
      const id = okResult({ places, meals, prefs, rng }).pick.place.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const c of candidates) {
      const observed = (counts.get(c.place.id) ?? 0) / draws;
      expect(Math.abs(observed - c.weight / total)).toBeLessThan(0.015);
    }
  });
});

describe('buildWheel', () => {
  const places = Array.from({ length: 12 }, (_, i) => place(`p${String(i).padStart(2, '0')}`, `cat${i}`));

  it('puts the pick first and fills up to 8 distinct slots', () => {
    const result = okResult({ places, rng: seededRng(3) });
    const wheel = buildWheel(result);
    expect(wheel).toHaveLength(8);
    expect(wheel[0]).toBe(result.pick);
    expect(new Set(wheel.map((c) => c.place.id)).size).toBe(8);
  });

  it('uses every candidate when there are fewer than 8', () => {
    const result = okResult({ places: places.slice(0, 3) });
    expect(buildWheel(result)).toHaveLength(3);
  });
});
