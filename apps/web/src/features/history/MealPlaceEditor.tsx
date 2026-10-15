import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useChangeMealPlace, usePlaces, type MealRow } from '../data/queries.ts';
import { fieldClass } from '../ui/field.ts';

/** Enough to pick from on a phone without scrolling past the next meal. */
const MAX_RESULTS = 6;

interface MealPlaceEditorProps {
  meal: MealRow;
  /** Called after the meal now points at the picked place. */
  onChanged: () => void;
}

/** Inline search for correcting which place a past meal was at. The date stays, as there is one lunch per day. */
export function MealPlaceEditor({ meal, onChanged }: MealPlaceEditorProps) {
  const ids = { search: useId(), status: useId() };
  const places = usePlaces();
  const changePlace = useChangeMealPlace();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const matches = useMemo(() => {
    if (!places.data || trimmed.length === 0) return [];
    return places.data
      .filter((p) => p.id !== meal.placeId && p.name.includes(trimmed))
      .sort(
        (a, b) =>
          Number(b.name.startsWith(trimmed)) - Number(a.name.startsWith(trimmed)) || a.name.localeCompare(b.name, 'ko'),
      );
  }, [places.data, trimmed, meal.placeId]);
  const shown = matches.slice(0, MAX_RESULTS);

  let status: string;
  if (changePlace.isPaused) status = '지금은 오프라인이에요. 연결되면 바로 바꿀게요.';
  else if (changePlace.isPending) status = '바꾸는 중이에요.';
  else if (places.isPending) status = '식당 목록을 불러오는 중이에요.';
  else if (trimmed.length === 0) status = '실제로 간 식당의 이름을 입력해 주세요.';
  else if (matches.length === 0) status = '찾는 식당이 없어요.';
  else if (matches.length > MAX_RESULTS) status = `${matches.length}곳 중 ${MAX_RESULTS}곳만 보여요. 이름을 더 입력해 보세요.`;
  else status = `${matches.length}곳을 찾았어요.`;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.search} className="text-[14px] font-semibold">
          바꿀 식당 찾기
        </label>
        <input
          id={ids.search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby={ids.status}
          className={fieldClass}
          autoComplete="off"
          // Opened by the user's own tap on 수정, so moving focus here is expected.
          autoFocus
        />
        <p id={ids.status} aria-live="polite" className="text-[13px] text-ink-muted">
          {status}
        </p>
      </div>

      {shown.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="찾은 식당">
          {shown.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                disabled={changePlace.isPending}
                onClick={() => changePlace.mutate({ mealId: meal.id, placeId: place.id }, { onSuccess: onChanged })}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-bg px-4 py-2 text-left ring-1 ring-line transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="min-w-0 truncate text-[15px] font-semibold">{place.name}</span>
                <span className="shrink-0 text-[13px] text-ink-muted">{place.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {trimmed.length > 0 && matches.length === 0 && places.isSuccess && (
        <p className="text-[14px]">
          목록에 없는 식당이면{' '}
          <Link to="/places" className="font-semibold text-accent-ink underline underline-offset-4">
            식당 목록에서 직접 추가
          </Link>
          한 뒤에 다시 바꿔 주세요.
        </p>
      )}

      {changePlace.isError && (
        <p role="alert" className="text-[14px] text-accent-ink">
          기록을 바꾸지 못했어요. ({changePlace.error.message})
        </p>
      )}
    </div>
  );
}
