#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/v1-seed-data.json');
const defaultOutputPath = path.join(repoRoot, 'tests/playwright/.auth/v1-owner.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage:
  node scripts/create-v1-auth-state.mjs [--dry-run]

Environment:
  BOOKMARKET_V1_API_URL      Defaults to http://localhost:8000.
  BOOKMARKET_WEB_ORIGIN      Defaults to http://localhost:3000.
  BOOKMARKET_AUTH_STORAGE    Defaults to tests/playwright/.auth/v1-owner.json.
  BOOKMARKET_SEED_EMAIL      Defaults to owner.seed@bookmarket.local.
  BOOKMARKET_SEED_PASSWORD   Defaults to the local-only fixture password.
`);
  process.exit(0);
}

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const owner = fixture.users.find(user => user.email === 'owner.seed@bookmarket.local');

if (!owner) {
  throw new Error('Owner seed user is missing from tests/fixtures/v1-seed-data.json.');
}

const apiUrl = trimTrailingSlash(process.env.BOOKMARKET_V1_API_URL || 'http://localhost:8000');
const webOrigin = trimTrailingSlash(process.env.BOOKMARKET_WEB_ORIGIN || process.env.BOOKMARKET_BASE_URL || 'http://localhost:3000');
const outputPath = path.resolve(process.env.BOOKMARKET_AUTH_STORAGE || defaultOutputPath);
const email = process.env.BOOKMARKET_SEED_EMAIL || owner.email;
const password = process.env.BOOKMARKET_SEED_PASSWORD || owner.passwordPlaintextForLocalSeedOnly;

if (dryRun) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    apiUrl,
    webOrigin,
    outputPath,
    email,
  }, null, 2));
  process.exit(0);
}

const response = await fetch(`${apiUrl}/authentication/signin`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email, password }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Failed to sign in to local v1 API: HTTP ${response.status} ${body}`);
}

const tokens = await response.json();

if (!tokens.accessToken || !tokens.refreshToken) {
  throw new Error('V1 API signin response did not include accessToken and refreshToken.');
}

const storageState = buildStorageState(webOrigin, tokens);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(storageState, null, 2)}\n`, 'utf8');

console.log(`Wrote Playwright auth storage to ${outputPath}`);

function buildStorageState(origin, tokens) {
  const url = new URL(origin);
  const secure = url.protocol === 'https:';
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    cookies: [
      {
        name: 'access_token',
        value: tokens.accessToken,
        domain: url.hostname,
        path: '/',
        expires: nowSeconds + 604800,
        httpOnly: true,
        secure,
        sameSite: 'Lax',
      },
      {
        name: 'refresh_token',
        value: tokens.refreshToken,
        domain: url.hostname,
        path: '/',
        expires: nowSeconds + 3024000,
        httpOnly: true,
        secure,
        sameSite: 'Lax',
      },
    ],
    origins: [],
  };
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}
