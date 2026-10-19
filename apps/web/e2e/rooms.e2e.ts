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

/** A Phoenix frame: [join_ref, ref, topic, event, payload]. */
type RealtimeFrame = [string | null, string | null, string, string, Record<string, unknown>];

/**
 * Realtime acknowledges a room channel's join before the Postgres subscription behind it exists,
 * and never sends changes committed in between. That gap is a few milliseconds normally but
 * seconds when the server restarts its replication after sitting idle. This widens it on demand:
 * the page's "Subscribed to PostgreSQL" message is held until `release()`, and change events that
 * arrive before then are dropped, as the server would never have sent them.
 */
async function delayRoomSubscription(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let markJoined!: () => void;
  const joined = new Promise<void>((resolve) => (markJoined = resolve));
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    let live = false;
    void released.then(() => (live = true));
    server.onMessage((message) => {
      if (typeof message !== 'string') return ws.send(message);
      const [, , topic, event, payload] = JSON.parse(message) as RealtimeFrame;
      if (!topic.startsWith('realtime:room:') || live) return ws.send(message);
      if (event === 'phx_reply' && payload.status === 'ok') markJoined();
      if (event === 'postgres_changes') return;
      if (event === 'system' && payload.extension === 'postgres_changes') {
        void released.then(() => ws.send(message));
        return;
      }
      ws.send(message);
    });
  });
  return { joined, release };
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
  await expect(page.getByRole('region', { name: '남은 시간' })).toContainText(/\d+초 남음|\d+분/);

  const guest = await (await browser.newContext()).newPage();
  await joinAs(guest, code, '손님');
  await guest.getByRole('button', { name: `${second} 여기 투표` }).click();
  await expect(guest.getByRole('button', { name: `${second} 내가 고른 곳` })).toHaveAttribute('aria-pressed', 'true');

  // The host sees the guest arrive and vote through Realtime.
  await expect(page.getByRole('list', { name: '참여한 사람' })).toContainText('손님');
  await expect(candidateRow(page, second)).toContainText('1표');

  await page.getByRole('button', { name: `${second} 여기 투표` }).click();
  await expect(candidateRow(guest, second)).toContainText('2표');
  await guest.context().close();
});

test('the host sees a guest who joined before Realtime started sending changes', async ({ page, browser }) => {
  const realtime = await delayRoomSubscription(page);
  await page.goto('/rooms/new');
  await expect(page.getByRole('list', { name: '후보 목록' }).getByRole('listitem')).toHaveCount(3);
  await page.getByRole('textbox', { name: '내 닉네임' }).fill('진행자');
  await page.getByRole('button', { name: '투표 방 만들기' }).click();
  await expect(page).toHaveURL(/\/r\/[A-HJKMNP-Z2-9]{8}$/);
  const code = page.url().split('/r/')[1]!;
  await realtime.joined;

  // The guest's join lands after the host's channel joined but before its subscription is live.
  const guest = await (await browser.newContext()).newPage();
  await joinAs(guest, code, '손님');
  realtime.release();

  // Well before the 15-second fallback refetch.
  await expect(page.getByRole('list', { name: '참여한 사람' })).toContainText('손님', { timeout: 5_000 });
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
  await guest.getByRole('button', { name: `${winner} 여기 투표` }).click();
  await expect(candidateRow(guest, winner)).toContainText('1표');

  await joinAs(page, code, '진행자');
  await expect(page.getByText('오늘 점심은 여기로 정해졌어요')).toBeVisible({ timeout: 110_000 });
  await expect(page.getByRole('heading', { name: winner })).toBeVisible();

  // The host did not vote, so nothing was recorded until they say they ate there too.
  await expect(page.getByText('오늘 내 식사 기록에는 아직 없어요.')).toBeVisible();
  await page.getByRole('button', { name: '나도 여기서 먹었어요' }).click();
  await expect(page.getByText('오늘 내 식사 기록에 남았어요.')).toBeVisible();

  // The guest voted, so the winner is now the guest's lunch.
  await expect(guest.getByText('오늘 내 식사 기록에 남았어요.')).toBeVisible({ timeout: 15_000 });
  await guest.getByRole('link', { name: '기록' }).click();
  await expect(guest.getByRole('list', { name: '식사 목록' })).toContainText(winner);
  await guest.context().close();
});

test('the host closes the room once everyone voted, and home shows the result', async ({ page, browser }) => {
  await page.goto('/rooms/new');
  const candidates = page.getByRole('list', { name: '후보 목록' }).getByRole('listitem');
  await expect(candidates).toHaveCount(3);
  const first = (await candidates.nth(0).getByRole('paragraph').first().innerText()).trim();

  await page.getByRole('textbox', { name: '내 닉네임' }).fill('진행자');
  await page.getByRole('button', { name: '투표 방 만들기' }).click();
  await expect(page).toHaveURL(/\/r\/[A-HJKMNP-Z2-9]{8}$/);
  const code = page.url().split('/r/')[1]!;

  const guest = await (await browser.newContext()).newPage();
  await joinAs(guest, code, '손님');
  // Only the host gets the early close.
  await expect(guest.getByRole('heading', { name: '진행자 메뉴' })).toHaveCount(0);
  await guest.getByRole('button', { name: `${first} 여기 투표` }).click();
  await expect(guest.getByRole('status').filter({ hasText: '투표했어요.' })).toContainText('마감 전까지는 다른 곳으로 바꿀 수 있어요');

  // The guest's home screen points back to the open vote.
  await guest.getByRole('link', { name: '룰렛', exact: true }).click();
  await expect(guest.getByRole('region', { name: '오늘의 팀 투표' })).toContainText('팀 투표 진행 중');
  await expect(guest.getByRole('region', { name: '오늘의 팀 투표' })).toContainText('투표했어요');

  await expect(page.getByText('1명이 아직 투표하지 않았어요.')).toBeVisible();
  await page.getByRole('button', { name: `${first} 여기 투표` }).click();
  await expect(page.getByText('모두 투표했어요. 지금 마감할까요?')).toBeVisible();
  await page.getByRole('button', { name: '지금 마감하기' }).click();
  await expect(page.getByRole('heading', { name: first })).toBeVisible();
  await expect(page.getByText('오늘 내 식사 기록에 남았어요.')).toBeVisible();
  await expect(page.getByRole('link', { name: '새 투표 방 만들기' })).toBeVisible();

  // The guest left the room, and home now shows the result instead of the vote.
  await expect(guest.getByRole('region', { name: '오늘의 팀 투표' })).toContainText(`오늘 투표 결과: ${first}`, { timeout: 15_000 });
  await guest.getByRole('link', { name: /결과 보기$/ }).click();
  await expect(guest.getByText('오늘 점심은 여기로 정해졌어요')).toBeVisible();
  await guest.context().close();
});

test('closing a room without votes asks first and ends without a winner', async ({ page }) => {
  await page.goto('/rooms/new');
  await expect(page.getByRole('list', { name: '후보 목록' }).getByRole('listitem')).toHaveCount(3);
  await page.getByRole('textbox', { name: '내 닉네임' }).fill('진행자');
  await page.getByRole('button', { name: '투표 방 만들기' }).click();
  await expect(page).toHaveURL(/\/r\/[A-HJKMNP-Z2-9]{8}$/);

  await page.getByRole('button', { name: '지금 마감하기' }).click();
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.getByRole('region', { name: '남은 시간' })).toContainText(/\d+초 남음|\d+분/);

  await page.getByRole('button', { name: '지금 마감하기' }).click();
  await page.getByRole('button', { name: '그래도 마감하기' }).click();
  await expect(page.getByText('아무도 투표하지 않아 정해지지 않았어요.')).toBeVisible();
  await page.getByRole('link', { name: '룰렛으로 정하기' }).click();
  await expect(page.getByRole('heading', { name: '수내에서 뭐먹을까?' })).toBeVisible();
});

test('a wrong code says the room cannot be found', async ({ page }) => {
  await page.goto('/r/ZZZZZZZZ');
  await page.getByRole('textbox', { name: '닉네임' }).fill('누구');
  await page.getByRole('button', { name: '입장하기' }).click();
  await expect(page.getByRole('alert')).toContainText('방을 찾을 수 없어요.');
});
