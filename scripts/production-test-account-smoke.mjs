#!/usr/bin/env node

import { chromium } from '@playwright/test';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const releaseDate = (process.env.BOOKMARKET_RELEASE_DATE ?? localDate(new Date())).trim();
const webURL = new URL(process.env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
const productionStack = (process.env.BOOKMARKET_PRODUCTION_TEST_ACCOUNT_STACK ?? 'v2').trim().toLowerCase();
const isV1ProductionOracle = productionStack === 'v1';
const apiBaseURL = normaliseApiBaseURL(process.env.BOOKMARKET_API_URL ?? 'https://api.bmkt.ericjypark.com');
const accountEmail = (process.env.BOOKMARKET_TEST_ACCOUNT_EMAIL ?? '').trim();
const accountPassword = process.env.BOOKMARKET_TEST_ACCOUNT_PASSWORD ?? '';
const accountLabel = (process.env.BOOKMARKET_TEST_ACCOUNT_LABEL ?? '<dedicated-test-account>').trim();
const approveMutations = process.env.BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS === '1';
const confirmDedicatedAccount = process.env.BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT === '1';
const createAccountIfMissing = process.env.BOOKMARKET_CREATE_PRODUCTION_TEST_ACCOUNT === '1';
const headless = process.env.BOOKMARKET_TEST_ACCOUNT_HEADFUL !== '1';
const routeTargetCookie = (process.env.BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE ?? '').trim();
const browserCanaryCookie = routeTargetCookie ? parseRouteTargetCookie(routeTargetCookie) : null;

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

async function main() {
  if (help) {
    usage();
    return;
  }

  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  section('Bookmarket production test-account smoke');
  line(`Web URL: ${webURL.origin}`);
  line(`API URL: ${apiBaseURL}`);
  line(`Production stack: ${productionStack}`);
  if (routeTargetCookie) {
    line('Route target canary cookie: configured');
  }

  if (dryRun) {
    printDryRunPlan();
    return;
  }

  assertRealRunPreconditions();
  await runBrowserSmoke();
}

function usage() {
  console.log(`Usage: node scripts/production-test-account-smoke.mjs [--dry-run]

Runs the dedicated production test-account smoke described in docs/operations/production-smoke-checklist.md.
Real runs mutate only disposable data in the dedicated test account and require explicit approval env vars.
`);
}

function printDryRunPlan() {
  line('Dry run: no browser, API, or mutation commands will run.');
  line('Real run requires these env vars:');
  bullet('BOOKMARKET_TEST_ACCOUNT_EMAIL');
  bullet('BOOKMARKET_TEST_ACCOUNT_PASSWORD');
  bullet('BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1');
  bullet('BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS=1');
  bullet('Optional: BOOKMARKET_WEB_URL, BOOKMARKET_API_URL, BOOKMARKET_TEST_ACCOUNT_LABEL, BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE, BOOKMARKET_TEST_ACCOUNT_HEADFUL=1');
  bullet('Optional: BOOKMARKET_PRODUCTION_TEST_ACCOUNT_STACK=v1 for the current v1 production oracle.');
  bullet('Optional: BOOKMARKET_CREATE_PRODUCTION_TEST_ACCOUNT=1 to create the dedicated account if email login is not available.');
  line('Real run plan:');
  ordered([
    'Open /login and perform email login with the dedicated test account.',
    'If explicitly enabled, create the dedicated test account through /signup when login is unavailable.',
    'Verify /home and the v1 bookmark input shell render.',
    'Create one disposable category and one disposable bookmark through the copied v1 UI.',
    'Open, copy, rename, assign category, refetch metadata, and delete the disposable bookmark through the UI.',
    'Delete the disposable category through the API using the test-account access token.',
    'Run API cleanup for any matching disposable bookmark/category names and verify disposable bookmark/category counts are 0|0 before exiting.',
    'Print the BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF template after success.'
  ]);
}

function assertRealRunPreconditions() {
  if (!approveMutations) {
    fail('Set BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS=1 to approve disposable test-account mutations.');
  }
  if (!confirmDedicatedAccount) {
    fail('Set BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1 to confirm this is not a real user account.');
  }
  if (!accountEmail) {
    fail('BOOKMARKET_TEST_ACCOUNT_EMAIL is required.');
  }
  if (!accountPassword) {
    fail('BOOKMARKET_TEST_ACCOUNT_PASSWORD is required.');
  }
  if (webURL.protocol !== 'https:' && !isLocalhost(webURL.hostname)) {
    fail(`Refusing non-HTTPS non-local web URL: ${webURL.origin}`);
  }
  if (productionStack !== 'v1' && productionStack !== 'v2') {
    fail('BOOKMARKET_PRODUCTION_TEST_ACCOUNT_STACK must be v1 or v2.');
  }
  if (routeTargetCookie) {
    parseRouteTargetCookie(routeTargetCookie);
  }
}

async function runBrowserSmoke() {
  const runId = `${Date.now()}`;
  const categoryName = `Bookmarket Smoke ${runId}`;
  const bookmarkURL = `https://example.com/bookmarket-production-smoke-${runId}`;
  const renamedTitle = `Bookmarket production smoke ${runId}`;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    baseURL: webURL.origin,
    viewport: { width: 1440, height: 1000 }
  });
  if (browserCanaryCookie) {
    await context.addCookies([
      {
        ...browserCanaryCookie,
        domain: webURL.hostname,
        path: '/',
        secure: webURL.protocol === 'https:',
        sameSite: 'Lax'
      }
    ]);
  }
  const page = await context.newPage();
  let accessToken = '';

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webURL.origin }).catch(() => undefined);
    info(`Logging in with dedicated test account label: ${accountLabel}`);
    await login(page);
    accessToken = await readAccessToken(context);

    await cleanupDisposableData(accessToken, { categoryName, bookmarkURL, renamedTitle });

    info('Creating disposable category through the UI.');
    await createCategory(page, categoryName);

    info('Creating disposable bookmark through the UI.');
    const bookmarkDisplayTitle = await createBookmark(page, accessToken, bookmarkURL);

    info('Opening disposable bookmark.');
    await openBookmark(context, page, bookmarkDisplayTitle, bookmarkURL);

    info('Copying disposable bookmark URL.');
    await openBookmarkContextMenu(page, bookmarkDisplayTitle);
    await page.getByRole('menuitem', { name: 'Copy' }).click();
    await expectVisibleText(page, 'Copied to clipboard');

    info('Renaming disposable bookmark.');
    await openBookmarkContextMenu(page, bookmarkDisplayTitle);
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const titleInput = page.locator('input:focus');
    await titleInput.fill(renamedTitle);
    await titleInput.press('Enter');
    await expectVisibleText(page, 'Bookmark updated!');
    await expectVisibleText(page, renamedTitle);

    info('Assigning disposable bookmark category.');
    await openBookmarkContextMenu(page, renamedTitle);
    await page.getByRole('menuitem', { name: 'Category' }).hover();
    await page.getByRole('menuitemcheckbox', { name: categoryName }).click();
    await expectVisibleText(page, 'Category updated!');

    info('Refetching disposable bookmark metadata.');
    await openBookmarkContextMenu(page, renamedTitle);
    await page.getByRole('menuitem', { name: 'Refetch' }).click();
    await expectAnyVisibleText(page, [
      'Refreshing bookmark metadata...',
      'Bookmark metadata refreshed successfully'
    ]);

    info('Deleting disposable bookmark through the UI.');
    await openBookmarkContextMenu(page, renamedTitle);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expectVisibleText(page, 'Bookmark deleted successfully');
    await page.getByText(renamedTitle, { exact: true }).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);

    info('Deleting disposable category through the API.');
    await deleteCategoryByName(accessToken, categoryName);

    const cleanupCounts = await cleanupDisposableData(accessToken, { categoryName, bookmarkURL, renamedTitle });
    if (cleanupCounts.bookmarks !== 0 || cleanupCounts.categories !== 0) {
      throw new Error(`Disposable cleanup left data behind: bookmarks/categories ${cleanupCounts.bookmarks}|${cleanupCounts.categories}.`);
    }

    info('Production test-account smoke completed.');
    printSignoffTemplate(cleanupCounts);
  } finally {
    if (accessToken) {
      await cleanupDisposableData(accessToken, { categoryName, bookmarkURL, renamedTitle }).catch((error) => {
        info(`Cleanup warning: ${error.message}`);
      });
    }
    await browser.close().catch(() => undefined);
  }
}

async function login(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(accountEmail);
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const loginSucceeded = await waitForHome(page, 20_000);
  if (!loginSucceeded) {
    if (!createAccountIfMissing) {
      throw new Error('Dedicated test account login did not reach /home.');
    }
    info('Email login did not reach /home; creating the dedicated test account through /signup.');
    await signup(page);
  }
  await page.getByPlaceholder('Paste a link to add a bookmark').waitFor({ state: 'visible', timeout: 20_000 });
}

async function signup(page) {
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(accountEmail);
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button', { name: /^Sign Up$/i }).click();
  if (!(await waitForHome(page, 20_000))) {
    throw new Error('Dedicated test account signup did not reach /home.');
  }
}

async function waitForHome(page, timeout) {
  try {
    await page.waitForURL(/\/home(?:\?|$)/, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function createCategory(page, categoryName) {
  await page.locator('nav div.relative.ml-4').click();
  await page.getByText('Create New Category').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Category Name').fill(categoryName);
  await page.getByPlaceholder('Category Name').press('Enter');
  await page.getByRole('button', { name: categoryName }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function createBookmark(page, accessToken, bookmarkURL) {
  const input = page.getByPlaceholder('Paste a link to add a bookmark');
  await input.fill(bookmarkURL);
  await input.press('Enter');
  const bookmark = await findBookmarkByUrl(accessToken, bookmarkURL);
  const displayTitle = bookmark?.title || bookmarkURL;
  await expectVisibleText(page, displayTitle);
  return displayTitle;
}

async function openBookmark(context, page, titleOrURL, expectedURL = titleOrURL) {
  const popupPromise = context.waitForEvent('page', { timeout: 10_000 });
  await visibleText(page, titleOrURL).first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
  if (!popup.url().includes(expectedURL)) {
    throw new Error(`Bookmark popup opened unexpected URL: ${popup.url()}`);
  }
  await popup.close();
}

async function openBookmarkContextMenu(page, title) {
  const bookmarkTitle = visibleText(page, title);
  await bookmarkTitle.first().waitFor({ state: 'visible', timeout: 10_000 });
  await bookmarkTitle.first().click({ button: 'right' });
}

async function expectVisibleText(page, text) {
  await visibleText(page, text).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function expectAnyVisibleText(page, options) {
  await Promise.any(options.map((text) => visibleText(page, text).first().waitFor({ state: 'visible', timeout: 15_000 }))).catch(() => {
    throw new Error(`Expected one of these visible messages: ${options.join(', ')}`);
  });
}

function visibleText(page, text) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

async function readAccessToken(context) {
  const cookies = await context.cookies(webURL.origin);
  const token = cookies.find((cookie) => cookie.name === 'access_token')?.value;
  if (!token) {
    throw new Error('No access_token cookie found after test-account login.');
  }
  return token;
}

async function cleanupDisposableData(token, { categoryName, bookmarkURL, renamedTitle }) {
  const bookmarks = await apiGet(token, 'bookmarks').catch(() => []);
  for (const bookmark of bookmarks) {
    if (bookmark?.url === bookmarkURL || bookmark?.title === renamedTitle) {
      await apiDelete(token, `bookmarks/${bookmark.id}`).catch(() => undefined);
    }
  }

  await deleteCategoryByName(token, categoryName);
  return disposableDataCounts(token, { categoryName, bookmarkURL, renamedTitle });
}

async function disposableDataCounts(token, { categoryName, bookmarkURL, renamedTitle }) {
  const [bookmarks, categories] = await Promise.all([
    apiGet(token, 'bookmarks').catch(() => []),
    apiGet(token, 'categories').catch(() => [])
  ]);
  return {
    bookmarks: bookmarks.filter((bookmark) => bookmark?.url === bookmarkURL || bookmark?.title === renamedTitle).length,
    categories: categories.filter((category) => category?.name === categoryName).length
  };
}

async function findBookmarkByUrl(token, bookmarkURL) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const bookmarks = await apiGet(token, 'bookmarks').catch(() => []);
    const bookmark = bookmarks.find((candidate) => candidate?.url === bookmarkURL);
    if (bookmark) {
      return bookmark;
    }
    await delay(500);
  }
  throw new Error(`Created bookmark was not returned by the API: ${bookmarkURL}`);
}

async function deleteCategoryByName(token, categoryName) {
  const categories = await apiGet(token, 'categories').catch(() => []);
  const category = categories.find((candidate) => candidate?.name === categoryName);
  if (category) {
    await apiDelete(token, `categories/${category.id}`);
  }
}

async function apiGet(token, apiPath) {
  const response = await fetch(`${apiBaseURL}/${apiPath}`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function apiDelete(token, apiPath) {
  const response = await fetch(`${apiBaseURL}/${apiPath}`, {
    method: 'DELETE',
    headers: authHeaders(token)
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${apiPath} failed: ${response.status} ${await response.text()}`);
  }
}

function printSignoffTemplate(cleanupCounts) {
  line('Set BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF from this real run:');
  code(
    `export BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF='${releaseDate}: pnpm smoke:production:test-account passed for dedicated test account ${accountLabel} email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories ${cleanupCounts.bookmarks}|${cleanupCounts.categories}; no real user data touched'`
  );
}

function normaliseApiBaseURL(rawBaseURL) {
  const withoutTrailingSlash = rawBaseURL.replace(/\/$/, '');
  if (isV1ProductionOracle) {
    return withoutTrailingSlash;
  }
  return withoutTrailingSlash.endsWith('/api/v1') ? withoutTrailingSlash : `${withoutTrailingSlash}/api/v1`;
}

function authHeaders(token) {
  if (isV1ProductionOracle) {
    return {
      Cookie: `access_token=${token}`
    };
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

function parseRouteTargetCookie(value) {
  if (/[\r\n]/.test(value)) {
    fail('BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE must not contain line breaks.');
  }
  const [pair] = value.split(';', 1);
  const separatorIndex = pair.indexOf('=');
  if (separatorIndex <= 0) {
    fail('BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE must start with a name=value cookie pair.');
  }
  const name = pair.slice(0, separatorIndex).trim();
  const cookieValue = pair.slice(separatorIndex + 1).trim();
  if (!name || !cookieValue) {
    fail('BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE must include a non-empty cookie name and value.');
  }
  if (/[\s,;]/.test(name)) {
    fail('BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE has an invalid cookie name.');
  }
  return {
    name,
    value: cookieValue
  };
}

function isLocalhost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function localDate(date) {
  const timeZone = process.env.TZ || 'Asia/Seoul';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function section(title) {
  console.log(`\n## ${title}`);
}

function line(value) {
  console.log(value);
}

function bullet(value) {
  console.log(`- ${value}`);
}

function ordered(items) {
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
}

function code(value) {
  console.log('```bash');
  console.log(value);
  console.log('```');
}

function info(message) {
  console.log(`[test-account-smoke] ${message}`);
}

function fail(message) {
  console.log(`[test-account-smoke] ${message}`);
  process.exit(1);
}
