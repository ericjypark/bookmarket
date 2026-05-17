#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const exportScriptPath = path.join(repoRoot, 'scripts/export-v1-data.mjs');
const importScriptPath = path.join(repoRoot, 'scripts/import-v2-data.mjs');
const packageJsonPath = path.join(repoRoot, 'package.json');
const missingExportPath = path.join(repoRoot, 'artifacts/migration/missing-migration-safety-validator.json');
const nonLocalV1Url = 'postgres://bookmarket:bookmarket@postgres.example.com:5432/bookmarket_v1';
const nonLocalV2Url = 'postgres://bookmarket:bookmarket@postgres.example.com:5432/bookmarket_v2';

const failures = [];

main();

function main() {
  const exportScript = readText(exportScriptPath);
  const importScript = readText(importScriptPath);
  const packageJson = readJson(packageJsonPath);

  assertIncludes(exportScript, 'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1  Required for real non-local export runs.', 'v1 export help must document the real-data approval gate.');
  assertIncludes(exportScript, 'Refusing to export real production user data from non-local Postgres host', 'v1 export must refuse real non-local runs without real-data approval.');
  assertIncludes(importScript, 'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1  Required for real non-local import runs.', 'v2 import help must document the real-data approval gate.');
  assertIncludes(importScript, 'BOOKMARKET_V2_IMPORT_VALIDATE_ONLY=1  Read-only validation of an existing import.', 'v2 import help must document read-only validate-only mode.');
  assertIncludes(importScript, 'no insert/delete/update statements executed', 'v2 import validate-only mode must report that it did not mutate rows.');
  assertIncludes(importScript, 'Refusing to import real production user data into non-local Postgres host', 'v2 import must refuse real non-local runs without real-data approval.');
  assertPackageScript(packageJson, 'migration:safety:verify', 'node scripts/validate-migration-safety.mjs');
  assertPackageScript(packageJson, 'import:v2:validate', 'node scripts/import-v2-data.mjs --validate-only');

  runExpectedFailure(
    'v1 export refuses non-local host without explicit non-local allow',
    ['scripts/export-v1-data.mjs'],
    {
      BOOKMARKET_V1_DATABASE_URL: nonLocalV1Url
    },
    'BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1'
  );
  runExpectedFailure(
    'v1 export refuses real non-local run without real-data approval',
    ['scripts/export-v1-data.mjs'],
    {
      BOOKMARKET_V1_DATABASE_URL: nonLocalV1Url,
      BOOKMARKET_ALLOW_NONLOCAL_EXPORT: '1'
    },
    'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1'
  );
  runExpectedSuccess(
    'v1 export dry-run can inspect non-local target only after explicit non-local allow',
    ['scripts/export-v1-data.mjs', '--dry-run'],
    {
      BOOKMARKET_V1_DATABASE_URL: nonLocalV1Url,
      BOOKMARKET_ALLOW_NONLOCAL_EXPORT: '1'
    },
    '"readsOnly": true'
  );
  runExpectedSuccess(
    'v1 export local dry-run remains available without production approval',
    ['scripts/export-v1-data.mjs', '--dry-run'],
    {
      POSTGRES_HOST: 'localhost',
      POSTGRES_NAME: 'bookmarket_v1_roundtrip'
    },
    '"mode": "dry-run"'
  );

  runExpectedFailure(
    'v2 import refuses non-local host without explicit non-local allow',
    ['scripts/import-v2-data.mjs'],
    {
      BOOKMARKET_V2_DATABASE_URL: nonLocalV2Url,
      BOOKMARKET_MIGRATION_EXPORT_PATH: missingExportPath
    },
    'BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1'
  );
  runExpectedFailure(
    'v2 import refuses real non-local run without real-data approval',
    ['scripts/import-v2-data.mjs'],
    {
      BOOKMARKET_V2_DATABASE_URL: nonLocalV2Url,
      BOOKMARKET_ALLOW_NONLOCAL_IMPORT: '1',
      BOOKMARKET_MIGRATION_EXPORT_PATH: missingExportPath
    },
    'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1'
  );
  runExpectedSuccess(
    'v2 import dry-run can inspect non-local target only after explicit non-local allow',
    ['scripts/import-v2-data.mjs', '--dry-run'],
    {
      BOOKMARKET_V2_DATABASE_URL: nonLocalV2Url,
      BOOKMARKET_ALLOW_NONLOCAL_IMPORT: '1',
      BOOKMARKET_MIGRATION_EXPORT_PATH: missingExportPath
    },
    '"inputExists": false'
  );
  runExpectedSuccess(
    'v2 import local dry-run remains available without production approval',
    ['scripts/import-v2-data.mjs', '--dry-run'],
    {
      BOOKMARKET_MIGRATION_EXPORT_PATH: missingExportPath,
      POSTGRES_HOST: 'localhost',
      POSTGRES_DB: 'bookmarket_v2_roundtrip'
    },
    '"mode": "dry-run"'
  );

  if (failures.length > 0) {
    console.error('Migration safety validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Migration safety validated: real non-local v1 export and v2 import require both non-local allow and BOOKMARKET_REAL_DATA_MIGRATION_APPROVED, while dry-runs and local dry-runs remain available.');
}

function runExpectedSuccess(label, args, env, expectedOutput) {
  const result = spawnNode(args, env);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    failures.push(`${label}: expected success but exited ${result.status ?? 'unknown'} with ${output.trim() || 'no output'}.`);
    return;
  }
  if (!output.includes(expectedOutput)) {
    failures.push(`${label}: expected output marker ${expectedOutput}.`);
  }
}

function runExpectedFailure(label, args, env, expectedOutput) {
  const result = spawnNode(args, env);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0) {
    failures.push(`${label}: expected failure but command succeeded.`);
    return;
  }
  if (!output.includes(expectedOutput)) {
    failures.push(`${label}: expected failure marker ${expectedOutput}; got ${output.trim() || 'no output'}.`);
  }
}

function spawnNode(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      ...env
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000
  });
}

function assertIncludes(text, marker, message) {
  if (!text.includes(marker)) {
    failures.push(message);
  }
}

function assertPackageScript(packageJson, script, expectedCommand) {
  const actualCommand = packageJson.scripts?.[script];
  if (actualCommand !== expectedCommand) {
    failures.push(`package.json must define ${script} as ${expectedCommand}; found ${actualCommand ?? 'missing'}.`);
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    failures.push(`Unable to read ${path.relative(repoRoot, filePath)}: ${error.message}`);
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`Unable to read ${path.relative(repoRoot, filePath)} as JSON: ${error.message}`);
    return {};
  }
}
