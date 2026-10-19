import { useId } from 'react';
import { useFilters } from '../../stores/filterStore.ts';
import { CATEGORIES, FILTER_TAGS, NEAR_WALK_MINUTES } from '../places/vocabulary.ts';
import { Chip } from '../ui/Chip.tsx';

const row = 'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4';

interface FilterBarProps {
  disabled: boolean;
  /** With a result on screen the filters shrink to one line, so the result fits the first screen. */
  collapsed?: boolean;
  onExpand?: () => void;
}

export function FilterBar({ disabled, collapsed = false, onExpand }: FilterBarProps) {
  const excludeLabelId = useId();
  const { nearOnly, requiredTags, excludedCategories, toggleNear, toggleTag, toggleCategory } = useFilters();

  if (collapsed) {
    const active = [
      ...(nearOnly ? [`도보 ${NEAR_WALK_MINUTES}분`] : []),
      ...requiredTags,
      ...excludedCategories.map((c) => `${c} 빼고`),
    ];
    return (
      <div className="flex min-h-11 items-center justify-between gap-2">
        <div className="no-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-[14px] text-ink-muted">필터</span>
          {active.length === 0 ? (
            <span className="shrink-0 text-[14px] text-ink-muted">없음</span>
          ) : (
            active.map((label) => (
              <span key={label} className="shrink-0 rounded-full bg-panel px-3 py-1 text-[13px] font-bold text-on-panel">
                {label}
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          aria-expanded={false}
          onClick={onExpand}
          className="min-h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold ring-1 ring-ink/15 transition-transform duration-200 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          필터 바꾸기
        </button>
      </div>
    );
  }

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
        <p id={excludeLabelId} className="text-[13px] font-semibold text-ink-muted">
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
