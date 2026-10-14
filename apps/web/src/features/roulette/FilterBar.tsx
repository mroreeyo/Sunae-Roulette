import { useId } from 'react';
import { useFilters } from '../../stores/filterStore.ts';
import { CATEGORIES, FILTER_TAGS, NEAR_WALK_MINUTES } from '../places/vocabulary.ts';
import { Chip } from '../ui/Chip.tsx';

const row = 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4';

export function FilterBar({ disabled }: { disabled: boolean }) {
  const excludeLabelId = useId();
  const { nearOnly, requiredTags, excludedCategories, toggleNear, toggleTag, toggleCategory } = useFilters();

  return (
    <div className="flex flex-col gap-3">
      <div className={row} role="group" aria-label="조건">
        <Chip pressed={nearOnly} onClick={toggleNear} disabled={disabled}>
          도보 {NEAR_WALK_MINUTES}분
        </Chip>
        {FILTER_TAGS.map((tag) => (
          <Chip key={tag} pressed={requiredTags.includes(tag)} onClick={() => toggleTag(tag)} disabled={disabled}>
            {tag}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <p id={excludeLabelId} className="text-[13px] font-semibold text-ink">
          빼고 싶은 메뉴
        </p>
        <div className={row} role="group" aria-labelledby={excludeLabelId}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              variant="exclude"
              pressed={excludedCategories.includes(category)}
              onClick={() => toggleCategory(category)}
              disabled={disabled}
            >
              {category}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
