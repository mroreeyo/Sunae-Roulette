import { distanceMeters, walkMinutes } from '@lunch/core';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { emptyPref, useAppConfig, usePlaces, usePrefs, useSetPref } from '../features/data/queries.ts';
import { AddPlaceForm } from '../features/places/AddPlaceForm.tsx';
import { CATEGORIES, TAGS } from '../features/places/vocabulary.ts';
import { Chip } from '../features/ui/Chip.tsx';

const ALL = '전체';

const smallButton =
  'min-h-11 rounded-full px-3.5 text-[14px] font-semibold ring-1 transition-[transform,background-color,color] duration-200 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function Places() {
  const searchId = useId();
  const config = useAppConfig();
  const places = usePlaces();
  const prefs = usePrefs();
  const setPref = useSetPref();

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [category, setCategory] = useState<string>(ALL);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const prefById = useMemo(() => new Map((prefs.data ?? []).map((p) => [p.placeId, p])), [prefs.data]);

  const rows = useMemo(() => {
    if (!places.data || !config.data) return [];
    const base = config.data.base;
    return places.data
      .map((place) => ({
        place,
        minutes: place.lat === null || place.lng === null ? null : walkMinutes(distanceMeters(base, { lat: place.lat, lng: place.lng })),
      }))
      .filter(({ place }) => (category === ALL || place.category === category) && place.name.includes(deferredQuery))
      .sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity) || a.place.name.localeCompare(b.place.name, 'ko'));
  }, [places.data, config.data, category, deferredQuery]);

  const presentCategories = useMemo(
    () => CATEGORIES.filter((c) => places.data?.some((p) => p.category === c)),
    [places.data],
  );

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="flex items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">식당 목록</h1>
          <p className="mt-1 text-[15px] text-ink-muted">
            {places.data ? `${places.data.length}곳, 걸어서 가까운 순` : '불러오는 중'}
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-11 shrink-0 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.97]"
          >
            직접 추가
          </button>
        )}
      </header>

      {adding && <AddPlaceForm onDone={() => setAdding(false)} />}

      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="text-[14px] font-semibold">
          식당 이름으로 찾기
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 w-full rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line focus:outline-2 focus:outline-accent"
          autoComplete="off"
        />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="카테고리">
        {[ALL, ...presentCategories].map((c) => (
          <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      {places.isPending || config.isPending ? (
        <ul className="flex flex-col gap-2" aria-label="불러오는 중">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-[88px] animate-pulse rounded-3xl bg-surface-2" />
          ))}
        </ul>
      ) : places.isError ? (
        <p role="alert" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          식당을 불러오지 못했어요. ({places.error.message})
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-3xl bg-surface p-5 text-[15px] text-ink-muted ring-1 ring-line">
          조건에 맞는 식당이 없어요. 검색어나 카테고리를 바꿔 보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ place, minutes }) => {
            const pref = prefById.get(place.id) ?? emptyPref(place.id);
            const open = expanded === place.id;
            return (
              <li
                key={place.id}
                className={`rounded-3xl bg-surface px-5 py-4 ring-1 ring-line transition-opacity duration-200 ${pref.isHidden ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold break-keep">
                      {place.name}
                      {pref.isHidden && <span className="ml-2 text-[13px] font-medium text-ink-muted">숨김</span>}
                    </p>
                    <p className="mt-0.5 text-[14px] text-ink-muted">
                      {place.category} · {minutes === null ? '위치 정보 없음' : `걸어서 약 ${Math.max(1, Math.round(minutes))}분`}
                    </p>
                    {pref.tags.length > 0 && (
                      <p className="mt-1 text-[13px] font-medium text-accent-ink">{pref.tags.join(', ')}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={pref.isFavorite}
                    onClick={() => setPref.mutate({ placeId: place.id, patch: { isFavorite: !pref.isFavorite } })}
                    className={`${smallButton} ${pref.isFavorite ? 'bg-accent text-on-accent ring-accent' : 'bg-surface text-ink ring-line'}`}
                  >
                    즐겨찾기
                  </button>
                  <button
                    type="button"
                    aria-pressed={pref.isHidden}
                    onClick={() => setPref.mutate({ placeId: place.id, patch: { isHidden: !pref.isHidden } })}
                    className={`${smallButton} ${pref.isHidden ? 'bg-surface-2 text-ink ring-line' : 'bg-surface text-ink ring-line'}`}
                  >
                    {pref.isHidden ? '숨김 해제' : '숨기기'}
                  </button>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : place.id)}
                    className={`${smallButton} bg-surface text-ink-muted ring-line`}
                  >
                    태그
                  </button>
                </div>
                {open && (
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`${place.name} 태그`}>
                    {TAGS.map((tag) => {
                      const on = pref.tags.includes(tag);
                      return (
                        <Chip
                          key={tag}
                          pressed={on}
                          onClick={() =>
                            setPref.mutate({
                              placeId: place.id,
                              patch: { tags: on ? pref.tags.filter((t) => t !== tag) : [...pref.tags, tag] },
                            })
                          }
                        >
                          {tag}
                        </Chip>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {setPref.isError && (
        <p role="alert" className="text-[14px] text-accent-ink">
          변경을 저장하지 못했어요. ({setPref.error.message})
        </p>
      )}

      <p className="text-[12px] leading-relaxed text-ink-muted">
        식당 정보: 행정안전부 공공데이터(일반음식점·휴게음식점 인허가 정보). 폐업이 늦게 반영될 수 있어요.
      </p>
    </div>
  );
}
