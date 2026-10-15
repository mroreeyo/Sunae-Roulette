import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/** Opens the app, goes offline and accepts a pick, leaving its save waiting for the connection. */
async function acceptPickOffline(page: Page, context: BrowserContext): Promise<string> {
  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  const accept = page.getByRole('button', { name: '여기 갈래' });
  await expect(accept).toBeVisible({ timeout: 6_000 });
  const pickedName = await page.locator('#result-name').innerText();
  await accept.click();
  await expect(page.getByText('지금은 오프라인이에요. 연결되면 바로 기록할게요.')).toBeVisible();
  return pickedName;
}

/** Accepts a pick while offline, waits until the queued save is persisted, then closes the tab. */
async function queueSaveOfflineAndClose(page: Page, context: BrowserContext): Promise<string> {
  const pickedName = await acceptPickOffline(page, context);
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
  return pickedName;
}

/** Makes every meal save on the page fail as if the request got no response; returns the attempt count. */
async function failMealSaves(page: Page): Promise<() => number> {
  let attempts = 0;
  await page.route(
    (url) => url.pathname === '/rest/v1/meals',
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      attempts += 1;
      return route.abort('internetdisconnected');
    },
  );
  return () => attempts;
}

/** Reopens the app with every meal save failing as if the request got no response. */
async function reopenWithSavesFailing(context: BrowserContext): Promise<{ page: Page; saveAttempts: () => number }> {
  const page = await context.newPage();
  const saveAttempts = await failMealSaves(page);
  await page.goto('/');
  return { page, saveAttempts };
}

const failedSaveNotice = (page: Page) => page.getByRole('alert').filter({ hasText: '오늘 점심을 기록하지 못했어요.' });

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
  const pickedName = await queueSaveOfflineAndClose(page, context);

  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeVisible();
  await reopened.getByRole('link', { name: '기록' }).click();
  await expect(reopened.getByRole('list', { name: '식사 목록' }).getByRole('listitem').filter({ hasText: pickedName })).toBeVisible();
});

test('a resumed save that fails is reported on the home screen, survives a reload and can be sent again', async ({ page, context }) => {
  const pickedName = await queueSaveOfflineAndClose(page, context);

  const { page: reopened, saveAttempts } = await reopenWithSavesFailing(context);
  const notice = failedSaveNotice(reopened);
  // Three attempts, one and then two seconds apart, before the save gives up.
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice).toContainText(pickedName);
  expect(saveAttempts()).toBe(3);
  await expect(reopened.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeHidden();

  await reopened.reload();
  await expect(notice).toBeVisible();
  expect(saveAttempts()).toBe(3);

  await reopened.unrouteAll();
  await notice.getByRole('button', { name: '다시 기록하기' }).click();
  await expect(reopened.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeVisible();
  await expect(notice).toBeHidden();
  await reopened.reload();
  await expect(reopened.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeVisible();
  await expect(notice).toBeHidden();
});

test('a failed resumed save can be dismissed and stays dismissed after a reload', async ({ page, context }) => {
  await queueSaveOfflineAndClose(page, context);

  const { page: reopened } = await reopenWithSavesFailing(context);
  const notice = failedSaveNotice(reopened);
  await expect(notice).toBeVisible({ timeout: 15_000 });

  await notice.getByRole('button', { name: '닫기' }).click();
  await expect(notice).toBeHidden();
  await reopened.reload();
  await expect(reopened.getByText(/반경 500m · \d+곳/)).toBeVisible();
  await expect(notice).toBeHidden();
});

test('a save that fails after leaving the home screen is reported on return and survives a reload', async ({ page, context }) => {
  const pickedName = await acceptPickOffline(page, context);
  await page.getByRole('link', { name: '기록' }).click();
  await expect(page.getByRole('heading', { name: '식사 기록' })).toBeVisible();

  const saveAttempts = await failMealSaves(page);
  await context.setOffline(false);
  // Three attempts, one and then two seconds apart, before the save gives up.
  await expect.poll(saveAttempts, { timeout: 15_000 }).toBe(3);

  await page.getByRole('link', { name: '룰렛' }).click();
  const notice = failedSaveNotice(page);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(`룰렛 화면을 떠난 사이에 보낸 ${pickedName} 기록이 저장되지 않았어요.`);
  await expect(notice).toHaveCount(1);
  await expect(page.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeHidden();

  await page.reload();
  await expect(notice).toBeVisible();
  expect(saveAttempts()).toBe(3);

  await page.unrouteAll();
  await notice.getByRole('button', { name: '다시 기록하기' }).click();
  await expect(page.getByText(`오늘은 ${pickedName}에서 먹었어요.`)).toBeVisible();
  await expect(notice).toBeHidden();
});

test('a save that fails on the home screen is reported on its result card only', async ({ page, context }) => {
  await acceptPickOffline(page, context);
  const saveAttempts = await failMealSaves(page);
  await context.setOffline(false);

  await expect(page.getByText(/^기록하지 못했어요\. 연결을 확인하고 다시 눌러 주세요\./)).toBeVisible({ timeout: 15_000 });
  expect(saveAttempts()).toBe(3);
  await expect(failedSaveNotice(page)).toBeHidden();
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
