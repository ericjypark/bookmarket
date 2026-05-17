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
  'pnpm check:ci-workflow',
  'pnpm lint:web',
  'pnpm build:web',
  'pnpm test:api',
  'pnpm test:metadata-worker',
  'pnpm compose:verify',
  'pnpm compose:config',
  'node --check scripts/production-smoke-check.mjs',
  'node --check scripts/production-postgres-backup.mjs',
  'node --check scripts/production-postgres-restore-check.mjs',
  'node --check scripts/production-context-preflight.mjs',
  'node --check scripts/external-public-endpoint-check.mjs',
  'pnpm backup:production:dry-run',
  'pnpm backup:production:restore-check:dry-run',
  'pnpm smoke:production:dry-run',
  'pnpm preflight:production-context:dry-run',
  'pnpm public:endpoints:external:dry-run',
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
