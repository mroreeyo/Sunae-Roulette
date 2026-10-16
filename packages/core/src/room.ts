import { toSeoulDate } from './cooldown.ts';
import { recommend, type Candidate, type RecommendInput } from './recommend.ts';

/** Candidates a team room starts with (PRD F-08). */
export const ROOM_CANDIDATE_COUNT = 3;
/** Rooms close at 11:40 Seoul time by default. */
const DEFAULT_DEADLINE_UTC = 'T02:40:00.000Z';
/** From 11:30 Seoul time on, a new room closes this many minutes after it is made. */
const LATE_START_MINUTES = 11 * 60 + 30;
const LATE_DEADLINE_MINUTES = 10;
const SEOUL_OFFSET_MINUTES = 9 * 60;

export interface RoomCandidatesInput extends Omit<RecommendInput, 'sessionExcludedIds'> {
  /** Places that must not be offered, such as the ones a host swapped out. */
  excludeIds?: readonly string[];
}

/**
 * Picks the room's candidates with the roulette rules, one at a time, preferring a category not
 * picked yet. The cooldown still comes first: a new category is only taken when it does not need
 * a shorter cooldown than repeating a category would. With fewer categories than slots, a category
 * repeats (PRD: v2 team room candidates).
 */
export function pickRoomCandidates(input: RoomCandidatesInput, count = ROOM_CANDIDATE_COUNT): Candidate[] {
  const { excludeIds = [], filters = {}, ...rest } = input;
  const picked: Candidate[] = [];
  const excluded = [...excludeIds];

  while (picked.length < count) {
    const usedCategories = picked.map((c) => c.place.category);
    const anyCategory = recommend({ ...rest, filters, sessionExcludedIds: excluded });
    const newCategory = recommend({
      ...rest,
      filters: { ...filters, excludedCategories: [...(filters.excludedCategories ?? []), ...usedCategories] },
      sessionExcludedIds: excluded,
    });

    let next: Candidate | null = null;
    if (newCategory.status === 'ok' && (anyCategory.status !== 'ok' || newCategory.appliedCooldownDays >= anyCategory.appliedCooldownDays)) {
      next = newCategory.pick;
    } else if (anyCategory.status === 'ok') {
      next = anyCategory.pick;
    }
    if (!next) break;
    picked.push(next);
    excluded.push(next.place.id);
  }
  return picked;
}

/** 11:40 Seoul time today, or 10 minutes from now once it is 11:30 or later (PRD scenario 3). */
export function defaultRoomDeadline(now: Date): Date {
  const seoulMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + SEOUL_OFFSET_MINUTES) % (24 * 60);
  if (seoulMinutes >= LATE_START_MINUTES) return new Date(now.getTime() + LATE_DEADLINE_MINUTES * 60_000);
  return new Date(`${toSeoulDate(now)}${DEFAULT_DEADLINE_UTC}`);
}
