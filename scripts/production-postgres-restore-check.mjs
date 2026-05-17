#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const backupFile = process.env.BOOKMARKET_BACKUP_FILE;
const restoreDatabaseUrl = process.env.BOOKMARKET_RESTORE_DATABASE_URL;
const allowNonLocal = process.env.BOOKMARKET_RESTORE_ALLOW_NONLOCAL === '1';
const allowUnsafeDatabase = process.env.BOOKMARKET_RESTORE_ALLOW_UNSAFE_DATABASE === '1';
const minRows = parseInt(process.env.BOOKMARKET_RESTORE_MIN_ROWS ?? '1', 10);
const safeDatabasePattern = /restore|rehearsal|scratch|tmp|test/i;

main();

function main() {
  if (help) {
    usage();
    return;
  }

  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  info('Bookmarket production Postgres restore rehearsal');

  if (!backupFile) {
    fail('Set BOOKMARKET_BACKUP_FILE to the pg_dump custom-format backup file to rehearse.');
  }

  if (!restoreDatabaseUrl) {
    fail('Set BOOKMARKET_RESTORE_DATABASE_URL to an isolated, empty restore database.');
  }

  const backupPath = path.resolve(backupFile);
  const target = parseDatabaseUrl(restoreDatabaseUrl);
  assertMinRows();

  info(`Backup file: ${backupPath}`);
  info(`Restore target: ${redactDatabaseUrl(restoreDatabaseUrl)}`);
  info(`Minimum restored rows per core table: ${minRows}`);

  assertSafeTarget(target);

  if (dryRun) {
    info('Dry run: printing commands without restoring data.');
    runPlan('Restore backup', 'pg_restore', restoreArgs(backupPath));
    runPlan('Validate restored counts', 'psql', psqlArgs(countSql()));
    info('After the real check passes, use the restore result in BOOKMARKET_BACKUP_SIGNOFF.');
    return;
  }

  if (!fs.existsSync(backupPath)) {
    fail(`Backup file does not exist: ${backupPath}`);
  }

  run('Restore backup', 'pg_restore', restoreArgs(backupPath));
  const countOutput = run('Validate restored counts', 'psql', psqlArgs(countSql()), { capture: true });
  assertRestoredCounts(countOutput);
  info('Restore rehearsal passed. Include this in BOOKMARKET_BACKUP_SIGNOFF: restore/rollback verified via pnpm backup:production:restore-check.');
}

function usage() {
  console.log(`Usage: BOOKMARKET_BACKUP_FILE=/path/to/file.dump BOOKMARKET_RESTORE_DATABASE_URL=postgres://... node scripts/production-postgres-restore-check.mjs [--dry-run]

Restores a production backup into an isolated Postgres database and validates core table counts.

Environment:
  BOOKMARKET_BACKUP_FILE                    Required backup file produced by pnpm backup:production.
  BOOKMARKET_RESTORE_DATABASE_URL           Required isolated restore database URL.
  BOOKMARKET_RESTORE_MIN_ROWS               Minimum rows expected in core tables. Defaults to 1.
  BOOKMARKET_RESTORE_ALLOW_NONLOCAL=1       Allow a non-local restore database host.
  BOOKMARKET_RESTORE_ALLOW_UNSAFE_DATABASE=1 Allow a database name without restore/rehearsal/scratch/tmp/test.
`);
}

function restoreArgs(backupPath) {
  return [
    '--dbname',
    restoreDatabaseUrl,
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    backupPath
  ];
}

function psqlArgs(sql) {
  return ['--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', sql, restoreDatabaseUrl];
}

function countSql() {
  return `
select 'users', count(*) from users
union all select 'bookmarks', count(*) from bookmarks
union all select 'bookmark_metadata', count(*) from bookmark_metadata
union all select 'categories', count(*) from categories
union all select 'public_profiles', count(*) from public_profiles
order by 1;
`;
}

function assertRestoredCounts(output) {
  const rows = output
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => {
      const [name, rawCount] = line.split('|');
      return [name, Number(rawCount)];
    });
  const counts = new Map(rows);

  for (const table of ['users', 'bookmarks', 'bookmark_metadata', 'categories', 'public_profiles']) {
    const count = counts.get(table);
    if (!Number.isInteger(count)) {
      fail(`Restore count check did not return table: ${table}`);
    }
    if (count < minRows) {
      fail(`Restore count check for ${table} returned ${count}; expected at least ${minRows}.`);
    }
    info(`Restored ${table}: ${count}`);
  }
}

function assertSafeTarget(target) {
  const host = target.hostname.toLowerCase();
  const databaseName = target.pathname.replace(/^\//, '');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (!allowNonLocal && !localHosts.has(host)) {
    fail(
      `Restore target host "${target.hostname}" is not local. Set BOOKMARKET_RESTORE_ALLOW_NONLOCAL=1 only for an explicitly isolated restore database.`
    );
  }

  if (!allowUnsafeDatabase && !safeDatabasePattern.test(databaseName)) {
    fail(
      `Restore target database "${databaseName}" does not look isolated. Use a name containing restore/rehearsal/scratch/tmp/test or set BOOKMARKET_RESTORE_ALLOW_UNSAFE_DATABASE=1.`
    );
  }
}

function assertMinRows() {
  if (!Number.isInteger(minRows) || minRows < 0) {
    fail('BOOKMARKET_RESTORE_MIN_ROWS must be a non-negative integer.');
  }
}

function parseDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('BOOKMARKET_RESTORE_DATABASE_URL must be a valid postgres:// or postgresql:// URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    fail('BOOKMARKET_RESTORE_DATABASE_URL must use postgres:// or postgresql://.');
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    fail('BOOKMARKET_RESTORE_DATABASE_URL must include a database name.');
  }

  return parsed;
}

function run(label, command, commandArgs, options = {}) {
  info(`${label}: ${renderCommand(command, commandArgs)}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (result.error) {
      fail(`${label} failed: ${result.error.message}`);
    }
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
  return result.stdout ?? '';
}

function runPlan(label, command, commandArgs) {
  info(`${label}: ${renderCommand(command, commandArgs)}`);
}

function renderCommand(command, commandArgs) {
  return [command, ...commandArgs.map((arg) => shellQuote(redactArg(arg)))].join(' ');
}

function redactArg(value) {
  if (value === restoreDatabaseUrl) {
    return redactDatabaseUrl(value);
  }
  return value;
}

function redactDatabaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.password) {
    parsed.password = '***';
  }
  return parsed.toString();
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@?&%*+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function info(message) {
  console.log(`[restore-check] ${message}`);
}

function fail(message) {
  console.error(`[restore-check] ${message}`);
  process.exit(1);
}
