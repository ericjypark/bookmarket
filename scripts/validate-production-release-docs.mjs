#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const readmePath = path.join(repoRoot, 'README.md');
const checklistPath = path.join(repoRoot, 'docs/operations/production-smoke-checklist.md');
const terraformDocPath = path.join(repoRoot, 'docs/operations/terraform.md');
const agentTocPath = path.join(repoRoot, 'docs/AGENT_TOC.md');
const packageJsonPath = path.join(repoRoot, 'package.json');
const productionContextPreflightPath = path.join(repoRoot, 'scripts/production-context-preflight.mjs');
const externalPublicEndpointCheckPath = path.join(repoRoot, 'scripts/external-public-endpoint-check.mjs');
const productionSmokePath = path.join(repoRoot, 'scripts/production-smoke-check.mjs');
const oauthProviderSmokePath = path.join(repoRoot, 'scripts/oauth-provider-smoke.mjs');
const oauthProviderEvidenceAuditPath = path.join(repoRoot, 'scripts/audit-oauth-provider-evidence.mjs');
const oauthProviderProfilePath = path.join(repoRoot, 'scripts/prepare-oauth-provider-profile.mjs');
const productionTestAccountSmokePath = path.join(repoRoot, 'scripts/production-test-account-smoke.mjs');
const productionCleanupCheckPath = path.join(repoRoot, 'scripts/production-disposable-cleanup-check.mjs');
const authenticatedOracleSmokePath = path.join(repoRoot, 'scripts/authenticated-production-oracle-smoke.mjs');
const migrationCutoverPath = path.join(repoRoot, 'scripts/production-migration-cutover.mjs');
const exportV1DataPath = path.join(repoRoot, 'scripts/export-v1-data.mjs');
const importV2DataPath = path.join(repoRoot, 'scripts/import-v2-data.mjs');
const migrationSafetyValidatorPath = path.join(repoRoot, 'scripts/validate-migration-safety.mjs');
const releaseReadinessPath = path.join(repoRoot, 'scripts/release-readiness-check.mjs');
const releaseReadinessValidatorPath = path.join(repoRoot, 'scripts/validate-release-readiness.mjs');
const releaseHandoffPath = path.join(repoRoot, 'scripts/print-release-handoff.mjs');
const releaseBlockersPath = path.join(repoRoot, 'scripts/lib/release-blockers.mjs');
const releaseBlockerHintsPath = path.join(repoRoot, 'scripts/lib/release-blocker-hints.mjs');
const releaseBlockerValidatorPath = path.join(repoRoot, 'scripts/validate-release-blockers.mjs');
const releaseSignoffsPath = path.join(repoRoot, 'scripts/lib/release-signoffs.mjs');
const routeTargetsPath = path.join(repoRoot, 'scripts/lib/route-targets.mjs');
const completionAuditStatusPath = path.join(repoRoot, 'scripts/lib/completion-audit-status.mjs');

const requiredScripts = [
  'backup:production',
  'backup:production:dry-run',
  'backup:production:restore-check',
  'backup:production:restore-check:dry-run',
  'preflight:production-context',
  'preflight:production-context:dry-run',
  'public:endpoints:external',
  'public:endpoints:external:dry-run',
  'smoke:production',
  'smoke:production:dry-run',
  'smoke:oauth-provider',
  'smoke:oauth-provider:dry-run',
  'smoke:oauth-provider:route-targets',
  'smoke:oauth-provider:preflight',
  'smoke:oauth-provider:provider-starts',
  'smoke:oauth-provider:evidence-audit',
  'smoke:oauth-provider:evidence-audit:require',
  'smoke:oauth-provider:profile:prepare',
  'smoke:oauth-provider:profile:prepare:dry-run',
  'smoke:production:test-account',
  'smoke:production:test-account:dry-run',
  'smoke:production:cleanup-check',
  'smoke:production:cleanup-check:dry-run',
  'smoke:authenticated-prod-oracle',
  'smoke:authenticated-prod-oracle:dry-run',
  'migration:production-cutover',
  'migration:production-cutover:dry-run',
  'migration:route-targets',
  'migration:canary-route-targets',
  'migration:safety:verify',
  'smoke:production:release',
  'release:handoff',
  'release:blockers',
  'release:blockers:verify',
  'release:readiness:verify',
  'release:readiness',
  'release:readiness:local',
  'compose:verify',
  'compose:config',
  'compose:smoke'
];

const requiredScriptImplementations = {
  'backup:production': 'node scripts/production-postgres-backup.mjs',
  'backup:production:dry-run': 'node scripts/production-postgres-backup.mjs --dry-run',
  'backup:production:restore-check': 'node scripts/production-postgres-restore-check.mjs',
  'backup:production:restore-check:dry-run': 'BOOKMARKET_BACKUP_FILE=artifacts/production-backups/example.dump BOOKMARKET_RESTORE_DATABASE_URL=postgres://bookmarket:bookmarket@localhost:5432/bookmarket_restore_check node scripts/production-postgres-restore-check.mjs --dry-run',
  'preflight:production-context': 'node scripts/production-context-preflight.mjs',
  'preflight:production-context:dry-run': 'node scripts/production-context-preflight.mjs --dry-run',
  'public:endpoints:external': 'node scripts/external-public-endpoint-check.mjs',
  'public:endpoints:external:dry-run': 'node scripts/external-public-endpoint-check.mjs --dry-run',
  'smoke:production': 'node scripts/production-smoke-check.mjs',
  'smoke:production:dry-run': 'node scripts/production-smoke-check.mjs --dry-run',
  'smoke:oauth-provider': 'node scripts/oauth-provider-smoke.mjs',
  'smoke:oauth-provider:dry-run': 'node scripts/oauth-provider-smoke.mjs --dry-run',
  'smoke:oauth-provider:route-targets': 'node scripts/oauth-provider-smoke.mjs --route-target-only',
  'smoke:oauth-provider:preflight': 'node scripts/oauth-provider-smoke.mjs --preflight-only',
  'smoke:oauth-provider:provider-starts': 'node scripts/oauth-provider-smoke.mjs --provider-start-only',
  'smoke:oauth-provider:evidence-audit': 'node scripts/audit-oauth-provider-evidence.mjs',
  'smoke:oauth-provider:evidence-audit:require': 'node scripts/audit-oauth-provider-evidence.mjs --require',
  'smoke:oauth-provider:profile:prepare': 'node scripts/prepare-oauth-provider-profile.mjs',
  'smoke:oauth-provider:profile:prepare:dry-run': 'node scripts/prepare-oauth-provider-profile.mjs --dry-run',
  'smoke:production:test-account': 'node scripts/production-test-account-smoke.mjs',
  'smoke:production:test-account:dry-run': 'node scripts/production-test-account-smoke.mjs --dry-run',
  'smoke:production:cleanup-check': 'node scripts/production-disposable-cleanup-check.mjs',
  'smoke:production:cleanup-check:dry-run': 'node scripts/production-disposable-cleanup-check.mjs --dry-run',
  'smoke:authenticated-prod-oracle': 'node scripts/authenticated-production-oracle-smoke.mjs',
  'smoke:authenticated-prod-oracle:dry-run': 'node scripts/authenticated-production-oracle-smoke.mjs --dry-run',
  'migration:production-cutover': 'node scripts/production-migration-cutover.mjs',
  'migration:production-cutover:dry-run': 'node scripts/production-migration-cutover.mjs --dry-run',
  'migration:route-targets': 'node scripts/production-migration-cutover.mjs --route-report',
  'migration:canary-route-targets': 'node scripts/production-migration-cutover.mjs --canary-route-report',
  'migration:safety:verify': 'node scripts/validate-migration-safety.mjs',
  'smoke:production:release': 'node scripts/production-smoke-check.mjs --require-restarts --include-restarts --require-test-account --require-authenticated-oracle',
  'release:handoff': 'node scripts/print-release-handoff.mjs',
  'release:blockers': 'node scripts/release-readiness-check.mjs --external-only --allow-external-blockers',
  'release:blockers:verify': 'node scripts/validate-release-blockers.mjs',
  'release:readiness:verify': 'node scripts/validate-release-readiness.mjs',
  'release:readiness': 'node scripts/release-readiness-check.mjs',
  'release:readiness:local': 'node scripts/release-readiness-check.mjs --allow-external-blockers',
  'compose:verify': 'node scripts/validate-docker-compose.mjs',
  'compose:config': 'docker compose -f infra/docker-compose/docker-compose.yml config',
  'compose:smoke': 'node scripts/docker-compose-smoke.mjs'
};

const requiredChecklistMarkers = [
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED',
  'BOOKMARKET_OAUTH_APP_LABEL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_HOST_RESOLVE_IP',
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE',
  'pnpm smoke:oauth-provider:preflight',
  'BOOKMARKET_OAUTH_PROVIDER_START_APPROVED',
  'pnpm smoke:oauth-provider:provider-starts',
  'pnpm smoke:oauth-provider:profile:prepare',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'artifacts/auth/oauth-provider-profile',
  '.bookmarket-dedicated-oauth-provider-profile',
  'profile path alone is not signoff evidence',
  'pnpm smoke:oauth-provider:evidence-audit',
  'pnpm smoke:oauth-provider:evidence-audit:require',
  'pnpm smoke:oauth-provider:profile:prepare',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'artifacts/auth/oauth-provider-profile',
  '.bookmarket-dedicated-oauth-provider-profile',
  'dedicated provider test account',
  'explicitly approved operator Chrome credentials',
  '/api/v1/users/me',
  'identity email confirmation',
  'avatar/profile menu evidence',
  'v2 route target proof',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'BOOKMARKET_TEST_ACCOUNT_EMAIL',
  'BOOKMARKET_TEST_ACCOUNT_PASSWORD',
  'BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE',
  'BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT',
  'BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS',
  'BOOKMARKET_RESTART_SMOKE_APPROVED',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED',
  'BOOKMARKET_CONFIRM_READ_ONLY_ORACLE',
  'BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL',
  'BOOKMARKET_RELEASE_DATE',
  'BOOKMARKET_PUBLIC_PROFILE_USERNAME',
  'BOOKMARKET_RUN_PUBLIC_VISUAL',
  'BOOKMARKET_SEARCH_REBUILD_TOKEN',
  'BOOKMARKET_WEB_URL /health',
  'BOOKMARKET_API_URL /health',
  'BOOKMARKET_API_URL /actuator/health/readiness',
  'API TLS/DNS/ingress failures',
  'pnpm public:endpoints:external',
  'pnpm public:endpoints:external:dry-run',
  'NAT loopback',
  'check-host.net',
  'cannot satisfy `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF`',
  'public TLS certificate diagnostics',
  'web_tls_secret_name',
  'api_tls_secret_name',
  'BOOKMARKET_WEB_TLS_SECRET_NAME',
  'BOOKMARKET_API_TLS_SECRET_NAME',
  'BOOKMARKET_WEB_IMAGE',
  'BOOKMARKET_API_IMAGE',
  'BOOKMARKET_METADATA_WORKER_IMAGE',
  'current deployed image tags',
  'default `latest` tags',
  'tls.crt',
  'tls.key',
  'api.bmkt.ericjypark.com',
  'pnpm backup:production',
  'pnpm backup:production:dry-run',
  'pnpm backup:production:restore-check',
  'pnpm preflight:production-context',
  'pnpm preflight:production-context:dry-run',
  'pnpm smoke:production',
  'pnpm smoke:production:dry-run',
  'pnpm smoke:oauth-provider',
  'pnpm smoke:oauth-provider:dry-run',
  'BOOKMARKET_OAUTH_HOST_RESOLVE_IP',
  'Tailscale/LAN path',
  'pnpm smoke:production:test-account',
  'pnpm smoke:production:test-account:dry-run',
  'pnpm smoke:production:cleanup-check',
  'pnpm smoke:production:cleanup-check:dry-run',
  'pnpm smoke:authenticated-prod-oracle',
  'pnpm smoke:authenticated-prod-oracle:dry-run',
  'pnpm migration:production-cutover',
  'pnpm migration:production-cutover:dry-run',
  'pnpm migration:route-targets',
  'pnpm migration:canary-route-targets',
  'pnpm migration:safety:verify',
  'pnpm smoke:production:release',
  'pnpm release:handoff',
  'read-only local diagnostics',
  'missing kubeconfig certificate/key/token-file references',
  'active release date',
  'pnpm release:readiness:local',
  'pnpm release:blockers',
  'pnpm release:readiness',
  'status shortcut, not a completion gate',
  'final completion gate',
  'production release-smoke signoff',
  'migration/cutover signoff',
  'direct k3s web pod response asset fingerprints',
  'end of the `Cookie` header',
  'grouped suffix form `(^|;[[:space:]]*)<cookie-name>=<cookie-value>(;|$)`',
  'ungrouped `<cookie-value>;|$` suffix',
  'proxy config test/reload',
  'rerun both `pnpm smoke:oauth-provider:route-targets` and `pnpm migration:canary-route-targets`',
  'read-only behavioral reference',
  'named release smoke path cannot pass without that read-only production reference evidence',
  'Common local contexts such as `kind-kind`, `docker-desktop`, and `minikube` are refused',
  'Do not mutate real user data',
  'restart/PVC survival'
];

const requiredTerraformDocMarkers = [
  'pnpm images:build',
  'bookmarket-app-secrets',
  'web_tls_secret_name',
  'api_tls_secret_name',
  'BOOKMARKET_WEB_TLS_SECRET_NAME',
  'BOOKMARKET_API_TLS_SECRET_NAME',
  'BOOKMARKET_WEB_IMAGE',
  'BOOKMARKET_API_IMAGE',
  'BOOKMARKET_METADATA_WORKER_IMAGE',
  'current deployed image tags',
  'default `latest` tags',
  'tls.crt',
  'tls.key',
  'api.bmkt.ericjypark.com',
  'pnpm backup:production',
  'pnpm backup:production:restore-check',
  'pnpm preflight:production-context',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'pnpm smoke:production',
  'pnpm smoke:production:release',
  'pnpm release:readiness',
  'previous image tag',
  'POST /api/v1/ops/search/bookmarks/rebuild',
  'direct k3s web route response asset fingerprint'
];

const requiredAgentTocMarkers = [
  'Completion Or Release Closure Work',
  'goal.md',
  'docs/testing/completion-audit.md',
  'docs/operations/production-smoke-checklist.md',
  'docs/testing/oauth-verification.md',
  'prompt-to-artifact checklist',
  'pnpm check:completion-audit',
  'pnpm release:blockers',
  'pnpm release:handoff',
  'pnpm migration:route-targets',
  'pnpm migration:canary-route-targets',
  'pnpm public:endpoints:external',
  'pnpm public:endpoints:external:dry-run',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'pnpm smoke:oauth-provider:profile:prepare',
  'pnpm smoke:oauth-provider:preflight',
  'pnpm smoke:oauth-provider:provider-starts',
  'pnpm release:readiness:local',
  'pnpm release:readiness',
  'Do not call `update_goal`'
];

const requiredReadmeMarkers = [
  'pnpm release:readiness:local',
  'pnpm release:blockers',
  'pnpm release:handoff',
  'pnpm preflight:production-context:dry-run',
  'pnpm release:readiness',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'pnpm smoke:oauth-provider:dry-run',
  'BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED',
  'BOOKMARKET_OAUTH_APP_LABEL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE',
  'pnpm smoke:oauth-provider:evidence-audit',
  'pnpm smoke:oauth-provider:evidence-audit:require',
  'explicitly approved operator Chrome credentials',
  '/api/v1/users/me',
  'avatar/profile menu renders Settings and Logout',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'public `/login` and `/home` match the direct k3s web pod',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED',
  'BOOKMARKET_RESTART_SMOKE_APPROVED=1',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'pnpm smoke:production:cleanup-check',
  'pnpm smoke:production:cleanup-check:dry-run',
  'users/bookmarks/categories/oauth_provider_users = 0|0|0|0',
  'oauth-provider-%',
  'codex-oauth-%',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'pnpm smoke:authenticated-prod-oracle:dry-run',
  'BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED',
  'BOOKMARKET_CONFIRM_READ_ONLY_ORACLE',
  'BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL',
  'pnpm migration:production-cutover:dry-run',
  'pnpm migration:route-targets',
  'pnpm migration:safety:verify',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED',
  'direct k3s web pod response asset fingerprints',
  'public web/API health endpoints',
  'NAT loopback',
  'check-host.net',
  'public:endpoints:external',
  'public-health evidence only',
  'web_tls_secret_name',
  'api_tls_secret_name',
  'BOOKMARKET_WEB_TLS_SECRET_NAME',
  'BOOKMARKET_API_TLS_SECRET_NAME',
  'tls.crt',
  'tls.key',
  'Local implementation and verification gates are in place',
  'BOOKMARKET_RELEASE_DATE'
];

const requiredReleaseHandoffMarkers = [
  'Bookmarket Production Release Handoff',
  'productionBoundBlockers',
  'releaseBlockerHint',
  'NEXT: ${hint}',
  'Do not use template values as fake signoffs',
  'Current Production-Bound Blockers',
  'Current Local Diagnostics',
  'Current kube context',
  'Available kube contexts',
  'Kube context file issues',
  'Live k3s deployment images',
  'Production context preflight',
  'Release env vars present',
  'Release env vars missing',
  'Repo env files found',
  'Reference v1 OAuth env keys present',
  'Public endpoint probes',
  'External public endpoint evidence helper',
  'pnpm public:endpoints:external',
  'Public TLS certificate diagnostics',
  'Kubernetes TLS secret env overrides',
  'BOOKMARKET_WEB_URL',
  'BOOKMARKET_API_URL',
  'BOOKMARKET_WEB_TLS_SECRET_NAME',
  'BOOKMARKET_API_TLS_SECRET_NAME',
  'BOOKMARKET_WEB_IMAGE',
  'BOOKMARKET_API_IMAGE',
  'BOOKMARKET_METADATA_WORKER_IMAGE',
  'current deployed web image tag',
  'current deployed api image tag',
  'current deployed metadata-worker image tag',
  'current deployed Pi image tags',
  'Terraform image env overrides',
  'Diagnostics intentionally print only names and presence',
  'Required Environment And Signoff Templates',
  'Release Command Order',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED',
  'BOOKMARKET_OAUTH_APP_LABEL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_PROVIDER_START_APPROVED',
  'BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE',
  'BOOKMARKET_OAUTH_HOST_RESOLVE_IP',
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE',
  'do not point it at a real-user Chrome profile',
  'the helper must prove public /login and /home match the direct k3s web pod before opening the browser',
  'keeps real hostnames/TLS SNI',
  'must confirm /api/v1/users/me matches the expected dedicated provider test account email',
  'pre-cutover v2 canary route',
  'edge proxy cookie matcher accepts the canary cookie at the end of the Cookie header',
  'grouped suffix form (^|;[[:space:]]*)<cookie-name>=<cookie-value>(;|$)',
  'ungrouped <cookie-value>;|$ suffix',
  'This canary proof does not satisfy BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED',
  'direct k3s web route response asset fingerprints matched public route asset fingerprints',
  'BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'BOOKMARKET_TEST_ACCOUNT_EMAIL',
  'BOOKMARKET_TEST_ACCOUNT_PASSWORD',
  'BOOKMARKET_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE',
  'BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT',
  'BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED',
  'BOOKMARKET_CONFIRM_READ_ONLY_ORACLE',
  'BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL',
  'BOOKMARKET_PUBLIC_PROFILE_USERNAME',
  'BOOKMARKET_RESTART_SMOKE_APPROVED=1',
  'pnpm release:blockers',
  'pnpm preflight:production-context',
  'NAT loopback',
  'do not substitute Tailscale or LAN routes',
  'pnpm backup:production',
  'pnpm backup:production:restore-check',
  'pnpm smoke:oauth-provider:evidence-audit',
  'pnpm smoke:oauth-provider:evidence-audit:require',
  'pnpm smoke:oauth-provider:preflight',
  'pnpm smoke:oauth-provider:provider-starts',
  'BOOKMARKET_OAUTH_START_PATH=/signup',
  'BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS=/signup,/home',
  'pre-login Google/GitHub authorization URLs',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'pnpm smoke:oauth-provider:profile:prepare',
  'artifacts/auth/oauth-provider-profile',
  '.bookmarket-dedicated-oauth-provider-profile',
  'profile path alone is not signoff evidence',
  'dedicated provider test-account or provider-smoke signoff evidence exists',
  'explicitly approved operator Chrome credentials',
  'pnpm smoke:oauth-provider',
  'pnpm smoke:production:test-account',
  'pnpm smoke:production:cleanup-check',
  'pnpm smoke:production:cleanup-check:dry-run',
  'users/bookmarks/categories/oauth_provider_users',
  'dedicated provider test-account rows created or linked by real OAuth smoke',
  'pnpm smoke:authenticated-prod-oracle',
  'pnpm migration:route-targets',
  'pnpm migration:canary-route-targets',
  'pnpm migration:safety:verify',
  'read-only normal-route target report',
  'read-only pre-cutover v2 canary route check',
  'real non-local v1 export and v2 import require both non-local allow and BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'pnpm migration:production-cutover',
  'exact production kube context',
  'pnpm smoke:production:release',
  'pnpm release:readiness',
  'read-only authenticated v1 production oracle',
  'docs/operations/production-smoke-checklist.md',
  'docs/testing/oauth-verification.md',
  'docs/testing/completion-audit.md'
];

const requiredReleaseSignoffMarkers = [
  'BOOKMARKET_RELEASE_DATE',
  'expectedReleaseDate',
  'exactDatePattern',
  'smoke date ${releaseDate}',
  'real OAuth browser smoke evidence',
  'v2 route target proof',
  'OAuth route sha256 fingerprint values',
  'approved provider credential account',
  'users/me identity evidence',
  'users/me identity account value',
  'avatar/profile shell evidence',
  'backup date ${releaseDate}',
  'production smoke date ${releaseDate}',
  'migration/cutover date ${releaseDate}',
  'direct k3s route fingerprint evidence',
  'normal route sha256 fingerprint values',
  'productionKubeContextRequirement',
  'production kube context ${context}',
  'test-account smoke date ${releaseDate}',
  'smoke:production:test-account command evidence',
  'disposable bookmark/category cleanup count evidence',
  'oracle date ${releaseDate}',
  'smoke:authenticated-prod-oracle command evidence'
];

const forbiddenProductionReleaseDocPatterns = [
  [/test account or account identifier/i, 'OAuth signoff accepting generic account identifiers'],
  [/provider account,\s+and observed redirect\/cookie result/i, 'OAuth release notes using generic provider-account wording'],
  [/BOOKMARKET_OAUTH_SMOKE_SIGNOFF='[^'\n]*\sand test account\s+<test-account>/i, 'OAuth signoff template missing dedicated provider test-account wording'],
  [/Use a local\/staging OAuth app or a dedicated production test account only/i, 'OAuth provider smoke allowing ambiguous local-or-production account wording']
];

const forbiddenProductionSmokePatterns = [
  [/signoff recorded:/i, 'production smoke printing full signoff values']
];

const requiredExternalPublicEndpointCheckMarkers = [
  'Bookmarket External Public Endpoint Check',
  'check-host.net',
  'BOOKMARKET_EXTERNAL_PUBLIC_PROBE_NODES',
  'BOOKMARKET_EXTERNAL_PUBLIC_PROBE_MIN_SUCCESSES',
  'BOOKMARKET_EXTERNAL_PUBLIC_PROBE_TIMEOUT_MS',
  'BOOKMARKET_EXTERNAL_PUBLIC_PROBE_POLL_MS',
  'BOOKMARKET_WEB_URL /health',
  'BOOKMARKET_API_URL /health',
  'BOOKMARKET_API_URL /actuator/health/readiness',
  'no cookies, tokens, or secrets are sent',
  'not a production-smoke, OAuth, migration, or cutover signoff',
  'HTTP 2',
  'Required successful external nodes per endpoint',
  '--dry-run'
];

const requiredProductionSmokeMarkers = [
  'missingOAuthSmokeSignoffFields',
  'missingBackupSignoffFields',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'missingProductionTestAccountSignoffFields',
  'missingAuthenticatedProdOracleFields',
  'productionKubeContextBlocker',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'v2 route target proof',
  'avatar/profile menu evidence',
  '/api/v1/users/me identity confirmation',
  'explicitly approved operator Chrome credentials',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'BOOKMARKET_RESTART_SMOKE_APPROVED',
  'BOOKMARKET_WEB_TLS_SECRET_NAME',
  'BOOKMARKET_API_TLS_SECRET_NAME',
  'resolveRepoPath',
  'path.resolve(process.cwd(), trimmed)',
  'OAuth provider smoke signoff accepted.',
  'Database backup signoff accepted.',
  'Production test-account smoke signoff accepted.',
  'Authenticated production-oracle signoff accepted.',
  'tls.crt',
  'tls.key',
  '--require-test-account',
  '--require-authenticated-oracle',
  'assertAuthenticatedProdOracleSignoff()'
];

const requiredProductionContextPreflightMarkers = [
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'productionKubeContextBlocker',
  'bookmarket-app-secrets',
  'database-user',
  'database-password',
  'jwt-secret',
  'google-client-id',
  'github-client-id',
  'search-rebuild-token',
  'BOOKMARKET_WEB_TLS_SECRET_NAME',
  'BOOKMARKET_API_TLS_SECRET_NAME',
  'tls.crt',
  'tls.key',
  '--dry-run',
  'kubectl config current-context',
  'kubectl config get-contexts -o name',
  'kubectl get nodes -o wide'
];

const requiredOAuthProviderSmokeMarkers = [
  'BOOKMARKET_OAUTH_PROVIDER_SMOKE_APPROVED',
  'BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT',
  'BOOKMARKET_OAUTH_APP_LABEL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_API_URL',
  '/api/v1/users/me',
  'BOOKMARKET_OAUTH_HOST_RESOLVE_IP',
  '--host-resolver-rules',
  'curlResolveArgs',
  '--route-target-only',
  'smoke:oauth-provider:route-targets',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'pnpm smoke:oauth-provider passed',
  'v2 route target proof passed',
  'BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS',
  'BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE',
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE',
  '--preflight-only',
  'smoke:oauth-provider:preflight',
  '--provider-start-only',
  'smoke:oauth-provider:provider-starts',
  'BOOKMARKET_OAUTH_PROVIDER_START_APPROVED',
  'Provider-start-only checks must use a fresh browser context',
  'provider authorization URL',
  'waitForProviderButtonReadiness',
  'waitForProviderStartOrHome',
  'provider flow started',
  "waitUntil: 'networkidle'",
  'assertProfileShell',
  'avatar/profile menu rendered with Settings and Logout',
  'without opening a browser or printing a signoff template',
  'This is not OAuth provider signoff evidence',
  '.bookmarket-dedicated-oauth-provider-profile',
  'prepared by pnpm smoke:oauth-provider:profile:prepare',
  'localStorage.clear',
  'sessionStorage.clear',
  'known default Chrome/Chromium real-user profile path',
  'BOOKMARKET_OAUTH_PROVIDER_BROWSER_CHANNEL',
  'public canary routes matching direct k3s web pod fingerprints',
  'compareK3sPublicRouteTargets',
  'productionKubeContextBlocker',
  'identity email',
  'BOOKMARKET_OAUTH_PROVIDERS',
  'BOOKMARKET_OAUTH_START_PATH',
  '--dry-run'
];

const requiredOAuthProviderEvidenceAuditMarkers = [
  'BOOKMARKET_OAUTH_EVIDENCE_FILES',
  'BOOKMARKET_OAUTH_EVIDENCE_GITHUB_REPOS',
  'BOOKMARKET_OAUTH_EVIDENCE_ARTIFACT_ROOTS',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'Provider storage-state and browser-profile inputs are not provider-account/signoff evidence',
  'value is not valid OAuth provider-smoke signoff evidence',
  'value is empty and is not provider-account/signoff evidence',
  'Secret key names are pointers only and are not provider-account/signoff evidence',
  'Legacy Local OAuth Session Artifacts',
  'helperHasHardCodedPersonalAccount',
  'hard-coded personal provider-account selector',
  'Legacy .tmp OAuth browser profiles are local session artifacts',
  'No dedicated Google/GitHub provider test-account evidence',
  'OAuth app credentials, deployment usernames, and email-login smoke accounts do not satisfy BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  '--require'
];

const requiredOAuthProviderProfileMarkers = [
  'Bookmarket OAuth Provider Browser Profile Preparation',
  'artifacts/auth/oauth-provider-profile',
  '.bookmarket-dedicated-oauth-provider-profile',
  'bookmarket-oauth-provider-profile.json',
  'does not open a browser, visit providers, store passwords, or create OAuth signoff evidence',
  'Profile directory prepared.',
  'profile path alone is not signoff evidence',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR',
  'BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1',
  'known default Chrome/Chromium real-user profile path',
  '--dry-run'
];

const requiredRouteTargetsMarkers = [
  'compareK3sPublicRouteTargets',
  'parseRoutePaths',
  'Direct k3s web route',
  'Public normal UI route',
  'publicHeaders',
  'publicResolveIP',
  'curlResolveArgs',
  'redactHeader',
  'response asset fingerprints',
  'No Next.js static assets found',
  'shellQuote'
];

const requiredProductionTestAccountSmokeMarkers = [
  'BOOKMARKET_TEST_ACCOUNT_EMAIL',
  'BOOKMARKET_TEST_ACCOUNT_PASSWORD',
  'BOOKMARKET_TEST_ACCOUNT_ROUTE_TARGET_COOKIE',
  'BOOKMARKET_CONFIRM_DEDICATED_TEST_ACCOUNT',
  'BOOKMARKET_ALLOW_PRODUCTION_TEST_ACCOUNT_MUTATIONS',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'pnpm smoke:production:test-account passed',
  'bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed',
  'category create/delete passed',
  'cleanup deleted disposable data',
  'verified disposable bookmarks/categories',
  '--dry-run'
];

const requiredProductionCleanupCheckMarkers = [
  'productionKubeContextBlocker',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_KUBE_NAMESPACE',
  'BOOKMARKET_POSTGRES_TARGET',
  'codex-bookmarket-%',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'oauth-provider-%',
  'codex-oauth-%',
  'Bookmarket production smoke%',
  'users/bookmarks/categories/oauth_provider_users',
  '0|0|0|0',
  'Disposable production test-data cleanup check passed',
  '--dry-run',
  'without querying production data'
];

const requiredAuthenticatedOracleSmokeMarkers = [
  'BOOKMARKET_AUTHENTICATED_ORACLE_APPROVED',
  'BOOKMARKET_CONFIRM_READ_ONLY_ORACLE',
  'BOOKMARKET_AUTHENTICATED_ORACLE_ACCOUNT_LABEL',
  'BOOKMARKET_PUBLIC_PROFILE_USERNAME',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'pnpm smoke:authenticated-prod-oracle passed',
  'read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI',
  'BOOKMARKET_AUTHENTICATED_ORACLE_STORAGE_STATE',
  'BOOKMARKET_AUTHENTICATED_ORACLE_USER_DATA_DIR',
  '--dry-run'
];

const requiredMigrationCutoverMarkers = [
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_CANARY_ROUTE_TARGET_COOKIE',
  'missingBackupSignoffFields',
  'productionKubeContextBlocker',
  'Normal UI route',
  'compareK3sPublicRouteTargets',
  'response asset fingerprints',
  'public traffic cutover switched normal UI routes',
  'production context ${currentContext}',
  '--route-report',
  '--canary-route-report',
  'Route target report mode',
  'Canary route target report mode',
  '--dry-run'
];

const requiredMigrationExportMarkers = [
  'BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1',
  'Refusing to export real production user data from non-local Postgres host',
  'dryRun'
];

const requiredMigrationImportMarkers = [
  'BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1',
  'Refusing to import real production user data into non-local Postgres host',
  'dryRun'
];

const requiredReleaseReadinessMarkers = [
  'productionBoundBlockers',
  'completion-audit-status.mjs',
  'completionAuditStatusBlocker',
  'preflight:production-context:dry-run',
  'smoke:oauth-provider:dry-run',
  'smoke:oauth-provider:evidence-audit',
  'migration:production-cutover:dry-run',
  'check:completion-audit',
  'compose:verify',
  'compose:config',
  'compose:smoke',
  'smoke:production:test-account:dry-run',
  'smoke:production:cleanup-check:dry-run',
  'smoke:authenticated-prod-oracle:dry-run',
  'releaseBlockerHint',
  'resolveRepoPath',
  'path.resolve(process.cwd(), trimmed)',
  'Release readiness validator guard',
  'release:readiness:verify',
  'release:blockers:verify',
  'migration:safety:verify',
  '--require-test-account',
  '--require-authenticated-oracle'
];

const requiredReleaseReadinessValidatorMarkers = [
  'completionAuditStatusBlocker',
  'completionAuditTextStatusBlocker',
  'requiredReleaseReadinessScriptMarkers',
  'requiredCompletionAuditValidatorMarkers',
  'local guards include completion-audit validation',
  'terraform plan resolves relative kubeconfig path before chdir',
  'relative kubeconfig path resolves from repo root',
  'local guards include OAuth provider evidence audit',
  'final readiness checks audit status only after production blockers clear',
  'completion-audit validator supports eventual complete status',
  'completion-audit validator keeps current blocker mode strict',
  'completion-audit validator checks rows against status mode',
  'completion-audit validator requires OAuth provider evidence audit command',
  'completion-audit validator requires OAuth provider evidence audit require command',
  'completion-audit validator forbids incomplete row wording in complete mode',
  'completion-audit validator requires final complete evidence',
  'Release readiness validators checked'
];

const requiredCompletionAuditStatusMarkers = [
  'completionAuditStatusBlocker',
  'completionAuditTextStatusBlocker',
  'docs/testing/completion-audit.md',
  'Status: complete.',
  'Status: not complete',
  'final release readiness pass'
];

const requiredMigrationSafetyValidatorMarkers = [
  'migration:safety:verify',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'v1 export refuses real non-local run without real-data approval',
  'v2 import refuses real non-local run without real-data approval',
  'v1 export dry-run can inspect non-local target only after explicit non-local allow',
  'v2 import dry-run can inspect non-local target only after explicit non-local allow',
  'BOOKMARKET_ALLOW_NONLOCAL_EXPORT=1',
  'BOOKMARKET_ALLOW_NONLOCAL_IMPORT=1'
];


const requiredReleaseBlockerMarkers = [
  'productionBoundBlockers',
  'missingOAuthSmokeSignoffFields',
  'missingBackupSignoffFields',
  'missingProductionSmokeSignoffFields',
  'missingMigrationCutoverSignoffFields',
  'missingMigrationCutoverApprovalFlagBlockers',
  'requiredMigrationCutoverApprovalFlags',
  'missingProductionTestAccountSignoffFields',
  'missingAuthenticatedProdOracleFields',
  'productionKubeContextBlocker',
  'publicEndpointBlockers',
  'compareK3sPublicRouteTargets',
  'parseRoutePaths',
  'migrationCutoverRouteTargetBlockers',
  'migrationRouteTargetBlockers',
  'BOOKMARKET_CUTOVER_ROUTE_PATHS',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_WEB_URL',
  'BOOKMARKET_API_URL',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'BOOKMARKET_RESTART_SMOKE_APPROVED'
];

const requiredReleaseBlockerHintMarkers = [
  'releaseBlockerHint',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'pnpm smoke:oauth-provider:evidence-audit',
  'pnpm smoke:oauth-provider:evidence-audit:require',
  'pnpm smoke:oauth-provider:preflight',
  'pnpm smoke:oauth-provider:provider-starts',
  'BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1',
  'pnpm smoke:oauth-provider',
  'dedicated provider test account',
  'explicitly approved operator Chrome credential',
  '/api/v1/users/me identity evidence',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'pnpm smoke:production:release',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'real-user-data migration',
  'normal public-traffic cutover',
  'pnpm migration:production-cutover',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_WEB_URL',
  'BOOKMARKET_API_URL'
];

const requiredReleaseBlockerValidatorMarkers = [
  'productionBoundBlockers',
  'releaseBlockerHint',
  'Release blocker validators checked',
  'OAuth blocker hint points to provider evidence audit, provider-starts, and provider smoke',
  'production release-smoke blocker hint preserves dependency on OAuth',
  'migration/cutover blocker hint preserves real-data and normal-route requirements',
  'complete evidence has no blockers',
  'missing production context is reported',
  'local kube context is rejected',
  'public endpoint blockers are included',
  'missing OAuth signoff is reported',
  'stale OAuth signoff is reported with active release date',
  'production smoke signoff still requires OAuth signoff',
  'restart approval is required',
  'production smoke signoff still requires backup signoff',
  'production smoke signoff still requires restart approval',
  'current post-Pi evidence retains exactly three release blockers',
  'missing production smoke signoff is reported',
  'migration/cutover signoff still requires production smoke signoff',
  'production smoke signoff must match production context',
  'stale production smoke signoff is reported with active release date',
  'missing test-account signoff is reported',
  'production smoke signoff still requires test-account signoff',
  'missing authenticated-oracle signoff is reported',
  'production smoke signoff still requires authenticated-oracle signoff',
  'missing migration/cutover signoff is reported',
  'migration/cutover signoff must match production context',
  'stale migration/cutover signoff is reported with active release date',
  'migration/cutover signoff requires approval and confirmation flags',
  'migration/cutover signoff still requires normal route proof'
];

const failures = [];

main();

function main() {
  const readme = readText(readmePath);
  const checklist = readText(checklistPath);
  const terraformDoc = readText(terraformDocPath);
  const agentToc = readText(agentTocPath);
  const productionContextPreflight = readText(productionContextPreflightPath);
  const externalPublicEndpointCheck = readText(externalPublicEndpointCheckPath);
  const productionSmoke = readText(productionSmokePath);
  const oauthProviderSmoke = readText(oauthProviderSmokePath);
  const oauthProviderEvidenceAudit = readText(oauthProviderEvidenceAuditPath);
  const oauthProviderProfile = readText(oauthProviderProfilePath);
  const productionTestAccountSmoke = readText(productionTestAccountSmokePath);
  const productionCleanupCheck = readText(productionCleanupCheckPath);
  const authenticatedOracleSmoke = readText(authenticatedOracleSmokePath);
  const migrationCutover = readText(migrationCutoverPath);
  const exportV1Data = readText(exportV1DataPath);
  const importV2Data = readText(importV2DataPath);
  const migrationSafetyValidator = readText(migrationSafetyValidatorPath);
  const releaseReadiness = readText(releaseReadinessPath);
  const releaseReadinessValidator = readText(releaseReadinessValidatorPath);
  const releaseHandoff = readText(releaseHandoffPath);
  const releaseBlockers = readText(releaseBlockersPath);
  const releaseBlockerHints = readText(releaseBlockerHintsPath);
  const releaseBlockerValidator = readText(releaseBlockerValidatorPath);
  const releaseSignoffs = readText(releaseSignoffsPath);
  const routeTargets = readText(routeTargetsPath);
  const completionAuditStatus = readText(completionAuditStatusPath);
  const packageJson = readJson(packageJsonPath);

  assertScripts(packageJson);
  assertScriptImplementations(packageJson);
  assertScriptIncludes(packageJson, 'smoke:production:release', '--require-authenticated-oracle');
  assertMarkers('README', readme, requiredReadmeMarkers);
  assertMarkers('production smoke checklist', checklist, requiredChecklistMarkers);
  assertMarkers('Terraform operations doc', terraformDoc, requiredTerraformDocMarkers);
  assertMarkers('agent table of contents', agentToc, requiredAgentTocMarkers);
  assertMarkers('production context preflight script', productionContextPreflight, requiredProductionContextPreflightMarkers);
  assertMarkers('external public endpoint check script', externalPublicEndpointCheck, requiredExternalPublicEndpointCheckMarkers);
  assertMarkers('production smoke script', productionSmoke, requiredProductionSmokeMarkers);
  assertMarkers('OAuth provider smoke script', oauthProviderSmoke, requiredOAuthProviderSmokeMarkers);
  assertMarkers('OAuth provider evidence audit script', oauthProviderEvidenceAudit, requiredOAuthProviderEvidenceAuditMarkers);
  assertMarkers('OAuth provider profile preparation script', oauthProviderProfile, requiredOAuthProviderProfileMarkers);
  assertMarkers('production test-account smoke script', productionTestAccountSmoke, requiredProductionTestAccountSmokeMarkers);
  assertMarkers('production cleanup-check script', productionCleanupCheck, requiredProductionCleanupCheckMarkers);
  assertMarkers('authenticated production-oracle smoke script', authenticatedOracleSmoke, requiredAuthenticatedOracleSmokeMarkers);
  assertMarkers('production migration/cutover script', migrationCutover, requiredMigrationCutoverMarkers);
  assertMarkers('v1 export migration script', exportV1Data, requiredMigrationExportMarkers);
  assertMarkers('v2 import migration script', importV2Data, requiredMigrationImportMarkers);
  assertMarkers('migration safety validator', migrationSafetyValidator, requiredMigrationSafetyValidatorMarkers);
  assertMarkers('release readiness script', releaseReadiness, requiredReleaseReadinessMarkers);
  assertMarkers('release readiness validator', releaseReadinessValidator, requiredReleaseReadinessValidatorMarkers);
  assertMarkers('release handoff script', releaseHandoff, requiredReleaseHandoffMarkers);
  assertMarkers('release blocker library', releaseBlockers, requiredReleaseBlockerMarkers);
  assertMarkers('release blocker hint library', releaseBlockerHints, requiredReleaseBlockerHintMarkers);
  assertMarkers('release blocker validator', releaseBlockerValidator, requiredReleaseBlockerValidatorMarkers);
  assertMarkers('release signoff library', releaseSignoffs, requiredReleaseSignoffMarkers);
  assertMarkers('route target helper library', routeTargets, requiredRouteTargetsMarkers);
  assertMarkers('completion-audit status helper library', completionAuditStatus, requiredCompletionAuditStatusMarkers);
  assertNoForbiddenPatterns('production release docs', [
    readme,
    checklist,
    terraformDoc,
    agentToc,
    releaseHandoff,
    oauthProviderSmoke,
    releaseSignoffs
  ], forbiddenProductionReleaseDocPatterns);
  assertNoForbiddenPatterns('production smoke script', [productionSmoke], forbiddenProductionSmokePatterns);

  if (failures.length > 0) {
    console.error('Production release documentation validation failed:');
    for (const failure of failures) {
    console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Production release docs validated: ${requiredScripts.length} scripts, ${Object.keys(requiredScriptImplementations).length} exact script implementations, ${requiredReadmeMarkers.length} README markers, ${requiredChecklistMarkers.length} checklist markers, ${requiredTerraformDocMarkers.length} Terraform markers, ${requiredAgentTocMarkers.length} agent TOC markers, ${requiredProductionContextPreflightMarkers.length} context-preflight markers, ${requiredExternalPublicEndpointCheckMarkers.length} external-public-endpoint markers, ${requiredProductionSmokeMarkers.length} smoke markers, ${requiredOAuthProviderSmokeMarkers.length} OAuth-provider smoke markers, ${requiredOAuthProviderEvidenceAuditMarkers.length} OAuth-provider evidence-audit markers, ${requiredOAuthProviderProfileMarkers.length} OAuth-provider profile markers, ${requiredProductionTestAccountSmokeMarkers.length} test-account smoke markers, ${requiredProductionCleanupCheckMarkers.length} cleanup-check markers, ${requiredAuthenticatedOracleSmokeMarkers.length} authenticated-oracle smoke markers, ${requiredMigrationCutoverMarkers.length} migration-cutover markers, ${requiredReleaseReadinessMarkers.length} readiness markers, ${requiredReleaseReadinessValidatorMarkers.length} release-readiness-validator markers.`
    + ` ${requiredMigrationExportMarkers.length} migration-export markers, ${requiredMigrationImportMarkers.length} migration-import markers, ${requiredMigrationSafetyValidatorMarkers.length} migration-safety markers.`
    + ` ${requiredReleaseHandoffMarkers.length} handoff markers, ${requiredReleaseBlockerMarkers.length} blocker-library markers, ${requiredReleaseBlockerHintMarkers.length} blocker-hint markers, ${requiredReleaseBlockerValidatorMarkers.length} blocker-validator markers, ${requiredReleaseSignoffMarkers.length} signoff-library markers, ${requiredRouteTargetsMarkers.length} route-target helper markers, ${requiredCompletionAuditStatusMarkers.length} completion-audit status markers.`
  );
}

function assertScripts(packageJson) {
  const scripts = packageJson.scripts ?? {};
  for (const script of requiredScripts) {
    if (!Object.prototype.hasOwnProperty.call(scripts, script)) {
      failures.push(`Missing package.json release script: ${script}`);
    }
  }
}

function assertScriptImplementations(packageJson) {
  const scripts = packageJson.scripts ?? {};
  for (const [script, expectedCommand] of Object.entries(requiredScriptImplementations)) {
    const actualCommand = scripts[script];
    if (actualCommand !== expectedCommand) {
      failures.push(`Package script ${script} must be "${expectedCommand}"; found "${actualCommand ?? 'missing'}".`);
    }
  }
}

function assertScriptIncludes(packageJson, script, marker) {
  const value = packageJson.scripts?.[script] ?? '';
  if (!value.includes(marker)) {
    failures.push(`Package script ${script} must include ${marker}`);
  }
}

function assertMarkers(label, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) {
      failures.push(`Missing ${label} marker: ${marker}`);
    }
  }
}

function assertNoForbiddenPatterns(label, texts, patterns) {
  const combined = texts.join('\n');
  for (const [pattern, description] of patterns) {
    if (pattern.test(combined)) {
      failures.push(`Found forbidden ${label} marker: ${description}.`);
    }
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
