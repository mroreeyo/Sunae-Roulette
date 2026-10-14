import { expect, test, type APIRequestContext } from '@playwright/test';

// Local Supabase delivers auth emails to Mailpit instead of a real inbox.
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

async function latestLink(request: APIRequestContext, to: string, after: number): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await request.get(`${MAILPIT}/search`, { params: { query: `to:"${to}"` } });
    const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] };
    const fresh = messages.find((m) => Date.parse(m.Created) >= after);
    if (fresh) {
      const message = (await (await request.get(`${MAILPIT}/message/${fresh.ID}`)).json()) as { Text: string };
      const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0];
      if (link) return link.replaceAll('&amp;', '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No auth email for ${to}`);
}

test('linking an email keeps the history and lets another device sign in to it', async ({ browser, request }) => {
  const email = `e2e-${Date.now()}@example.test`;

  // Device A: record a meal as an anonymous user, then attach an email.
  const deviceA = await browser.newPage();
  await deviceA.goto('/');
  await deviceA.getByRole('button', { name: '돌리기', exact: true }).click();
  await expect(deviceA.getByRole('button', { name: '여기 갈래' })).toBeVisible({ timeout: 6_000 });
  const meal = await deviceA.locator('#result-name').innerText();
  await deviceA.getByRole('button', { name: '여기 갈래' }).click();
  await expect(deviceA.getByText('오늘 점심으로 기록했어요.')).toBeVisible();

  await deviceA.getByRole('link', { name: '설정' }).click();
  const sentAt = Date.now() - 1000;
  await deviceA.getByRole('textbox', { name: '이메일' }).fill(email);
  await deviceA.getByRole('button', { name: '연결 링크 보내기' }).click();

  // With email confirmation off (local default) the email is attached at once;
  // with it on (production) a confirmation link arrives first.
  const connected = deviceA.getByText(`${email}에 연결되어 있어요.`);
  const sent = deviceA.getByText(`${email}로 링크를 보냈어요.`);
  await expect(connected.or(sent)).toBeVisible();
  if (await sent.isVisible()) await deviceA.goto(await latestLink(request, email, sentAt));
  await expect(connected).toBeVisible({ timeout: 10_000 });

  // Device B: a fresh browser signs in with the same email and sees device A's meal.
  const deviceB = await (await browser.newContext()).newPage();
  await deviceB.goto('/settings');
  await deviceB.getByRole('button', { name: /이메일로 로그인/ }).click();
  const loginAt = Date.now() - 1000;
  await deviceB.getByRole('textbox', { name: '이메일' }).fill(email);
  await deviceB.getByRole('button', { name: '로그인 링크 보내기' }).click();
  await expect(deviceB.getByText(`${email}로 링크를 보냈어요.`)).toBeVisible();

  await deviceB.goto(await latestLink(request, email, loginAt));
  await expect(deviceB.getByText(`${email}에 연결되어 있어요.`)).toBeVisible({ timeout: 10_000 });
  await deviceB.getByRole('link', { name: '기록' }).click();
  await expect(deviceB.getByRole('list', { name: '식사 목록' })).toContainText(meal);
});
