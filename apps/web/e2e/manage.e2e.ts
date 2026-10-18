import { expect, test, type Page } from '@playwright/test';

async function spin(page: Page) {
  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  await expect(page.getByRole('button', { name: '여기 갈래' })).toBeVisible({ timeout: 6_000 });
  return page.locator('section[aria-labelledby="result-name"]');
}

test('the walking filter only recommends places within 5 minutes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '도보 5분' }).click();
  await expect(page.getByRole('button', { name: '도보 5분' })).toHaveAttribute('aria-pressed', 'true');

  const card = await spin(page);
  const text = await card.getByText(/걸어서 약 \d+분/).innerText();
  expect(Number(text.match(/(\d+)분/)![1])).toBeLessThanOrEqual(5);
});

test('excluded categories never come up and the filter survives a reload', async ({ page }) => {
  await page.goto('/');
  const excludeRow = page.getByRole('group', { name: '빼고 싶은 메뉴' });
  await excludeRow.getByRole('button', { name: '한식' }).click();

  const card = await spin(page);
  await expect(card.locator('p').first()).not.toHaveText('한식');

  await page.reload();
  await expect(excludeRow.getByRole('button', { name: '한식' })).toHaveAttribute('aria-pressed', 'true');
});

test('favorite and hidden flags are saved per user', async ({ page }) => {
  await page.goto('/places');
  const first = page.getByRole('listitem').first();
  const name = await first.locator('p').first().innerText();

  // Reload only once both saves reached the server; under load a reload could cut the second one off.
  const saved = (response: { url(): string; request(): { method(): string } }) =>
    response.url().includes('/rest/v1/user_place_prefs') && response.request().method() === 'POST';
  await Promise.all([page.waitForResponse(saved), first.getByRole('button', { name: '즐겨찾기' }).click()]);
  await Promise.all([page.waitForResponse(saved), first.getByRole('button', { name: '숨기기' }).click()]);
  await page.reload();

  const row = page.getByRole('listitem').filter({ hasText: name.replace(/숨김$/, '').trim() });
  await expect(row.getByRole('button', { name: '즐겨찾기' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row.getByRole('button', { name: '숨김 해제' })).toHaveAttribute('aria-pressed', 'true');
});

test('the cooldown setting is saved', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('5영업일')).toBeVisible();
  await page.getByRole('button', { name: '하루 늘리기' }).click();
  await expect(page.getByText('6영업일')).toBeVisible();
  await page.reload();
  await expect(page.getByText('6영업일')).toBeVisible();
});

test('history shows 30-day stats after a meal is saved', async ({ page }) => {
  await page.goto('/');
  const card = await spin(page);
  const category = await card.locator('p').first().innerText();
  await page.getByRole('button', { name: '여기 갈래' }).click();
  await expect(page.getByText('오늘 점심으로 기록했어요.')).toBeVisible();

  await page.getByRole('link', { name: '기록' }).click();
  await expect(page.getByRole('heading', { name: '최근 30일, 1끼' })).toBeVisible();
  await expect(page.getByRole('list', { name: '카테고리 비율' })).toContainText(`${category}100%`);
});
