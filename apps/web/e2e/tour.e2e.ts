import { expect, test } from '@playwright/test';

// A browser that has never opened the app.
test.use({ storageState: { cookies: [], origins: [] } });

test('the tour shows once on the first visit and again from settings', async ({ page }) => {
  await page.goto('/');
  const tour = page.getByRole('dialog');
  await expect(tour.getByRole('heading', { name: '조건부터 골라도 돼요' })).toBeVisible();

  await tour.getByRole('button', { name: '다음' }).click();
  await expect(tour.getByRole('heading', { name: '돌리면 한 곳을 골라 줘요' })).toBeVisible();
  await tour.getByRole('button', { name: '이전' }).click();
  await expect(tour.getByRole('heading', { name: '조건부터 골라도 돼요' })).toBeVisible();

  for (let i = 0; i < 3; i += 1) await tour.getByRole('button', { name: '다음' }).click();
  await expect(tour.getByRole('heading', { name: '식당·기록·설정' })).toBeVisible();
  await tour.getByRole('button', { name: '시작하기' }).click();
  await expect(tour).toBeHidden();

  // Finished tours stay finished, and the page works again.
  await page.reload();
  await expect(page.getByRole('button', { name: '돌리기' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('link', { name: '설정' }).click();
  await page.getByRole('button', { name: '사용법 다시 보기' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('dialog').getByRole('heading', { name: '조건부터 골라도 돼요' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
