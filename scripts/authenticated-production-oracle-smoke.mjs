#!/usr/bin/env node

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const releaseDate = (process.env.BOOKMARKET_RELEASE_DATE ?? localDate(new Date())).trim();
const baseURL = new URL(process.env.BOOKMARKET_V1_PRODUCTION_URL ?? 'https://bmkt.ericjypark.com');
const approved = process.env.BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED === '1';
const confirmReadOnly = process.env.BOOKMARKET_CONFIRM_READ_ONLY_ORACLE === '1';
const accountLabel = (process.env.BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL ?? '').trim();
const publicUsername = (process.env.BOOKMARKET_PUBLIC_PROFILE_USERNAME ?? '').trim();
const storageStatePath = (process.env.BOOKMARKET_AUTHENTICATED_ORACLE_STORAGE_STATE ?? '').trim();
const userDataDir = (process.env.BOOKMARKET_AUTHENTICATED_ORACLE_USER_DATA_DIR ?? '').trim();
const browserChannel = (process.env.BOOKMARKET_AUTHENTICATED_ORACLE_BROWSER_CHANNEL ?? '').trim();
const timeoutMs = positiveInteger(process.env.BOOKMARKET_AUTHENTICATED_ORACLE_TIMEOUT_MS, 120_000);
const headless = process.env.BOOKMARKET_AUTHENTICATED_ORACLE_HEADLESS === '1';

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

  section('Bookmarket authenticated production oracle smoke');
  line(`Production URL: ${baseURL.origin}`);
  line(`Public profile username: ${publicUsername || '<required-for-real-run>'}`);

  if (dryRun) {
    printDryRunPlan();
    return;
  }

  assertRealRunPreconditions();
  await runReadOnlyOracle();
}

function usage() {
  console.log(`Usage: node scripts/authenticated-production-oracle-smoke.mjs [--dry-run]

Runs the read-only authenticated v1 production oracle inspection described in goal.md.
Real runs require explicit read-only approval and an authenticated production browser session.
`);
}

function printDryRunPlan() {
  line('Dry run: no browser, provider, API, form submit, mutation, or production action will run.');
  line('Real run requires these env vars:');
  bullet('BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED=1');
  bullet('BOOKMARKET_CONFIRM_READ_ONLY_ORACLE=1');
  bullet('BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL=<authenticated-account-label>');
  bullet('BOOKMARKET_PUBLIC_PROFILE_USERNAME=<known-public-username>');
  bullet('Optional: BOOKMARKET_V1_PRODUCTION_URL, BOOKMARKET_AUTHENTICATED_ORACLE_STORAGE_STATE, BOOKMARKET_AUTHENTICATED_ORACLE_USER_DATA_DIR, BOOKMARKET_AUTHENTICATED_ORACLE_BROWSER_CHANNEL, BOOKMARKET_AUTHENTICATED_ORACLE_TIMEOUT_MS, BOOKMARKET_AUTHENTICATED_ORACLE_HEADLESS=1');
  line('Real run plan:');
  ordered([
    'Open v1 production /home with an authenticated session.',
    'Verify the session is authenticated by opening the avatar menu and observing Settings/Logout without clicking Logout.',
    'Inspect /home bookmark-input shell and bookmark-list layout.',
    'Inspect category filter behavior by selecting a visible category when one exists, then returning to /home.',
    'Inspect command menu behavior by opening it with Meta+K or Control+K and closing it with Escape.',
    'Inspect profile settings/subdomain UI by opening Settings and closing with Cancel/Escape without saving.',
    'Inspect /s/<known-public-username> public profile behavior.',
    'Print the BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF template after all read-only checks pass.'
  ]);
}

function assertRealRunPreconditions() {
  if (!approved) {
    fail('Set BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED=1 to approve the read-only authenticated production oracle inspection.');
  }
  if (!confirmReadOnly) {
    fail('Set BOOKMARKET_CONFIRM_READ_ONLY_ORACLE=1 to confirm this run must not mutate production data.');
  }
  if (!accountLabel) {
    fail('BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL is required.');
  }
  if (!publicUsername) {
    fail('BOOKMARKET_PUBLIC_PROFILE_USERNAME is required so public profile behavior can be inspected.');
  }
  if (baseURL.protocol !== 'https:' && !isLocalhost(baseURL.hostname)) {
    fail(`Refusing non-HTTPS non-local production URL: ${baseURL.origin}`);
  }
  if (storageStatePath && !fs.existsSync(storageStatePath)) {
    fail(`BOOKMARKET_AUTHENTICATED_ORACLE_STORAGE_STATE does not exist: ${storageStatePath}`);
  }
  if (storageStatePath && userDataDir) {
    fail('Use either BOOKMARKET_AUTHENTICATED_ORACLE_STORAGE_STATE or BOOKMARKET_AUTHENTICATED_ORACLE_USER_DATA_DIR, not both.');
  }
}

async function runReadOnlyOracle() {
  const browserSession = await openBrowserSession();
  const { context, page } = browserSession;

  try {
    await inspectAuthenticatedHome(page);
    await inspectSessionMenu(page);
    await inspectCategoryFilter(page);
    await inspectCommandMenu(page);
    await inspectProfileSettings(page);
    await inspectPublicProfile(page);

    info('Authenticated production oracle smoke completed without production mutations.');
    printSignoffTemplate();
  } finally {
    await browserSession.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function openBrowserSession() {
  const launchOptions = {
    headless,
    ...(browserChannel ? { channel: browserChannel } : {})
  };

  if (userDataDir) {
    const context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      baseURL: baseURL.origin,
      viewport: { width: 1440, height: 1000 }
    });
    const page = context.pages()[0] ?? await context.newPage();
    return { context, page, close: () => context.close() };
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    baseURL: baseURL.origin,
    viewport: { width: 1440, height: 1000 },
    ...(storageStatePath ? { storageState: storageStatePath } : {})
  });
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

async function inspectAuthenticatedHome(page) {
  info('Opening authenticated v1 production /home.');
  await page.goto('/home', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.locator('nav#nav').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.getByPlaceholder('Paste a link to add a bookmark').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('main').last().waitFor({ state: 'visible', timeout: timeoutMs });

  const loginVisible = await page.locator('nav#nav a[href="/login"]').isVisible().catch(() => false);
  if (loginVisible) {
    throw new Error('Production /home is showing the Login link, so no authenticated session is available.');
  }
}

async function inspectSessionMenu(page) {
  info('Inspecting authenticated avatar menu without selecting Logout.');
  await openAvatarMenu(page);
  await page.getByText('Settings', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText('Logout', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Escape');
}

async function inspectCategoryFilter(page) {
  info('Inspecting category filter behavior.');
  await page.goto('/home', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const categoryButtons = page.locator('nav#nav button').filter({ has: page.locator('p') });
  const count = await categoryButtons.count();
  if (count === 0) {
    info('No visible category buttons found; recorded empty category-filter surface.');
    return;
  }

  const firstCategory = categoryButtons.first();
  const categoryName = (await firstCategory.innerText()).trim();
  await firstCategory.click();
  await page.waitForURL((url) => url.pathname === '/home' && url.searchParams.has('c'), { timeout: 10_000 });
  info(`Category filter selected read-only category: ${categoryName}`);
  await page.goto('/home', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
}

async function inspectCommandMenu(page) {
  info('Inspecting command menu read-only.');
  await page.goto('/home', { waitUntil: 'networkidle', timeout: timeoutMs });
  await page.mouse.click(500, 500).catch(() => undefined);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  await page.keyboard.press('KeyK');
  await page.keyboard.up(modifier);
  await page.getByPlaceholder('Search for a bookmark...').waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Escape');
}

async function inspectProfileSettings(page) {
  info('Inspecting profile settings/subdomain UI without saving.');
  await openAvatarMenu(page);
  await page.getByText('Settings', { exact: true }).click();
  await page.getByText('Edit profile', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText('Personal Subdomain', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText('.bmkt.tech', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  const cancel = page.getByRole('button', { name: 'Cancel' });
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
  } else {
    await page.keyboard.press('Escape');
  }
}

async function inspectPublicProfile(page) {
  info(`Inspecting public profile /s/${publicUsername}.`);
  await page.goto(`/s/${encodeURIComponent(publicUsername)}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.locator('nav#nav').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.locator('main').last().waitFor({ state: 'visible', timeout: timeoutMs });
}

async function openAvatarMenu(page) {
  await page.locator('nav#nav').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const loginVisible = await page.locator('nav#nav a[href="/login"]').isVisible().catch(() => false);
  if (loginVisible) {
    throw new Error('Cannot inspect authenticated menu because production nav is logged out.');
  }

  const avatarTrigger = page.locator('nav#nav [data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]');
  if (await avatarTrigger.isVisible().catch(() => false)) {
    await avatarTrigger.click({ force: true });
    return;
  }

  const directNavChildren = page.locator('nav#nav').locator('xpath=./*');
  await directNavChildren.last().click();
}

function printSignoffTemplate() {
  line('Set BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF from this real run:');
  code(
    `export BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF='${releaseDate}: pnpm smoke:authenticated-prod-oracle passed for authenticated session ${accountLabel}; read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/${publicUsername}'`
  );
}

function positiveInteger(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`Expected a positive integer timeout; received ${rawValue}.`);
  }
  return value;
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
  console.log(`[authenticated-prod-oracle] ${message}`);
}

function fail(message) {
  console.log(`[authenticated-prod-oracle] ${message}`);
  process.exit(1);
}
