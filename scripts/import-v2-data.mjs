#!/usr/bin/env node

import { Client } from 'pg';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultInputPath = path.join(repoRoot, 'artifacts/migration/v1-export.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const validateOnly = args.has('--validate-only') || process.env.BOOKMARKET_V2_IMPORT_VALIDATE_ONLY === '1';
const replace = args.has('--replace') || process.env.BOOKMARKET_V2_IMPORT_REPLACE === '1';
const help = args.has('--help') || args.has('-h');

if (help) {
  console.log(`Usage:
  node scripts/import-v2-data.mjs [--dry-run] [--validate-only] [--replace]

Environment:
  BOOKMARKET_MIGRATION_EXPORT_PATH  Input JSON path. Defaults to artifacts/migration/v1-export.json.
  BOOKMARKET_V2_DATABASE_URL        Optional full v2 Postgres connection string.
  BOOKMARKET_DATABASE_URL           Fallback full v2 Postgres connection string.
  POSTGRES_HOST/PORT/DB/USER/PASSWORD  Fallback local connection parts.
  BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1  Required for non-local database hosts.
  BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1  Required for real non-local import runs.
  BOOKMARKET_V2_IMPORT_VALIDATE_ONLY=1  Read-only validation of an existing import.
  BOOKMARKET_V2_IMPORT_REPLACE=1      Delete matching imported IDs before insert.
`);
  process.exit(0);
}

const inputPath = path.resolve(process.env.BOOKMARKET_MIGRATION_EXPORT_PATH || defaultInputPath);
const connection = buildV2Connection(process.env);
assertLocalOrExplicit(connection, {
  allowNonLocal: process.env.BOOKMARKET_ALLOW_NONLOCAL_IMPORT,
  realDataMigrationApproved: process.env.BOOKMARKET_REAL_DATA_MIGRATION_APPROVED,
  dryRun: dryRun || validateOnly
});

if (dryRun && !existsSync(inputPath)) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    inputPath,
    inputExists: false,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    replace,
  }, null, 2));
  process.exit(0);
}

const migration = JSON.parse(await readFile(inputPath, 'utf8'));
validateExportShape(migration);
const normalizedMigration = normalizeLegacyMigration(migration);

if (dryRun) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    inputPath,
    inputExists: true,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    replace,
    counts: normalizedMigration.counts,
    inputCounts: migration.counts,
    normalization: normalizedMigration.normalization,
  }, null, 2));
  process.exit(0);
}

const client = new Client(connection);
await client.connect();

if (validateOnly) {
  try {
    await ensureV2TablesExist(client);
    const validation = await validateImportedCounts(client, normalizedMigration);
    const marketplaceSummary = validation.collections > 0 || validation.listings > 0 || validation.purchases > 0
      ? `, ${validation.collections} collections, ${validation.listings} listings, ${validation.purchases} purchases, ${validation.accessGrants} access grants`
      : '';
    console.log(`Validated existing v2 import: ${validation.users} users, ${validation.categories} categories, ${validation.bookmarks} bookmarks, ${validation.bookmarkMetadata} metadata rows${marketplaceSummary}; no insert/delete/update statements executed.`);
  } finally {
    await client.end();
  }
  process.exit(0);
}

try {
  await client.query('BEGIN');
  await ensureV2TablesExist(client);
  if (replace) {
    await deleteMatchingRows(client, normalizedMigration);
  }
  await insertUsers(client, normalizedMigration.users);
  await insertAuthAccounts(client, normalizedMigration.authAccounts);
  await insertPublicProfiles(client, normalizedMigration.users);
  await insertCategories(client, normalizedMigration.categories);
  await insertBookmarks(client, normalizedMigration.bookmarks);
  await insertBookmarkMetadata(client, normalizedMigration.bookmarks);
  await insertHiddenMarketplaceSeeds(client, normalizedMigration);
  const validation = await validateImportedCounts(client, normalizedMigration);
  await client.query('COMMIT');

  const marketplaceSummary = validation.collections > 0 || validation.listings > 0 || validation.purchases > 0
    ? `, ${validation.collections} collections, ${validation.listings} listings, ${validation.purchases} purchases, ${validation.accessGrants} access grants`
    : '';
  console.log(`Imported v1 export into v2: ${validation.users} users, ${validation.categories} categories, ${validation.bookmarks} bookmarks, ${validation.bookmarkMetadata} metadata rows${marketplaceSummary}.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

function validateExportShape(value) {
  if (value?.format !== 'bookmarket-v1-export' || value.version !== 1) {
    throw new Error('Input is not a supported Bookmarket v1 export.');
  }
  for (const field of ['users', 'categories', 'bookmarks']) {
    if (!Array.isArray(value[field])) {
      throw new Error(`Export is missing array field: ${field}`);
    }
  }
}

function buildV2Connection(sourceEnv) {
  const connectionString = sourceEnv.BOOKMARKET_V2_DATABASE_URL || sourceEnv.BOOKMARKET_DATABASE_URL;
  if (connectionString) {
    const url = new URL(connectionString);
    return {
      connectionString,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ''),
    };
  }

  return {
    host: sourceEnv.POSTGRES_HOST || 'localhost',
    port: Number(sourceEnv.POSTGRES_PORT || 5432),
    user: sourceEnv.POSTGRES_USER || 'bookmarket',
    password: sourceEnv.POSTGRES_PASSWORD || 'bookmarket',
    database: sourceEnv.POSTGRES_DB || 'bookmarket',
  };
}

function assertLocalOrExplicit(target, { allowNonLocal, realDataMigrationApproved, dryRun }) {
  const safeHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!target.database) {
    throw new Error('Missing database. Set BOOKMARKET_V2_DATABASE_URL, BOOKMARKET_DATABASE_URL, or POSTGRES_DB.');
  }
  if (safeHosts.has(target.host)) {
    return;
  }
  if (allowNonLocal !== '1') {
    throw new Error(`Refusing to import into non-local Postgres host "${target.host}". Set BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1 only after confirming the target is intended.`);
  }
  if (!dryRun && realDataMigrationApproved !== '1') {
    throw new Error(`Refusing to import real production user data into non-local Postgres host "${target.host}". Set BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1 only after explicit approval to touch real user data.`);
  }
}

async function ensureV2TablesExist(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('users') AS users_table,
      to_regclass('auth_accounts') AS auth_accounts_table,
      to_regclass('bookmarks') AS bookmarks_table,
      to_regclass('bookmark_metadata') AS bookmark_metadata_table,
      to_regclass('categories') AS categories_table,
      to_regclass('public_profiles') AS public_profiles_table,
      to_regclass('collections') AS collections_table,
      to_regclass('collection_items') AS collection_items_table,
      to_regclass('marketplace_listings') AS marketplace_listings_table,
      to_regclass('listing_versions') AS listing_versions_table,
      to_regclass('purchases') AS purchases_table,
      to_regclass('access_grants') AS access_grants_table
  `);
  const missing = Object.entries(rows[0])
    .filter(([, value]) => value === null)
    .map(([key]) => key.replace('_table', ''));
  if (missing.length > 0) {
    throw new Error(`V2 schema is missing required table(s): ${missing.join(', ')}. Run Flyway migration first.`);
  }
}

async function deleteMatchingRows(client, migration) {
  const userIds = idsForDeletion(migration, 'deleteUserIds', migration.users);
  const categoryIds = idsForDeletion(migration, 'deleteCategoryIds', migration.categories);
  const bookmarkIds = idsForDeletion(migration, 'deleteBookmarkIds', migration.bookmarks);
  const hiddenSeeds = normalizeHiddenSeeds(migration.marketplaceHiddenSeeds);
  const collectionIds = hiddenSeeds.collections.map(collection => collection.id);
  const listingIds = hiddenSeeds.marketplaceListings.map(listing => listing.id);
  const purchaseIds = hiddenSeeds.purchases.map(purchase => purchase.id);

  await deleteMarketplaceRowsForUsers(client, userIds, collectionIds, listingIds, purchaseIds);
  await client.query('DELETE FROM bookmark_metadata WHERE bookmark_id = ANY($1::uuid[])', [bookmarkIds]);
  await client.query('DELETE FROM bookmarks WHERE id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])', [bookmarkIds, userIds]);
  await client.query('DELETE FROM categories WHERE id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])', [categoryIds, userIds]);
  await client.query('DELETE FROM public_profiles WHERE user_id = ANY($1::uuid[])', [userIds]);
  await client.query('DELETE FROM auth_accounts WHERE user_id = ANY($1::uuid[])', [userIds]);
  await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
}

function idsForDeletion(migration, field, fallbackItems) {
  const ids = Array.isArray(migration[field])
    ? migration[field]
    : fallbackItems.map(item => item.id);
  return [...new Set(ids)];
}

async function deleteMarketplaceRowsForUsers(client, userIds, collectionIds, listingIds, purchaseIds) {
  await client.query(`
    DELETE FROM access_grants
    WHERE user_id = ANY($1::uuid[])
       OR purchase_id = ANY($2::uuid[])
       OR listing_version_id IN (
         SELECT lv.id
         FROM listing_versions lv
         JOIN marketplace_listings ml ON ml.id = lv.listing_id
         WHERE ml.seller_user_id = ANY($1::uuid[]) OR ml.id = ANY($3::uuid[])
       )
  `, [userIds, purchaseIds, listingIds]);
  await client.query(`
    DELETE FROM purchases
    WHERE buyer_user_id = ANY($1::uuid[])
       OR id = ANY($2::uuid[])
       OR listing_id IN (
         SELECT id FROM marketplace_listings WHERE seller_user_id = ANY($1::uuid[]) OR id = ANY($3::uuid[])
       )
  `, [userIds, purchaseIds, listingIds]);
  await client.query(`
    DELETE FROM listing_versions
    WHERE listing_id IN (
      SELECT id FROM marketplace_listings WHERE seller_user_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])
    )
  `, [userIds, listingIds]);
  await client.query('DELETE FROM marketplace_listings WHERE seller_user_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])', [userIds, listingIds]);
  await client.query(`
    DELETE FROM collection_items
    WHERE collection_id IN (
      SELECT id FROM collections WHERE owner_user_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])
    )
  `, [userIds, collectionIds]);
  await client.query('DELETE FROM collections WHERE owner_user_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])', [userIds, collectionIds]);
}

async function insertUsers(client, users) {
  for (const user of users) {
    const email = normalizeUserEmail(user);
    await client.query(
      `
      INSERT INTO users (id, email, username, first_name, last_name, picture_url, is_public, created_at, updated_at)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        user.id,
        email,
        user.username,
        user.firstName,
        user.lastName,
        user.picture,
        user.isPublic ?? true,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }
}

async function insertAuthAccounts(client, authAccounts) {
  for (const authAccount of authAccounts) {
    const provider = normalizeProvider(authAccount.auth_provider);
    const email = normalizeUserEmail(authAccount);
    const providerSubject = provider === 'google'
      ? authAccount.google_id || `google-${authAccount.sourceUserId || authAccount.id}`
      : provider === 'github'
        ? authAccount.github_id || `github-${authAccount.sourceUserId || authAccount.id}`
        : null;

    await client.query(
      `
      INSERT INTO auth_accounts (user_id, provider, provider_subject, email, password_hash, created_at, updated_at)
      VALUES ($1::uuid, $2::auth_provider, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
      `,
      [
        authAccount.id,
        provider,
        providerSubject,
        email,
        provider === 'email' ? authAccount.password : null,
        authAccount.createdAt,
        authAccount.updatedAt,
      ],
    );
  }
}

async function insertPublicProfiles(client, users) {
  for (const user of users) {
    if (!user.username) continue;
    await client.query(
      `
      INSERT INTO public_profiles (user_id, username, is_public, display_name, created_at, updated_at)
      VALUES ($1::uuid, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [
        user.id,
        user.username,
        user.isPublic ?? true,
        [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }
}

async function insertCategories(client, categories) {
  for (const category of categories) {
    await client.query(
      `
      INSERT INTO categories (id, user_id, name, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
      `,
      [category.id, category.userId, category.name, category.createdAt, category.updatedAt],
    );
  }
}

async function insertBookmarks(client, bookmarks) {
  for (const bookmark of bookmarks) {
    const normalized = normalizeBookmarkURL(bookmark.url);
    const normalizedUrl = bookmark.normalizedUrl || normalized.normalizedUrl;
    await client.query(
      `
      INSERT INTO bookmarks (id, user_id, category_id, url, normalized_url, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        bookmark.id,
        bookmark.userId,
        bookmark.categoryId,
        normalized.originalUrl,
        normalizedUrl,
        bookmark.createdAt,
        bookmark.updatedAt,
      ],
    );
  }
}

async function insertBookmarkMetadata(client, bookmarks) {
  for (const bookmark of bookmarks) {
    const title = (bookmark.title || bookmark.url || '').trim();
    const status = title ? 'READY' : 'FAILED';
    await client.query(
      `
      INSERT INTO bookmark_metadata (
        bookmark_id, status, version, title, description, favicon_url,
        canonical_url, failure_code, failure_message, fetched_at, created_at, updated_at
      )
      VALUES ($1::uuid, $2::metadata_status, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (bookmark_id) DO NOTHING
      `,
      [
        bookmark.id,
        status,
        title || null,
        bookmark.description || null,
        bookmark.faviconUrl || null,
        bookmark.url,
        status === 'FAILED' ? 'V1_METADATA_MISSING' : null,
        status === 'FAILED' ? 'V1 bookmark did not include a title during migration' : null,
        bookmark.updatedAt,
        bookmark.createdAt,
        bookmark.updatedAt,
      ],
    );
  }
}

async function insertHiddenMarketplaceSeeds(client, migration) {
  const hiddenSeeds = normalizeHiddenSeeds(migration.marketplaceHiddenSeeds);
  const collectionById = new Map(hiddenSeeds.collections.map(collection => [collection.id, collection]));
  const listingById = new Map(hiddenSeeds.marketplaceListings.map(listing => [listing.id, listing]));

  for (const collection of hiddenSeeds.collections) {
    await client.query(
      `
      INSERT INTO collections (id, owner_user_id, title, description, visibility)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::collection_visibility)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        collection.id,
        collection.ownerId,
        requiredString(collection.title, 'Hidden collection title is required'),
        collection.description || null,
        normalizeCollectionVisibility(collection.visibility),
      ],
    );

    for (const [index, item] of (collection.items || []).entries()) {
      await client.query(
        `
        INSERT INTO collection_items (collection_id, bookmark_id, position, note)
        VALUES ($1::uuid, $2::uuid, $3, $4)
        ON CONFLICT DO NOTHING
        `,
        [collection.id, item.bookmarkId, item.position ?? index, item.note || null],
      );
    }
  }

  for (const listing of hiddenSeeds.marketplaceListings) {
    const collection = collectionById.get(listing.collectionId);
    if (!collection) {
      throw new Error(`Hidden listing ${listing.id} references unknown collection ${listing.collectionId}`);
    }
    await client.query(
      `
      INSERT INTO marketplace_listings (
        id, seller_user_id, collection_id, status, slug, title, description, price_cents, currency, published_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::listing_status, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        listing.id,
        collection.ownerId,
        listing.collectionId,
        normalizeListingStatus(listing.status),
        listing.slug || null,
        listing.title || collection.title,
        listing.description || null,
        listing.priceCents ?? 0,
        normalizeCurrency(listing.currency || 'USD'),
        listing.status === 'PUBLISHED' ? listing.publishedAt || new Date().toISOString() : null,
      ],
    );
  }

  for (const purchase of hiddenSeeds.purchases) {
    const listing = listingById.get(purchase.listingId);
    if (!listing) {
      throw new Error(`Hidden purchase ${purchase.id} references unknown listing ${purchase.listingId}`);
    }
    const version = purchase.snapshotVersion || 1;
    const listingVersionId = await ensureListingVersion(client, listing, collectionById.get(listing.collectionId), version);
    await client.query(
      `
      INSERT INTO purchases (
        id, buyer_user_id, listing_id, listing_version_id, status, amount_cents, currency, purchased_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PAID'::purchase_status, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        purchase.id,
        purchase.buyerId,
        purchase.listingId,
        listingVersionId,
        listing.priceCents ?? 0,
        normalizeCurrency(listing.currency || 'USD'),
        purchase.purchasedAt || new Date().toISOString(),
      ],
    );
    await client.query(
      `
      INSERT INTO access_grants (user_id, listing_version_id, purchase_id, source)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'PURCHASE'::access_grant_source)
      ON CONFLICT DO NOTHING
      `,
      [purchase.buyerId, listingVersionId, purchase.id],
    );
  }
}

async function ensureListingVersion(client, listing, collection, version) {
  if (!collection) {
    throw new Error(`Hidden listing ${listing.id} references unknown collection ${listing.collectionId}`);
  }
  const existing = await client.query(
    'SELECT id FROM listing_versions WHERE listing_id = $1::uuid AND version = $2 LIMIT 1',
    [listing.id, version],
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const snapshot = {
    collectionId: collection.id,
    title: collection.title,
    description: collection.description || null,
    visibility: normalizeCollectionVisibility(collection.visibility),
    items: collection.items || [],
  };
  const inserted = await client.query(
    `
    INSERT INTO listing_versions (listing_id, version, collection_id, snapshot, price_cents, currency)
    VALUES ($1::uuid, $2, $3::uuid, $4::jsonb, $5, $6)
    RETURNING id
    `,
    [
      listing.id,
      version,
      listing.collectionId,
      JSON.stringify(snapshot),
      listing.priceCents ?? 0,
      normalizeCurrency(listing.currency || 'USD'),
    ],
  );
  return inserted.rows[0].id;
}

async function validateImportedCounts(client, migration) {
  const userIds = migration.users.map(user => user.id);
  const categoryIds = migration.categories.map(category => category.id);
  const bookmarkIds = migration.bookmarks.map(bookmark => bookmark.id);
  const hiddenSeeds = normalizeHiddenSeeds(migration.marketplaceHiddenSeeds);
  const collectionIds = hiddenSeeds.collections.map(collection => collection.id);
  const listingIds = hiddenSeeds.marketplaceListings.map(listing => listing.id);
  const purchaseIds = hiddenSeeds.purchases.map(purchase => purchase.id);

  const users = await countByIds(client, 'users', 'id', userIds);
  const authAccounts = await countByUserIds(client, 'auth_accounts', userIds);
  const publicProfiles = await countPublicProfilesForUsers(client, migration.users);
  const categories = await countByIds(client, 'categories', 'id', categoryIds);
  const bookmarks = await countByIds(client, 'bookmarks', 'id', bookmarkIds);
  const bookmarkMetadata = await countByIds(client, 'bookmark_metadata', 'bookmark_id', bookmarkIds);
  const collections = await countByIds(client, 'collections', 'id', collectionIds);
  const listings = await countByIds(client, 'marketplace_listings', 'id', listingIds);
  const purchases = await countByIds(client, 'purchases', 'id', purchaseIds);
  const accessGrants = await countAccessGrantsForPurchases(client, purchaseIds);
  const orphanCategories = await countOrphanCategories(client, categoryIds);
  const orphanBookmarks = await countOrphanBookmarks(client, bookmarkIds);
  const metadataFieldMismatches = await countBookmarkMetadataFieldMismatches(client, migration.bookmarks);

  assertCount('users', users, migration.users.length);
  assertCount('auth accounts', authAccounts, migration.authAccounts.length);
  assertCount('public profiles', publicProfiles, migration.users.filter(user => user.username).length);
  assertCount('categories', categories, migration.categories.length);
  assertCount('bookmarks', bookmarks, migration.bookmarks.length);
  assertCount('bookmark metadata', bookmarkMetadata, migration.bookmarks.length);
  assertCount('collections', collections, hiddenSeeds.collections.length);
  assertCount('marketplace listings', listings, hiddenSeeds.marketplaceListings.length);
  assertCount('purchases', purchases, hiddenSeeds.purchases.length);
  assertCount('access grants', accessGrants, hiddenSeeds.purchases.length);
  assertCount('orphan categories', orphanCategories, 0);
  assertCount('orphan bookmarks', orphanBookmarks, 0);
  assertCount('bookmark metadata field mismatches', metadataFieldMismatches, 0);

  return { users, authAccounts, publicProfiles, categories, bookmarks, bookmarkMetadata, collections, listings, purchases, accessGrants };
}

async function countByIds(client, table, column, ids) {
  if (ids.length === 0) return 0;
  const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${column} = ANY($1::uuid[])`, [ids]);
  return rows[0].count;
}

async function countByUserIds(client, table, userIds) {
  if (userIds.length === 0) return 0;
  const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id = ANY($1::uuid[])`, [userIds]);
  return rows[0].count;
}

async function countPublicProfilesForUsers(client, users) {
  const usersWithProfiles = users.filter(user => user.username);
  if (usersWithProfiles.length === 0) return 0;
  const { rows } = await client.query(
    'SELECT count(*)::int AS count FROM public_profiles WHERE user_id = ANY($1::uuid[])',
    [usersWithProfiles.map(user => user.id)],
  );
  return rows[0].count;
}

async function countOrphanCategories(client, categoryIds) {
  if (categoryIds.length === 0) return 0;
  const { rows } = await client.query(`
    SELECT count(*)::int AS count
    FROM categories c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.id = ANY($1::uuid[]) AND u.id IS NULL
  `, [categoryIds]);
  return rows[0].count;
}

async function countOrphanBookmarks(client, bookmarkIds) {
  if (bookmarkIds.length === 0) return 0;
  const { rows } = await client.query(`
    SELECT count(*)::int AS count
    FROM bookmarks b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN categories c ON c.id = b.category_id
    WHERE b.id = ANY($1::uuid[])
      AND (u.id IS NULL OR (b.category_id IS NOT NULL AND c.id IS NULL))
  `, [bookmarkIds]);
  return rows[0].count;
}

async function countAccessGrantsForPurchases(client, purchaseIds) {
  if (purchaseIds.length === 0) return 0;
  const { rows } = await client.query(`
    SELECT count(*)::int AS count
    FROM access_grants
    WHERE purchase_id = ANY($1::uuid[]) AND revoked_at IS NULL
  `, [purchaseIds]);
  return rows[0].count;
}

async function countBookmarkMetadataFieldMismatches(client, bookmarks) {
  let mismatches = 0;
  for (const bookmark of bookmarks) {
    const expectedTitle = (bookmark.title || bookmark.url || '').trim() || null;
    const expectedDescription = bookmark.description || null;
    const expectedFaviconUrl = bookmark.faviconUrl || null;
    const expectedCanonicalUrl = bookmark.url;
    const { rows } = await client.query(
      `
      SELECT title, description, favicon_url, canonical_url
      FROM bookmark_metadata
      WHERE bookmark_id = $1::uuid
      `,
      [bookmark.id],
    );
    const actual = rows[0];
    if (!actual) {
      mismatches += 1;
      continue;
    }
    if (
      actual.title !== expectedTitle ||
      actual.description !== expectedDescription ||
      actual.favicon_url !== expectedFaviconUrl ||
      actual.canonical_url !== expectedCanonicalUrl
    ) {
      mismatches += 1;
    }
  }
  return mismatches;
}

function assertCount(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`Import validation failed for ${label}: expected ${expected}, got ${actual}`);
  }
}

function normalizeLegacyMigration(migration) {
  const userMetrics = buildUserMetrics(migration);
  const usersByEmail = groupBy(migration.users, user => normalizeEmailKey(user));
  const canonicalUserBySourceId = new Map();
  const users = [];
  let blankEmailUsers = 0;
  let duplicateEmailGroups = 0;
  let duplicateEmailRows = 0;

  for (const sourceUsers of usersByEmail.values()) {
    blankEmailUsers += sourceUsers.filter(user => !String(user.email ?? '').trim()).length;
    if (sourceUsers.length > 1) {
      duplicateEmailGroups += 1;
      duplicateEmailRows += sourceUsers.length;
    }

    const canonicalSourceUser = chooseBestUser(sourceUsers, userMetrics);
    const canonicalUser = buildCanonicalUser(canonicalSourceUser, sourceUsers, userMetrics);
    users.push(canonicalUser);
    for (const sourceUser of sourceUsers) {
      canonicalUserBySourceId.set(sourceUser.id, canonicalUser);
    }
  }

  const authAccounts = normalizeAuthAccounts(migration.users, canonicalUserBySourceId, userMetrics);
  const categoryNormalization = normalizeCategories(migration.categories, migration.bookmarks, canonicalUserBySourceId);
  const bookmarkNormalization = normalizeBookmarks(
    migration.bookmarks,
    canonicalUserBySourceId,
    categoryNormalization.categoryIdBySourceId,
  );
  const marketplaceHiddenSeeds = remapHiddenSeeds(migration.marketplaceHiddenSeeds, canonicalUserBySourceId);

  return {
    ...migration,
    users,
    authAccounts,
    categories: categoryNormalization.categories,
    bookmarks: bookmarkNormalization.bookmarks,
    marketplaceHiddenSeeds,
    deleteUserIds: uniqueIds([...migration.users.map(user => user.id), ...users.map(user => user.id)]),
    deleteCategoryIds: uniqueIds([
      ...migration.categories.map(category => category.id),
      ...categoryNormalization.categories.map(category => category.id),
    ]),
    deleteBookmarkIds: uniqueIds([
      ...migration.bookmarks.map(bookmark => bookmark.id),
      ...bookmarkNormalization.bookmarks.map(bookmark => bookmark.id),
    ]),
    counts: {
      ...migration.counts,
      users: users.length,
      authAccounts: authAccounts.length,
      categories: categoryNormalization.categories.length,
      bookmarks: bookmarkNormalization.bookmarks.length,
    },
    normalization: {
      inputUsers: migration.users.length,
      users: users.length,
      blankEmailUsers,
      duplicateEmailGroups,
      duplicateEmailRows,
      authAccounts: authAccounts.length,
      inputCategories: migration.categories.length,
      categories: categoryNormalization.categories.length,
      mergedCategoryGroups: categoryNormalization.mergedCategoryGroups,
      mergedCategoryRows: categoryNormalization.mergedCategoryRows,
      inputBookmarks: migration.bookmarks.length,
      bookmarks: bookmarkNormalization.bookmarks.length,
      duplicateBookmarkGroups: bookmarkNormalization.duplicateBookmarkGroups,
      duplicateBookmarkRows: bookmarkNormalization.duplicateBookmarkRows,
      bookmarksWithInternalNormalizedUrlDisambiguation: bookmarkNormalization.bookmarksWithInternalNormalizedUrlDisambiguation,
    },
  };
}

function buildUserMetrics(migration) {
  const categoryCounts = countBy(migration.categories, category => category.userId);
  const bookmarkCounts = countBy(migration.bookmarks, bookmark => bookmark.userId);
  const categoryBookmarkCounts = countBy(
    migration.bookmarks.filter(bookmark => bookmark.categoryId),
    bookmark => bookmark.categoryId,
  );

  return {
    categoryCounts,
    bookmarkCounts,
    categoryBookmarkCounts,
  };
}

function buildCanonicalUser(canonicalSourceUser, sourceUsers, userMetrics) {
  const fallbackUsers = [...sourceUsers].sort((left, right) => compareUsersForCanonical(left, right, userMetrics));
  return {
    ...canonicalSourceUser,
    email: normalizeUserEmail(canonicalSourceUser),
    username: canonicalSourceUser.username || firstPresent(fallbackUsers, 'username'),
    firstName: canonicalSourceUser.firstName || firstPresent(fallbackUsers, 'firstName'),
    lastName: canonicalSourceUser.lastName || firstPresent(fallbackUsers, 'lastName'),
    picture: canonicalSourceUser.picture || firstPresent(fallbackUsers, 'picture'),
    isPublic: sourceUsers.some(user => user.isPublic ?? true),
  };
}

function chooseBestUser(users, userMetrics) {
  return [...users].sort((left, right) => compareUsersForCanonical(left, right, userMetrics))[0];
}

function compareUsersForCanonical(left, right, userMetrics) {
  return compareNumbers(descendingUserScore(right, userMetrics), descendingUserScore(left, userMetrics))
    || compareBooleans(Boolean(right.username), Boolean(left.username))
    || compareBooleans(Boolean(right.picture), Boolean(left.picture))
    || compareDates(left.createdAt, right.createdAt)
    || String(left.id).localeCompare(String(right.id));
}

function descendingUserScore(user, userMetrics) {
  return (userMetrics.bookmarkCounts.get(user.id) || 0) + (userMetrics.categoryCounts.get(user.id) || 0);
}

function normalizeAuthAccounts(sourceUsers, canonicalUserBySourceId, userMetrics) {
  const authAccountsByEmailProvider = new Map();

  for (const sourceUser of sourceUsers) {
    const canonicalUser = requiredCanonicalUser(canonicalUserBySourceId, sourceUser.id);
    const provider = normalizeProvider(sourceUser.auth_provider);
    if (provider === 'email' && !sourceUser.password) {
      continue;
    }
    const authAccount = {
      ...sourceUser,
      id: canonicalUser.id,
      sourceUserId: sourceUser.id,
      email: canonicalUser.email,
    };
    const key = `${canonicalUser.email.toLowerCase()}\0${provider}`;
    const existing = authAccountsByEmailProvider.get(key);
    if (!existing || compareAuthAccounts(authAccount, existing, userMetrics) < 0) {
      authAccountsByEmailProvider.set(key, authAccount);
    }
  }

  const authAccountsByProviderSubject = new Map();
  const authAccountsWithoutProviderSubject = [];
  for (const authAccount of authAccountsByEmailProvider.values()) {
    const providerSubject = providerSubjectForAuthAccount(authAccount);
    if (!providerSubject) {
      authAccountsWithoutProviderSubject.push(authAccount);
      continue;
    }
    const key = `${normalizeProvider(authAccount.auth_provider)}\0${providerSubject}`;
    const existing = authAccountsByProviderSubject.get(key);
    if (!existing || compareAuthAccounts(authAccount, existing, userMetrics) < 0) {
      authAccountsByProviderSubject.set(key, authAccount);
    }
  }

  return [...authAccountsWithoutProviderSubject, ...authAccountsByProviderSubject.values()]
    .sort((left, right) => compareDates(left.createdAt, right.createdAt) || String(left.sourceUserId).localeCompare(String(right.sourceUserId)));
}

function compareAuthAccounts(left, right, userMetrics) {
  return compareBooleans(hasAuthCredential(right), hasAuthCredential(left))
    || compareNumbers(descendingUserScore(right, userMetrics), descendingUserScore(left, userMetrics))
    || compareDates(left.createdAt, right.createdAt)
    || String(left.sourceUserId || left.id).localeCompare(String(right.sourceUserId || right.id));
}

function hasAuthCredential(authAccount) {
  const provider = normalizeProvider(authAccount.auth_provider);
  if (provider === 'email') {
    return Boolean(authAccount.password);
  }
  return Boolean(providerSubjectForAuthAccount(authAccount));
}

function providerSubjectForAuthAccount(authAccount) {
  const provider = normalizeProvider(authAccount.auth_provider);
  if (provider === 'google') {
    return authAccount.google_id || `google-${authAccount.sourceUserId || authAccount.id}`;
  }
  if (provider === 'github') {
    return authAccount.github_id || `github-${authAccount.sourceUserId || authAccount.id}`;
  }
  return null;
}

function normalizeCategories(categories, bookmarks, canonicalUserBySourceId) {
  const categoryBookmarkCounts = countBy(
    bookmarks.filter(bookmark => bookmark.categoryId),
    bookmark => bookmark.categoryId,
  );
  const categoriesByUserAndName = groupBy(categories, category => {
    const canonicalUser = requiredCanonicalUser(canonicalUserBySourceId, category.userId);
    return `${canonicalUser.id}\0${String(category.name || '').trim().toLowerCase()}`;
  });
  const normalizedCategories = [];
  const categoryIdBySourceId = new Map();
  let mergedCategoryGroups = 0;
  let mergedCategoryRows = 0;

  for (const sourceCategories of categoriesByUserAndName.values()) {
    if (sourceCategories.length > 1) {
      mergedCategoryGroups += 1;
      mergedCategoryRows += sourceCategories.length - 1;
    }

    const canonicalCategory = chooseBestCategory(sourceCategories, categoryBookmarkCounts);
    const canonicalUser = requiredCanonicalUser(canonicalUserBySourceId, canonicalCategory.userId);
    normalizedCategories.push({
      ...canonicalCategory,
      userId: canonicalUser.id,
    });
    for (const sourceCategory of sourceCategories) {
      categoryIdBySourceId.set(sourceCategory.id, canonicalCategory.id);
    }
  }

  return {
    categories: normalizedCategories,
    categoryIdBySourceId,
    mergedCategoryGroups,
    mergedCategoryRows,
  };
}

function chooseBestCategory(categories, categoryBookmarkCounts) {
  return [...categories].sort((left, right) => (
    compareNumbers(categoryBookmarkCounts.get(right.id) || 0, categoryBookmarkCounts.get(left.id) || 0)
      || compareDates(left.createdAt, right.createdAt)
      || String(left.id).localeCompare(String(right.id))
  ))[0];
}

function normalizeBookmarks(bookmarks, canonicalUserBySourceId, categoryIdBySourceId) {
  const normalizedBookmarks = bookmarks.map(bookmark => {
    const canonicalUser = requiredCanonicalUser(canonicalUserBySourceId, bookmark.userId);
    return {
      ...bookmark,
      userId: canonicalUser.id,
      categoryId: bookmark.categoryId ? categoryIdBySourceId.get(bookmark.categoryId) || bookmark.categoryId : null,
      normalizedUrl: normalizeBookmarkURL(bookmark.url).normalizedUrl,
    };
  });
  const bookmarksByUserAndUrl = groupBy(normalizedBookmarks, bookmark => `${bookmark.userId}\0${bookmark.normalizedUrl}`);
  let duplicateBookmarkGroups = 0;
  let duplicateBookmarkRows = 0;
  let bookmarksWithInternalNormalizedUrlDisambiguation = 0;

  for (const duplicateBookmarks of bookmarksByUserAndUrl.values()) {
    if (duplicateBookmarks.length <= 1) {
      continue;
    }

    duplicateBookmarkGroups += 1;
    duplicateBookmarkRows += duplicateBookmarks.length;
    const [primaryBookmark, ...secondaryBookmarks] = [...duplicateBookmarks].sort((left, right) => (
      compareDates(left.createdAt, right.createdAt)
        || String(left.id).localeCompare(String(right.id))
    ));
    primaryBookmark.normalizedUrl = normalizeBookmarkURL(primaryBookmark.url).normalizedUrl;
    for (const bookmark of secondaryBookmarks) {
      bookmark.normalizedUrl = `${bookmark.normalizedUrl}#bookmarket-v1-duplicate-${bookmark.id}`;
      bookmarksWithInternalNormalizedUrlDisambiguation += 1;
    }
  }

  return {
    bookmarks: normalizedBookmarks,
    duplicateBookmarkGroups,
    duplicateBookmarkRows,
    bookmarksWithInternalNormalizedUrlDisambiguation,
  };
}

function remapHiddenSeeds(value, canonicalUserBySourceId) {
  const hiddenSeeds = normalizeHiddenSeeds(value);
  return {
    collections: hiddenSeeds.collections.map(collection => ({
      ...collection,
      ownerId: remapUserId(collection.ownerId, canonicalUserBySourceId),
      items: Array.isArray(collection.items) ? collection.items.map(item => ({ ...item })) : [],
    })),
    marketplaceListings: hiddenSeeds.marketplaceListings.map(listing => ({ ...listing })),
    purchases: hiddenSeeds.purchases.map(purchase => ({
      ...purchase,
      buyerId: remapUserId(purchase.buyerId, canonicalUserBySourceId),
    })),
  };
}

function remapUserId(userId, canonicalUserBySourceId) {
  return canonicalUserBySourceId.get(userId)?.id || userId;
}

function requiredCanonicalUser(canonicalUserBySourceId, sourceUserId) {
  const canonicalUser = canonicalUserBySourceId.get(sourceUserId);
  if (!canonicalUser) {
    throw new Error(`Migration data references unknown user id ${sourceUserId}`);
  }
  return canonicalUser;
}

function normalizeEmailKey(user) {
  return normalizeUserEmail(user).toLowerCase();
}

function groupBy(values, keyForValue) {
  const groups = new Map();
  for (const value of values) {
    const key = keyForValue(value);
    const group = groups.get(key);
    if (group) {
      group.push(value);
    } else {
      groups.set(key, [value]);
    }
  }
  return groups;
}

function countBy(values, keyForValue) {
  const counts = new Map();
  for (const value of values) {
    const key = keyForValue(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function firstPresent(values, field) {
  return values.find(value => value[field])?.[field] || null;
}

function compareNumbers(left, right) {
  return left === right ? 0 : left > right ? 1 : -1;
}

function compareBooleans(left, right) {
  return Number(left) - Number(right);
}

function compareDates(left, right) {
  const leftTime = Date.parse(left || '') || 0;
  const rightTime = Date.parse(right || '') || 0;
  return compareNumbers(leftTime, rightTime);
}

function normalizeProvider(value) {
  const provider = String(value || 'email').trim().toLowerCase();
  if (provider === 'google') return 'google';
  if (provider === 'github') return 'github';
  return 'email';
}

function normalizeUserEmail(user) {
  const email = String(user.email ?? '').trim();
  if (email) {
    return email;
  }

  return `legacy-${user.id}@imported.bookmarket.local`;
}

function normalizeHiddenSeeds(value) {
  return {
    collections: Array.isArray(value?.collections) ? value.collections : [],
    marketplaceListings: Array.isArray(value?.marketplaceListings) ? value.marketplaceListings : [],
    purchases: Array.isArray(value?.purchases) ? value.purchases : [],
  };
}

function requiredString(value, message) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function normalizeCollectionVisibility(value) {
  const visibility = String(value || 'PRIVATE').trim().toUpperCase();
  if (!['PRIVATE', 'PUBLIC', 'UNLISTED'].includes(visibility)) {
    throw new Error(`Unsupported collection visibility: ${value}`);
  }
  return visibility;
}

function normalizeListingStatus(value) {
  const status = String(value || 'DRAFT').trim().toUpperCase();
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    throw new Error(`Unsupported listing status: ${value}`);
  }
  return status;
}

function normalizeCurrency(value) {
  const currency = String(value || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Unsupported currency: ${value}`);
  }
  return currency;
}

function normalizeBookmarkURL(rawURL) {
  const trimmed = String(rawURL || '').trim();
  if (!trimmed) {
    throw new Error('Bookmark URL is required');
  }
  const originalUrl = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  const parsed = new URL(originalUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`Invalid bookmark URL: ${rawURL}`);
  }
  const afterHost = originalUrl.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+(.*)$/i)?.[1] ?? '';
  const pathPart = afterHost.startsWith('/') ? parsed.pathname : '';
  const portPart = parsed.port ? `:${parsed.port}` : '';
  return {
    originalUrl,
    normalizedUrl: `${parsed.protocol}//${parsed.hostname.toLowerCase()}${portPart}${pathPart}${parsed.search}`,
  };
}
