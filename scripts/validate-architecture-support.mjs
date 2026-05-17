#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const migration = await readText('services/api/src/main/resources/db/migration/V001__initial_schema.sql');
const openapi = await readJson('docs/contracts/openapi.json');
const apiDoc = await readText('docs/contracts/api.md');
const permissionsDoc = await readText('docs/domain/permissions.md');
const apiTokensController = await readText('services/api/src/main/kotlin/com/bookmarket/api/auth/ApiTokensController.kt');
const apiTokenService = await readText('services/api/src/main/kotlin/com/bookmarket/api/auth/ApiTokenService.kt');
const collectionsController = await readText('services/api/src/main/kotlin/com/bookmarket/api/marketplace/CollectionsController.kt');
const marketplaceController = await readText('services/api/src/main/kotlin/com/bookmarket/api/marketplace/MarketplaceController.kt');
const purchasesController = await readText('services/api/src/main/kotlin/com/bookmarket/api/marketplace/PurchasesController.kt');
const publicCollectionsController = await readText('services/api/src/main/kotlin/com/bookmarket/api/marketplace/PublicCollectionsController.kt');

validateSchema();
validateOpenApi();
validateDocs();
validateServiceBoundaries();
await validateNoWebMarketplaceRoutes();

console.log('Architecture support validated: Postgres future tables, Raycast API-token contract, hidden marketplace contract, permissions, and backend-only service boundaries.');

function validateSchema() {
  for (const tableName of [
    'users',
    'auth_accounts',
    'refresh_tokens',
    'api_tokens',
    'bookmarks',
    'bookmark_metadata',
    'categories',
    'public_profiles',
    'collections',
    'collection_items',
    'marketplace_listings',
    'listing_versions',
    'purchases',
    'access_grants'
  ]) {
    tableBody(tableName);
  }

  for (const enumName of [
    'auth_provider',
    'metadata_status',
    'collection_visibility',
    'listing_status',
    'purchase_status',
    'access_grant_source'
  ]) {
    assert(migration.includes(`CREATE TYPE ${enumName} AS ENUM`), `Missing Postgres enum: ${enumName}`);
  }

  assertTableColumns('api_tokens', [
    'user_id',
    'name',
    'token_prefix',
    'token_hash',
    'scopes',
    'last_used_at',
    'expires_at',
    'revoked_at',
    'created_at',
    'updated_at'
  ]);
  assertIncludes(migration, 'token_hash text NOT NULL UNIQUE', 'api_tokens must persist only a token hash.');
  assertIncludes(migration, "scopes text[] NOT NULL DEFAULT '{}'", 'api_tokens must store explicit scopes.');
  assertIncludes(migration, 'CREATE INDEX api_tokens_user_id_idx ON api_tokens (user_id)', 'api_tokens must be user-scoped.');

  assertTableColumns('collections', ['owner_user_id', 'title', 'description', 'visibility', 'deleted_at']);
  assertTableColumns('collection_items', ['collection_id', 'bookmark_id', 'position', 'note']);
  assertIncludes(migration, 'CREATE UNIQUE INDEX collection_items_collection_position_unique_idx', 'collection item ordering must be stable.');
  assertIncludes(migration, 'CREATE UNIQUE INDEX collection_items_collection_bookmark_unique_idx', 'collections must not duplicate bookmarks.');

  assertTableColumns('marketplace_listings', [
    'seller_user_id',
    'collection_id',
    'status',
    'slug',
    'title',
    'price_cents',
    'currency',
    'published_at'
  ]);
  assertIncludes(migration, 'CREATE INDEX marketplace_listings_seller_idx', 'marketplace listings must be seller-scoped.');
  assertIncludes(migration, 'CREATE INDEX marketplace_listings_status_idx', 'marketplace listings must be status-filterable.');

  assertTableColumns('listing_versions', ['listing_id', 'version', 'collection_id', 'snapshot', 'price_cents', 'currency']);
  assertIncludes(migration, 'snapshot jsonb NOT NULL', 'listing versions must store immutable collection snapshots.');
  assertIncludes(migration, 'CREATE UNIQUE INDEX listing_versions_listing_version_unique_idx', 'listing versions must be immutable per version number.');

  assertTableColumns('purchases', [
    'buyer_user_id',
    'listing_id',
    'listing_version_id',
    'status',
    'amount_cents',
    'currency',
    'provider',
    'provider_purchase_id',
    'purchased_at'
  ]);
  assertIncludes(migration, 'CREATE INDEX purchases_buyer_idx', 'purchases must be buyer-scoped.');

  assertTableColumns('access_grants', ['user_id', 'listing_version_id', 'purchase_id', 'source', 'expires_at', 'revoked_at']);
  assertIncludes(
    migration,
    'CREATE UNIQUE INDEX access_grants_user_listing_version_unique_idx',
    'access grants must prevent duplicate active grants.'
  );
  assertIncludes(migration, 'WHERE revoked_at IS NULL', 'access-grant uniqueness must ignore revoked grants.');
}

function validateOpenApi() {
  assert(openapi.info?.description?.includes('future Raycast'), 'OpenAPI description must mention future Raycast clients.');
  assert(openapi.info?.description?.includes('future marketplace'), 'OpenAPI description must mention future marketplace clients.');

  assertPathMethods('/api-tokens', ['get', 'post']);
  assertPathMethods('/api-tokens/{apiTokenId}', ['delete']);
  assertPathMethods('/collections', ['get', 'post']);
  assertPathMethods('/collections/{collectionId}', ['get', 'patch', 'delete']);
  assertPathMethods('/public-collections/{collectionId}', ['get']);
  assertPathMethods('/marketplace/listings', ['get', 'post']);
  assertPathMethods('/marketplace/listings/{listingId}/publish', ['post']);
  assertPathMethods('/marketplace/listings/{slugOrId}', ['get']);
  assertPathMethods('/marketplace/listings/{slugOrId}/latest-version', ['get']);
  assertPathMethods('/marketplace/listings/{listingId}/purchases', ['post']);
  assertPathMethods('/purchases', ['get']);
  assertPathMethods('/access-grants', ['get']);

  assertResponseRef('/api-tokens', 'post', '201', '#/components/schemas/CreateApiTokenResponse');
  assert(openapi.paths['/api-tokens'].post.responses['201'].description.includes('shown once'), 'API-token creation must document one-time plain token display.');

  assertSchemaFields('ApiTokenDto', ['id', 'name', 'tokenPrefix', 'scopes', 'createdAt', 'lastUsedAt']);
  assertNoSchemaFields('ApiTokenDto', ['token', 'tokenHash', 'token_hash']);
  assertSchemaFields('CreateApiTokenResponse', ['token', 'tokenMetadata']);
  assertSchemaFields('CollectionDto', ['id', 'title', 'description', 'visibility', 'items', 'createdAt', 'updatedAt']);
  assertSchemaFields('ListingDto', [
    'id',
    'sellerUserId',
    'collectionId',
    'status',
    'slug',
    'title',
    'priceCents',
    'currency',
    'latestVersion',
    'publishedAt'
  ]);
  assertSchemaFields('ListingVersionDto', ['id', 'listingId', 'version', 'collectionId', 'snapshot', 'priceCents', 'currency']);
  assertSchemaFields('PurchaseDto', ['id', 'buyerUserId', 'listingId', 'listingVersionId', 'status', 'amountCents', 'currency']);
  assertSchemaFields('AccessGrantDto', ['id', 'userId', 'listingVersionId', 'purchaseId', 'source', 'expiresAt', 'revokedAt']);

  for (const schemaName of ['ApiTokenDto', 'CollectionDto', 'ListingDto', 'ListingVersionDto', 'PurchaseDto', 'AccessGrantDto']) {
    assert(openapi.components.schemas[schemaName].additionalProperties === false, `${schemaName} must reject undeclared DTO fields.`);
  }

  const openapiText = JSON.stringify(openapi);
  for (const scope of ['bookmarks:read', 'bookmarks:write', 'profile:read']) {
    assert(openapiText.includes(scope), `OpenAPI must preserve API-token scope: ${scope}`);
  }
}

function validateDocs() {
  for (const marker of [
    'future Raycast clients',
    'Hidden Collections And Marketplace Foundation',
    'must not be linked from the current bookmark workspace UI',
    'Listing versions store snapshots',
    'Raycast-Ready Tokens',
    'Plain API token values are shown only once'
  ]) {
    assertIncludes(apiDoc, marker, `API docs missing marker: ${marker}`);
  }

  for (const endpoint of [
    '/api/v1/api-tokens',
    '/api/v1/collections',
    '/api/v1/public-collections/{id}',
    '/api/v1/marketplace/listings',
    '/api/v1/marketplace/listings/{id}/publish',
    '/api/v1/marketplace/listings/{id}/purchases',
    '/api/v1/purchases',
    '/api/v1/access-grants'
  ]) {
    assertIncludes(apiDoc, endpoint, `API docs missing future endpoint: ${endpoint}`);
  }

  for (const marker of [
    'API tokens cannot manage tokens',
    'Plain token returned once; hash and prefix stored',
    'Every bookmark item must belong to caller',
    'Private/deleted collections return not found',
    'Buyer cannot receive duplicate active grant',
    'Query filters by grant user id and excludes revoked grants'
  ]) {
    assertIncludes(permissionsDoc, marker, `Permissions docs missing enforcement marker: ${marker}`);
  }
}

function validateServiceBoundaries() {
  assertIncludes(apiTokensController, '@RequestMapping("/api/v1/api-tokens")', 'API-token controller route changed.');
  assertIncludes(apiTokensController, 'currentSessionUser(request)', 'API-token management must remain session-only.');
  assert(!apiTokensController.includes('currentUserOrApiToken'), 'API tokens must not manage API tokens.');

  for (const marker of [
    'const val TokenPrefix = "bmkt_"',
    'const val ScopeBookmarksRead = "bookmarks:read"',
    'const val ScopeBookmarksWrite = "bookmarks:write"',
    'const val ScopeProfileRead = "profile:read"',
    'tokenHash = hash(plainToken)',
    'apiTokenRepository.markUsed(tokenHash)'
  ]) {
    assertIncludes(apiTokenService, marker, `API token service missing marker: ${marker}`);
  }

  assertIncludes(collectionsController, '@RequestMapping("/api/v1/collections")', 'Collections controller route changed.');
  assertIncludes(collectionsController, 'authService.currentUser(request)', 'Collections must remain session-only.');
  assert(!collectionsController.includes('currentUserOrApiToken'), 'API tokens must not manage hidden collections.');

  assertIncludes(publicCollectionsController, '@RequestMapping("/api/v1/public-collections")', 'Public collections route changed.');
  assertIncludes(publicCollectionsController, 'getPublicCollection', 'Public collections must use the public collection boundary.');

  assertIncludes(marketplaceController, '@RequestMapping("/api/v1/marketplace/listings")', 'Marketplace route changed.');
  assertIncludes(marketplaceController, 'listPublishedListings()', 'Marketplace listing reads must expose only published listings.');
  assertIncludes(marketplaceController, 'publishListing(currentUserId(request)', 'Marketplace publish must remain seller-session scoped.');
  assertIncludes(marketplaceController, 'createFreePurchase(currentUserId(request)', 'Marketplace purchases must remain session scoped.');
  assert(!marketplaceController.includes('currentUserOrApiToken'), 'API tokens must not mutate hidden marketplace routes.');

  assertIncludes(purchasesController, '@RequestMapping("/api/v1")', 'Purchases controller route changed.');
  assertIncludes(purchasesController, '@GetMapping("/purchases")', 'Purchases route missing.');
  assertIncludes(purchasesController, '@GetMapping("/access-grants")', 'Access grants route missing.');
  assertIncludes(purchasesController, 'authService.currentUser(request)', 'Purchases and access grants must remain session-only.');
}

async function validateNoWebMarketplaceRoutes() {
  for (const routePath of [
    'apps/web/src/app/collections',
    'apps/web/src/app/marketplace',
    'apps/web/src/app/purchases',
    'apps/web/src/app/access-grants'
  ]) {
    try {
      await access(path.join(repoRoot, routePath));
      fail(`Hidden marketplace/Raycast architecture route must not be exposed in the bookmark workspace UI: ${routePath}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

function assertPathMethods(apiPath, methods) {
  assert(openapi.paths?.[apiPath], `Missing OpenAPI path: ${apiPath}`);
  for (const method of methods) {
    assert(openapi.paths[apiPath][method], `Missing OpenAPI method: ${method.toUpperCase()} ${apiPath}`);
  }
}

function assertResponseRef(apiPath, method, status, schemaRef) {
  const response = openapi.paths?.[apiPath]?.[method]?.responses?.[status];
  const actual = response?.content?.['application/json']?.schema?.$ref;
  assert(actual === schemaRef, `${method.toUpperCase()} ${apiPath} ${status} must return ${schemaRef}; got ${actual ?? 'missing'}.`);
}

function assertSchemaFields(schemaName, fields) {
  const schema = openapi.components?.schemas?.[schemaName];
  assert(schema, `Missing OpenAPI schema: ${schemaName}`);
  for (const field of fields) {
    assert(schema.required?.includes(field), `${schemaName} missing required field: ${field}`);
    assert(schema.properties?.[field], `${schemaName} missing property: ${field}`);
  }
}

function assertNoSchemaFields(schemaName, fields) {
  const schema = openapi.components?.schemas?.[schemaName];
  assert(schema, `Missing OpenAPI schema: ${schemaName}`);
  for (const field of fields) {
    assert(!schema.required?.includes(field), `${schemaName} must not require private field: ${field}`);
    assert(!schema.properties?.[field], `${schemaName} must not expose private field: ${field}`);
  }
}

function assertTableColumns(tableName, columns) {
  const body = tableBody(tableName);
  for (const column of columns) {
    const pattern = new RegExp(`(^|\\n)\\s*${escapeRegExp(column)}\\b`);
    assert(pattern.test(body), `Table ${tableName} missing column: ${column}`);
  }
}

function tableBody(tableName) {
  const pattern = new RegExp(`CREATE TABLE ${escapeRegExp(tableName)} \\(([\\s\\S]*?)\\n\\);`);
  const match = migration.match(pattern);
  assert(match, `Missing Postgres table: ${tableName}`);
  return match[1];
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function assertIncludes(haystack, needle, message) {
  assert(haystack.includes(needle), message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
