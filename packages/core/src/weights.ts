import { businessWindowStart } from './cooldown.ts';
import type { IsoDate, Meal, Place } from './types.ts';

export const WEIGHT = {
  base: 1,
  sameCategoryAsLastMeal: 0.3,
  recentCategory: 0.6,
  favorite: 1.5,
  fresh: 1.2,
} as const;

/** Categories eaten within this many business days get the recentCategory penalty. */
export const RECENT_CATEGORY_BUSINESS_DAYS = 3;
/** Places not visited within this many business days get the fresh bonus. */
export const FRESH_AFTER_BUSINESS_DAYS = 10;

export interface WeightContext {
  lastMealCategory: string | null;
  recentCategories: ReadonlySet<string>;
  recentlyVisitedPlaceIds: ReadonlySet<string>;
  favoritePlaceIds: ReadonlySet<string>;
}

export function buildWeightContext(
  meals: readonly Meal[],
  favoritePlaceIds: ReadonlySet<string>,
  today: IsoDate,
): WeightContext {
  const recentStart = businessWindowStart(today, RECENT_CATEGORY_BUSINESS_DAYS);
  const freshStart = businessWindowStart(today, FRESH_AFTER_BUSINESS_DAYS);

  let lastMeal: Meal | null = null;
  const recentCategories = new Set<string>();
  const recentlyVisitedPlaceIds = new Set<string>();

  for (const meal of meals) {
    if (meal.eatenOn > today) continue;
    if (!lastMeal || meal.eatenOn > lastMeal.eatenOn) lastMeal = meal;
    if (meal.eatenOn >= recentStart) recentCategories.add(meal.category);
    if (meal.eatenOn >= freshStart) recentlyVisitedPlaceIds.add(meal.placeId);
  }

  return {
    lastMealCategory: lastMeal?.category ?? null,
    recentCategories,
    recentlyVisitedPlaceIds,
    favoritePlaceIds,
  };
}

/**
 * Category penalties do not stack: only the stronger one applies.
 * Bonuses multiply on top of whichever penalty applied.
 */
export function placeWeight(place: Place, ctx: WeightContext): number {
  let weight: number = WEIGHT.base;

  if (place.category === ctx.lastMealCategory) {
    weight *= WEIGHT.sameCategoryAsLastMeal;
  } else if (ctx.recentCategories.has(place.category)) {
    weight *= WEIGHT.recentCategory;
  }

  if (ctx.favoritePlaceIds.has(place.id)) weight *= WEIGHT.favorite;
  if (!ctx.recentlyVisitedPlaceIds.has(place.id)) weight *= WEIGHT.fresh;

  return weight;
}
