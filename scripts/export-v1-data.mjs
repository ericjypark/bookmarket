#!/usr/bin/env node

import { Client } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultV1EnvPath = path.join(repoRoot, 'apps/server/.env');
const defaultOutputPath = path.join(repoRoot, 'artifacts/migration/v1-export.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage:
  node scripts/export-v1-data.mjs [--dry-run]

Environment:
  BOOKMARKET_V1_DATABASE_URL     Optional full v1 Postgres connection string.
  BOOKMARKET_V1_ENV_FILE         Optional v1 server .env path. Defaults to local v1 .env.
  BOOKMARKET_MIGRATION_EXPORT_PATH  Output JSON path. Defaults to artifacts/migration/v1-export.json.
  BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1  Required for non-local database hosts.
  BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1  Required for real non-local export runs.
`);
  process.exit(0);
}

const env = {
  ...loadEnvFile(process.env.BOOKMARKET_V1_ENV_FILE || defaultV1EnvPath),
  ...process.env,
};
const connection = buildV1Connection(env);
assertLocalOrExplicit(connection, {
  allowNonLocal: env.BOOKMARKET_ALLOW_NONLOCAL_EXPORT,
  realDataMigrationApproved: env.BOOKMARKET_REAL_DATA_MIGRATION_APPROVED,
  dryRun
});
const outputPath = path.resolve(env.BOOKMARKET_MIGRATION_EXPORT_PATH || defaultOutputPath);

if (dryRun) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    host: connection.host,
    port: connection.port,
    database: connection.database,
    outputPath,
    readsOnly: true,
  }, null, 2));
  process.exit(0);
}

const client = new Client(connection);
await client.connect();

try {
  await ensureV1TablesExist(client);
  const exportedAt = new Date().toISOString();
  const users = await exportUsers(client);
  const categories = await exportCategories(client);
  const bookmarks = await exportBookmarks(client);

  const payload = {
    format: 'bookmarket-v1-export',
    version: 1,
    exportedAt,
    source: {
      database: connection.database,
      host: connection.host,
    },
    counts: {
      users: users.length,
      categories: categories.length,
      bookmarks: bookmarks.length,
    },
    users,
    categories,
    bookmarks,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Exported v1 data to ${outputPath}: ${users.length} users, ${categories.length} categories, ${bookmarks.length} bookmarks.`);
} finally {
  await client.end();
}

function loadEnvFile(envPath) {
  if (!envPath || !existsSync(envPath)) return {};
  const result = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function buildV1Connection(sourceEnv) {
  if (sourceEnv.BOOKMARKET_V1_DATABASE_URL) {
    const url = new URL(sourceEnv.BOOKMARKET_V1_DATABASE_URL);
    return {
      connectionString: sourceEnv.BOOKMARKET_V1_DATABASE_URL,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ''),
    };
  }

  return {
    host: sourceEnv.POSTGRES_HOST || 'localhost',
    port: Number(sourceEnv.POSTGRES_PORT || 5432),
    user: sourceEnv.POSTGRES_USER,
    password: sourceEnv.POSTGRES_PASSWORD,
    database: sourceEnv.POSTGRES_NAME,
  };
}

function assertLocalOrExplicit(target, { allowNonLocal, realDataMigrationApproved, dryRun }) {
  const safeHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!target.database) {
    throw new Error('Missing database. Set BOOKMARKET_V1_DATABASE_URL or POSTGRES_NAME.');
  }
  if (safeHosts.has(target.host)) {
    return;
  }
  if (allowNonLocal !== '1') {
    throw new Error(`Refusing to export from non-local Postgres host "${target.host}". Set BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1 only after confirming the target is intended.`);
  }
  if (!dryRun && realDataMigrationApproved !== '1') {
    throw new Error(`Refusing to export real production user data from non-local Postgres host "${target.host}". Set BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1 only after explicit approval to touch real user data.`);
  }
}

async function ensureV1TablesExist(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('"user"') AS user_table,
      to_regclass('bookmark') AS bookmark_table,
      to_regclass('category') AS category_table
  `);
  const missing = Object.entries(rows[0])
    .filter(([, value]) => value === null)
    .map(([key]) => key.replace('_table', ''));
  if (missing.length > 0) {
    throw new Error(`V1 schema is missing required table(s): ${missing.join(', ')}`);
  }
}

async function exportUsers(client) {
  const { rows } = await client.query(`
    SELECT
      "id", "email", "username", "firstName", "lastName", "password",
      "isPublic", "auth_provider", "google_id", "github_id", "picture",
      "createdAt", "updatedAt"
    FROM "user"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
  return rows;
}

async function exportCategories(client) {
  const { rows } = await client.query(`
    SELECT "id", "name", "userId", "createdAt", "updatedAt"
    FROM "category"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
  return rows;
}

async function exportBookmarks(client) {
  const { rows } = await client.query(`
    SELECT
      "id", "url", "title", "description", "faviconUrl",
      "createdAt", "updatedAt", "userId", "categoryId"
    FROM "bookmark"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
  return rows;
}
