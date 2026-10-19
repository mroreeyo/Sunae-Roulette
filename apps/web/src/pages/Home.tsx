import { buildWheel, recommend, toSeoulDate, type Candidate } from '@lunch/core';
import { useReducedMotion } from 'motion/react';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { BackdropMode } from '../features/backdrop/SunaeBackdrop.tsx';
import {
  useAppConfig,
  useCooldownDays,
  usePlaces,
  usePrefs,
  useRecentMeals,
  useSaveMeal,
  useSession,
  type PlaceRow,
} from '../features/data/queries.ts';
import { TodaysRooms } from '../features/room/TodaysRooms.tsx';
import { FailedSaveNotices } from '../features/roulette/FailedSaveNotices.tsx';
import { FilterBar } from '../features/roulette/FilterBar.tsx';
import { ResultCard } from '../features/roulette/ResultCard.tsx';
import { RouletteWheel, rotationFor, WheelSkeleton } from '../features/roulette/RouletteWheel.tsx';
import { hasActiveFilters, toCoreFilters, useFilters } from '../stores/filterStore.ts';
import { useRouletteSession } from '../stores/rouletteSessionStore.ts';

// three.js lives in its own chunk so the first screen stays within the bundle budget.
const SunaeBackdrop = lazy(() => import('../features/backdrop/SunaeBackdrop.tsx'));
const BACKDROP_SRC = '/images/sunae-overpass.jpg';

type PlaceCandidate = Candidate & { place: PlaceRow };

type Outcome =
  | { kind: 'idle' }
  | { kind: 'spinning'; wheel: PlaceCandidate[]; pickIndex: number }
  | { kind: 'result'; wheel: PlaceCandidate[]; pickIndex: number; saved: boolean }
  | { kind: 'exhausted' }
  | { kind: 'no-match' };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const primaryButton =
  'inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-accent px-6 text-[17px] font-extrabold text-on-accent transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function Home() {
  const session = useSession();
  const config = useAppConfig();
  const places = usePlaces();
  const prefs = usePrefs();
  const meals = useRecentMeals();
  const cooldown = useCooldownDays();
  const saveMeal = useSaveMeal();
  const { skippedIds, spinCount, firstSpinAt, recordSpin, skip, clearSkipped, reset } = useRouletteSession();

  const filters = useFilters();
  const filtersActive = hasActiveFilters(filters);
  const reduceMotion = useReducedMotion() ?? false;
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const rotation = useRef(0);
  const [rotationValue, setRotationValue] = useState(0);
  // With a result on screen the filters fold into one line until asked for.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const today = toSeoulDate(new Date());
  const todaysMeal = meals.data?.find((m) => m.eatenOn === today);
  const ready = config.isSuccess && places.isSuccess && prefs.isSuccess && meals.isSuccess && cooldown.isSuccess;
  // With cached data the roulette still works, so errors only matter when nothing is loaded.
  const loadError = ready
    ? null
    : (session.error ?? config.error ?? places.error ?? prefs.error ?? meals.error ?? cooldown.error);

  const idleLabels = useMemo(() => (places.data ?? []).slice(0, 8).map((p) => p.name), [places.data]);

  function spin(excluded: string[]) {
    if (!places.data || !meals.data || !prefs.data || cooldown.data === undefined || !config.data) return;
    const placeById = new Map(places.data.map((p) => [p.id, p]));
    const result = recommend({
      places: places.data,
      meals: meals.data,
      prefs: prefs.data,
      filters: toCoreFilters(filters),
      sessionExcludedIds: excluded,
      today,
      cooldownDays: cooldown.data,
      base: config.data.base,
      rng: Math.random,
    });
    if (result.status !== 'ok') {
      setOutcome({ kind: result.status });
      return;
    }
    const wheel = shuffle(buildWheel(result)).map((c) => ({ ...c, place: placeById.get(c.place.id)! }));
    const pickIndex = wheel.findIndex((c) => c.place.id === result.pick.place.id);
    rotation.current = rotationFor(pickIndex, wheel.length, rotation.current);
    setRotationValue(rotation.current);
    recordSpin();
    setFiltersOpen(false);
    setOutcome({ kind: 'spinning', wheel, pickIndex });
  }

  function reroll() {
    if (outcome.kind !== 'result') return;
    const skippedNow = [...skippedIds, outcome.wheel[outcome.pickIndex]!.place.id];
    skip(outcome.wheel[outcome.pickIndex]!.place.id);
    spin(skippedNow);
  }

  function restart() {
    clearSkipped();
    spin([]);
  }

  function accept() {
    if (outcome.kind !== 'result') return;
    const pick = outcome.wheel[outcome.pickIndex]!;
    saveMeal.mutate(
      {
        placeId: pick.place.id,
        eatenOn: toSeoulDate(new Date()),
        spinCount: Math.max(spinCount, 1),
        decisionSeconds: firstSpinAt ? Math.round((Date.now() - firstSpinAt) / 1000) : 0,
      },
      {
        onSuccess: () => {
          setOutcome({ ...outcome, saved: true });
          reset();
        },
      },
    );
  }

  const wheelLabels = outcome.kind === 'spinning' || outcome.kind === 'result' ? outcome.wheel.map((c) => c.place.name) : idleLabels;
  const pick = outcome.kind === 'result' ? outcome.wheel[outcome.pickIndex]! : null;
  const spinning = outcome.kind === 'spinning';
  const backdropMode: BackdropMode = spinning ? 'spinning' : outcome.kind === 'result' ? 'settled' : 'idle';
  // Once a place is picked the photo header and the wheel shrink, so the result and its buttons
  // fit the first screen.
  const compact = outcome.kind === 'result';

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header
        className={`relative isolate -mx-4 -mt-4 flex flex-col justify-end overflow-hidden px-5 motion-safe:transition-[height] motion-safe:duration-500 motion-safe:ease-soft ${
          compact ? 'h-[112px] pb-3.5' : 'h-[260px] pb-6'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 opacity-70 saturate-[0.7]">
            <Suspense fallback={null}>
              <SunaeBackdrop src={BACKDROP_SRC} mode={backdropMode} reduceMotion={reduceMotion} />
            </Suspense>
          </div>
          {/* The photo fades into the page, so the heading reads on any part of it. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--bg)_35%,transparent)_0%,color-mix(in_oklab,var(--bg)_62%,transparent)_55%,var(--bg)_100%)]" />
        </div>
        <h1
          className={`font-extrabold tracking-[-0.035em] ${compact ? 'text-[26px] leading-tight' : 'text-[38px] leading-[1.12]'}`}
        >
          <span className={compact ? undefined : 'block'}>수내에서</span> 뭐먹을까?
        </h1>
        <p className="mt-1 text-[14px] font-semibold text-ink/80">
          {config.data ? `${config.data.baseName} 반경 ${config.data.radiusM}m` : '주변 식당을 불러오는 중'}
          {places.data ? ` · ${places.data.length}곳` : ''}
        </p>
      </header>

      <FailedSaveNotices />

      <TodaysRooms />

      {todaysMeal && outcome.kind !== 'result' && (
        <p className="rounded-[18px] bg-surface-2 px-4 py-3 text-[14px] font-medium">
          오늘은 {todaysMeal.name}에서 먹었어요. 다시 고르면 기록이 바뀌어요.
        </p>
      )}

      <FilterBar disabled={spinning} collapsed={compact && !filtersOpen} onExpand={() => setFiltersOpen(true)} />

      {loadError ? (
        <div role="alert" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-semibold">식당 정보를 불러오지 못했어요.</p>
          <p className="mt-1 text-[14px] text-ink-muted">{loadError.message}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => window.location.reload()}>
            다시 불러오기
          </button>
        </div>
      ) : !ready ? (
        <WheelSkeleton />
      ) : places.data.length === 0 ? (
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-semibold">아직 등록된 식당이 없어요.</p>
          <p className="mt-1 text-[14px] text-ink-muted">공공데이터를 가져온 뒤 다시 열어 주세요.</p>
        </div>
      ) : (
        <RouletteWheel
          labels={wheelLabels}
          rotation={rotationValue}
          size={compact ? 184 : 280}
          highlightIndex={outcome.kind === 'result' ? outcome.pickIndex : null}
          onSpinEnd={() =>
            setOutcome((o) => (o.kind === 'spinning' ? { kind: 'result', wheel: o.wheel, pickIndex: o.pickIndex, saved: false } : o))
          }
        />
      )}

      <div aria-live="polite" className="sr-only">
        {pick ? `추천 식당은 ${pick.place.name}, ${pick.place.category}입니다.` : ''}
      </div>

      {pick && outcome.kind === 'result' && (
        <ResultCard
          key={`${pick.place.id}-${rotationValue}`}
          candidate={pick}
          origin={config.data!}
          saved={outcome.saved}
          saving={saveMeal.isPending}
          waitingForNetwork={saveMeal.isPaused}
          saveError={saveMeal.error?.message ?? null}
          onAccept={accept}
          onReroll={reroll}
        />
      )}

      {outcome.kind === 'exhausted' && (
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-semibold">후보를 모두 넘겼어요.</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={restart}>
            처음부터 다시
          </button>
        </div>
      )}

      {outcome.kind === 'no-match' && (
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-semibold">조건에 맞는 곳이 없어요.</p>
          {filtersActive ? (
            <button
              type="button"
              className={`${primaryButton} mt-4`}
              onClick={() => {
                filters.clear();
                setOutcome({ kind: 'idle' });
              }}
            >
              필터 해제
            </button>
          ) : (
            <p className="mt-1 text-[14px] text-ink-muted">숨긴 식당을 다시 보이게 하거나 쿨다운을 줄여 보세요.</p>
          )}
        </div>
      )}

      {/* Holds the spin button's place, so the link below stays put when the places arrive. */}
      {!ready && !loadError && (
        <button type="button" className={primaryButton} disabled>
          식당 불러오는 중
        </button>
      )}

      {ready &&
        places.data.length > 0 &&
        (outcome.kind === 'idle' ||
          outcome.kind === 'spinning' ||
          (outcome.kind === 'result' && outcome.saved) ||
          outcome.kind === 'no-match') && (
        <button type="button" className={primaryButton} onClick={() => spin(skippedIds)} disabled={spinning}>
          {spinning ? '돌리는 중' : outcome.kind === 'result' ? '한 번 더 돌리기' : '돌리기'}
        </button>
      )}

      <Link
        to="/rooms/new"
        className="flex items-center gap-3.5 rounded-3xl bg-surface px-5 py-4 ring-1 ring-line transition-transform duration-200 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-ink-muted">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 19c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" />
          <circle cx="17" cy="9" r="2.6" />
          <path d="M16.5 13.6c2.6.2 4.5 2.2 4.5 4.9" />
        </svg>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-bold">팀이랑 투표로 정하기</span>
          <span className="text-[13px] text-ink-muted">후보 3곳으로 링크 투표를 열어요</span>
        </span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-ink-muted">
          <path d="M9 5 L16 12 L9 19" />
        </svg>
      </Link>
    </div>
  );
}
