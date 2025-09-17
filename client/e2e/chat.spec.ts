import { test, expect } from '@playwright/test';

const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

async function decodeUserId(page) {
  return page.evaluate(() => {
    const token = window.localStorage.getItem('token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId || null;
    } catch (err) {
      console.error('Failed to decode token', err);
      return null;
    }
  });
}

test('encrypted chat: user A and user B exchange ciphertext-only message', async ({ browser }) => {
  const userAContext = await browser.newContext();
  const userBContext = await browser.newContext();

  const userAPage = await userAContext.newPage();
  const userBPage = await userBContext.newPage();

  const capturedBodies = [] as Array<Record<string, unknown>>;

  for (const page of [userAPage, userBPage]) {
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/api/messages')) {
        try {
          const parsed = request.postDataJSON();
          capturedBodies.push(parsed);
        } catch (err) {
          capturedBodies.push({ raw: request.postData() });
        }
      }
    });
  }

  const timestamp = Date.now();
  const userACreds = {
    username: `UserA-${timestamp}`,
    email: `usera-${timestamp}@example.com`,
    password: 'Password123!',
    passphrase: 'phraseA123'
  };
  const userBCreds = {
    username: `UserB-${timestamp}`,
    email: `userb-${timestamp}@example.com`,
    password: 'Password123!',
    passphrase: 'phraseB123'
  };

  await userAPage.goto('/');
  await userAPage.getByRole('link', { name: 'Зарегистрироваться' }).click();
  await userAPage.getByLabel('Имя пользователя').fill(userACreds.username);
  await userAPage.getByLabel('Email').fill(userACreds.email);
  await userAPage.getByLabel('Пароль').fill(userACreds.password);
  await userAPage.getByLabel('Пароль-фраза для ключей (локально)').fill(userACreds.passphrase);
  await userAPage.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(userAPage).toHaveURL(/\/chat/);

  await userBPage.goto('/');
  await userBPage.getByRole('link', { name: 'Зарегистрироваться' }).click();
  await userBPage.getByLabel('Имя пользователя').fill(userBCreds.username);
  await userBPage.getByLabel('Email').fill(userBCreds.email);
  await userBPage.getByLabel('Пароль').fill(userBCreds.password);
  await userBPage.getByLabel('Пароль-фраза для ключей (локально)').fill(userBCreds.passphrase);
  await userBPage.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(userBPage).toHaveURL(/\/chat/);

  await expect(async () => {
    const id = await decodeUserId(userAPage);
    expect(id).not.toBeNull();
  }).toPass();
  await expect(async () => {
    const id = await decodeUserId(userBPage);
    expect(id).not.toBeNull();
  }).toPass();

  const userAId = await decodeUserId(userAPage);
  const userBId = await decodeUserId(userBPage);

  expect(userAId).not.toBeNull();
  expect(userBId).not.toBeNull();

  await userAPage.goto(`/chat/${userBId}`);
  await userBPage.goto(`/chat/${userAId}`);

  const messageText = 'Привет';
  await userAPage.getByPlaceholder('Type your message…').fill(messageText);
  await userAPage.getByRole('button', { name: 'Send' }).click();

  await expect(userBPage.locator('.messages')).toContainText(messageText);

  expect(capturedBodies.length).toBeGreaterThan(0);
  const invalidPayloads = capturedBodies.filter(body => {
    if (!body) return true;
    if (typeof body !== 'object') return true;
    if ('text' in body || 'message' in body || 'body' in body) return true;
    const encryptedPayload = body.encryptedPayload;
    if (typeof encryptedPayload !== 'string') return true;
    return !BASE64_RE.test(encryptedPayload);
  });

  expect(invalidPayloads).toEqual([]);

  await userAContext.close();
  await userBContext.close();
});
