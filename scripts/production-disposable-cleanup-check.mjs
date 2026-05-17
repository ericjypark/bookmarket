#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { productionKubeContextBlocker } from './lib/production-context.mjs';

const args = new Set(process.argv.slice(2));
const help = args.has('--help') || args.has('-h');
const dryRun = args.has('--dry-run');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE || 'bookmarket';
const postgresTarget = process.env.BOOKMARKET_POSTGRES_TARGET || 'statefulset/postgres';
const expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT || '';
const oauthExpectedEmailEnvNames = [
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL'
];
const oauthExpectedEmails = uniqueEmailLikes(oauthExpectedEmailEnvNames.map((name) => process.env[name] ?? ''));
const oauthExpectedEmailClause = oauthExpectedEmails.length > 0
  ? `or lower(email) in (${oauthExpectedEmails.map(sqlString).join(', ')})`
  : '';

const sql = String.raw`
select
  (select count(*) from users where email like 'codex-bookmarket-%' or username like 'codex-%'),
  (select count(*) from bookmarks where coalesce(title_override,'') like 'Bookmarket production smoke%' or coalesce(title_override,'') like 'Codex%' or url like '%bookmarket-production-smoke-%' or url like '%example.com/codex%'),
  (select count(*) from categories where name like 'Bookmarket Smoke%' or name like 'Codex%'),
  (select count(*) from users where
    lower(coalesce(email, '')) like 'oauth-provider-%'
    or lower(coalesce(email, '')) like 'codex-oauth-%'
    or lower(coalesce(username, '')) like 'oauth-provider-%'
    or lower(coalesce(username, '')) like 'codex-oauth-%'
    ${oauthExpectedEmailClause}
  );
`;

main();

function main() {
  if (help) {
    usage();
    return;
  }

  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  info('Bookmarket production disposable test-data cleanup check');
  info(`Namespace: ${namespace}`);
  info(`Postgres target: ${postgresTarget}`);
  info(`OAuth provider expected-email filters: ${oauthExpectedEmails.length} email-like value(s) from ${oauthExpectedEmailEnvNames.join(', ')}.`);

  if (dryRun) {
    info('Dry run: printing commands without querying production data.');
    info('Read active kube context: kubectl config current-context');
    info('Real run requires BOOKMARKET_PROD_KUBE_CONTEXT to match the active Raspberry Pi k3s context.');
    info(`Query disposable test-data counts: kubectl -n ${namespace} exec -i ${postgresTarget} -- sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'`);
    info('Real run passes only when known disposable smoke-test users/bookmarks/categories/oauth_provider_users are 0|0|0|0.');
    return;
  }

  const currentContext = runText('Read active kube context', 'kubectl', ['config', 'current-context']).trim();
  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    fail(`${contextBlocker} Refusing to query production disposable cleanup state.`);
  }

  const output = runText('Query disposable test-data counts', 'kubectl', [
    '-n',
    namespace,
    'exec',
    '-i',
    postgresTarget,
    '--',
    'sh',
    '-lc',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
  ], sql).trim();

  const [users, bookmarks, categories, oauthProviderUsers] = output.split('|').map((value) => Number.parseInt(value, 10));
  if (![users, bookmarks, categories, oauthProviderUsers].every(Number.isInteger)) {
    fail(`Could not parse disposable cleanup counts from psql output: ${output || '<empty>'}`);
  }

  info(`Disposable test-data counts users/bookmarks/categories/oauth_provider_users = ${users}|${bookmarks}|${categories}|${oauthProviderUsers}`);
  if (users !== 0 || bookmarks !== 0 || categories !== 0 || oauthProviderUsers !== 0) {
    fail('Disposable production test data remains. Clean only matching dedicated smoke/OAuth test-account data before release.');
  }

  info('Disposable production test-data cleanup check passed.');
}

function usage() {
  console.log(`Usage: node scripts/production-disposable-cleanup-check.mjs [--dry-run]

Runs a read-only production Postgres count check for known Codex/Bookmarket disposable smoke-test patterns.
Requires BOOKMARKET_PROD_KUBE_CONTEXT to match kubectl config current-context and refuses common local contexts.
Also counts OAuth provider smoke users from BOOKMARKET_OAUTH_EXPECTED_EMAIL,
BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL, BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL,
BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL when those values are email-like, plus
oauth-provider-% and codex-oauth-% disposable user patterns.
Passes only when users/bookmarks/categories/oauth_provider_users = 0|0|0|0.
Use --dry-run to print the plan without running kubectl or querying production data.
`);
}

function runText(label, command, commandArgs, input) {
  info(`${label}: ${[command, ...commandArgs].join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }

  return result.stdout ?? '';
}

function info(message) {
  console.log(`[cleanup-check] ${message}`);
}

function fail(message) {
  console.log(`[cleanup-check] ${message}`);
  process.exit(1);
}

function uniqueEmailLikes(values) {
  return [...new Set(values
    .map((value) => String(value).trim().toLowerCase())
    .filter(isEmailLike))];
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
