#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { missingBackupSignoffFields } from './lib/release-signoffs.mjs';
import { productionKubeContextBlocker } from './lib/production-context.mjs';
import {
  compareK3sPublicRouteTargets,
  parseRoutePaths,
  shellQuote,
  trimTrailingSlash
} from './lib/route-targets.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const routeReport = args.has('--route-report');
const canaryRouteReport = args.has('--canary-route-report');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--route-report', '--canary-route-report', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const releaseDate = (process.env.BOOKMARKET_RELEASE_DATE ?? localDate(new Date())).trim();
const expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT;
const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
const webUrl = trimTrailingSlash(process.env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
const apiUrl = trimTrailingSlash(process.env.BOOKMARKET_API_URL ?? 'https://api.bmkt.ericjypark.com');
const routePaths = parseRoutePaths(process.env.BOOKMARKET_CUTOVER_ROUTE_PATHS ?? '/login,/home');
const canaryRouteCookie = (process.env.BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE ?? '').trim();
const canaryRouteHeaders = canaryRouteCookie ? [`Cookie: ${canaryRouteCookie}`] : [];
const backupSignoff = (process.env.BOOKMARKET_BACKUP_SIGNOFF ?? '').trim();

main();

function main() {
  if (help) {
    usage();
    return;
  }

  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }
  if ([dryRun, routeReport, canaryRouteReport].filter(Boolean).length > 1) {
    fail('Use only one of --dry-run, --route-report, or --canary-route-report.');
  }

  section('Bookmarket production migration/cutover evidence helper');
  info(`Namespace: ${namespace}`);
  info(`Web URL: ${webUrl}`);
  info(`API URL: ${apiUrl}`);
  info(`Normal UI route probes: ${routePaths.join(', ')}`);

  if (dryRun) {
    printDryRunPlan();
    return;
  }

  if (routeReport) {
    assertRouteReportPreconditions();
    const { mismatches } = runEvidenceChecks({ failOnMismatch: false });
    if (mismatches.length > 0) {
      fail(
        `Route target report found ${mismatches.length} normal UI route mismatch(es). This is expected before public cutover, but it cannot satisfy BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF.`
      );
    }
    info('Route target report passed: public normal UI route asset fingerprints match direct k3s web pod fingerprints.');
    return;
  }

  if (canaryRouteReport) {
    assertCanaryRouteReportPreconditions();
    const { mismatches, routeFingerprints } = runEvidenceChecks({
      failOnMismatch: false,
      publicHeaders: canaryRouteHeaders,
      publicTargetLabel: 'public canary URL',
      publicRouteLabel: 'Public canary UI route',
      routeDescription: 'Canary UI route'
    });
    if (mismatches.length > 0) {
      fail(
        `Canary route target report found ${mismatches.length} canary UI route mismatch(es). It cannot support pre-cutover OAuth/test-account smoke.`
      );
    }
    info(`Canary route target report passed: public canary routes match direct k3s web pod fingerprints ${routeFingerprints.join(', ')}.`);
    info('This canary report is pre-cutover evidence only and cannot satisfy BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF.');
    return;
  }

  const currentContext = assertRealRunPreconditions();
  const { routeFingerprints } = runEvidenceChecks({ failOnMismatch: true });
  printSignoffTemplate(routeFingerprints, currentContext);
}

function usage() {
  console.log(`Usage: node scripts/production-migration-cutover.mjs [--dry-run]

Collects guarded evidence after the real production v1 export, v2 import, data validation, and public traffic cutover have already been completed.
This helper does not migrate real data and does not change traffic by itself.

Use --route-report for a read-only normal-route target check that does not require real-data migration or cutover approvals and cannot produce a release signoff.
Use --canary-route-report with BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE for a read-only pre-cutover v2 canary route check. This is valid only for canary smoke setup and cannot satisfy the final migration/cutover signoff.
`);
}

function printDryRunPlan() {
  info('Dry run: no browser, API mutation, database import, kubectl mutation, or traffic change will run.');
  info('Real run requires these env vars after the actual migration/cutover work has completed:');
  bullet('BOOKMARKET_PROD_KUBE_CONTEXT=<pi-k3s-context>');
  bullet('BOOKMARKET_BACKUP_SIGNOFF=<pre-switch backup and restore rehearsal evidence>');
  bullet('BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1');
  bullet('BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1');
  bullet('BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1');
  bullet('BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1');
  bullet('BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1');
  bullet('BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1');
  bullet('Optional: BOOKMARKET_WEB_URL, BOOKMARKET_API_URL, BOOKMARKET_KUBE_NAMESPACE, BOOKMARKET_CUTOVER_ROUTE_PATHS');
  info('Pre-cutover canary route report requires BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE and uses no migration, data, or traffic-switch approval flags.');
  info('Real run plan:');
  ordered([
    'Verify the active kube context is the expected Raspberry Pi k3s production context.',
    'Verify the backup signoff includes backup and restore rehearsal evidence.',
    'Require explicit confirmations that real production migration, count/ownership validation, normal route cutover, and rollback verification are complete.',
    'Read-only check k3s web/API rollouts and public web/API health.',
    'Fetch normal UI routes such as /login and /home directly from the k3s web pod and from the public URL, then compare response asset fingerprints.',
    'Print the BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF template after evidence checks pass.'
  ]);
}

function assertRouteReportPreconditions() {
  const currentContext = runText('Read active kube context', 'kubectl', ['config', 'current-context']).trim();
  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    fail(`${contextBlocker} Refusing to read production route targets.`);
  }
  info('Route target report mode: no migration, browser action, API mutation, database import, kubectl mutation, or traffic change will run.');
}

function assertCanaryRouteReportPreconditions() {
  assertRouteReportPreconditions();
  if (!canaryRouteCookie) {
    fail('Set BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE=<name=value> before running --canary-route-report.');
  }
  parseRouteTargetCookie(canaryRouteCookie, 'BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE');
  info('Canary route target report mode: request cookie is sent only for public route probes and is redacted from logs. Normal public traffic is not changed.');
}

function assertRealRunPreconditions() {
  const currentContext = runText('Read active kube context', 'kubectl', ['config', 'current-context']).trim();
  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    fail(`${contextBlocker} Refusing to collect migration/cutover evidence.`);
  }

  const missingBackupFields = missingBackupSignoffFields(backupSignoff);
  if (missingBackupFields.length > 0) {
    fail(`BOOKMARKET_BACKUP_SIGNOFF is required before migration/cutover signoff. Missing: ${missingBackupFields.join(', ')}.`);
  }

  requireFlag('BOOKMARKET_REAL_DATA_MIGRATION_APPROVED', 'approve touching real production user data for migration.');
  requireFlag('BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED', 'approve switching normal public UI traffic.');
  requireFlag('BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED', 'confirm pnpm export:v1 and pnpm import:v2 production migration completed.');
  requireFlag('BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED', 'confirm real production data counts and ownership/orphan validation passed.');
  requireFlag('BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S', 'confirm normal UI routes are served by the Raspberry Pi k3s ingress.');
  requireFlag('BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED', 'confirm backup rollback path remains verified after cutover.');
  return currentContext;
}

function runEvidenceChecks({
  failOnMismatch,
  publicHeaders = [],
  publicTargetLabel = 'public URL',
  publicRouteLabel = 'Public normal UI route',
  routeDescription = 'Normal UI route'
}) {
  run('Rollout status deployment/web', 'kubectl', ['-n', namespace, 'rollout', 'status', 'deployment/web', '--timeout=180s']);
  run('Rollout status deployment/api', 'kubectl', ['-n', namespace, 'rollout', 'status', 'deployment/api', '--timeout=180s']);
  run('Web health', 'curl', ['-fsS', `${webUrl}/health`]);
  run('API health', 'curl', ['-fsS', `${apiUrl}/health`]);
  run('API readiness', 'curl', ['-fsS', `${apiUrl}/actuator/health/readiness`]);

  return compareK3sPublicRouteTargets({
    namespace,
    webUrl,
    routePaths,
    publicHeaders,
    publicTargetLabel,
    publicRouteLabel,
    routeDescription,
    log: info,
    failOnMismatch
  });
}

function printSignoffTemplate(routeFingerprints, currentContext) {
  info('Migration/cutover evidence checks completed.');
  info('Set BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF from this real run:');
  console.log(
    `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF='${releaseDate}: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context ${currentContext}; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes ${routePaths.join(' and ')} to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints ${routeFingerprints.join(', ')}; backup rollback path verified'`
  );
}

function requireFlag(name, reason) {
  if (process.env[name] !== '1') {
    fail(`Set ${name}=1 to ${reason}`);
  }
}

function parseRouteTargetCookie(value, envName) {
  if (/[\r\n]/.test(value)) {
    fail(`${envName} must not contain line breaks.`);
  }
  const [pair] = value.split(';', 1);
  const separatorIndex = pair.indexOf('=');
  if (separatorIndex <= 0) {
    fail(`${envName} must start with a name=value cookie pair.`);
  }
  const name = pair.slice(0, separatorIndex).trim();
  const cookieValue = pair.slice(separatorIndex + 1).trim();
  if (!name || !cookieValue) {
    fail(`${envName} must include a non-empty cookie name and value.`);
  }
  if (/[\s,;]/.test(name)) {
    fail(`${envName} has an invalid cookie name.`);
  }
}

function run(label, command, commandArgs) {
  info(`${label}: ${renderCommand(command, commandArgs)}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    stdio: 'inherit'
  });
  assertSuccess(label, result);
}

function runText(label, command, commandArgs) {
  info(`${label}: ${renderCommand(command, commandArgs)}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assertSuccess(label, result);
  return result.stdout ?? '';
}

function assertSuccess(label, result) {
  if (result.status === 0) {
    return;
  }
  if (result.stderr?.length) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    fail(`${label} failed: ${result.error.message}`);
  }
  fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

function renderCommand(command, commandArgs) {
  return [command, ...commandArgs.map(shellQuote)].join(' ');
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

function ordered(items) {
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
}

function bullet(value) {
  console.log(`- ${value}`);
}

function info(message) {
  console.log(`[migration-cutover] ${message}`);
}

function fail(message) {
  console.error(`[migration-cutover] ${message}`);
  process.exit(1);
}
