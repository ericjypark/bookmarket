import { expect, test } from '@playwright/test';

const baseURL = process.env.BOOKMARKET_BASE_URL ?? 'https://bmkt.ericjypark.com';
const routingParityEnabled = process.env.BOOKMARKET_ROUTING_PARITY === '1';
const subdomainUsername = process.env.BOOKMARKET_SEED_USERNAME ?? 'publicseed';

test.describe('v1 routing parity', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(!routingParityEnabled, 'Set BOOKMARKET_ROUTING_PARITY=1 to run local routing checks');
  test.skip(!isLocalURL(baseURL), 'Routing parity checks are local-only and must not target production');

  test('public user subdomain rewrites to the shared profile surface', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Subdomain routing checks run once on the desktop viewport');

    await page.goto(subdomainURL(subdomainUsername, '/'), { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(subdomainURL(subdomainUsername, '/'))}`));
    await expect(page.getByText('React', { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText('PostgreSQL Documentation', { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  });

  test('subdomain category query is preserved through the rewrite', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Subdomain routing checks run once on the desktop viewport');

    await page.goto(subdomainURL(subdomainUsername, '/?c=Tools'), { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(subdomainURL(subdomainUsername, '/?c=Tools'))}`));
    await expect(page.getByText('PostgreSQL Documentation', { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText('React', { exact: true }).filter({ visible: true })).toHaveCount(0);
  });

  test('shared profile bookmark opens the public URL in a new tab', async ({ context, page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Shared bookmark-open parity is covered on the desktop viewport');

    await page.goto(`/s/${subdomainUsername}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('React', { exact: true }).filter({ visible: true })).toHaveCount(1);

    const popupPromise = context.waitForEvent('page');
    await page.getByText('React', { exact: true }).filter({ visible: true }).first().click();
    const popup = await popupPromise;

    await expect.poll(() => popup.url(), { timeout: 5_000 }).toContain('https://react.dev');
    await popup.close();
  });

  test('reserved www host stays on the main landing page', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Subdomain routing checks run once on the desktop viewport');

    await page.goto(reservedURL('www', '/'), { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Your Bookmarks, Reimagined' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join Now|Slots Full/ })).toBeVisible();
    await expect(page.getByText('React', { exact: true }).filter({ visible: true })).toHaveCount(0);
  });
});

function subdomainURL(subdomain: string, path: string) {
  return withLocalSubdomain(subdomain, path);
}

function reservedURL(subdomain: string, path: string) {
  return withLocalSubdomain(subdomain, path);
}

function withLocalSubdomain(subdomain: string, path: string) {
  const url = new URL(baseURL);
  url.hostname = `${subdomain}.localhost`;
  url.pathname = path.startsWith('/?') ? '/' : path;
  if (path.startsWith('/?')) {
    url.search = path.slice(1);
  }
  return url.toString();
}

function isLocalURL(rawURL: string) {
  try {
    const { hostname } = new URL(rawURL);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
