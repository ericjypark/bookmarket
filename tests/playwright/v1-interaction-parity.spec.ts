import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const baseURL = process.env.BOOKMARKET_BASE_URL ?? 'https://bmkt.ericjypark.com';
const authStorage = process.env.BOOKMARKET_AUTH_STORAGE;
const interactionParityEnabled = process.env.BOOKMARKET_INTERACTION_PARITY === '1';
const apiBaseURL = normaliseApiBaseURL(
  process.env.BOOKMARKET_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080',
);

type BookmarkDto = {
  id: string;
  url: string;
  title: string | null;
};

type CategoryDto = {
  id: string;
  name: string;
};

test.describe('v1 interaction parity', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(!interactionParityEnabled, 'Set BOOKMARKET_INTERACTION_PARITY=1 to run local mutation-capable checks');
  test.skip(!isLocalURL(baseURL), 'Interaction parity checks are local-only and must not target production');
  test.skip(!authStorage, 'BOOKMARKET_AUTH_STORAGE is required for authenticated interaction checks');
  test.skip(!!authStorage && !existsSync(path.resolve(process.cwd(), authStorage)), 'BOOKMARKET_AUTH_STORAGE file does not exist');

  test('desktop command menu preserves v1 shortcut, search, and category selection', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Desktop command-menu parity is covered on the desktop viewport');

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Paste a link to add a bookmark')).toBeVisible();

    const command = await openCommandMenu(page);
    await expect(command.getByText('Recent Bookmarks')).toBeVisible();

    await command.getByPlaceholder('Search for a bookmark...').fill('kafka');
    await expect(command.getByText('Search Results')).toBeVisible();
    await expect(command.getByText('Apache Kafka Documentation', { exact: true })).toBeVisible();
    await expect(command.getByText('Next.js Documentation', { exact: true })).toHaveCount(0);

    await command.getByPlaceholder('Search for a bookmark...').fill('');
    await expect(command.getByText('Categories')).toBeVisible();
    await command.locator('[cmdk-item]').filter({ hasText: /^Tools$/ }).click();

    await expect(page).toHaveURL(/\/home\?c=Tools$/);
    await expect(visibleText(page, 'GitHub Actions')).toHaveCount(1);
    await expect(visibleText(page, 'Next.js Documentation')).toHaveCount(0);
  });

  test('mobile category drawer preserves v1 filter behavior', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'Mobile drawer parity is covered on the mobile viewport');

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Paste a link to add a bookmark')).toBeVisible();

    await page.getByText('All', { exact: true }).click();
    await expect(page.getByText('Categories')).toBeVisible();
    await page.getByRole('button', { name: 'Docs' }).click();

    await expect(page).toHaveURL(/\/home\?c=Docs$/);
    await expect(visibleText(page, 'Next.js Documentation')).toHaveCount(1);
    await expect(visibleText(page, 'GitHub Actions')).toHaveCount(0);
  });

  test('desktop category and bookmark creation preserve v1 visible behavior', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Desktop creation parity is covered on the desktop viewport');

    const token = readAccessToken();
    const runId = `${Date.now()}-${testInfo.retry}`;
    const categoryName = `Parity ${runId}`;
    const bookmarkUrl = `https://example.com/bookmarket-ui-create-${runId}`;

    try {
      await page.goto('/home', { waitUntil: 'domcontentloaded' });
      await expect(page.getByPlaceholder('Paste a link to add a bookmark')).toBeVisible();

      await page.locator('nav div.relative.ml-4').click();
      await expect(page.getByText('Create New Category')).toBeVisible();
      await page.getByPlaceholder('Category Name').fill(categoryName);
      await page.getByPlaceholder('Category Name').press('Enter');

      await expect(page.getByRole('button', { name: categoryName })).toBeVisible();
      await page.getByRole('button', { name: categoryName }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('c')).toBe(categoryName);

      await page.getByPlaceholder('Paste a link to add a bookmark').fill(bookmarkUrl);
      await page.getByPlaceholder('Paste a link to add a bookmark').press('Enter');

      await expect(visibleText(page, bookmarkUrl)).toHaveCount(1);
    } finally {
      const bookmarks = await apiGet<BookmarkDto[]>(token, 'bookmarks').catch(() => []);
      const createdBookmark = bookmarks.find(bookmark => bookmark.url === bookmarkUrl);
      if (createdBookmark) {
        await apiDelete(token, `bookmarks/${createdBookmark.id}`).catch(() => undefined);
      }

      const categories = await apiGet<CategoryDto[]>(token, 'categories').catch(() => []);
      const createdCategory = categories.find(category => category.name === categoryName);
      if (createdCategory) {
        await apiDelete(token, `categories/${createdCategory.id}`).catch(() => undefined);
      }
    }
  });

  test('desktop bookmark click opens the saved URL in a new tab', async ({ context, page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Desktop bookmark-open parity is covered on the desktop viewport');

    const token = readAccessToken();
    const runId = `${Date.now()}-${testInfo.retry}`;
    const title = `Bookmarket open parity ${runId}`;
    const url = `https://example.com/bookmarket-v2-open-${runId}`;
    const created = await apiPost<BookmarkDto>(token, 'bookmarks', {
      url,
      categoryName: 'Tools',
    });

    try {
      await apiPatch<BookmarkDto>(token, `bookmarks/${created.id}`, { title });

      await page.goto('/home', { waitUntil: 'domcontentloaded' });
      await expect(visibleText(page, title)).toHaveCount(1);

      const popupPromise = context.waitForEvent('page');
      await visibleText(page, title).first().click();
      const popup = await popupPromise;

      await expect.poll(() => popup.url(), { timeout: 5_000 }).toContain(url);
      await popup.close();
    } finally {
      await apiDelete(token, `bookmarks/${created.id}`).catch(() => undefined);
    }
  });

  test('desktop bookmark context menu preserves v1 copy, rename, category, and delete actions', async ({
    context,
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Desktop context-menu parity is covered on the desktop viewport');

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const token = readAccessToken();
    const runId = `${Date.now()}-${testInfo.retry}`;
    const originalTitle = `Bookmarket parity ${runId}`;
    const renamedTitle = `${originalTitle} renamed`;
    const created = await apiPost<BookmarkDto>(token, 'bookmarks', {
      url: `https://example.com/bookmarket-v2-parity-${runId}`,
      categoryName: 'Tools',
    });

    try {
      await apiPatch<BookmarkDto>(token, `bookmarks/${created.id}`, { title: originalTitle });

      await page.goto('/home', { waitUntil: 'domcontentloaded' });
      await expect(visibleText(page, originalTitle)).toHaveCount(1);

      await openBookmarkContextMenu(page, originalTitle);
      await expect(page.getByRole('menuitem', { name: 'Copy' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Refetch' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Category' })).toBeVisible();

      await page.getByRole('menuitem', { name: 'Copy' }).click();
      await expectToast(page, 'Copied to clipboard');

      await openBookmarkContextMenu(page, originalTitle);
      await page.getByRole('menuitem', { name: 'Rename' }).click();
      const titleInput = page.locator('input:focus');
      await expect(titleInput).toBeVisible();
      await expect(titleInput).toHaveValue(originalTitle);
      await titleInput.fill(renamedTitle);
      await titleInput.press('Enter');
      await expectToast(page, 'Bookmark updated!');
      await expect(visibleText(page, renamedTitle)).toHaveCount(1);

      await openBookmarkContextMenu(page, renamedTitle);
      await page.getByRole('menuitem', { name: 'Category' }).hover();
      await page.getByRole('menuitemcheckbox', { name: 'Docs' }).click();
      await expectToast(page, 'Category updated!');

      await openBookmarkContextMenu(page, renamedTitle);
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expectToast(page, 'Bookmark deleted successfully');
      await expect(visibleText(page, renamedTitle)).toHaveCount(0);
    } finally {
      await apiDelete(token, `bookmarks/${created.id}`).catch(() => undefined);
    }
  });

  test('desktop profile settings preserve v1 fields validation and save behavior', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'Desktop profile settings parity is covered on the desktop viewport');

    const token = readAccessToken();
    const runId = randomLowercase(8);
    const originalProfile = {
      firstName: 'Bookmarket',
      lastName: 'Owner',
      username: 'ownerseed',
    };
    const updatedProfile = {
      firstName: `Parity${runId.slice(0, 4)}`,
      lastName: 'Owner',
      username: runId,
    };

    await apiPatch(token, 'users/me', originalProfile);

    try {
      await page.goto('/home', { waitUntil: 'domcontentloaded' });
      await expect(page.getByPlaceholder('Paste a link to add a bookmark')).toBeVisible();

      await page.locator('nav > *').last().click();
      await page.getByRole('menuitem', { name: 'Settings' }).click();

      await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();
      await expect(page.getByPlaceholder('Eric')).toHaveValue(originalProfile.firstName);
      await expect(page.getByPlaceholder('Park')).toHaveValue(originalProfile.lastName);
      await expect(page.getByPlaceholder('google')).toHaveValue(originalProfile.username);
      await expect(page.getByText('https://', { exact: true })).toBeVisible();
      await expect(page.getByText('.bmkt.tech', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

      await page.getByPlaceholder('google').fill('publicseed');
      await expect(page.getByText('Username already taken')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

      await page.getByPlaceholder('Eric').fill(updatedProfile.firstName);
      await page.getByPlaceholder('google').fill(updatedProfile.username);
      await expect(page.getByText('Username already taken')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      await page.getByRole('button', { name: 'Save changes' }).click();

      await expectToast(page, 'User profile updated successfully.');
      await expect(page.getByRole('heading', { name: 'Edit profile' })).toHaveCount(0);
    } finally {
      await apiPatch(token, 'users/me', originalProfile).catch(() => undefined);
    }
  });
});

async function openCommandMenu(page: Page) {
  const command = page.locator('.cmdk-root');

  await page.locator('body').click({ position: { x: 10, y: 10 } });

  for (const shortcut of ['Meta+k', 'Control+k']) {
    await page.keyboard.press(shortcut);
    try {
      await expect(command.getByPlaceholder('Search for a bookmark...')).toBeVisible({ timeout: 1_500 });
      return command;
    } catch {
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  await expect(command.getByPlaceholder('Search for a bookmark...')).toBeVisible();
  return command;
}

async function openBookmarkContextMenu(page: Page, title: string) {
  const bookmarkTitle = visibleText(page, title);
  await expect(bookmarkTitle).toHaveCount(1);
  await bookmarkTitle.first().click({ button: 'right' });
}

function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

async function expectToast(page: Page, text: string) {
  await expect(page.getByText(text, { exact: true }).filter({ visible: true }).first()).toBeVisible();
}

function readAccessToken() {
  if (!authStorage) throw new Error('BOOKMARKET_AUTH_STORAGE is required');
  const storagePath = path.resolve(process.cwd(), authStorage);
  const storageState = JSON.parse(readFileSync(storagePath, 'utf8')) as {
    cookies?: Array<{ name: string; value: string }>;
  };
  const token = storageState.cookies?.find(cookie => cookie.name === 'access_token')?.value;
  if (!token) throw new Error(`No access_token cookie found in ${storagePath}`);
  return token;
}

async function apiPost<T>(token: string, apiPath: string, body: unknown): Promise<T> {
  return apiJson<T>('POST', token, apiPath, body);
}

async function apiPatch<T>(token: string, apiPath: string, body: unknown): Promise<T> {
  return apiJson<T>('PATCH', token, apiPath, body);
}

async function apiDelete(token: string, apiPath: string): Promise<void> {
  const response = await fetch(`${apiBaseURL}/${apiPath}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${apiPath} failed: ${response.status} ${await response.text()}`);
  }
}

async function apiGet<T>(token: string, apiPath: string): Promise<T> {
  const response = await fetch(`${apiBaseURL}/${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function apiJson<T>(method: 'POST' | 'PATCH', token: string, apiPath: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseURL}/${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${apiPath} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
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

function randomLowercase(length: number) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}
