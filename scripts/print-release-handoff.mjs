#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { productionBoundBlockers } from './lib/release-blockers.mjs';
import { releaseBlockerHint } from './lib/release-blocker-hints.mjs';
import {
  publicEndpointCertificateDiagnostics,
  publicEndpointDiagnostics
} from './lib/public-endpoints.mjs';

const releaseDate = (process.env.BOOKMARKET_RELEASE_DATE ?? localDate(new Date())).trim();
const repoRoot = process.cwd();
const releaseEnvNames = [
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_WEB_IMAGE',
  'BOOKMARKET_API_IMAGE',
  'BOOKMARKET_METADATA_WORKER_IMAGE',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED',
  'BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT',
  'BOOKMARKET_OAUTH_APP_LABEL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_PROVIDER_START_APPROVED',
  'BOOKMARKET_OAUTH_HOST_RESOLVE_IP',
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE',
  'BOOKMARKET_OAUTH_PROVIDER_BROWSER_CHANNEL',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'BOOKMARKET_TEST_ACCOUNT_EMAIL',
  'BOOKMARKET_TEST_ACCOUNT_PASSWORD',
  'BOOKMARKET_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED',
  'BOOKMARKET_CONFIRM_READ_ONLY_ORACLE',
  'BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL',
  'BOOKMARKET_PUBLIC_PROFILE_USERNAME',
  'BOOKMARKET_RESTART_SMOKE_APPROVED'
];

main();

function main() {
  const blockers = currentExternalBlockers();

  section('Bookmarket Production Release Handoff');
  line('This helper is read-only. It prints the release inputs that must come from the real Pi/k3s deployment and manual provider/browser evidence.');
  line('Do not use template values as fake signoffs. Set each variable only after the matching evidence exists.');

  section('Current Production-Bound Blockers');
  if (blockers.length === 0) {
    bullet('No production-bound blockers are visible from this shell. Run pnpm release:readiness for the final gate.');
  } else {
    for (const blocker of blockers) {
      bullet(blocker);
      const hint = releaseBlockerHint(blocker);
      if (hint) {
        line(`  NEXT: ${hint}`);
      }
    }
    line('');
    line('Canonical status shortcut: pnpm release:blockers');
  }

  section('Current Local Diagnostics');
  bullet(`Current kube context: ${readCurrentKubeContext() || 'unavailable'}`);
  bullet(`Available kube contexts: ${readKubeContexts().join(', ') || 'none found'}`);
  bullet(`Kube context file issues: ${readKubeContextFileIssues().join('; ') || 'none detected'}`);
  bullet(`KUBECONFIG: ${process.env.KUBECONFIG ? 'set' : 'unset'}`);
  bullet(`Release env vars present: ${releaseEnvNames.filter((name) => isPresentEnv(name)).join(', ') || 'none'}`);
  bullet(`Release env vars missing: ${releaseEnvNames.filter((name) => !isPresentEnv(name)).join(', ') || 'none'}`);
  bullet(`Repo env files found: ${findRepoEnvFiles().join(', ') || 'none'}`);
  bullet(`Reference v1 OAuth env keys present: ${findReferenceV1OAuthEnvKeys().join('; ') || 'none found'}`);
  bullet(`Live k3s deployment images: ${readDeploymentImages().join(', ') || 'unavailable'}`);
  bullet(`Public endpoint probes: ${publicEndpointDiagnostics().join('; ')}`);
  bullet('External public endpoint evidence helper: pnpm public:endpoints:external');
  bullet(`Public TLS certificate diagnostics: ${publicEndpointCertificateDiagnostics().join('; ')}`);
  bullet('Public endpoint env overrides: BOOKMARKET_WEB_URL, BOOKMARKET_API_URL');
  bullet('Kubernetes TLS secret env overrides: BOOKMARKET_WEB_TLS_SECRET_NAME, BOOKMARKET_API_TLS_SECRET_NAME');
  bullet('Terraform image env overrides: BOOKMARKET_WEB_IMAGE, BOOKMARKET_API_IMAGE, BOOKMARKET_METADATA_WORKER_IMAGE');
  line('Diagnostics intentionally print only names and presence, never secret or signoff values.');
  line('Production context preflight: pnpm preflight:production-context');

  section('Required Environment And Signoff Templates');
  code(`export BOOKMARKET_PROD_KUBE_CONTEXT='<pi-k3s-context>'
export BOOKMARKET_WEB_IMAGE='<current deployed web image tag>'
export BOOKMARKET_API_IMAGE='<current deployed api image tag>'
export BOOKMARKET_METADATA_WORKER_IMAGE='<current deployed metadata-worker image tag>'

export BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1
export BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1
export BOOKMARKET_OAUTH_APP_LABEL='staging OAuth app <oauth-app-name>'
export BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL='<test-account@example.com>'
export BOOKMARKET_OAUTH_EXPECTED_EMAIL='<test-account@example.com>'
export BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL='<optional-google-test-account@example.com>'
export BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL='<optional-github-test-account@example.com>'
export BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1
export BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE='<optional-v2-canary-cookie-name=value>'
export BOOKMARKET_OAUTH_HOST_RESOLVE_IP='<optional-tailscale-or-lan-ip>'
export BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE='<optional-dedicated-provider-storage-state.json>'
export BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR='<optional-dedicated-provider-browser-profile-dir>'
export BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1
export BOOKMARKET_OAUTH_PROVIDER_BROWSER_CHANNEL='<optional-browser-channel>'
export BOOKMARKET_OAUTH_SMOKE_SIGNOFF='${releaseDate}: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app <oauth-app-name> and dedicated provider test account <test-account@example.com>; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:<sha256>, /home:<sha256>; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email <test-account@example.com> confirmed'

export BOOKMARKET_BACKUP_SIGNOFF='${releaseDate}: Postgres backup file artifacts/production-backups/pre-switch-${releaseDate}.dump sha256 <sha256> created and restore-check pg_restore rollback verified'

export BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF='${releaseDate}: pnpm smoke:production:release passed on Raspberry Pi k3s production context <pi-k3s-context>; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed'

export BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF='${releaseDate}: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context <pi-k3s-context>; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:<sha256>, /home:<sha256>; backup rollback path verified'
export BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE='<optional-v2-canary-cookie-name=value>'
export BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1
export BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1
export BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1
export BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1
export BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1
export BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1

export BOOKMARKET_TEST_ACCOUNT_EMAIL='<test-account@example.com>'
export BOOKMARKET_TEST_ACCOUNT_PASSWORD='<dedicated-test-account-password>'
export BOOKMARKET_TEST_ACCOUNT_LABEL='<test-account@example.com>'
export BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE='<optional-v2-canary-cookie-name=value>'
export BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS=1
export BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF='${releaseDate}: pnpm smoke:production:test-account passed for dedicated test account <test-account@example.com> email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched'

export BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED=1
export BOOKMARKET_CONFIRM_READ_ONLY_ORACLE=1
export BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL='<authenticated-account-label>'
export BOOKMARKET_PUBLIC_PROFILE_USERNAME='<known-public-username>'
export BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF='${releaseDate}: pnpm smoke:authenticated-prod-oracle passed for authenticated session <authenticated-account-label>; read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/<username>'

export BOOKMARKET_RESTART_SMOKE_APPROVED=1`);

  section('Release Command Order');
  ordered([
    'Switch kubectl to the Raspberry Pi k3s context and export BOOKMARKET_PROD_KUBE_CONTEXT with the exact current context name.',
    'Set BOOKMARKET_WEB_IMAGE, BOOKMARKET_API_IMAGE, and BOOKMARKET_METADATA_WORKER_IMAGE to the current deployed Pi image tags so Terraform plan/readiness checks compare against the intended release images; pnpm release:handoff prints the live deployment images when kube access works.',
    'Run pnpm preflight:production-context to validate the active context, namespace, nodes, and app-secret key names without printing secret values.',
    'If local public endpoint curls fail from the operator LAN because of NAT loopback, run pnpm public:endpoints:external to collect external web/API health evidence; do not substitute Tailscale or LAN routes for the final production smoke or migration/cutover gates.',
    'Run pnpm backup:production to create the pre-switch Postgres backup.',
    'Run pnpm backup:production:restore-check against an isolated local restore database, then set BOOKMARKET_BACKUP_SIGNOFF from that evidence.',
    'Run pnpm smoke:oauth-provider:evidence-audit to inspect the current shell, env files, artifact file names, k3s secret key names, and GitHub secret names without printing secret values. Run pnpm smoke:oauth-provider:evidence-audit:require when you intentionally want the command to fail until dedicated provider test-account or provider-smoke signoff evidence exists.',
    'Before using a browser profile for provider login, run pnpm smoke:oauth-provider:profile:prepare:dry-run to inspect the setup and then pnpm smoke:oauth-provider:profile:prepare to create artifacts/auth/oauth-provider-profile or the configured BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR. The helper writes .bookmarket-dedicated-oauth-provider-profile, refuses known default Chrome/Chromium real-user profile paths, and prints the BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR plus BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1 exports. The real smoke refuses profile directories without that marker, and the profile path alone is not signoff evidence.',
    'Run pnpm smoke:oauth-provider:preflight with the real-run env to validate approvals, expected emails, the prepared profile marker, production kube context, and route-target proof without opening a browser or contacting Google/GitHub; this cannot satisfy BOOKMARKET_OAUTH_SMOKE_SIGNOFF.',
    'Run pnpm smoke:oauth-provider:provider-starts with BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1 to verify pre-login Google/GitHub authorization URLs from the copied v1 buttons before entering credentials. Use BOOKMARKET_OAUTH_START_PATH=/signup and BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS=/signup,/home to cover the signup entry point. This contacts providers but does not complete provider login, verify /api/v1/users/me, or satisfy BOOKMARKET_OAUTH_SMOKE_SIGNOFF.',
    'Run pnpm smoke:oauth-provider with BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED=1, BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1, BOOKMARKET_OAUTH_APP_LABEL, BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL, optional BOOKMARKET_OAUTH_EXPECTED_EMAIL or provider-specific BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL / BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL, and BOOKMARKET_PROD_KUBE_CONTEXT for Google and GitHub provider smoke using a dedicated provider test account; the helper must prove public /login and /home match the direct k3s web pod before opening the browser and must confirm /api/v1/users/me matches the expected dedicated provider test account email. When no dedicated Google/GitHub provider test account is available, the release operator may instead complete the same Google AND GitHub provider flows with explicitly approved operator Chrome credentials (Computer Use / Browser Use / operator Chrome credential session) on the proven v2 route target; use this only with explicit per-release approval, record the identity value as `operator-approved Chrome account` in BOOKMARKET_OAUTH_SMOKE_SIGNOFF (do not write the real personal account email), and require the same redirect to /home, avatar/profile menu rendering Settings and Logout, Bookmarket session cookies, and /api/v1/users/me identity result for both providers. If either provider only reaches the Google identifier/login page or the GitHub login page, leave BOOKMARKET_OAUTH_SMOKE_SIGNOFF unset and report blocked. If public DNS reaches an unavailable WAN route while the operator is on the Pi Tailscale/LAN path, set BOOKMARKET_OAUTH_HOST_RESOLVE_IP so the helper keeps real hostnames/TLS SNI while routing browser, route-target, and API identity checks to that explicit IP. If a dedicated provider browser session already exists, optionally pass BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE, or pass BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR only with BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1 and .bookmarket-dedicated-oauth-provider-profile present; do not point it at a real-user Chrome profile. If normal public traffic is still on v1, set BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE for the pre-cutover v2 canary route after confirming the edge proxy cookie matcher accepts the canary cookie at the end of the Cookie header; for nginx, use the grouped suffix form (^|;[[:space:]]*)<cookie-name>=<cookie-value>(;|$), not an ungrouped <cookie-value>;|$ suffix, so a single-cookie route-target probe matches. This canary proof does not satisfy BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF. Then set BOOKMARKET_OAUTH_SMOKE_SIGNOFF from that real run.',
    'Run pnpm smoke:authenticated-prod-oracle with BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED=1, BOOKMARKET_CONFIRM_READ_ONLY_ORACLE=1, BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL, and BOOKMARKET_PUBLIC_PROFILE_USERNAME for read-only authenticated v1 production oracle inspection, then set BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF from that real run.',
    'Run pnpm smoke:production:test-account with BOOKMARKET_TEST_ACCOUNT_EMAIL, BOOKMARKET_TEST_ACCOUNT_PASSWORD, BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT=1, and BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS=1 for email login/session, disposable bookmark/category CRUD, metadata/refetch, cleanup, and no-real-user-data scope; then set BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF from that real run.',
    'Run pnpm smoke:production:cleanup-check:dry-run to inspect the no-query cleanup proof plan, then run pnpm smoke:production:cleanup-check as a read-only Postgres count check and confirm known disposable smoke-test users/bookmarks/categories/oauth_provider_users are 0|0|0|0. Keep the OAuth expected-email env values exported so the helper can count dedicated provider test-account rows created or linked by real OAuth smoke.',
    'Approve the restart/PVC survival smoke by setting BOOKMARKET_RESTART_SMOKE_APPROVED=1.',
    'Run pnpm smoke:production:release, then set BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF from that real run.',
    'Run pnpm migration:route-targets before cutover for a read-only normal-route target report; this cannot produce BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF, but it shows whether public /login and /home still differ from the k3s web pod.',
    'Run pnpm migration:canary-route-targets with BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE for a read-only pre-cutover v2 canary route check when a canary route is installed; this proves the canary edge path only and cannot produce BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF.',
    'Run pnpm migration:safety:verify before real migration; real non-local v1 export and v2 import require both non-local allow and BOOKMARKET_REAL_DATA_MIGRATION_APPROVED.',
    'After explicit real-user-data migration/cutover approval, run the production v1 export, v2 import, count/ownership validation, normal UI route cutover to k3s, and rollback check; then run pnpm migration:production-cutover so direct k3s web route response asset fingerprints match the public route asset fingerprints and the signoff records the exact production kube context before setting BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF from that real run.',
    'Run pnpm release:readiness as the final completion gate.'
  ]);

  section('Reference Docs');
  bullet('docs/operations/production-smoke-checklist.md');
  bullet('docs/testing/oauth-verification.md');
  bullet('docs/testing/completion-audit.md');
}

function currentExternalBlockers() {
  return productionBoundBlockers({ currentContext: readCurrentKubeContext() });
}

function readCurrentKubeContext() {
  const result = spawnSync('kubectl', ['config', 'current-context'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) {
    return '';
  }
  return (result.stdout ?? '').trim();
}

function readKubeContexts() {
  const result = spawnSync('kubectl', ['config', 'get-contexts', '-o', 'name'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) {
    return [];
  }
  return (result.stdout ?? '')
    .split('\n')
    .map((lineValue) => lineValue.trim())
    .filter(Boolean);
}

function readKubeContextFileIssues() {
  const result = spawnSync('kubectl', ['config', 'view', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) {
    return ['unable to read kubeconfig'];
  }

  let kubeConfig;
  try {
    kubeConfig = JSON.parse(result.stdout);
  } catch {
    return ['unable to parse kubeconfig'];
  }

  const clustersByName = new Map((kubeConfig.clusters ?? []).map((entry) => [entry.name, entry.cluster ?? {}]));
  const usersByName = new Map((kubeConfig.users ?? []).map((entry) => [entry.name, entry.user ?? {}]));
  const issues = [];

  for (const contextEntry of kubeConfig.contexts ?? []) {
    const contextName = contextEntry.name;
    const context = contextEntry.context ?? {};
    const cluster = clustersByName.get(context.cluster) ?? {};
    const user = usersByName.get(context.user) ?? {};
    const missingKinds = [];

    if (isMissingConfiguredFile(cluster['certificate-authority'])) {
      missingKinds.push('certificate-authority');
    }
    if (isMissingConfiguredFile(user['client-certificate'])) {
      missingKinds.push('client-certificate');
    }
    if (isMissingConfiguredFile(user['client-key'])) {
      missingKinds.push('client-key');
    }
    if (isMissingConfiguredFile(user['tokenFile'])) {
      missingKinds.push('token-file');
    }

    if (missingKinds.length > 0) {
      issues.push(`${contextName}: missing ${missingKinds.join(', ')}`);
    }
  }

  return issues;
}

function readDeploymentImages() {
  const namespace = (process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket').trim() || 'bookmarket';
  const result = spawnSync(
    'kubectl',
    ['-n', namespace, 'get', 'deployment', 'web', 'api', 'metadata-worker', '-o', 'json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }
  );
  if (result.status !== 0) {
    return [];
  }

  let deploymentList;
  try {
    deploymentList = JSON.parse(result.stdout);
  } catch {
    return [];
  }

  return (deploymentList.items ?? [])
    .map((deployment) => {
      const name = deployment.metadata?.name;
      const image = deployment.spec?.template?.spec?.containers?.[0]?.image;
      return name && image ? `${name}=${image}` : '';
    })
    .filter(Boolean)
    .sort();
}

function isMissingConfiguredFile(filePath) {
  return typeof filePath === 'string' && filePath.length > 0 && !fs.existsSync(filePath);
}

function isPresentEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function findRepoEnvFiles() {
  const ignoredDirectories = new Set(['node_modules', '.next', 'target', 'bin', 'dist', '.git']);
  const results = [];

  walk(repoRoot, 0);
  return results.sort();

  function walk(directory, depth) {
    if (depth > 4) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          walk(path.join(directory, entry.name), depth + 1);
        }
        continue;
      }

      if (entry.isFile() && isEnvFileName(entry.name)) {
        results.push(path.relative(repoRoot, path.join(directory, entry.name)) || entry.name);
      }
    }
  }
}

function findReferenceV1OAuthEnvKeys() {
  const v1Root = path.resolve(repoRoot, '..', 'bookmarket');
  const envFiles = [
    path.join(v1Root, 'apps/web/.env'),
    path.join(v1Root, 'apps/server/.env')
  ];
  const interestingKeys = new Set([
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    'NEXT_PUBLIC_GITHUB_CLIENT_ID',
    'NEXT_PUBLIC_GITHUB_REDIRECT_URI',
    'GITHUB_CLIENT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  ]);
  const results = [];

  for (const filePath of envFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const keys = readEnvKeys(filePath).filter((key) => interestingKeys.has(key));
    if (keys.length > 0) {
      results.push(`${path.relative(v1Root, filePath)}: ${keys.join(', ')}`);
    }
  }

  return results;
}

function readEnvKeys(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  return content
    .split('\n')
    .map((lineValue) => lineValue.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter(Boolean);
}

function isEnvFileName(fileName) {
  return fileName === '.env' || fileName.startsWith('.env.') || fileName.endsWith('.env');
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
