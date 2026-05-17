import { expect, test, type BrowserContext } from '@playwright/test';

const baseURL = process.env.BOOKMARKET_BASE_URL ?? 'https://bmkt.ericjypark.com';
const authParityEnabled = process.env.BOOKMARKET_AUTH_PARITY === '1';
const apiBaseURL = normaliseApiBaseURL(
  process.env.BOOKMARKET_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080',
);
const ownerEmail = process.env.BOOKMARKET_SEED_EMAIL ?? 'owner.seed@bookmarket.local';
const ownerPassword = process.env.BOOKMARKET_SEED_PASSWORD ?? 'BookmarketV1!23';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

test.describe('v1 auth parity', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(!authParityEnabled, 'Set BOOKMARKET_AUTH_PARITY=1 to run local auth checks');
  test.skip(!isLocalURL(baseURL), 'Auth parity checks are local-only and must not target production');

  test('unauthenticated home preserves v1 logged-out shell behavior', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Auth route checks run once on the desktop viewport');

    await page.context().clearCookies();
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    await expect(page.getByPlaceholder('Paste a link to add a bookmark')).toBeVisible();
    await expect(page.locator('nav > *').last()).toContainText('Login');
  });

  test('invalid email login keeps v1 visible error behavior', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Auth form checks run once on the desktop viewport');

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email').fill(`missing-${Date.now()}@bookmarket.local`);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Invalid email or password. Please try again.')).toBeVisible();
  });

  test('signup keeps v1 duplicate-email or full-slot visible behavior', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Auth form checks run once on the desktop viewport');

    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/slots? left|Slots Full/)).toBeVisible();

    if (await page.getByRole('button', { name: 'Slots Full' }).isVisible()) {
      await expect(page.getByLabel('Email')).toBeDisabled();
      await expect(page.getByLabel('Password')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Slots Full' })).toBeDisabled();
      return;
    }

    await page.getByLabel('Email').fill(ownerEmail);
    await page.getByLabel('Password').fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByText('An account with this email already exists. Please try logging in instead.')).toBeVisible();
  });

  test('github oauth navigation includes a minted state without changing visible controls', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'OAuth route checks run once on the desktop viewport');

    let githubAuthorizeURL: URL | undefined;
    await page.route('https://github.com/login/oauth/authorize**', route => {
      githubAuthorizeURL = new URL(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>GitHub OAuth stub</title>',
      });
    });

    const statePrefetch = page.waitForResponse(response =>
      response.url().endsWith('/api/oauth/state') && response.status() === 200
    );

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await statePrefetch;
    await expect(page.getByRole('button', { name: 'Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Github' }).click();

    await expect.poll(() => githubAuthorizeURL?.searchParams.get('state')).toBeTruthy();
    expect(githubAuthorizeURL?.searchParams.get('scope')).toBe('user:email');
    expect(githubAuthorizeURL?.searchParams.get('redirect_uri')).toBeTruthy();
  });

  test('logout clears browser session and revokes the refresh token', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Logout checks run once on the desktop viewport');

    const tokens = await loginSeedOwner();
    await installAuthCookies(page.context(), tokens);

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Paste a link to add a bookmark')).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.locator('#nav [data-slot="dropdown-menu-trigger"]').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Logout' }).click();

    await expect(page).toHaveURL(/\/$/);
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    await expect(page.locator('nav > *').last()).toContainText('Login');

    const refreshResponse = await fetch(`${apiBaseURL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    expect(refreshResponse.status).toBe(401);
  });
});

async function loginSeedOwner(): Promise<TokenPair> {
  const response = await fetch(`${apiBaseURL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  });
  if (!response.ok) {
    throw new Error(`Seed owner login failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<TokenPair>;
}

async function installAuthCookies(context: BrowserContext, tokens: TokenPair) {
  const url = new URL(baseURL);
  const expires = Math.floor(Date.now() / 1000) + 604_800;
  await context.clearCookies();
  await context.addCookies([
    {
      name: 'access_token',
      value: tokens.accessToken,
      domain: url.hostname,
      path: '/',
      expires,
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
    {
      name: 'refresh_token',
      value: tokens.refreshToken,
      domain: url.hostname,
      path: '/',
      expires,
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}

function normaliseApiBaseURL(rawBaseURL: string) {
  const withoutTrailingSlash = rawBaseURL.replace(/\/$/, '');
  return withoutTrailingSlash.endsWith('/api/v1') ? withoutTrailingSlash : `${withoutTrailingSlash}/api/v1`;
}

function isLocalURL(rawURL: string) {
  try {
    const { hostname } = new URL(rawURL);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}
