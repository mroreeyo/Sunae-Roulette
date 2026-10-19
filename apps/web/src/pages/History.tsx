import { mealStats, toSeoulDate } from '@lunch/core';
import { useMemo, useState } from 'react';
import { useDeleteMeal, useRecentMeals } from '../features/data/queries.ts';
import { MealPlaceEditor } from '../features/history/MealPlaceEditor.tsx';
import { CATEGORY_COLORS } from '../features/places/vocabulary.ts';
import { CategoryBadge } from '../features/ui/CategoryBadge.tsx';

const rowButton =
  'min-h-11 shrink-0 rounded-full px-3 text-[14px] text-ink-muted transition-transform duration-200 ease-soft active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

export default function History() {
  const meals = useRecentMeals();
  const deleteMeal = useDeleteMeal();
  const stats = useMemo(() => (meals.data ? mealStats(meals.data, toSeoulDate(new Date())) : null), [meals.data]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="pt-2">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.035em]">식사 기록</h1>
        <p className="mt-1 text-[15px] text-ink-muted">최근 45일</p>
        {/* Always rendered so screen readers pick up each new notice. */}
        <p role="status" className="text-[14px] font-semibold text-accent-ink not-empty:mt-2">
          {notice}
        </p>
      </header>

      {meals.isPending ? (
        <ul className="flex flex-col gap-2" aria-label="불러오는 중">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[72px] animate-pulse rounded-3xl bg-surface-2" />
          ))}
        </ul>
      ) : meals.isError ? (
        <p role="alert" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          기록을 불러오지 못했어요. ({meals.error.message})
        </p>
      ) : meals.data.length === 0 ? (
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <p className="font-semibold">아직 기록이 없어요.</p>
          <p className="mt-1 text-[14px] text-ink-muted">룰렛에서 “여기 갈래”를 누르면 여기에 쌓여요.</p>
        </div>
      ) : (
        <>
        {stats && stats.total > 0 && (
          <section aria-labelledby="stats-title" className="rounded-3xl bg-surface p-5 ring-1 ring-line">
            <h2 id="stats-title" className="text-[17px] font-bold">
              최근 30일, {stats.total}끼
            </h2>
            <ul className="mt-4 flex flex-col gap-3" aria-label="카테고리 비율">
              {stats.categories.map((c) => (
                <li key={c.category} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-[14px]">
                  <span className="font-semibold">{c.category}</span>
                  <span
                    className="h-2.5 rounded-full"
                    style={{ width: `${Math.max(c.ratio * 100, 4)}%`, background: CATEGORY_COLORS[c.category] ?? 'var(--ink-muted)' }}
                  />
                  <span className="text-right text-ink-muted tabular-nums">{Math.round(c.ratio * 100)}%</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-5 text-[15px] font-bold">자주 간 곳</h3>
            <ol className="mt-2 flex flex-col gap-1.5 text-[14px]">
              {stats.topPlaces.map((p, i) => (
                <li key={p.placeId} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="mr-2 font-extrabold text-ink-muted tabular-nums">{i + 1}</span>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-ink-muted tabular-nums">{p.count}번</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <ul className="flex flex-col gap-2" aria-label="식사 목록">
          {meals.data.map((meal) => {
            const date = formatDate(meal.eatenOn);
            const editing = editingId === meal.id;
            return (
              <li key={meal.id} className="rounded-3xl bg-surface px-5 py-3 ring-1 ring-line">
                <div className="flex min-h-12 items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] text-ink-muted">
                      {date}
                      <CategoryBadge category={meal.category} />
                    </p>
                    <p className="mt-0.5 truncate text-[16px] font-semibold">{meal.name}</p>
                  </div>
                  <button
                    type="button"
                    className={rowButton}
                    aria-label={`${date} ${meal.name} 기록 수정${editing ? ' 닫기' : ''}`}
                    aria-expanded={editing}
                    onClick={() => {
                      setNotice('');
                      setEditingId(editing ? null : meal.id);
                    }}
                  >
                    {editing ? '닫기' : '수정'}
                  </button>
                  <button
                    type="button"
                    className={rowButton}
                    aria-label={`${date} ${meal.name} 기록 삭제`}
                    disabled={deleteMeal.isPending}
                    onClick={() => {
                      if (!window.confirm(`${meal.name} 기록을 지울까요?`)) return;
                      deleteMeal.mutate(meal.id, { onSuccess: () => setNotice(`${date} 기록을 지웠어요.`) });
                    }}
                  >
                    삭제
                  </button>
                </div>
                {editing && (
                  <MealPlaceEditor
                    meal={meal}
                    onChanged={() => {
                      setEditingId(null);
                      setNotice(`${date} 기록을 바꿨어요.`);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </div>
  );
}
