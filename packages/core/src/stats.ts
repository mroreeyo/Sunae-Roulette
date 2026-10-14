import { addDays } from './cooldown.ts';
import type { IsoDate, Meal } from './types.ts';

export interface CategoryShare {
  category: string;
  count: number;
  /** count / total, between 0 and 1. */
  ratio: number;
}

export interface PlaceCount {
  placeId: string;
  name: string;
  count: number;
}

export interface MealStats {
  total: number;
  categories: CategoryShare[];
  topPlaces: PlaceCount[];
}

const byCountThenName = <T extends { count: number }>(name: (x: T) => string) => (a: T, b: T) =>
  b.count - a.count || name(a).localeCompare(name(b), 'ko');

/** Category shares and most-visited places over the last `days` calendar days, today included. */
export function mealStats(
  meals: readonly (Meal & { name: string })[],
  today: IsoDate,
  days = 30,
  topLimit = 5,
): MealStats {
  const start = addDays(today, -(days - 1));
  const inRange = meals.filter((m) => m.eatenOn >= start && m.eatenOn <= today);

  const categoryCounts = new Map<string, number>();
  const placeCounts = new Map<string, PlaceCount>();
  for (const meal of inRange) {
    categoryCounts.set(meal.category, (categoryCounts.get(meal.category) ?? 0) + 1);
    const entry = placeCounts.get(meal.placeId) ?? { placeId: meal.placeId, name: meal.name, count: 0 };
    entry.count += 1;
    placeCounts.set(meal.placeId, entry);
  }

  const total = inRange.length;
  const categories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count, ratio: total ? count / total : 0 }))
    .sort(byCountThenName((c) => c.category));
  const topPlaces = [...placeCounts.values()].sort(byCountThenName((p) => p.name)).slice(0, topLimit);

  return { total, categories, topPlaces };
}
