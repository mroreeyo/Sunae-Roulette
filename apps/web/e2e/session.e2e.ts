import { expect, test } from '@playwright/test';

/*
 * Production, 2026-10-16: on an iPhone opened from the QR code, sign-up and the first reads
 * succeeded, then "여기 갈래" reached the server without the user's token and RLS rejected it
 * (401). supabase-js reads the session from localStorage before every request and quietly falls
 * back to the anon key when the read comes back empty. This simulates a browser that loses the
 * stored session a moment after sign-up.
 */
test('a meal is still saved when the browser loses the stored session after sign-up', async ({ page }) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    let dropAfter = Infinity;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const value = getItem.call(this, key);
        if (value !== null && dropAfter === Infinity) dropAfter = Date.now() + 1_500;
        if (Date.now() > dropAfter) return null;
        return value;
      }
      return getItem.call(this, key);
    };
  });

  const saves: number[] = [];
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && response.url().includes('/rest/v1/meals')) saves.push(response.status());
  });

  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();
  await page.waitForTimeout(2_000);

  await page.getByRole('button', { name: '돌리기', exact: true }).click();
  await expect(page.getByRole('button', { name: '여기 갈래' })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('button', { name: '여기 갈래' }).click();

  await expect(page.getByText('오늘 점심으로 기록했어요.')).toBeVisible();
  expect(saves).not.toContain(401);
});
