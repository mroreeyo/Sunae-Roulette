import { expect, test, type Page } from '@playwright/test';

type SupabaseModule = typeof import('../src/lib/supabase.ts');
type QueryClientModule = typeof import('../src/lib/queryClient.ts');

/** Seoul calendar date `days` days ago, as YYYY-MM-DD. */
function seoulDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/**
 * Inserts a meal through the page's own signed-in Supabase client, which the Vite dev
 * server serves as a module. The UI only records today's meal, so this is how a test
 * gets a past one. Call it after the page has finished signing in. The app's meal list
 * is then invalidated, since a reload would restore the still-fresh persisted cache.
 */
async function seedMeal(page: Page, placeName: string, eatenOn: string): Promise<void> {
  await page.evaluate(
    async ({ placeName, eatenOn }) => {
      const modulePath = '/src/lib/supabase.ts';
      const { supabase } = (await import(/* @vite-ignore */ modulePath)) as SupabaseModule;
      const { data: place, error } = await supabase.from('places').select('id').eq('name', placeName).limit(1).single();
      if (error) throw error;
      const { error: insertError } = await supabase
        .from('meals')
        .insert({ place_id: place.id, eaten_on: eatenOn, spin_count: 1, decision_seconds: 20 });
      if (insertError) throw insertError;
      const clientPath = '/src/lib/queryClient.ts';
      const { queryClient } = (await import(/* @vite-ignore */ clientPath)) as QueryClientModule;
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
    },
    { placeName, eatenOn },
  );
}

/** Two active place names where neither appears inside any other name, so a search finds exactly one. */
async function twoDistinctPlaces(page: Page): Promise<[string, string]> {
  return page.evaluate(async () => {
    const modulePath = '/src/lib/supabase.ts';
    const { supabase } = (await import(/* @vite-ignore */ modulePath)) as SupabaseModule;
    const { data, error } = await supabase.from('places').select('name').eq('is_active', true).eq('source', 'public');
    if (error) throw error;
    const names: string[] = data.map((p: { name: string }) => p.name);
    const distinct = names.filter((name) => names.filter((other) => other.includes(name)).length === 1);
    if (distinct.length < 2) throw new Error('Need at least two distinctly named places');
    return [distinct[0]!, distinct[1]!];
  });
}

test('a past meal can be moved to the place you actually went to', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByText('아직 기록이 없어요.')).toBeVisible();
  const [recorded, actual] = await twoDistinctPlaces(page);
  await seedMeal(page, recorded, seoulDateDaysAgo(2));

  const meals = page.getByRole('list', { name: '식사 목록' });
  const row = meals.getByRole('listitem').filter({ hasText: recorded });
  await row.getByRole('button', { name: /기록 수정$/ }).click();
  await row.getByRole('searchbox', { name: '바꿀 식당 찾기' }).fill(actual);
  await row.getByRole('list', { name: '찾은 식당' }).getByRole('button').filter({ hasText: actual }).click();

  await expect(page.getByRole('status')).toHaveText(/기록을 바꿨어요\.$/);
  await expect(meals).toContainText(actual);
  await expect(meals).not.toContainText(recorded);

  // The server has the new place, and the corrected meal no longer counts toward the roulette metrics.
  const saved = await page.evaluate(async () => {
    const modulePath = '/src/lib/supabase.ts';
    const { supabase } = (await import(/* @vite-ignore */ modulePath)) as SupabaseModule;
    const { data, error } = await supabase.from('meals').select('spin_count, decision_seconds, places(name)').single();
    if (error) throw error;
    return data;
  });
  expect(saved).toEqual({ spin_count: null, decision_seconds: null, places: { name: actual } });
});

test('the meal editor points to adding a place when nothing matches', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByText('아직 기록이 없어요.')).toBeVisible();
  const [recorded] = await twoDistinctPlaces(page);
  await seedMeal(page, recorded, seoulDateDaysAgo(1));

  const row = page.getByRole('list', { name: '식사 목록' }).getByRole('listitem').filter({ hasText: recorded });
  await row.getByRole('button', { name: /기록 수정$/ }).click();
  await row.getByRole('searchbox', { name: '바꿀 식당 찾기' }).fill('없는식당이름zz');
  await expect(row.getByText('찾는 식당이 없어요.')).toBeVisible();
  await row.getByRole('link', { name: '식당 목록에서 직접 추가' }).click();
  await expect(page).toHaveURL(/\/places$/);
});

test('only the person who added a place can edit or delete it, and its meals stay', async ({ page, browser }) => {
  // Unique even when copies of this test run in parallel within the same millisecond.
  const name = `e2e 국수집 ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const renamed = `${name} 2호점`;

  await page.goto('/places');
  await page.getByRole('button', { name: '직접 추가' }).click();
  await page.getByRole('textbox', { name: '식당 이름' }).fill(name);
  await page.getByRole('combobox', { name: '카테고리' }).selectOption('분식');
  await page.getByRole('button', { name: '추가하기' }).click();

  const search = page.getByRole('searchbox', { name: '식당 이름으로 찾기' });
  await search.fill(name);
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('내가 추가');

  // Someone else sees the place but gets no edit button.
  const other = await (await browser.newContext()).newPage();
  await other.goto('/places');
  await other.getByRole('searchbox', { name: '식당 이름으로 찾기' }).fill(name);
  const otherRow = other.getByRole('listitem').filter({ hasText: name });
  await expect(otherRow).toContainText('사용자 추가');
  await expect(otherRow.getByRole('button', { name: '즐겨찾기' })).toBeVisible();
  await expect(otherRow.getByRole('button', { name: '수정' })).toHaveCount(0);
  await other.context().close();

  // The owner renames it and changes its category.
  await row.getByRole('button', { name: '수정' }).click();
  await row.getByRole('textbox', { name: '식당 이름' }).fill(renamed);
  await row.getByRole('combobox', { name: '카테고리' }).selectOption('한식');
  await row.getByRole('button', { name: '저장하기' }).click();
  await expect(page.getByRole('status')).toHaveText(`“${renamed}” 정보를 고쳤어요.`);
  const renamedRow = page.getByRole('listitem').filter({ hasText: renamed });
  await expect(renamedRow).toContainText('한식 · 위치 정보 없음');

  // A meal at the place, then the place is deleted: it leaves the list but stays in history.
  await seedMeal(page, renamed, seoulDateDaysAgo(3));
  await renamedRow.getByRole('button', { name: '수정' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await renamedRow.getByRole('button', { name: '이 식당 지우기' }).click();
  await expect(page.getByRole('status')).toHaveText(`“${renamed}” 식당을 지웠어요.`);
  await expect(page.getByText('조건에 맞는 식당이 없어요.')).toBeVisible();

  await page.getByRole('link', { name: '기록' }).click();
  await expect(page.getByRole('list', { name: '식사 목록' })).toContainText(renamed);
});
