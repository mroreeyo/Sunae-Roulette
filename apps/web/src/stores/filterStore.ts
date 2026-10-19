import type { Filters } from '@lunch/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { FILTER_TAGS, NEAR_WALK_MINUTES } from '../features/places/vocabulary.ts';

interface FilterState {
  nearOnly: boolean;
  requiredTags: string[];
  excludedCategories: string[];
  toggleNear: () => void;
  toggleTag: (tag: string) => void;
  toggleCategory: (category: string) => void;
  clear: () => void;
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Remembered per browser so a "한식 빼고" habit survives reloads. */
export const useFilters = create<FilterState>()(
  persist(
    (set) => ({
      nearOnly: false,
      requiredTags: [],
      excludedCategories: [],
      toggleNear: () => set((s) => ({ nearOnly: !s.nearOnly })),
      toggleTag: (tag) => set((s) => ({ requiredTags: toggle(s.requiredTags, tag) })),
      toggleCategory: (category) => set((s) => ({ excludedCategories: toggle(s.excludedCategories, category) })),
      clear: () => set({ nearOnly: false, requiredTags: [], excludedCategories: [] }),
    }),
    {
      name: 'lunch-filters',
      storage: createJSONStorage(() => localStorage),
      // A tag whose chip was removed (가성비) would otherwise stay applied with no way to turn it off.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<FilterState>;
        return {
          ...current,
          ...saved,
          requiredTags: (saved.requiredTags ?? []).filter((tag) => FILTER_TAGS.includes(tag)),
        };
      },
    },
  ),
);

export function toCoreFilters(state: Pick<FilterState, 'nearOnly' | 'requiredTags' | 'excludedCategories'>): Filters {
  return {
    ...(state.nearOnly ? { maxWalkMinutes: NEAR_WALK_MINUTES } : {}),
    requiredTags: state.requiredTags,
    excludedCategories: state.excludedCategories,
  };
}

export function hasActiveFilters(state: Pick<FilterState, 'nearOnly' | 'requiredTags' | 'excludedCategories'>): boolean {
  return state.nearOnly || state.requiredTags.length > 0 || state.excludedCategories.length > 0;
}
