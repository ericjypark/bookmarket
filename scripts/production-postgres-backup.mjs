#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { productionKubeContextBlocker } from './lib/production-context.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
const expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT;
const postgresStatefulSet = process.env.BOOKMARKET_POSTGRES_STATEFULSET ?? 'statefulset/postgres';
const postgresContainer = process.env.BOOKMARKET_POSTGRES_CONTAINER;
const backupDir = resolvePath(process.env.BOOKMARKET_BACKUP_DIR ?? 'artifacts/production-backups');
const backupTimeZone = process.env.BOOKMARKET_BACKUP_TIMEZONE ?? 'Asia/Seoul';
const backupId = process.env.BOOKMARKET_BACKUP_ID ?? defaultBackupId();
const backupPath = path.join(backupDir, `${backupId}.dump`);
const checksumPath = `${backupPath}.sha256`;
const metadataPath = `${backupPath}.json`;
const dumpCommand = 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges';

main();

function main() {
  if (help) {
    usage();
    return;
  }

  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  assertBackupId(backupId);

  info('Bookmarket production Postgres backup');
  info(`Namespace: ${namespace}`);
  info(`Postgres target: ${postgresStatefulSet}`);
  if (postgresContainer) {
    info(`Postgres container: ${postgresContainer}`);
  }
  info(`Backup time zone: ${backupTimeZone}`);
  info(`Backup file: ${backupPath}`);

  if (dryRun) {
    info('Dry run: printing commands without executing them or writing backup files.');
    printDryRunPlan();
    return;
  }

  if (!expectedContext) {
    fail('Set BOOKMARKET_PROD_KUBE_CONTEXT to the exact Raspberry Pi k3s context before creating a production backup.');
  }

  const currentContext = runText('Read active kube context', 'kubectl', ['config', 'current-context']).trim();
  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    fail(`${contextBlocker} Refusing to create a backup.`);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  if (fs.existsSync(backupPath) || fs.existsSync(checksumPath) || fs.existsSync(metadataPath)) {
    fail(`Backup output already exists for id "${backupId}". Set BOOKMARKET_BACKUP_ID to a new value.`);
  }

  const dump = runBinary('Dump Postgres from cluster', 'kubectl', postgresDumpArgs());
  if (dump.length === 0) {
    fail('pg_dump returned no data; refusing to write an empty backup.');
  }

  fs.writeFileSync(backupPath, dump, { mode: 0o600 });
  const sha256 = createHash('sha256').update(dump).digest('hex');
  fs.writeFileSync(checksumPath, `${sha256}  ${path.basename(backupPath)}\n`, { mode: 0o600 });
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata(sha256, dump.length, currentContext), null, 2)}\n`, {
    mode: 0o600
  });

  info(`Wrote backup: ${backupPath}`);
  info(`Wrote checksum: ${checksumPath}`);
  info(`Wrote metadata: ${metadataPath}`);
  info(`Backup size: ${dump.length} bytes`);
  info(`SHA256: ${sha256}`);
  info('After a restore rehearsal succeeds, use this release signoff:');
  console.log(
    `BOOKMARKET_BACKUP_SIGNOFF='${formatBackupDate(new Date())}: Postgres backup file ${backupPath} created with sha256 ${sha256}; restore/rollback verified via <restore-check>'`
  );
}

function usage() {
  console.log(`Usage: node scripts/production-postgres-backup.mjs [--dry-run]

Creates a local custom-format pg_dump from the production Postgres StatefulSet.

Environment:
  BOOKMARKET_PROD_KUBE_CONTEXT   Required for real runs; must match kubectl config current-context.
  BOOKMARKET_KUBE_NAMESPACE      Kubernetes namespace. Defaults to bookmarket.
  BOOKMARKET_POSTGRES_STATEFULSET Kubernetes exec target. Defaults to statefulset/postgres.
  BOOKMARKET_POSTGRES_CONTAINER  Optional container name for kubectl exec -c.
  BOOKMARKET_BACKUP_DIR          Output directory. Defaults to artifacts/production-backups.
  BOOKMARKET_BACKUP_ID           Output id. Defaults to bookmarket-postgres-<timestamp>.
  BOOKMARKET_BACKUP_TIMEZONE     Date/time zone for generated ids and signoff date. Defaults to Asia/Seoul.
`);
}

function printDryRunPlan() {
  runPlan('Read active kube context', 'kubectl', ['config', 'current-context']);
  info(`Real run requires BOOKMARKET_PROD_KUBE_CONTEXT to match the active Raspberry Pi k3s context exactly and refuses common local contexts such as kind-kind or docker-desktop.`);
  info(`Would create directory: ${backupDir}`);
  runPlan('Dump Postgres from cluster', 'kubectl', postgresDumpArgs(), `> ${shellQuote(backupPath)}`);
  info(`Would write checksum: ${checksumPath}`);
  info(`Would write metadata: ${metadataPath}`);
  info(
    'After the real backup and restore rehearsal, set BOOKMARKET_BACKUP_SIGNOFF with the backup date, path or sha256, and restore/rollback verification note.'
  );
}

function postgresDumpArgs() {
  return [
    '-n',
    namespace,
    'exec',
    postgresStatefulSet,
    ...(postgresContainer ? ['-c', postgresContainer] : []),
    '--',
    'sh',
    '-lc',
    dumpCommand
  ];
}

function metadata(sha256, byteLength, kubeContext) {
  return {
    createdAt: new Date().toISOString(),
    backupTimeZone,
    kubeContext,
    namespace,
    postgresTarget: postgresStatefulSet,
    postgresContainer: postgresContainer ?? null,
    backupId,
    backupPath,
    checksumPath,
    sha256,
    byteLength,
    format: 'pg_dump custom',
    dumpCommand,
    restoreHint:
      'Rehearse restore with pg_restore into an isolated database before using this backup signoff for production smoke.'
  };
}

function runText(label, command, commandArgs) {
  info(`${label}: ${renderCommand(command, commandArgs)}`);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assertSuccess(label, result);
  return result.stdout ?? '';
}

function runBinary(label, command, commandArgs) {
  info(`${label}: ${renderCommand(command, commandArgs)}`);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assertSuccess(label, result);
  return result.stdout ?? Buffer.alloc(0);
}

function runPlan(label, command, commandArgs, suffix = '') {
  const commandText = renderCommand(command, commandArgs);
  info(`${label}: ${suffix ? `${commandText} ${suffix}` : commandText}`);
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

function assertBackupId(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    fail('BOOKMARKET_BACKUP_ID may only contain letters, numbers, dots, underscores, and hyphens.');
  }
}

function defaultBackupId() {
  const parts = backupDateParts(new Date());
  const zoneSlug = backupTimeZone.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `bookmarket-postgres-${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}-${zoneSlug}`;
}

function formatBackupDate(date) {
  const parts = backupDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function backupDateParts(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: backupTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  } catch {
    fail(`Invalid BOOKMARKET_BACKUP_TIMEZONE: ${backupTimeZone}`);
  }
}

function resolvePath(value) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.join(repoRoot, value);
}

function renderCommand(command, commandArgs) {
  return [command, ...commandArgs.map(shellQuote)].join(' ');
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function info(message) {
  console.log(`[production-backup] ${message}`);
}

function fail(message) {
  console.error(`[production-backup] ${message}`);
  process.exit(1);
}
