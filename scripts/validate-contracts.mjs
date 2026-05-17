#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const openapi = await readJson('docs/contracts/openapi.json');
const eventEnvelope = await readJson('docs/contracts/schemas/event-envelope.schema.json');
const authController = await readText('services/api/src/main/kotlin/com/bookmarket/api/auth/AuthController.kt');
const authDtos = await readText('services/api/src/main/kotlin/com/bookmarket/api/auth/AuthDtos.kt');
const authService = await readText('services/api/src/main/kotlin/com/bookmarket/api/auth/AuthService.kt');
const oauthProviderClient = await readText('services/api/src/main/kotlin/com/bookmarket/api/auth/OAuthProviderClient.kt');

const requiredOpenApiPaths = [
  '/auth/signup',
  '/auth/login',
  '/auth/oauth/state',
  '/auth/oauth/google',
  '/auth/oauth/github',
  '/auth/refresh',
  '/auth/logout',
  '/signup-slots',
  '/users/me',
  '/users/check-username',
  '/public-profiles/{username}',
  '/bookmarks',
  '/bookmarks/{bookmarkId}',
  '/bookmarks/{bookmarkId}/category',
  '/bookmarks/{bookmarkId}/metadata-refetch',
  '/bookmarks/{bookmarkId}/metadata-status',
  '/public-profiles/{username}/bookmarks',
  '/categories',
  '/categories/{categoryId}',
  '/public-profiles/{username}/categories',
  '/search/bookmarks',
  '/ops/search/bookmarks/rebuild',
  '/api-tokens',
  '/api-tokens/{apiTokenId}',
  '/collections',
  '/collections/{collectionId}',
  '/public-collections/{collectionId}',
  '/marketplace/listings',
  '/marketplace/listings/{listingId}/publish',
  '/marketplace/listings/{slugOrId}',
  '/marketplace/listings/{slugOrId}/latest-version',
  '/marketplace/listings/{listingId}/purchases',
  '/purchases',
  '/access-grants'
];

const requiredSchemas = [
  'ErrorResponse',
  'OAuthStateRequest',
  'OAuthStateDto',
  'TokenPairDto',
  'UserProfileDto',
  'BookmarkDto',
  'CategoryDto',
  'MetadataJobStatusDto',
  'SearchRebuildResult',
  'ApiTokenDto',
  'CollectionDto',
  'ListingDto',
  'ListingVersionDto',
  'PurchaseDto',
  'AccessGrantDto'
];

assert(openapi.openapi === '3.1.0', 'OpenAPI version must be 3.1.0');
for (const apiPath of requiredOpenApiPaths) {
  assert(openapi.paths[apiPath], `Missing OpenAPI path: ${apiPath}`);
}
for (const schemaName of requiredSchemas) {
  assert(openapi.components?.schemas?.[schemaName], `Missing OpenAPI schema: ${schemaName}`);
}

const eventRequired = eventEnvelope.required ?? [];
for (const field of ['eventId', 'eventType', 'eventVersion', 'occurredAt', 'producer', 'idempotencyKey', 'subject', 'payload']) {
  assert(eventRequired.includes(field), `Event envelope missing required field: ${field}`);
}

const eventTypes = eventEnvelope.properties?.eventType?.enum ?? [];
for (const eventType of [
  'bookmark.created',
  'bookmark.updated',
  'bookmark.deleted',
  'metadata.fetch.requested',
  'metadata.fetch.completed',
  'metadata.fetch.failed',
  'event.dead_lettered',
  'search.index.requested',
  'search.delete.requested'
]) {
  assert(eventTypes.includes(eventType), `Event schema missing event type: ${eventType}`);
}

validateOAuthProviderContracts();

console.log(`Contracts validated: ${requiredOpenApiPaths.length} OpenAPI paths, ${requiredSchemas.length} schemas, ${eventTypes.length} event types, and server-side OAuth provider verification markers.`);

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function validateOAuthProviderContracts() {
  for (const marker of [
    '@PostMapping("/auth/oauth/google")',
    '@PostMapping("/auth/oauth/github")',
    '@PostMapping("/auth/oauth/state")',
    'rateLimitService.requireAuthAttempt("oauth-google"',
    'rateLimitService.requireAuthAttempt("oauth-github"',
    'rateLimitService.requireAuthAttempt("oauth-state-${request.provider.lowercase()}"'
  ]) {
    assert(authController.includes(marker), `Auth controller missing OAuth contract marker: ${marker}`);
  }

  for (const marker of [
    'val code: String? = null',
    'val redirectUri: String? = null',
    'val credential: String? = null',
    'val accessToken: String? = null',
    'val state: String? = null',
    'data class VerifiedOAuthIdentity(',
    'val emailVerified: Boolean'
  ]) {
    assert(authDtos.includes(marker), `OAuth DTO missing provider-verification marker: ${marker}`);
  }

  for (const marker of [
    'request.state?.takeIf { it.isNotBlank() }?.let { oauthStateService.consume("google", it) }',
    'return oauthTokenPair(oauthProviderClient.verifyGoogle(request))',
    'request.state?.takeIf { it.isNotBlank() }?.let { oauthStateService.consume("github", it) }',
    'return oauthTokenPair(oauthProviderClient.verifyGithub(request))',
    'if (provider !in setOf("google", "github"))',
    'oauthStateService.create(provider, request.pkceVerifier?.takeIf { it.isNotBlank() })',
    'if (!identity.emailVerified)',
    'userRepository.createOrLinkOAuthUser('
  ]) {
    assert(authService.includes(marker), `Auth service missing OAuth contract marker: ${marker}`);
  }

  for (const marker of [
    'interface OAuthProviderClient',
    'fun verifyGoogle(request: OAuthLoginRequest): VerifiedOAuthIdentity',
    'fun verifyGithub(request: OAuthLoginRequest): VerifiedOAuthIdentity',
    'request.accessToken?.takeIf { it.isNotBlank() }',
    'request.credential?.takeIf { it.isNotBlank() }',
    'request.code?.takeIf { it.isNotBlank() }?.let',
    "token.count { it == '.' } == 2",
    '"https://openidconnect.googleapis.com/v1/userinfo"',
    '"https://oauth2.googleapis.com/tokeninfo"',
    'if (expectedAudience != null && tokenInfo.audience != expectedAudience)',
    'if (!userInfo.emailVerified)',
    'if (!tokenInfo.emailVerified)',
    '"https://oauth2.googleapis.com/token"',
    'add("grant_type", "authorization_code")',
    'Google redirectUri is required',
    'requiredSecret(authProperties.googleClientId, "Google client id")',
    'requiredSecret(authProperties.googleClientSecret, "Google client secret")',
    '"https://github.com/login/oauth/access_token"',
    '"https://api.github.com/user"',
    '"https://api.github.com/user/emails"',
    'emails.firstOrNull { it.primary && it.verified }',
    'emails.firstOrNull { it.verified }',
    'GitHub email is not verified',
    'if (!response.error.isNullOrBlank())',
    'set("X-GitHub-Api-Version", "2022-11-28")',
    'requiredSecret(authProperties.githubClientId, "GitHub client id")',
    'requiredSecret(authProperties.githubClientSecret, "GitHub client secret")',
    'throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "OAuth provider verification failed")'
  ]) {
    assert(oauthProviderClient.includes(marker), `HTTP OAuth provider client missing verification marker: ${marker}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
