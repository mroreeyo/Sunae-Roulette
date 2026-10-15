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

test('a meal accepted offline is saved when the app is reopened online after the tab was closed', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  const accept = page.getByRole('button', { name: '여기 갈래' });
  await expect(accept).toBeVisible({ timeout: 6_000 });
  const pickedName = await page.locator('#result-name').innerText();
  await accept.click();
  await expect(page.getByText('지금은 오프라인이에요. 연결되면 바로 기록할게요.')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const cache = JSON.parse(localStorage.getItem('lunch-query-cache') ?? '{}') as {
          clientState?: { mutations?: unknown[] };
        };
        return cache.clientState?.mutations?.length ?? 0;
      }),
    )
    .toBe(1);
  await page.close();

  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeVisible();
  await reopened.getByRole('link', { name: '기록' }).click();
  await expect(reopened.getByRole('list', { name: '식사 목록' }).getByRole('listitem').filter({ hasText: pickedName })).toBeVisible();
});

test('a meal saved right before a reload is shown after the reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();

  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  const accept = page.getByRole('button', { name: '여기 갈래' });
  await expect(accept).toBeVisible({ timeout: 6_000 });
  const pickedName = await page.locator('#result-name').innerText();
  await accept.click();
  await expect(page.getByText('오늘 점심으로 기록했어요.')).toBeVisible();

  // Reload at once, well inside the persister's write throttle.
  await page.reload();
  await expect(page.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeVisible();
  await page.getByRole('link', { name: '기록' }).click();
  await expect(page.getByRole('list', { name: '식사 목록' }).getByRole('listitem').filter({ hasText: pickedName })).toBeVisible();
});

test('after a reload with the API unreachable, the cached places still drive the roulette', async ({ page }) => {
  await page.goto('/');
  const subtitle = page.getByText(/반경 500m · \d+곳/);
  await expect(subtitle).toBeVisible();
  const countText = await subtitle.innerText();

  // No wait for the throttled cache write: leaving the page writes the cache at once.
  await page.route('http://127.0.0.1:54321/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByText(countText)).toBeVisible();
  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  await expect(page.getByRole('button', { name: '여기 갈래' })).toBeVisible({ timeout: 6_000 });
});
