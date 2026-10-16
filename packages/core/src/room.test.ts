import { describe, expect, it } from 'vitest';
import { defaultRoomDeadline, pickRoomCandidates, type RoomCandidatesInput } from './room.ts';
import type { Meal, Place } from './types.ts';

const BASE = { lat: 37.3786, lng: 127.1144 };
// Monday. The previous business day is Friday 2026-10-16.
const TODAY = '2026-10-19';

function place(id: string, category: string): Place {
  return { id, name: id, category, lat: BASE.lat + 0.001, lng: BASE.lng, isActive: true };
}

/** Cycles through fixed values so a run is repeatable. */
function cycleRng(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function input(overrides: Partial<RoomCandidatesInput>): RoomCandidatesInput {
  return { places: [], meals: [], prefs: [], today: TODAY, cooldownDays: 5, base: BASE, rng: cycleRng(0.1, 0.5, 0.9), ...overrides };
}

describe('pickRoomCandidates', () => {
  it('picks three places from three different categories when it can', () => {
    const places = [place('k1', '한식'), place('k2', '한식'), place('k3', '한식'), place('c1', '중식'), place('j1', '일식')];
    const picked = pickRoomCandidates(input({ places }));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((c) => c.place.category))).toEqual(new Set(['한식', '중식', '일식']));
  });

  it('repeats a category when there are fewer categories than slots', () => {
    const places = [place('k1', '한식'), place('k2', '한식'), place('c1', '중식')];
    const picked = pickRoomCandidates(input({ places }));
    expect(picked.map((c) => c.place.id).sort()).toEqual(['c1', 'k1', 'k2']);
  });

  it('never offers a place twice or one the host swapped out', () => {
    const places = [place('k1', '한식'), place('c1', '중식'), place('j1', '일식'), place('y1', '양식')];
    const picked = pickRoomCandidates(input({ places, excludeIds: ['k1'] }));
    const ids = picked.map((c) => c.place.id);
    expect(ids).not.toContain('k1');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the cooldown ahead of category variety', () => {
    // 일식 was eaten yesterday, so taking it for variety would need a shorter cooldown.
    const places = [place('k1', '한식'), place('k2', '한식'), place('k3', '한식'), place('j1', '일식')];
    const meals: Meal[] = [{ placeId: 'j1', category: '일식', eatenOn: '2026-10-16' }];
    const picked = pickRoomCandidates(input({ places, meals }));
    expect(picked.map((c) => c.place.id)).not.toContain('j1');
    expect(picked).toHaveLength(3);
  });

  it('returns fewer candidates when not enough places are left', () => {
    const picked = pickRoomCandidates(input({ places: [place('k1', '한식')] }));
    expect(picked.map((c) => c.place.id)).toEqual(['k1']);
  });
});

describe('defaultRoomDeadline', () => {
  it('is 11:40 Seoul time when the room is made in the morning', () => {
    // 10:05 in Seoul.
    expect(defaultRoomDeadline(new Date('2026-10-19T01:05:00Z')).toISOString()).toBe('2026-10-19T02:40:00.000Z');
  });

  it('uses the Seoul date just after midnight', () => {
    // 00:30 on the 20th in Seoul is still the 19th in UTC.
    expect(defaultRoomDeadline(new Date('2026-10-19T15:30:00Z')).toISOString()).toBe('2026-10-20T02:40:00.000Z');
  });

  it('is ten minutes from now from 11:30 Seoul time on', () => {
    expect(defaultRoomDeadline(new Date('2026-10-19T02:30:00Z')).toISOString()).toBe('2026-10-19T02:40:00.000Z');
    expect(defaultRoomDeadline(new Date('2026-10-19T02:35:00Z')).toISOString()).toBe('2026-10-19T02:45:00.000Z');
    expect(defaultRoomDeadline(new Date('2026-10-19T09:00:00Z')).toISOString()).toBe('2026-10-19T09:10:00.000Z');
  });
});
