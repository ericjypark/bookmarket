#!/usr/bin/env node

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { productionKubeContextBlocker } from './lib/production-context.mjs';
import {
  compareK3sPublicRouteTargets,
  curlResolveArgs,
  parseRoutePaths
} from './lib/route-targets.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const routeTargetOnly = args.has('--route-target-only');
const preflightOnly = args.has('--preflight-only');
const providerStartOnly = args.has('--provider-start-only');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--route-target-only', '--preflight-only', '--provider-start-only', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const releaseDate = (process.env.BOOKMARKET_RELEASE_DATE ?? localDate(new Date())).trim();
const webURL = new URL(process.env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
const apiBaseURL = normaliseApiBaseURL(process.env.BOOKMARKET_API_URL ?? 'https://api.bmkt.ericjypark.com');
const providers = parseProviders(process.env.BOOKMARKET_OAUTH_PROVIDERS ?? 'google,github');
const oauthAppLabel = (process.env.BOOKMARKET_OAUTH_APP_LABEL ?? '').trim();
const testAccountLabel = (process.env.BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL ?? '').trim();
const expectedAccountEmails = expectedAccountEmailsByProvider(providers, testAccountLabel);
const approved = process.env.BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED === '1';
const confirmDedicatedAccount = process.env.BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT === '1';
const startPath = normaliseStartPath(process.env.BOOKMARKET_OAUTH_START_PATH ?? '/login');
const timeoutMs = positiveInteger(process.env.BOOKMARKET_OAUTH_PROVIDER_TIMEOUT_MS, 180_000);
const headless = process.env.BOOKMARKET_OAUTH_PROVIDER_HEADLESS === '1';
const browserChannel = (process.env.BOOKMARKET_OAUTH_PROVIDER_BROWSER_CHANNEL ?? '').trim();
const storageStatePath = (process.env.BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE ?? '').trim();
const userDataDir = (process.env.BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR ?? '').trim();
const dedicatedProviderProfileMarkerFileName = '.bookmarket-dedicated-oauth-provider-profile';
const confirmDedicatedBrowserProfile = process.env.BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE === '1';
const expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT;
const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
const routeTargetCookie = (process.env.BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE ?? '').trim();
const hostResolveIP = (
  process.env.BOOKMARKET_OAUTH_HOST_RESOLVE_IP
  ?? process.env.BOOKMARKET_OAUTH_ROUTE_TARGET_RESOLVE_IP
  ?? ''
).trim();
const routeTargetPaths = parseRoutePaths(
  process.env.BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS ?? `${startPath},/home`,
  'BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS'
);
const routeTargetHeaders = routeTargetCookie ? [`Cookie: ${routeTargetCookie}`] : [];
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
  const selectedModes = [routeTargetOnly, preflightOnly, providerStartOnly].filter(Boolean);
  if (selectedModes.length > 1) {
    fail('Choose only one of --route-target-only, --preflight-only, or --provider-start-only.');
  }

  section('Bookmarket OAuth provider smoke');
  line(`Web URL: ${webURL.origin}`);
  line(`API URL: ${apiBaseURL}`);
  line(`Start path: ${startPath}`);
  line(`Providers: ${humanProviders(providers)}`);
  line(`Route target proof paths: ${routeTargetPaths.join(', ')}`);
  if (routeTargetCookie) {
    line('Route target canary cookie: configured');
  }
  if (hostResolveIP) {
    line(`OAuth host resolve override: ${hostResolveIP}`);
  }
  if (storageStatePath) {
    line('Provider storage state: configured');
  }
  if (userDataDir) {
    line('Provider user-data directory: configured');
  }
  if (browserChannel) {
    line(`Browser channel: ${browserChannel}`);
  }

  if (dryRun) {
    printDryRunPlan();
    return;
  }

  if (routeTargetOnly) {
    assertRouteTargetOnlyPreconditions();
    assertOAuthRouteTarget();
    info('OAuth provider route-target proof completed without opening a browser or printing a signoff template.');
    return;
  }

  if (providerStartOnly) {
    assertProviderStartOnlyPreconditions();
    assertOAuthRouteTarget();
    await runProviderStartCheck();
    info('OAuth provider start check completed without completing provider login, verifying /api/v1/users/me, or printing a signoff template.');
    info('This is not OAuth provider signoff evidence; a real provider browser smoke must still verify /api/v1/users/me for the dedicated provider test account.');
    return;
  }

  assertRealRunPreconditions();
  const routeFingerprints = assertOAuthRouteTarget();
  if (preflightOnly) {
    info(`OAuth provider real-run preflight completed without opening a browser or printing a signoff template. Route fingerprints: ${routeFingerprints.join(', ')}.`);
    info('This is not OAuth provider signoff evidence; a real provider browser smoke must still verify /api/v1/users/me for the dedicated provider test account.');
    return;
  }
  await runProviderSmoke(routeFingerprints);
}

function usage() {
  console.log(`Usage: node scripts/oauth-provider-smoke.mjs [--dry-run] [--route-target-only] [--preflight-only] [--provider-start-only]

Runs the guarded OAuth provider browser smoke described in docs/testing/oauth-verification.md.
Real runs open a browser for manual Google/GitHub login and require explicit approval env vars.
With --route-target-only, prove the public OAuth route target and exit without opening a browser or printing a signoff template.
With --preflight-only, validate the real-run env/profile preconditions plus route target proof, then exit before opening a browser or contacting Google/GitHub.
With --provider-start-only, click the copied v1 provider buttons and verify the Google/GitHub authorization URLs without entering credentials or printing a signoff template.
Package shortcuts: pnpm smoke:oauth-provider:route-targets, pnpm smoke:oauth-provider:preflight, pnpm smoke:oauth-provider:provider-starts.
`);
}

function printDryRunPlan() {
  line('Dry run: no browser, provider, API, or mutation commands will run.');
  line('Real run requires these env vars:');
  bullet('BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1');
  bullet('BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1');
  bullet('BOOKMARKET_OAUTH_APP_LABEL=<local/staging/test/sandbox/dev OAuth app>');
  bullet('BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL=<dedicated-provider-test-account>');
  bullet('BOOKMARKET_OAUTH_EXPECTED_EMAIL=<dedicated-provider-test-account-email> when the label is not the account email.');
  bullet('Optional provider-specific overrides: BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL and BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL.');
  bullet('BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context> when BOOKMARKET_WEB_URL is a non-local production URL.');
  bullet('BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1 for --provider-start-only pre-login provider authorization URL checks.');
  bullet(`Optional: BOOKMARKET_WEB_URL, BOOKMARKET_API_URL, BOOKMARKET_OAUTH_PROVIDERS, BOOKMARKET_OAUTH_START_PATH, BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS, BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE, BOOKMARKET_OAUTH_HOST_RESOLVE_IP, BOOKMARKET_KUBE_NAMESPACE, BOOKMARKET_OAUTH_PROVIDER_TIMEOUT_MS, BOOKMARKET_OAUTH_PROVIDER_HEADLESS=1, BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE, BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR prepared by pnpm smoke:oauth-provider:profile:prepare with ${dedicatedProviderProfileMarkerFileName}, BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1, BOOKMARKET_OAUTH_PROVIDER_BROWSER_CHANNEL`);
  line('Real run plan:');
  ordered([
    'For non-local URLs, verify the active kube context and prove /login and /home are served by the k3s web pod using direct-k3s/public response asset fingerprints. If BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE is set, this proof is scoped to the pre-cutover canary cookie and does not satisfy the final migration/cutover gate. If BOOKMARKET_OAUTH_HOST_RESOLVE_IP is set, curl and the smoke browser keep the public hostnames but route them to that explicit IP.',
    'Optionally run pnpm smoke:oauth-provider:preflight to validate the real-run environment, prepared provider browser profile marker, and route target proof before opening a provider browser.',
    `Open ${startPath} in a fresh browser context for each provider, optionally seeded from a dedicated provider storage-state file or a dedicated provider browser profile containing ${dedicatedProviderProfileMarkerFileName}.`,
    'Click the copied v1 Google and/or Github OAuth buttons.',
    'Wait for the operator to complete the third-party provider login manually.',
    'Verify redirect to /home, the v1 bookmark input shell, Bookmarket session cookies, and /api/v1/users/me email identity for the dedicated provider test account.',
    'Close the browser context between providers so each provider proves its own login path.',
    'Print the BOOKMARKET_OAUTH_SMOKE_SIGNOFF template after all selected providers pass.'
  ]);
  line('Provider-start-only plan: prove the v2 route target, open /login or /signup, click each provider button, verify the provider authorization URL contains required public parameters, then exit without provider credentials or Bookmarket signoff.');
}

function assertRealRunPreconditions() {
  if (!approved) {
    fail('Set BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1 to approve the external provider browser smoke.');
  }
  if (!confirmDedicatedAccount) {
    fail('Set BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1 to confirm the provider login uses a dedicated provider test account.');
  }
  if (!oauthAppLabel) {
    fail('BOOKMARKET_OAUTH_APP_LABEL is required.');
  }
  if (!/(local|staging|test|sandbox|dev)/i.test(oauthAppLabel) || !/oauth/i.test(oauthAppLabel)) {
    fail('BOOKMARKET_OAUTH_APP_LABEL must describe a local/staging/test/sandbox/dev OAuth app.');
  }
  if (!testAccountLabel) {
    fail('BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL is required.');
  }
  const missingExpectedEmailProviders = providers.filter((provider) => !expectedAccountEmails.get(provider));
  if (missingExpectedEmailProviders.length > 0) {
    fail(
      `BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL must be the dedicated account email, BOOKMARKET_OAUTH_EXPECTED_EMAIL must be set, or provider-specific expected email env must be set for: ${missingExpectedEmailProviders.join(', ')}.`
    );
  }
  const invalidExpectedEmailProviders = providers.filter((provider) => !isEmailLike(expectedAccountEmails.get(provider) ?? ''));
  if (invalidExpectedEmailProviders.length > 0) {
    fail(`Expected dedicated OAuth provider test account email is not email-like for: ${invalidExpectedEmailProviders.join(', ')}.`);
  }
  if (routeTargetCookie) {
    parseRouteTargetCookie(routeTargetCookie);
  }
  assertHostResolveIP();
  if (storageStatePath && userDataDir) {
    fail('Set either BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE or BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR, not both.');
  }
  if (storageStatePath && !fs.existsSync(resolveWorkspacePath(storageStatePath))) {
    fail('BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE must point to an existing Playwright storage-state JSON file.');
  }
  if (userDataDir && !confirmDedicatedBrowserProfile) {
    fail('Set BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1 to confirm BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR is a dedicated provider-test browser profile, not a real-user Chrome profile.');
  }
  if (userDataDir) {
    assertDedicatedProviderUserDataDir(userDataDir);
  }
  if (webURL.protocol !== 'https:' && !isLocalhost(webURL.hostname)) {
    fail(`Refusing non-HTTPS non-local web URL: ${webURL.origin}`);
  }
}

function assertRouteTargetOnlyPreconditions() {
  if (routeTargetCookie) {
    parseRouteTargetCookie(routeTargetCookie);
  }
  assertHostResolveIP();
  if (webURL.protocol !== 'https:' && !isLocalhost(webURL.hostname)) {
    fail(`Refusing non-HTTPS non-local web URL: ${webURL.origin}`);
  }
}

function assertProviderStartOnlyPreconditions() {
  if (process.env.BOOKMARKET_OAUTH_PROVIDER_START_APPROVED !== '1') {
    fail('Set BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1 to approve the pre-login provider authorization URL check.');
  }
  if (!oauthAppLabel) {
    fail('BOOKMARKET_OAUTH_APP_LABEL is required.');
  }
  if (!/(local|staging|test|sandbox|dev)/i.test(oauthAppLabel) || !/oauth/i.test(oauthAppLabel)) {
    fail('BOOKMARKET_OAUTH_APP_LABEL must describe a local/staging/test/sandbox/dev OAuth app.');
  }
  if (storageStatePath || userDataDir) {
    fail('Provider-start-only checks must use a fresh browser context; do not set BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE or BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR.');
  }
  if (routeTargetCookie) {
    parseRouteTargetCookie(routeTargetCookie);
  }
  assertHostResolveIP();
  if (webURL.protocol !== 'https:' && !isLocalhost(webURL.hostname)) {
    fail(`Refusing non-HTTPS non-local web URL: ${webURL.origin}`);
  }
}

function assertOAuthRouteTarget() {
  if (isLocalhost(webURL.hostname)) {
    info('Local OAuth provider smoke target detected; skipping k3s route-target proof.');
    return ['local-target'];
  }

  const currentContext = runText('Read active kube context', 'kubectl', ['config', 'current-context']).trim();
  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    fail(`${contextBlocker} Refusing to run OAuth provider smoke against a non-local URL without k3s route-target proof.`);
  }

  try {
    const { routeFingerprints } = compareK3sPublicRouteTargets({
      namespace,
      webUrl: webURL.origin,
      routePaths: routeTargetPaths,
      publicHeaders: routeTargetHeaders,
      publicResolveIP: hostResolveIP,
      publicTargetLabel: routeTargetCookie ? 'public canary URL' : 'public URL',
      publicRouteLabel: routeTargetCookie ? 'Public canary UI route' : 'Public normal UI route',
      routeDescription: routeTargetCookie ? 'Canary UI route' : 'Normal UI route',
      log: info,
      failOnMismatch: true
    });
    info(
      routeTargetCookie
        ? 'OAuth provider smoke route-target proof passed: public canary UI routes match the direct k3s web pod.'
        : 'OAuth provider smoke route-target proof passed: public normal UI routes match the direct k3s web pod.'
    );
    return routeFingerprints;
  } catch (error) {
    fail(`OAuth provider smoke route-target proof failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runProviderSmoke(routeFingerprints) {
  const browserSession = await createBrowserSession();
  const passedProviders = [];

  try {
    for (const provider of providers) {
      const context = await browserSession.newContext();
      const page = await context.newPage();

      try {
        info(`Starting ${provider} provider smoke with dedicated provider test account label: ${testAccountLabel}`);
        await prepareBookmarketContext(context);
        await page.goto(startPath, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: providerButtonName(provider) }).waitFor({ state: 'visible', timeout: 20_000 });
        await waitForProviderButtonReadiness(page, provider);

        const popupPromise = page.waitForEvent('popup', { timeout: 5_000 }).catch(() => null);
        await page.getByRole('button', { name: providerButtonName(provider) }).click();
        await popupPromise;

        const startDetails = await waitForProviderStartOrHome(context, provider);
        info(`${provider} provider flow started: ${startDetails.summary}`);
        info(`Complete ${provider} login manually in the opened browser. Waiting up to ${timeoutMs}ms for /home.`);
        const homePage = await waitForHome(context, provider);
        await homePage.getByPlaceholder('Paste a link to add a bookmark').waitFor({ state: 'visible', timeout: 20_000 });
        await assertProfileShell(homePage, provider);
        await assertSessionCookies(context);
        await assertSessionIdentity(context, provider);

        passedProviders.push(provider);
        info(`${provider} provider smoke completed.`);
      } finally {
        await context.close().catch(() => undefined);
      }
    }

    if (passedProviders.length !== providers.length) {
      fail(`Only ${humanProviders(passedProviders)} passed; expected ${humanProviders(providers)}.`);
    }

    info('OAuth provider smoke completed.');
    printSignoffTemplate(routeFingerprints);
  } finally {
    await browserSession.close().catch(() => undefined);
  }
}

async function runProviderStartCheck() {
  const browser = await chromium.launch(browserLaunchOptions());

  try {
    for (const provider of providers) {
      const context = await browser.newContext(browserOptions());
      const page = await context.newPage();

      try {
        info(`Starting ${provider} provider authorization URL check.`);
        await prepareBookmarketContext(context);
        await page.goto(startPath, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: providerButtonName(provider) }).waitFor({ state: 'visible', timeout: 20_000 });
        await waitForProviderButtonReadiness(page, provider);

        const popupPromise = page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null);
        await page.getByRole('button', { name: providerButtonName(provider) }).click();
        await popupPromise;

        const details = await waitForProviderAuthorizationStart(context, provider);
        info(`${provider} provider authorization URL check passed: ${details.summary}`);
      } finally {
        await context.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function waitForProviderButtonReadiness(page, provider) {
  if (provider === 'google') {
    await page.waitForFunction(() => Boolean(globalThis.google?.accounts?.oauth2), null, { timeout: 15_000 }).catch(() => undefined);
  }
  await page.waitForTimeout(1_000);
}

async function waitForProviderAuthorizationStart(context, provider) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (page.isClosed()) {
        continue;
      }
      const details = providerAuthorizationStartDetails(page.url(), provider);
      if (details) {
        return details;
      }
    }
    await delay(500);
  }

  const observed = context.pages()
    .filter((page) => !page.isClosed())
    .map((page) => redactProviderURL(page.url()))
    .join(', ') || 'no open pages';
  throw new Error(`${provider} provider authorization URL did not start within 30000ms. Observed pages: ${observed}`);
}

async function waitForProviderStartOrHome(context, provider) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (page.isClosed()) {
        continue;
      }

      if (isHomeURL(page.url())) {
        return {
          summary: 'Bookmarket /home reached before provider authorization URL was observed'
        };
      }

      const details = providerAuthorizationStartDetails(page.url(), provider);
      if (details) {
        return details;
      }
    }
    await delay(500);
  }

  const observed = context.pages()
    .filter((page) => !page.isClosed())
    .map((page) => redactProviderURL(page.url()))
    .join(', ') || 'no open pages';
  throw new Error(`${provider} provider smoke did not reach the provider authorization URL or /home within 30000ms. Observed pages: ${observed}`);
}

function providerAuthorizationStartDetails(value, provider) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (provider === 'github') {
    return githubAuthorizationStartDetails(url);
  }
  return googleAuthorizationStartDetails(url);
}

function githubAuthorizationStartDetails(url) {
  if (url.hostname !== 'github.com') {
    return null;
  }

  let authorizationURL = url;
  let throughLoginGate = false;
  if (url.pathname === '/login' && url.searchParams.get('return_to')) {
    authorizationURL = new URL(url.searchParams.get('return_to'), 'https://github.com');
    throughLoginGate = true;
  }

  if (authorizationURL.hostname !== 'github.com' || authorizationURL.pathname !== '/login/oauth/authorize') {
    return null;
  }

  const scope = authorizationURL.searchParams.get('scope') ?? '';
  const requiredFields = [
    ['client_id', authorizationURL.searchParams.get('client_id')],
    ['redirect_uri', authorizationURL.searchParams.get('redirect_uri')],
    ['state', authorizationURL.searchParams.get('state')]
  ];
  const missingFields = requiredFields.filter(([, fieldValue]) => !fieldValue).map(([fieldName]) => fieldName);
  if (!scope.split(/[ ,]+/).includes('user:email')) {
    missingFields.push('scope=user:email');
  }
  if (missingFields.length > 0) {
    throw new Error(`GitHub provider authorization URL is missing required public parameter(s): ${missingFields.join(', ')}.`);
  }

  return {
    summary: `${throughLoginGate ? 'GitHub login gate with return_to authorization URL' : 'GitHub authorization URL'} contains client_id, redirect_uri, state, and user:email scope`
  };
}

function googleAuthorizationStartDetails(url) {
  if (url.hostname !== 'accounts.google.com') {
    return null;
  }

  const scope = url.searchParams.get('scope') ?? '';
  const missingFields = [];
  if (!url.searchParams.get('client_id')) {
    missingFields.push('client_id');
  }
  if (!url.searchParams.get('state')) {
    missingFields.push('state');
  }
  if (url.searchParams.get('origin') !== webURL.origin) {
    missingFields.push('origin');
  }
  for (const requiredScope of ['openid', 'profile', 'email']) {
    if (!scope.split(/[ +,]+/).includes(requiredScope)) {
      missingFields.push(`scope=${requiredScope}`);
    }
  }
  if (missingFields.length > 0) {
    throw new Error(`Google provider authorization URL is missing required public parameter(s): ${missingFields.join(', ')}.`);
  }

  return {
    summary: 'Google authorization popup contains client_id, origin, state, and openid/profile/email scopes'
  };
}

async function createBrowserSession() {
  if (userDataDir) {
    return {
      async newContext() {
        return chromium.launchPersistentContext(resolveWorkspacePath(userDataDir), persistentContextOptions());
      },
      async close() {}
    };
  }

  const browser = await chromium.launch(browserLaunchOptions());
  return {
    async newContext() {
      return browser.newContext(browserOptions());
    },
    async close() {
      await browser.close();
    }
  };
}

function browserLaunchOptions() {
  const args = hostResolveIP ? ['--host-resolver-rules=' + hostResolverRules()] : [];
  return {
    headless,
    ...(args.length > 0 ? { args } : {}),
    ...(browserChannel ? { channel: browserChannel } : {})
  };
}

function browserOptions() {
  return {
    baseURL: webURL.origin,
    viewport: { width: 1440, height: 1000 },
    ...(storageStatePath ? { storageState: resolveWorkspacePath(storageStatePath) } : {})
  };
}

function persistentContextOptions() {
  return {
    ...browserLaunchOptions(),
    baseURL: webURL.origin,
    viewport: { width: 1440, height: 1000 }
  };
}

async function prepareBookmarketContext(context) {
  await clearBookmarketCookies(context);
  await clearBookmarketStorage(context);
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
}

async function clearBookmarketCookies(context) {
  const hostnames = [
    webURL.hostname,
    `.${webURL.hostname}`,
    new URL(apiBaseURL).hostname,
    `.${new URL(apiBaseURL).hostname}`
  ];

  for (const hostname of new Set(hostnames)) {
    await context.clearCookies({ domain: hostname }).catch(() => undefined);
  }
}

async function clearBookmarketStorage(context) {
  await context.addInitScript((origin) => {
    if (window.location.origin === origin) {
      window.localStorage.clear();
      window.sessionStorage.clear();
    }
  }, webURL.origin);
}

async function waitForHome(context, provider) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (page.isClosed()) {
        continue;
      }

      const currentURL = page.url();
      if (isHomeURL(currentURL)) {
        await page.bringToFront().catch(() => undefined);
        return page;
      }
    }

    await delay(500);
  }

  const observed = context.pages()
    .filter((page) => !page.isClosed())
    .map((page) => page.url())
    .join(', ') || 'no open pages';
  throw new Error(`${provider} provider smoke did not reach /home within ${timeoutMs}ms. Observed pages: ${observed}`);
}

async function assertProfileShell(page, provider) {
  const avatar = page.locator('[data-slot="avatar"]').first();
  await avatar.waitFor({ state: 'visible', timeout: 20_000 });
  await avatar.click();
  await page.getByRole('menuitem', { name: /Settings/i }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('menuitem', { name: /Logout/i }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Escape').catch(() => undefined);
  info(`${provider} provider smoke avatar/profile menu rendered with Settings and Logout.`);
}

async function assertSessionCookies(context) {
  const cookies = await context.cookies(webURL.origin);
  const cookieNames = new Set(cookies.map((cookie) => cookie.name));
  if (!cookieNames.has('access_token') && !cookieNames.has('refresh_token')) {
    throw new Error(`No Bookmarket session cookies found after OAuth login. Cookie names: ${[...cookieNames].join(', ') || 'none'}`);
  }
}

async function assertSessionIdentity(context, provider) {
  const accessToken = await readAccessToken(context);
  const profile = await fetchSessionIdentity(accessToken, provider);
  const actualEmail = String(profile?.email ?? '').trim().toLowerCase();
  const expectedAccountEmail = expectedAccountEmails.get(provider);
  if (actualEmail !== expectedAccountEmail) {
    throw new Error(`${provider} provider smoke reached /home but /api/v1/users/me did not match the expected dedicated provider test account email.`);
  }

  info(`${provider} provider smoke /api/v1/users/me identity matched the expected dedicated provider test account email.`);
}

async function fetchSessionIdentity(accessToken, provider) {
  if (!hostResolveIP) {
    const response = await fetch(`${apiBaseURL}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      throw new Error(`${provider} provider smoke could not verify /api/v1/users/me identity: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }

  const result = spawnSync(
    'curl',
    [
      '-fsS',
      ...curlResolveArgs(apiBaseURL, hostResolveIP),
      '-H',
      `Authorization: Bearer ${accessToken}`,
      `${apiBaseURL}/users/me`
    ],
    {
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    throw new Error(`${provider} provider smoke could not verify /api/v1/users/me identity through the resolved API host: ${stderr || `curl exited ${result.status ?? 'unknown'}`}`);
  }
  return JSON.parse(result.stdout);
}

async function readAccessToken(context) {
  const cookies = await context.cookies(webURL.origin);
  const token = cookies.find((cookie) => cookie.name === 'access_token')?.value;
  if (!token) {
    throw new Error('No access_token cookie found after OAuth login.');
  }
  return token;
}

function printSignoffTemplate(routeFingerprints) {
  const routeProofScope = routeTargetCookie
    ? 'v2 canary route target proof passed with public canary routes matching direct k3s web pod fingerprints'
    : 'v2 route target proof passed with public routes matching direct k3s web pod fingerprints';
  line('Set BOOKMARKET_OAUTH_SMOKE_SIGNOFF from this real run:');
  code(
    `export BOOKMARKET_OAUTH_SMOKE_SIGNOFF='${releaseDate}: pnpm smoke:oauth-provider passed for ${humanProviders(providers)} provider smoke using ${oauthAppLabel} and dedicated provider test account ${testAccountLabel}; ${routeProofScope} ${routeFingerprints.join(', ')}; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email ${identityEmailSummary()} confirmed'`
  );
}

function runText(label, command, commandArgs) {
  info(`${label}: ${[command, ...commandArgs].join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    if (result.stderr?.length) {
      process.stderr.write(result.stderr);
    }
    if (result.error) {
      fail(`${label} failed: ${result.error.message}`);
    }
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
  return result.stdout ?? '';
}

function parseProviders(rawProviders) {
  const parsed = rawProviders
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  const uniqueProviders = [...new Set(parsed)];
  const invalidProviders = uniqueProviders.filter((provider) => provider !== 'google' && provider !== 'github');
  if (uniqueProviders.length === 0) {
    fail('BOOKMARKET_OAUTH_PROVIDERS must include google, github, or both.');
  }
  if (invalidProviders.length > 0) {
    fail(`Unsupported BOOKMARKET_OAUTH_PROVIDERS value(s): ${invalidProviders.join(', ')}`);
  }
  return uniqueProviders;
}

function normaliseStartPath(rawPath) {
  const pathValue = rawPath.trim() || '/login';
  if (pathValue !== '/login' && pathValue !== '/signup') {
    fail('BOOKMARKET_OAUTH_START_PATH must be /login or /signup.');
  }
  return pathValue;
}

function normaliseApiBaseURL(rawBaseURL) {
  const withoutTrailingSlash = rawBaseURL.replace(/\/$/, '');
  return withoutTrailingSlash.endsWith('/api/v1') ? withoutTrailingSlash : `${withoutTrailingSlash}/api/v1`;
}

function expectedAccountEmailsByProvider(providerValues, rawLabel) {
  const labelEmail = emailOrEmpty(rawLabel);
  const defaultExpectedEmail = emailOrEmpty(process.env.BOOKMARKET_OAUTH_EXPECTED_EMAIL ?? '') || labelEmail;
  const providerEnv = new Map([
    ['google', process.env.BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL ?? ''],
    ['github', process.env.BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL ?? '']
  ]);
  return new Map(providerValues.map((provider) => {
    const providerExpectedEmail = emailOrEmpty(providerEnv.get(provider) ?? '');
    return [provider, providerExpectedEmail || defaultExpectedEmail];
  }));
}

function emailOrEmpty(value) {
  const trimmed = value.trim().toLowerCase();
  return trimmed || '';
}

function identityEmailSummary() {
  const emails = providers.map((provider) => expectedAccountEmails.get(provider) ?? '');
  const uniqueEmails = [...new Set(emails)];
  if (uniqueEmails.length === 1) {
    return uniqueEmails[0];
  }

  return providers
    .map((provider) => `${provider === 'github' ? 'GitHub' : 'Google'} ${expectedAccountEmails.get(provider)}`)
    .join(', ');
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseRouteTargetCookie(value) {
  if (/[\r\n]/.test(value)) {
    fail('BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE must not contain line breaks.');
  }
  const [pair] = value.split(';', 1);
  const separatorIndex = pair.indexOf('=');
  if (separatorIndex <= 0) {
    fail('BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE must start with a name=value cookie pair.');
  }
  const name = pair.slice(0, separatorIndex).trim();
  const cookieValue = pair.slice(separatorIndex + 1).trim();
  if (!name || !cookieValue) {
    fail('BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE must include a non-empty cookie name and value.');
  }
  if (/[\s,;]/.test(name)) {
    fail('BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE has an invalid cookie name.');
  }
  return {
    name,
    value: cookieValue
  };
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

function resolveWorkspacePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function assertDedicatedProviderUserDataDir(value) {
  const resolved = resolveWorkspacePath(value);
  const normalised = resolved.replaceAll(path.sep, '/').toLowerCase();
  const unsafeProfilePattern =
    /(?:\/\.config\/(?:chromium|google-chrome)|\/library\/application support\/google\/chrome)(?:\/(?:default|profile [0-9]+))?$/;
  if (unsafeProfilePattern.test(normalised)) {
    fail(
      'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR must be a dedicated provider-test browser profile directory; refusing a known default Chrome/Chromium real-user profile path.'
    );
  }
  if (!fs.existsSync(path.join(resolved, dedicatedProviderProfileMarkerFileName))) {
    fail(
      `BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR must be prepared by pnpm smoke:oauth-provider:profile:prepare and contain ${dedicatedProviderProfileMarkerFileName}.`
    );
  }
}

function assertHostResolveIP() {
  if (!hostResolveIP) {
    return;
  }
  if (/[\r\n\s,]/.test(hostResolveIP)) {
    fail('BOOKMARKET_OAUTH_HOST_RESOLVE_IP must be a single IP address or hostname without whitespace.');
  }
}

function hostResolverRules() {
  const hostnames = [
    webURL.hostname,
    new URL(apiBaseURL).hostname
  ];
  return [...new Set(hostnames)]
    .map((hostname) => `MAP ${hostname} ${hostResolveIP}`)
    .join(',');
}

function providerButtonName(provider) {
  return provider === 'github' ? /^Github$/i : /^Google$/i;
}

function humanProviders(providerValues) {
  return providerValues.map((provider) => provider === 'github' ? 'GitHub' : 'Google').join(' and ');
}

function isHomeURL(value) {
  try {
    const url = new URL(value);
    return url.origin === webURL.origin && url.pathname === '/home';
  } catch {
    return value === `${webURL.origin}/home`;
  }
}

function redactProviderURL(value) {
  try {
    const url = new URL(value);
    for (const key of ['client_id', 'state', 'return_to', 'continue', 'opparams', 'rart', 'dsh']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, 'redacted');
      }
    }
    return url.toString();
  } catch {
    return value;
  }
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
  console.log(`[oauth-provider-smoke] ${message}`);
}

function fail(message) {
  console.log(`[oauth-provider-smoke] ${message}`);
  process.exit(1);
}
