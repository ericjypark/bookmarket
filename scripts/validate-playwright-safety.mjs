#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const testRoot = path.join(repoRoot, 'tests/playwright');

const config = await readText('playwright.config.ts');
const authSpec = await readText('v1-auth-parity.spec.ts');
const interactionSpec = await readText('v1-interaction-parity.spec.ts');
const routingSpec = await readText('v1-routing-parity.spec.ts');
const visualSpec = await readText('v1-visual-baseline.spec.ts');
const readme = await readText('README.md');
const oauthHook = await readRepoText("apps/web/src/app/(pages)/(auth)/_hooks/use-oauth.tsx");
const googleOAuthAction = await readRepoText("apps/web/src/app/(pages)/(auth)/_actions/fetch-google-user-info.action.ts");
const githubOAuthAction = await readRepoText("apps/web/src/app/(pages)/(auth)/_actions/fetch-github-user-info.action.ts");
const githubOAuthPage = await readRepoText("apps/web/src/app/(pages)/(auth)/oauth/github/page.tsx");
const oauthStateRoute = await readRepoText('apps/web/src/app/api/oauth/state/route.ts');
const failures = [];

validateConfig();
validateLocalOnlySpec('v1-auth-parity.spec.ts', authSpec, 'BOOKMARKET_AUTH_PARITY', 'Auth parity checks are local-only');
validateLocalOnlySpec(
  'v1-interaction-parity.spec.ts',
  interactionSpec,
  'BOOKMARKET_INTERACTION_PARITY',
  'Interaction parity checks are local-only'
);
validateLocalOnlySpec(
  'v1-routing-parity.spec.ts',
  routingSpec,
  'BOOKMARKET_ROUTING_PARITY',
  'Routing parity checks are local-only'
);
validateInteractionCleanup();
validateAuthSafety();
validateWebOAuthStateFlow();
validateVisualReadOnly();
validateDocs();

if (failures.length > 0) {
  console.error('Playwright safety validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Playwright safety validated: mutation-capable parity specs are local-only and production visual checks remain read-only.');

function validateConfig() {
  for (const marker of [
    "process.env.BOOKMARKET_BASE_URL ?? 'https://bmkt.ericjypark.com'",
    "process.env.BOOKMARKET_AUTH_STORAGE || undefined",
    "snapshotDir: '__screenshots__'",
    "name: 'desktop-1440'",
    "name: 'tablet-834'",
    "name: 'mobile-390'"
  ]) {
    assertIncludes(config, marker, `Playwright config missing marker: ${marker}`);
  }
}

function validateLocalOnlySpec(fileName, source, enableEnv, localOnlyMessage) {
  for (const marker of [
    `process.env.${enableEnv} === '1'`,
    `test.skip(!isLocalURL(baseURL), '${localOnlyMessage}`,
    'function isLocalURL(rawURL: string)',
    "hostname === 'localhost'",
    "hostname === '127.0.0.1'",
    "hostname === '::1'"
  ]) {
    assertIncludes(source, marker, `${fileName} missing local-only safety marker: ${marker}`);
  }
}

function validateInteractionCleanup() {
  for (const marker of [
    'BOOKMARKET_AUTH_STORAGE is required for authenticated interaction checks',
    'BOOKMARKET_AUTH_STORAGE file does not exist',
    'apiDelete(token, `bookmarks/${createdBookmark.id}`)',
    'apiDelete(token, `categories/${createdCategory.id}`)',
    'apiDelete(token, `bookmarks/${created.id}`)',
    "apiPatch(token, 'users/me', originalProfile).catch"
  ]) {
    assertIncludes(interactionSpec, marker, `interaction parity spec missing cleanup/safety marker: ${marker}`);
  }
}

function validateAuthSafety() {
  for (const marker of [
    'await page.context().clearCookies()',
    'await context.clearCookies()',
    'loginSeedOwner()',
    'expect(refreshResponse.status).toBe(401)',
    "await page.route('https://github.com/login/oauth/authorize**'",
    'const statePrefetch = page.waitForResponse',
    "response.url().endsWith('/api/oauth/state')",
    'await statePrefetch',
    "expect.poll(() => githubAuthorizeURL?.searchParams.get('state')).toBeTruthy()",
    "expect(githubAuthorizeURL?.searchParams.get('scope')).toBe('user:email')",
    "expect(githubAuthorizeURL?.searchParams.get('redirect_uri')).toBeTruthy()"
  ]) {
    assertIncludes(authSpec, marker, `auth parity spec missing safety marker: ${marker}`);
  }
}

function validateWebOAuthStateFlow() {
  for (const marker of [
    "React.useState<Partial<Record<'google' | 'github', string>>>({})",
    "void refreshOAuthState('google')",
    "void refreshOAuthState('github')",
    'setOAuthStates(current => ({',
    "startGoogleLogin({ state: googleState })",
    ".then(state => startGoogleLogin({ state }))",
    "scope: 'user:email'",
    'state,',
    'window.location.href = `https://github.com/login/oauth/authorize?${searchParams.toString()}`',
    'navigateToGithub(oauthStates.github)'
  ]) {
    assertIncludes(oauthHook, marker, `web OAuth hook missing state-flow marker: ${marker}`);
  }

  for (const marker of [
    'auth/oauth/google',
    'accessToken: codeResponse.access_token',
    'state: codeResponse.state',
    'await setAccessToken(response.accessToken)',
    'await setRefreshToken(response.refreshToken)',
    "redirect('/home')",
    "redirect('/login?error=oauth_failed')"
  ]) {
    assertIncludes(googleOAuthAction, marker, `Google OAuth action missing state/session marker: ${marker}`);
  }

  for (const marker of [
    'auth/oauth/github',
    'code,',
    'redirectUri: process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI',
    'state,',
    'await setAccessToken(response.accessToken)',
    'await setRefreshToken(response.refreshToken)',
    "redirect('/home')",
    "redirect('/login?error=oauth_failed')"
  ]) {
    assertIncludes(githubOAuthAction, marker, `GitHub OAuth action missing state/session marker: ${marker}`);
  }

  for (const marker of [
    "const code = searchParams.get('code')",
    "const state = searchParams.get('state')",
    'void fetchGithubUserInfo(code, state)'
  ]) {
    assertIncludes(githubOAuthPage, marker, `GitHub OAuth callback page missing state marker: ${marker}`);
  }

  for (const marker of [
    'request.text()',
    '/api/v1/auth/oauth/state',
    "method: 'POST'",
    "cache: 'no-store'",
    "'Content-Type': response.headers.get('Content-Type') ?? 'application/json'"
  ]) {
    assertIncludes(oauthStateRoute, marker, `OAuth state proxy route missing marker: ${marker}`);
  }
}

function validateVisualReadOnly() {
  for (const marker of [
    "const visualScope = process.env.BOOKMARKET_VISUAL_SCOPE ?? 'all'",
    "scope: 'public'",
    "scope: 'seeded'",
    'requiresAuth: true',
    'requiresSeedUsername: true',
    'await page.goto(path',
    'await expect(page).toHaveScreenshot'
  ]) {
    assertIncludes(visualSpec, marker, `visual baseline spec missing read-only marker: ${marker}`);
  }

  for (const [pattern, label] of [
    [/\.(?:click|fill|press|type|selectOption|setInputFiles|dragTo)\s*\(/, 'mutating user action'],
    [/\bfetch\s*\(/, 'direct network fetch'],
    [/\bapi(?:Post|Patch|Delete|Json)\b/, 'API mutation helper'],
    [/\bgrantPermissions\b/, 'browser permission mutation']
  ]) {
    if (pattern.test(visualSpec)) {
      failures.push(`visual baseline spec must stay read-only; found ${label}.`);
    }
  }
}

function validateDocs() {
  for (const marker of [
    'Do not run auth parity against production',
    'revokes only a fresh local refresh token',
    'BOOKMARKET_INTERACTION_PARITY=1',
    'BOOKMARKET_ROUTING_PARITY=1',
    'BOOKMARKET_VISUAL_SCOPE=public',
    'read-only production check'
  ]) {
    assertIncludes(readme, marker, `Playwright README missing safety marker: ${marker}`);
  }
}

async function readText(relativePath) {
  return readFile(path.join(testRoot, relativePath), 'utf8');
}

async function readRepoText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(source, marker, message) {
  if (!source.includes(marker)) {
    failures.push(message);
  }
}
