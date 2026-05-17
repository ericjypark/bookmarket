#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const workflow = await readFile(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

const requiredMarkers = [
  'pull_request:',
  'branches:',
  '- main',
  'pnpm/action-setup@v4',
  'version: 8.9.2',
  'actions/setup-node@v4',
  'node-version: 22',
  'actions/setup-java@v4',
  'java-version: "11"',
  'actions/setup-go@v5',
  'hashicorp/setup-terraform@v3',
  'pnpm install --frozen-lockfile',
  'pnpm contracts:validate',
  'pnpm check:architecture-support',
  'pnpm check:web-ui-parity',
  'pnpm check:v1-parity-checklist',
  'pnpm check:completion-audit',
  'pnpm check:production-release-docs',
  'pnpm check:production-context-guard',
  'pnpm check:ci-workflow',
  'pnpm check:playwright-safety',
  'pnpm test:v1-visual:verify',
  'pnpm lint:web',
  'pnpm build:web',
  'pnpm test:api',
  'pnpm test:metadata-worker',
  'pnpm test:v1-auth-parity',
  'pnpm test:v1-interactions',
  'pnpm test:v1-routing-parity',
  'pnpm compose:verify',
  'pnpm compose:config',
  'node --check scripts/production-smoke-check.mjs',
  'node --check scripts/oauth-provider-smoke.mjs',
  'node --check scripts/audit-oauth-provider-evidence.mjs',
  'node --check scripts/prepare-oauth-provider-profile.mjs',
  'node --check scripts/production-test-account-smoke.mjs',
  'node --check scripts/authenticated-production-oracle-smoke.mjs',
  'node --check scripts/production-migration-cutover.mjs',
  'node --check scripts/production-postgres-backup.mjs',
  'node --check scripts/production-postgres-restore-check.mjs',
  'node --check scripts/production-disposable-cleanup-check.mjs',
  'node --check scripts/lib/completion-audit-status.mjs',
  'node --check scripts/lib/release-signoffs.mjs',
  'node --check scripts/lib/release-blockers.mjs',
  'node --check scripts/lib/route-targets.mjs',
  'node --check scripts/validate-release-signoffs.mjs',
  'node --check scripts/validate-release-blockers.mjs',
  'node --check scripts/validate-release-readiness.mjs',
  'node --check scripts/validate-migration-safety.mjs',
  'node --check scripts/validate-completion-audit.mjs',
  'node --check scripts/release-readiness-check.mjs',
  'pnpm release:signoffs:verify',
  'pnpm release:blockers:verify',
  'pnpm release:readiness:verify',
  'pnpm migration:safety:verify',
  'pnpm backup:production:dry-run',
  'pnpm backup:production:restore-check:dry-run',
  'pnpm smoke:production:dry-run',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR=.tmp/ci-oauth-provider-profile pnpm smoke:oauth-provider:profile:prepare',
  "BOOKMARKET_OAUTH_APP_LABEL='staging OAuth app ci preflight'",
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR=.tmp/ci-oauth-provider-profile BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1 pnpm smoke:oauth-provider:preflight',
  'rm -rf .tmp/ci-oauth-provider-profile',
  'pnpm smoke:oauth-provider:evidence-audit',
  'BOOKMARKET_WEB_URL=http://localhost:3000 BOOKMARKET_API_URL=http://localhost:8080 pnpm smoke:oauth-provider:route-targets',
  'pnpm smoke:production:cleanup-check:dry-run',
  'node scripts/production-smoke-check.mjs --dry-run --require-restarts --include-restarts --require-test-account --require-authenticated-oracle',
  'pnpm infra:pi:verify',
  'terraform -chdir=infra/terraform/pi init -backend=false',
  'terraform -chdir=infra/terraform/pi validate',
  'terraform -chdir=infra/terraform/pi plan -input=false -lock=false -no-color',
  'node --check scripts/validate-image-workflow.mjs',
  'pnpm images:verify'
];

const failures = requiredMarkers
  .filter((marker) => !workflow.includes(marker))
  .map((marker) => `Missing CI workflow marker: ${marker}`);

if (failures.length > 0) {
  console.error('CI workflow validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`CI workflow validated: ${requiredMarkers.length} required guard markers.`);
