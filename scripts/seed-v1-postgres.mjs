#!/usr/bin/env node

import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/v1-seed-data.json');
const defaultV1EnvPath = path.join(repoRoot, 'apps/server/.env');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage:
  node scripts/seed-v1-postgres.mjs [--dry-run]

Environment:
  BOOKMARKET_V1_DATABASE_URL  Optional full Postgres connection string.
  BOOKMARKET_V1_ENV_FILE      Optional v1 server .env path. Defaults to local v1 .env.
  BOOKMARKET_V1_CREATE_SCHEMA=1  Create the final v1 schema if the DB is empty.
  BOOKMARKET_ALLOW_NONLOCAL_SEED=1  Required for non-local database hosts.
`);
  process.exit(0);
}

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const env = {
  ...loadEnvFile(process.env.BOOKMARKET_V1_ENV_FILE || defaultV1EnvPath),
  ...process.env,
};
const connection = buildConnection(env);
assertLocalDatabase(connection);

const seedUserIds = fixture.users.map(user => user.id);
const seedEmails = fixture.users.map(user => user.email);
const seedUsernames = fixture.users.map(user => user.username);

if (dryRun) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    host: connection.host,
    port: connection.port,
    database: connection.database,
    users: fixture.users.length,
    categories: fixture.categories.length,
    bookmarks: fixture.bookmarks.length,
    createSchemaIfMissing: env.BOOKMARKET_V1_CREATE_SCHEMA === '1',
    deletesOnlySeedRecords: true,
  }, null, 2));
  process.exit(0);
}

const client = new Client(connection);
await client.connect();

try {
  await client.query('BEGIN');
  await ensureV1TablesExist(client);
  await deleteSeedRecords(client);
  await insertUsers(client);
  await insertCategories(client);
  await insertBookmarks(client);
  await client.query('COMMIT');

  console.log(`Seeded v1 Postgres with ${fixture.users.length} users, ${fixture.categories.length} categories, and ${fixture.bookmarks.length} bookmarks.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

function loadEnvFile(envPath) {
  if (!envPath || !existsSync(envPath)) return {};

  const content = requireReadFileSync(envPath);
  const result = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function requireReadFileSync(filePath) {
  return existsSync(filePath)
    ? Buffer.from(readFileSync(filePath)).toString('utf8')
    : '';
}

function buildConnection(sourceEnv) {
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

function assertLocalDatabase(target) {
  const safeHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const isLocal = safeHosts.has(target.host);

  if (!isLocal && env.BOOKMARKET_ALLOW_NONLOCAL_SEED !== '1') {
    throw new Error(`Refusing to seed non-local Postgres host "${target.host}". Set BOOKMARKET_ALLOW_NONLOCAL_SEED=1 only for an isolated test database.`);
  }

  if (!target.database) {
    throw new Error('Missing target database. Set BOOKMARKET_V1_DATABASE_URL or POSTGRES_NAME.');
  }
}

async function ensureV1TablesExist(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('"user"') AS user_table,
      to_regclass('bookmark') AS bookmark_table,
      to_regclass('category') AS category_table
  `);

  const tableState = rows[0];
  const missing = Object.entries(tableState)
    .filter(([, value]) => value === null)
    .map(([key]) => key.replace('_table', ''));

  if (missing.length > 0) {
    if (env.BOOKMARKET_V1_CREATE_SCHEMA === '1') {
      await createV1Schema(client);
      return;
    }

    throw new Error(`V1 schema is missing required table(s): ${missing.join(', ')}. Start the v1 API once so migrations run before seeding.`);
  }
}

async function createV1Schema(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "email" character varying NOT NULL,
      "username" character varying NULL UNIQUE,
      "firstName" character varying NULL,
      "lastName" character varying NULL,
      "password" character varying NULL,
      "isPublic" boolean DEFAULT true,
      "auth_provider" character varying NOT NULL,
      "google_id" character varying NULL,
      "github_id" character varying NULL,
      "picture" character varying NULL,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "category" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "name" character varying NOT NULL,
      "userId" uuid,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UQ_category_name_userId" UNIQUE ("name", "userId"),
      CONSTRAINT "FK_category_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "bookmark" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "url" character varying NOT NULL,
      "title" character varying NOT NULL,
      "description" character varying NULL,
      "faviconUrl" character varying NULL,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "userId" uuid,
      "categoryId" uuid,
      CONSTRAINT "FK_bookmark_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_bookmark_category" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "migrations" (
      "id" SERIAL PRIMARY KEY,
      "timestamp" bigint NOT NULL,
      "name" character varying NOT NULL
    )
  `);

  const migrations = [
    [1741003681675, 'NullableDescriptionBookmark1741003681675'],
    [1741004721666, 'NullableFaviconBookmark1741004721666'],
    [1741515061023, 'BookmarkCategory1741515061023'],
    [1742215844517, 'UserNameFirstNameLastName1742215844517'],
    [1742896225807, 'ProfilePublic1742896225807'],
    [1751387105551, 'AddUserTimestamps1751387105551'],
  ];

  for (const [timestamp, name] of migrations) {
    await client.query(
      `
        INSERT INTO "migrations" ("timestamp", "name")
        SELECT $1::bigint, $2::character varying
        WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = $2::character varying)
      `,
      [timestamp, name],
    );
  }
}

async function deleteSeedRecords(client) {
  await client.query('DELETE FROM "bookmark" WHERE "id" = ANY($1::uuid[]) OR "userId" = ANY($2::uuid[])', [
    fixture.bookmarks.map(bookmark => bookmark.id),
    seedUserIds,
  ]);
  await client.query('DELETE FROM "category" WHERE "id" = ANY($1::uuid[]) OR "userId" = ANY($2::uuid[])', [
    fixture.categories.map(category => category.id),
    seedUserIds,
  ]);
  await client.query('DELETE FROM "user" WHERE "id" = ANY($1::uuid[]) OR "email" = ANY($2::text[]) OR "username" = ANY($3::text[])', [
    seedUserIds,
    seedEmails,
    seedUsernames,
  ]);
}

async function insertUsers(client) {
  for (const user of fixture.users) {
    const password = user.passwordPlaintextForLocalSeedOnly
      ? await bcrypt.hash(user.passwordPlaintextForLocalSeedOnly, await bcrypt.genSalt())
      : null;

    await client.query(
      `
        INSERT INTO "user" (
          "id", "email", "username", "firstName", "lastName", "password",
          "isPublic", "auth_provider", "google_id", "github_id", "picture",
          "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        user.id,
        user.email,
        user.username,
        user.firstName,
        user.lastName,
        password,
        user.isPublic,
        user.authProvider.toLowerCase(),
        user.authProvider === 'GOOGLE' ? `google-${user.id}` : null,
        user.authProvider === 'GITHUB' ? `github-${user.id}` : null,
        user.picture,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }
}

async function insertCategories(client) {
  for (const category of fixture.categories) {
    await client.query(
      `
        INSERT INTO "category" ("id", "name", "userId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5)
      `,
      [category.id, category.name, category.userId, category.createdAt, category.updatedAt],
    );
  }
}

async function insertBookmarks(client) {
  for (const bookmark of fixture.bookmarks) {
    await client.query(
      `
        INSERT INTO "bookmark" (
          "id", "url", "title", "description", "faviconUrl",
          "createdAt", "updatedAt", "userId", "categoryId"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        bookmark.id,
        bookmark.url,
        bookmark.title,
        bookmark.description,
        bookmark.faviconUrl,
        bookmark.createdAt,
        bookmark.updatedAt,
        bookmark.userId,
        bookmark.categoryId,
      ],
    );
  }
}
