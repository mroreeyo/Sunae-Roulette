import { expect, test } from '@playwright/test';

// Each test gets a fresh browser context, so a new anonymous user with no history.
test('spin, accept, and see the meal in history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();

  await page.getByRole('button', { name: '돌리기' }).click();
  const accept = page.getByRole('button', { name: '여기 갈래' });
  await expect(accept).toBeVisible({ timeout: 6_000 });
  const pickedName = await page.locator('#result-name').innerText();

  await accept.click();
  await expect(page.getByText('오늘 점심으로 기록했어요.')).toBeVisible();
  await expect(page.getByRole('link', { name: '카카오맵 길찾기' })).toHaveAttribute('href', /map\.kakao\.com\/link\/to\//);
  await expect(page.getByRole('link', { name: '네이버 지도' })).toHaveAttribute('href', /map\.naver\.com\/p\/search\//);

  await page.getByRole('link', { name: '기록' }).click();
  await expect(page.getByRole('list', { name: '식사 목록' }).getByRole('listitem').filter({ hasText: pickedName })).toBeVisible();
});

test('rerolling never shows the skipped place again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '돌리기' }).click();
  await expect(page.getByRole('button', { name: '다시 돌리기' })).toBeVisible({ timeout: 6_000 });
  const first = await page.locator('#result-name').innerText();

  await page.getByRole('button', { name: '다시 돌리기' }).click();
  await expect(page.getByRole('button', { name: '다시 돌리기' })).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('#result-name')).not.toHaveText(first);
});
