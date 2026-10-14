import { expect, test } from '@playwright/test';

test('spinning works offline and the meal is saved once the connection returns', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  const accept = page.getByRole('button', { name: '여기 갈래' });
  await expect(accept).toBeVisible({ timeout: 6_000 });
  await accept.click();
  await expect(page.getByText('지금은 오프라인이에요. 연결되면 바로 기록할게요.')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('오늘 점심으로 기록했어요.')).toBeVisible({ timeout: 10_000 });
});

test('after a reload with the API unreachable, the cached places still drive the roulette', async ({ page }) => {
  await page.goto('/');
  const subtitle = page.getByText(/반경 500m · \d+곳/);
  await expect(subtitle).toBeVisible();
  const countText = await subtitle.innerText();
  // The cache is written with a 1s throttle.
  await page.waitForTimeout(1_500);

  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByText(countText)).toBeVisible();
  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  await expect(page.getByRole('button', { name: '여기 갈래' })).toBeVisible({ timeout: 6_000 });
});
