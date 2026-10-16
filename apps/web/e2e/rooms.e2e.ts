import { expect, test, type Page } from '@playwright/test';

// Needs the create-room Edge Function served locally (`pnpm functions:serve`).
type SupabaseModule = typeof import('../src/lib/supabase.ts');

function candidateRow(page: Page, name: string) {
  return page.getByRole('list', { name: '후보 목록' }).getByRole('listitem').filter({ hasText: name });
}

async function joinAs(page: Page, code: string, nickname: string) {
  await page.goto(`/r/${code}`);
  await page.getByRole('textbox', { name: '닉네임' }).fill(nickname);
  await page.getByRole('button', { name: '입장하기' }).click();
  await expect(page.getByRole('heading', { name: '오늘 점심 투표' })).toBeVisible();
}

test('two people vote in a room and each sees the other vote without reloading', async ({ page, browser }) => {
  await page.goto('/rooms/new');
  const candidates = page.getByRole('list', { name: '후보 목록' }).getByRole('listitem');
  await expect(candidates).toHaveCount(3);
  const second = (await candidates.nth(1).getByRole('paragraph').first().innerText()).trim();

  await page.getByRole('textbox', { name: '내 닉네임' }).fill('진행자');
  await page.getByRole('button', { name: '투표 방 만들기' }).click();
  await expect(page).toHaveURL(/\/r\/[A-HJKMNP-Z2-9]{8}$/);
  const code = page.url().split('/r/')[1]!;
  await expect(page.getByText(/마감 · .*남음/)).toBeVisible();

  const guest = await (await browser.newContext()).newPage();
  await joinAs(guest, code, '손님');
  await guest.getByRole('button', { name: `${second}에 투표` }).click();
  await expect(guest.getByRole('button', { name: `${second}에 투표` })).toHaveAttribute('aria-pressed', 'true');

  // The host sees the guest arrive and vote through Realtime.
  await expect(page.getByRole('list', { name: '참여한 사람' })).toContainText('손님');
  await expect(candidateRow(page, second)).toContainText('1표');

  await page.getByRole('button', { name: `${second}에 투표` }).click();
  await expect(candidateRow(guest, second)).toContainText('2표');
  await guest.context().close();
});

test('a room closes at its deadline and the winner lands in the voters history', async ({ page, browser }) => {
  // pg_cron closes due rooms once a minute.
  test.setTimeout(150_000);

  await page.goto('/');
  await expect(page.getByText(/반경 500m · \d+곳/)).toBeVisible();
  const { code, winner } = await page.evaluate(async () => {
    const modulePath = '/src/lib/supabase.ts';
    const { supabase } = (await import(/* @vite-ignore */ modulePath)) as SupabaseModule;
    const preview = await supabase.functions.invoke('create-room', { body: { preview: true } });
    if (preview.error) throw preview.error;
    const candidates = (preview.data as { candidates: { place_id: string; name: string }[] }).candidates;
    const created = await supabase.functions.invoke('create-room', {
      body: {
        place_ids: candidates.map((c) => c.place_id),
        nickname: '진행자',
        deadline_at: new Date(Date.now() + 20_000).toISOString(),
      },
    });
    if (created.error) throw created.error;
    return { code: (created.data as { code: string }).code, winner: candidates[0]!.name };
  });

  const guest = await (await browser.newContext()).newPage();
  await joinAs(guest, code, '손님');
  await guest.getByRole('button', { name: `${winner}에 투표` }).click();
  await expect(candidateRow(guest, winner)).toContainText('1표');

  await joinAs(page, code, '진행자');
  await expect(page.getByText('오늘 점심은 여기로 정해졌어요')).toBeVisible({ timeout: 110_000 });
  await expect(page.getByRole('heading', { name: winner })).toBeVisible();
  await expect(page.getByText('투표하지 않아서 내 식사 기록에는 남지 않았어요.')).toBeVisible();

  // The guest voted, so the winner is now the guest's lunch.
  await expect(guest.getByText('투표한 사람의 오늘 식사 기록에 남았어요.')).toBeVisible({ timeout: 15_000 });
  await guest.getByRole('link', { name: '기록' }).click();
  await expect(guest.getByRole('list', { name: '식사 목록' })).toContainText(winner);
  await guest.context().close();
});

test('a wrong code says the room cannot be found', async ({ page }) => {
  await page.goto('/r/ZZZZZZZZ');
  await page.getByRole('textbox', { name: '닉네임' }).fill('누구');
  await page.getByRole('button', { name: '입장하기' }).click();
  await expect(page.getByRole('alert')).toContainText('방을 찾을 수 없어요.');
});
