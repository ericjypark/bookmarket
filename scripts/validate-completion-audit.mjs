#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const auditPath = path.join(repoRoot, 'docs/testing/completion-audit.md');
const packageJsonPath = path.join(repoRoot, 'package.json');

const requiredSections = [
  'Objective Restatement',
  'Prompt-To-Artifact Checklist',
  'Current Pass Evidence',
  'Remaining Completion Gaps'
];

const requiredObjectiveMarkers = [
  'complete rewrite of v1',
  'Next.js web UI preserving every v1-visible route, layout, copy, interaction, and feature',
  'Kotlin Spring API using DTO contracts',
  'Postgres as source of truth',
  'Redis only for bounded operational state',
  'Kafka for async events',
  'Elasticsearch as a derived search index',
  'Go metadata worker',
  'Local Docker Compose',
  'Terraform-managed k3s resources',
  'Migration/export/import tooling',
  'ARM64 image readiness',
  'Verification gates'
];

const requiredObjectiveInputs = [
  ['goal.md', 'file'],
  ['REWRITE_PLAN.md', 'file'],
  ['docs/AGENT_TOC.md', 'file'],
  ['docs/testing/v1-parity-checklist.md', 'file'],
  ['tests/fixtures/v1-root', 'directory'],
  ['tests/fixtures/v1-root/apps/web', 'directory'],
  ['tests/fixtures/v1-root/apps/server', 'directory']
];

const requiredChecklistRows = [
  ['Read `REWRITE_PLAN.md`, `docs/AGENT_TOC.md`, `docs/testing/v1-parity-checklist.md`, and v1 source', /^Covered for this pass$/],
  ['Use v1 source and production app as behavioral oracles', /^Covered for source\/public\/logged-out production plus authenticated test-account oracle$/],
  ['Do not redesign UI or change visible copy/spacing/routes/interactions', /^Covered for copied UI paths, package surface, and non-visual adapter boundary$/],
  ['Next.js web app visually identical to v1', /^Covered for copied UI paths and main snapshots$/],
  ['Deterministic seed data plan', /^Covered$/],
  ['V1 behavior documentation', /^Covered$/],
  ['Playwright visual regression for `/`, `/login`, `/signup`, `/home`, `/s/[username]` at desktop/tablet/mobile', /^Covered for main routes$/],
  ['Playwright production safety', /^Covered$/],
  ['CI release guard coverage', /^Covered$/],
  ['API/OpenAPI contract', /^Covered$/],
  ['Kafka event envelope/topic contracts', /^Covered$/],
  ['Error response shape', /^Covered$/],
  ['Postgres schema for v1 plus future marketplace tables', /^Covered$/],
  ['Future Raycast extension architecture', /^Covered$/],
  ['Hidden marketplace architecture without v1 UI exposure', /^Covered; UI hidden$/],
  ['Docker Compose local stack', /^Covered locally$/],
  ['Terraform k3s modules for namespace, web, api, metadata-worker, postgres, redis, kafka, elasticsearch, ingress', /^Covered by static verifier, plan, and live Pi apply$/],
  ['Service skeletons build', /^Covered locally$/],
  ['Auth/session/OAuth', /^Covered with operator-approved Chrome provider signoff$/],
  ['Users/profile/subdomain behavior', /^Covered locally$/],
  ['Bookmark CRUD', /^Covered locally$/],
  ['Categories', /^Covered locally$/],
  ['Public profiles', /^Covered locally$/],
  ['Async metadata pipeline through Kafka and Go worker', /^Covered by tests$/],
  ['Redis operational state', /^Covered by tests$/],
  ['Elasticsearch derived search index and fallback', /^Covered locally$/],
  ['Prevent entity/password leakage; DTOs only', /^Covered with DTO tests$/],
  ['Authorization on every endpoint', /^Covered with matrix and tests$/],
  ['Metadata worker SSRF protection', /^Covered$/],
  ['Idempotency, retry, dead-letter behavior', /^Covered$/],
  ['Integration tests with Testcontainers', /^Covered locally$/],
  ['V1 export and v2 import scripts', /^Covered locally$/],
  ['Validate data counts and ownership', /^Covered locally$/],
  ['ARM64 image builds', /^Covered locally$/],
  ['Terraform deployment flow, rollback notes, smoke checklist', /^Docs\/tooling covered; Pi k3s rollout, public health\/TLS route, full release smoke, import validation, and normal route proof executed; migration signoff pending$/],
  ['Unit tests pass', /^Covered locally$/],
  ['Playwright parity tests pass', /^Covered locally$/],
  ['Visual regression passes against v1 baselines', /^Covered$/],
  ['No v1 parity checklist item unchecked', /^Covered$/]
];

const requiredEvidenceCommands = [
  'pnpm check:web-ui-parity',
  'pnpm check:architecture-support',
  'pnpm check:v1-parity-checklist',
  'pnpm check:completion-audit',
  'pnpm check:production-release-docs',
  'pnpm check:ci-workflow',
  'pnpm check:playwright-safety',
  'pnpm test:v1-visual:verify',
  'pnpm contracts:validate',
  'pnpm lint:web',
  'pnpm build:web',
  'pnpm test:api',
  'pnpm test:metadata-worker',
  'pnpm compose:verify',
  'pnpm compose:config',
  'pnpm compose:smoke',
  'pnpm infra:pi:verify',
  'terraform -chdir=infra/terraform/pi validate',
  'terraform -chdir=infra/terraform/pi plan',
  'pnpm preflight:production-context:dry-run',
  'pnpm smoke:oauth-provider:dry-run',
  'pnpm smoke:oauth-provider:route-targets',
  'pnpm smoke:oauth-provider:preflight',
  'pnpm smoke:oauth-provider:provider-starts',
  'pnpm smoke:oauth-provider:evidence-audit',
  'pnpm smoke:oauth-provider:evidence-audit:require',
  'pnpm smoke:production:test-account:dry-run',
  'pnpm smoke:production:cleanup-check:dry-run',
  'pnpm smoke:production:cleanup-check',
  'pnpm smoke:authenticated-prod-oracle:dry-run',
  'pnpm migration:production-cutover:dry-run',
  'pnpm migration:route-targets',
  'pnpm migration:canary-route-targets',
  'pnpm migration:safety:verify',
  'pnpm images:verify',
  'pnpm release:handoff',
  'pnpm release:signoffs:verify',
  'pnpm release:blockers:verify',
  'pnpm release:readiness:verify',
  'pnpm release:readiness:local',
  'pnpm release:blockers',
  'pnpm release:readiness'
];

const requiredEvidencePackageScripts = {
  'check:web-ui-parity': 'node scripts/check-web-ui-parity.mjs',
  'check:architecture-support': 'node scripts/validate-architecture-support.mjs',
  'check:v1-parity-checklist': 'node scripts/validate-v1-parity-checklist.mjs',
  'check:completion-audit': 'node scripts/validate-completion-audit.mjs',
  'check:production-release-docs': 'node scripts/validate-production-release-docs.mjs',
  'check:ci-workflow': 'node scripts/validate-ci-workflow.mjs',
  'check:playwright-safety': 'node scripts/validate-playwright-safety.mjs',
  'test:v1-visual:verify': 'node scripts/validate-visual-baselines.mjs',
  'contracts:validate': 'node scripts/validate-contracts.mjs',
  'lint:web': 'pnpm --filter @bookmarket/web lint',
  'build:web': 'pnpm --filter @bookmarket/web build',
  'test:api': 'cd services/api && mvn clean test',
  'test:metadata-worker': 'cd services/metadata-worker && go test ./...',
  'compose:verify': 'node scripts/validate-docker-compose.mjs',
  'compose:config': 'docker compose -f infra/docker-compose/docker-compose.yml config',
  'compose:smoke': 'node scripts/docker-compose-smoke.mjs',
  'infra:pi:verify': 'node scripts/validate-pi-terraform.mjs',
  'preflight:production-context:dry-run': 'node scripts/production-context-preflight.mjs --dry-run',
  'smoke:oauth-provider:dry-run': 'node scripts/oauth-provider-smoke.mjs --dry-run',
  'smoke:oauth-provider:route-targets': 'node scripts/oauth-provider-smoke.mjs --route-target-only',
  'smoke:oauth-provider:preflight': 'node scripts/oauth-provider-smoke.mjs --preflight-only',
  'smoke:oauth-provider:provider-starts': 'node scripts/oauth-provider-smoke.mjs --provider-start-only',
  'smoke:oauth-provider:evidence-audit': 'node scripts/audit-oauth-provider-evidence.mjs',
  'smoke:oauth-provider:evidence-audit:require': 'node scripts/audit-oauth-provider-evidence.mjs --require',
  'smoke:production:test-account:dry-run': 'node scripts/production-test-account-smoke.mjs --dry-run',
  'smoke:production:cleanup-check:dry-run': 'node scripts/production-disposable-cleanup-check.mjs --dry-run',
  'smoke:production:cleanup-check': 'node scripts/production-disposable-cleanup-check.mjs',
  'smoke:authenticated-prod-oracle:dry-run': 'node scripts/authenticated-production-oracle-smoke.mjs --dry-run',
  'migration:production-cutover:dry-run': 'node scripts/production-migration-cutover.mjs --dry-run',
  'migration:route-targets': 'node scripts/production-migration-cutover.mjs --route-report',
  'migration:canary-route-targets': 'node scripts/production-migration-cutover.mjs --canary-route-report',
  'migration:safety:verify': 'node scripts/validate-migration-safety.mjs',
  'images:verify': 'node scripts/validate-image-workflow.mjs',
  'release:handoff': 'node scripts/print-release-handoff.mjs',
  'release:signoffs:verify': 'node scripts/validate-release-signoffs.mjs',
  'release:blockers:verify': 'node scripts/validate-release-blockers.mjs',
  'release:readiness:verify': 'node scripts/validate-release-readiness.mjs',
  'release:readiness:local': 'node scripts/release-readiness-check.mjs --allow-external-blockers',
  'release:blockers': 'node scripts/release-readiness-check.mjs --external-only --allow-external-blockers',
  'release:readiness': 'node scripts/release-readiness-check.mjs'
};

const requiredRemainingGapMarkers = [
  'OAuth provider browser smoke is now signed off',
  'Production release-smoke is now signed off',
  '1 production-bound blocker',
  'Migration/cutover evidence is now read-only verified but not signed off',
  'artifacts/migration/prod-cutover-v1-export.json',
  'pnpm import:v2:validate',
  'normal public `/login` and `/home` now match k3s route fingerprints',
  'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1',
  'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1',
  'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1',
  'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1',
  'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1',
  'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1',
  'BOOKMARKET_PROD_KUBE_CONTEXT',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_BACKUP_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF',
  'BOOKMARKET_RESTART_SMOKE_APPROVED=1',
  'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF',
  'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF',
  'api.bmkt.ericjypark.com',
  'Final post-readiness cleanup checks',
  'users/bookmarks/categories = 0|0|0',
  'users/bookmarks/categories/oauth_provider_users = 0|0|0|0',
  'targeted local search across `bookmarket-v2` and the v1 `bookmarket` repo',
  'operator-approved Chrome account',
  '56 cases',
  'OAuth route sha256 fingerprint values',
  'real `/login:<sha256>` and `/home:<sha256>` OAuth route fingerprint values',
  'users/me email-like identity value',
  'disposable bookmark/category cleanup count evidence',
  'disposable bookmark/category `0|0` count evidence',
  'OAuth provider cleanup residue guard',
  'exact expected production kube context evidence',
  'Do not call `update_goal`'
];

const requiredUiParityEvidenceMarkers = [
  'whole `src` tree, `public` assets, and `next-env.d.ts`',
  'stable web package scripts/dev styling tooling',
  'rejects unexpected v2 package scripts/dev tooling',
  'allowed-diff exception inventory',
  'effective v1 TypeScript config checked',
  '46 v1-resolved web lock versions checked',
  '9 exact roots',
  '15 allowed adapter diffs',
  '1 v2-only adapter helper',
  '2 non-visual v2-only route handlers'
];

const requiredProductionReleaseDocEvidenceMarkers = [
  'migration/cutover evidence helper',
  '40 scripts, 40 exact script implementations',
  '68 README markers',
  '117 checklist markers',
  '24 Terraform markers',
  '20 agent TOC markers',
  '14 external-public-endpoint markers',
  '50 OAuth-provider smoke markers',
  '21 OAuth-provider evidence-audit markers',
  '11 OAuth-provider profile markers',
  '17 cleanup-check markers',
  '20 migration-cutover markers',
  '23 readiness markers',
  '17 release-readiness-validator markers',
  'completion-audit status guard',
  '4 migration-export markers',
  '4 migration-import markers',
  '8 migration-safety markers',
  '124 handoff markers',
  '32 blocker-library markers',
  '20 blocker-hint markers',
  '30 blocker-validator markers',
  '24 synthetic blocker cases',
  '4 hints',
  'normal route proof',
  '23 signoff-library markers',
  '11 route-target helper markers',
  '6 completion-audit status markers',
  'Canary route drift refresh',
  '4 status cases, 9 release script markers, and 7 completion-audit validator markers',
  'BOOKMARKET_OAUTH_ROUTE_TARGET_COOKIE',
  'v2 canary route target proof',
  'direct k3s web route response asset fingerprints',
  '14866c1f3701168a2ab08ea68bbfa484aae31a3e3c71dd1d3c02bc8d6efdd6fe',
  'ed7fa6862cb896ec1c1ac44fc3a7d74ec37c379b1cee74187f28a63a2d459489',
  '0dceb1dd4f8f6f7937e296099f0396bf16a13f46d60491070028986490d2af16',
  'e2512c0c33d2d4de5da43610f83f07f2c7b2a5db4f4791695200d3ab42a14239'
];

const requiredCiWorkflowEvidenceMarkers = [
  'production disposable cleanup dry-run',
  'node --check scripts/oauth-provider-smoke.mjs',
  'node --check scripts/audit-oauth-provider-evidence.mjs',
  'node --check scripts/prepare-oauth-provider-profile.mjs',
  'node --check scripts/production-test-account-smoke.mjs',
  'node --check scripts/authenticated-production-oracle-smoke.mjs',
  'node --check scripts/production-migration-cutover.mjs',
  'node --check scripts/production-disposable-cleanup-check.mjs',
  'pnpm smoke:oauth-provider:evidence-audit',
  'BOOKMARKET_WEB_URL=http://localhost:3000 BOOKMARKET_API_URL=http://localhost:8080 pnpm smoke:oauth-provider:route-targets',
  'pnpm smoke:production:cleanup-check:dry-run',
  'node --check scripts/validate-release-readiness.mjs',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR=.tmp/ci-oauth-provider-profile pnpm smoke:oauth-provider:profile:prepare',
  'pnpm smoke:oauth-provider:preflight',
  '73 required guard markers'
];

const requiredOAuthCoverageEvidenceMarkers = [
  'Latest dedicated OAuth provider profile helper',
  'pnpm smoke:oauth-provider:profile:prepare:dry-run',
  'pnpm smoke:oauth-provider:preflight',
  'pnpm smoke:oauth-provider:provider-starts',
  '.bookmarket-dedicated-oauth-provider-profile',
  'real-user-profile refusal',
  'reject an unmarked profile directory before browser launch',
  'Fresh Pi/Tailscale OAuth preflight refresh',
  'Fresh fake-preflight signoff audit',
  'missing real `smoke:oauth-provider` command evidence',
  'Fresh provider-start OAuth readiness check',
  'Google authorization popup contains client_id, origin, state, and openid/profile/email scopes',
  'GitHub login gate with return_to authorization URL contains client_id, redirect_uri, state, and user:email scope',
  'Fresh signup provider-start OAuth readiness check',
  'Latest operator-approved Chrome OAuth provider smoke',
  'Computer Use Chrome credential OAuth provider smoke check',
  'operator-approved Chrome account',
  'BOOKMARKET_OAUTH_START_PATH=/signup',
  'BOOKMARKET_OAUTH_ROUTE_TARGET_PATHS=/signup,/home',
  '7c994ae8a02dcd42f24977bccf6e7251ee3443f97c6aacc0a28efd2b8cdb4021',
  'waitForProviderButtonReadiness',
  'waitForProviderStartOrHome',
  'Google Identity script race',
  'Latest pre-provider OAuth parity guard',
  'Google state still flows into `startGoogleLogin({ state })`',
  'GitHub state still flows into the authorize URL and `/oauth/github` callback',
  'both server actions forward `state` to the API OAuth endpoints',
  'the `/api/oauth/state` proxy remains a no-store POST to `/api/v1/auth/oauth/state`',
  'Latest backend OAuth verifier contract guard',
  'Redis-backed state consumption before Google/GitHub provider verification',
  'verified-email rejection before linking',
  'Google audience and verified-email checks',
  'GitHub `/user` plus `/user/emails` calls',
  'server-side OAuth provider verification markers'
];

const requiredCleanupEvidenceMarkers = [
  'no matching local Docker Compose/Testcontainers containers',
  'no matching kubectl port-forward/SSH/release-readiness/production-smoke/OAuth/test-account/oracle worker processes',
  'artifacts/pi-k3s.kubeconfig',
  'disposable production test-pattern `users/bookmarks/categories = 0|0|0`',
  'OAuth provider cleanup residue guard',
  'users/bookmarks/categories/oauth_provider_users = 0|0|0|0'
];

const requiredCompleteAuditMarkers = [
  'Status: complete.',
  'No remaining completion gaps',
  'final `pnpm release:readiness` passed',
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
  'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF'
];

const forbiddenNotCompletePatterns = [
  [/^Status:\s*complete\b/im, 'complete status while production blockers remain'],
  [/\|\s*No v1 parity checklist item unchecked\s*\|[^|\n]*\|\s*Complete\s*\|/i, 'completed v1 parity row despite external blockers']
];

const forbiddenCompleteRemainingGapPatterns = [
  [/\b1 production-bound blocker\b/i, 'current production-bound blocker count in complete audit'],
  [/\bExternal OAuth provider browser smoke\b/i, 'OAuth provider browser smoke still listed as a remaining gap'],
  [/\bFull production release-smoke signoff\b/i, 'production release smoke still listed as a remaining gap'],
  [/\bPublic traffic cutover\/migration\b/i, 'public traffic cutover still listed as a remaining gap'],
  [/\bReal v1 user data has not been imported\b/i, 'real production data migration still listed as incomplete'],
  [/\bstill proxies normal UI routes to the v1 Docker web container\b/i, 'normal route cutover still listed as incomplete'],
  [/\bDo not call `update_goal`\b/i, 'goal-completion warning still listed as a remaining gap']
];

const forbiddenPatterns = [
  [/\bcurrent\s+8\s+exact\s+roots\b/i, 'stale current web UI parity exact-root count'],
  [/\bCurrent run:[^.\n]*\b8\s+exact\s+roots\b/i, 'stale current web UI parity run evidence'],
  [/\bsame\s+six\s+production-bound\s+blockers\b/i, 'stale six-blocker release-readiness wording'],
  [/\breported\s+six\s+production-bound\s+blockers\b/i, 'stale six-blocker release-readiness wording'],
  [/\bAuthenticated production reference inspection remains unavailable\b/i, 'stale authenticated production-oracle blocked wording'],
  [/`BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF`\s+remains unset/i, 'stale authenticated production-oracle signoff unset wording'],
  [/\bauthenticated production-oracle signoff remains blocked\b/i, 'stale authenticated production-oracle blocked wording'],
  [/\breported\s+10\s+production-bound\s+blockers:\s+missing Pi\/k3s context\b/i, 'stale ten-blocker release-readiness wording'],
  [/\breports\s+10\s+production-bound\s+blockers\s+from missing release context/i, 'stale ten-blocker blocker-triage wording'],
  [/\bCurrent run passed with 22 scripts\b/i, 'stale production release-doc script count'],
  [/scripts\/validate-release-signoffs\.mjs` now has 32 cases/i, 'stale release signoff validator case count'],
  [/`pnpm release:signoffs:verify`:\s+passed with `(?:29|32) cases`/i, 'stale release signoff validator run evidence'],
  [/pnpm release:signoffs:verify[^.\n]*passed with (?:[1-9]|[1-4][0-9]|5[01]) cases/i, 'stale release signoff validator case count below current 52'],
  [/`pnpm release:signoffs:verify`:\s+passed with `50 cases`/i, 'stale release signoff validator run evidence'],
  [/`pnpm release:signoffs:verify`:\s+passed with `51 cases`/i, 'stale release signoff validator run evidence'],
  [/Fresh `pnpm check:production-release-docs`[^.\n]*passed with [0-9]+ scripts/i, 'stale production release-doc script count in historical evidence'],
  [/Fresh `pnpm check:completion-audit`[^.\n]*passed with [0-9]+ evidence commands/i, 'stale completion audit evidence-command count in historical evidence'],
  [/\b30 scripts,\s+30 exact script implementations\b/i, 'stale production release-doc script count'],
  [/\b31 scripts,\s+31 exact script implementations\b/i, 'stale production release-doc script count'],
  [/\b32 scripts,\s+32 exact script implementations\b/i, 'stale production release-doc script count'],
  [/\b34 scripts,\s+34 exact script implementations\b/i, 'stale production release-doc script count'],
  [/\b19 OAuth-provider smoke markers\b/i, 'stale OAuth-provider smoke marker count'],
  [/`pnpm release:blockers:verify` passed with 13 synthetic blocker cases/i, 'stale release blocker validator case count'],
  [/`pnpm release:blockers:verify` passed with 14 synthetic blocker cases/i, 'stale release blocker validator case count'],
  [/`pnpm release:blockers:verify` passed with 16 (?:synthetic )?blocker cases/i, 'stale release blocker validator case count'],
  [/`pnpm release:blockers:verify` passed with 18 (?:synthetic )?blocker cases/i, 'stale release blocker validator case count'],
  [/`pnpm release:blockers:verify` passed with 19 (?:synthetic )?blocker cases/i, 'stale release blocker validator case count'],
  [/`pnpm release:blockers:verify` passed with 20 (?:synthetic )?blocker cases/i, 'stale release blocker validator case count'],
  [/\b19 blocker-library markers\b/i, 'stale release blocker library marker count'],
  [/\b27 blocker-library markers\b/i, 'stale release blocker library marker count'],
  [/\b22 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b24 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b25 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b26 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b16 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b15 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b18 readiness markers\b/i, 'stale release readiness marker count'],
  [/\b17 readiness markers\b/i, 'stale release readiness marker count'],
  [/\b15 readiness markers\b/i, 'stale release readiness marker count'],
  [/\b19 readiness markers\b/i, 'stale release readiness marker count'],
  [/\b21 readiness markers\b/i, 'stale release readiness marker count'],
  [/\b4 status cases,\s+7 release script markers,\s+and 7 completion-audit validator markers\b/i, 'stale release readiness validator marker count'],
  [/\b17 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/\b21 blocker-validator markers\b/i, 'stale release blocker validator marker count'],
  [/`pnpm release:signoffs:verify`:\s+passed with `49 cases`/i, 'stale release signoff validator run evidence'],
  [/`pnpm release:signoffs:verify`:\s+passed with `48 cases`/i, 'stale release signoff validator run evidence'],
  [/`pnpm release:signoffs:verify`:\s+passed with `47 cases`/i, 'stale release signoff validator run evidence'],
  [/`pnpm release:signoffs:verify`:\s+passed with `46 cases`/i, 'stale release signoff validator run evidence'],
  [/`pnpm release:signoffs:verify`:\s+passed with `45 cases`/i, 'stale release signoff validator run evidence'],
  [/\bCI workflow validated:\s+58 required guard markers\b/i, 'stale CI workflow guard count'],
  [/\bCI workflow validated:\s+60 required guard markers\b/i, 'stale CI workflow guard count'],
  [/\bCI workflow validated:\s+64 required guard markers\b/i, 'stale CI workflow guard count'],
  [/\bCI workflow validated:\s+65 required guard markers\b/i, 'stale CI workflow guard count'],
  [/\b9 CI workflow evidence markers\b/i, 'stale completion audit CI workflow evidence count'],
  [/\b65 required guard markers\b/i, 'stale CI workflow guard count'],
  [/\bCI workflow validated:\s+56 required guard markers\b/i, 'stale CI workflow guard count']
];

const failures = [];

main();

function main() {
  const audit = readText(auditPath);
  const packageJson = readJson(packageJsonPath);

  assertPackageScript(packageJson);
  const status = assertStatus(audit);
  assertSections(audit);
  assertObjectiveInputs();
  assertMarkers('objective', audit, requiredObjectiveMarkers);
  assertChecklistRows(audit, status);
  assertMarkers('current pass evidence command', audit, requiredEvidenceCommands);
  assertEvidenceCommandScripts(packageJson);
  assertEvidenceCommandScriptImplementations(packageJson);
  if (status === 'not-complete') {
    assertMarkers('remaining completion gap', audit, requiredRemainingGapMarkers);
    assertNoForbiddenPatterns(audit, forbiddenNotCompletePatterns);
  } else if (status === 'complete') {
    assertCompleteAuditEvidence(audit);
  }
  assertMarkers('current UI parity evidence', audit, requiredUiParityEvidenceMarkers);
  assertMarkers('production release-doc evidence', audit, requiredProductionReleaseDocEvidenceMarkers);
  assertMarkers('CI workflow evidence', audit, requiredCiWorkflowEvidenceMarkers);
  assertMarkers('OAuth coverage evidence', audit, requiredOAuthCoverageEvidenceMarkers);
  assertMarkers('post-readiness cleanup evidence', audit, requiredCleanupEvidenceMarkers);
  assertNoForbiddenPatterns(audit);

  if (failures.length > 0) {
    console.error('Completion audit validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Completion audit validated: ${requiredSections.length} sections, ${requiredObjectiveMarkers.length} objective markers, ${requiredObjectiveInputs.length} objective input paths, ${requiredChecklistRows.length} checklist rows, ${requiredEvidenceCommands.length} evidence commands, ${countPnpmEvidenceCommands()} package-backed commands, ${Object.keys(requiredEvidencePackageScripts).length} exact package script implementations, ${requiredRemainingGapMarkers.length} remaining-gap markers, ${requiredUiParityEvidenceMarkers.length} UI parity evidence markers.`
    + ` ${requiredProductionReleaseDocEvidenceMarkers.length} production release-doc evidence markers. ${requiredCiWorkflowEvidenceMarkers.length} CI workflow evidence markers. ${requiredOAuthCoverageEvidenceMarkers.length} OAuth coverage evidence markers. ${requiredCleanupEvidenceMarkers.length} cleanup evidence markers.`
  );
}

function assertPackageScript(packageJson) {
  if (packageJson.scripts?.['check:completion-audit'] !== 'node scripts/validate-completion-audit.mjs') {
    failures.push('package.json must define check:completion-audit as node scripts/validate-completion-audit.mjs.');
  }
}

function assertEvidenceCommandScripts(packageJson) {
  const scripts = packageJson.scripts ?? {};
  for (const command of requiredEvidenceCommands) {
    const match = /^pnpm\s+([^\s]+)$/.exec(command);
    if (!match) {
      continue;
    }

    const scriptName = match[1];
    if (!Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
      failures.push(`Completion audit evidence command has no package.json script: ${command}`);
    }
  }
}

function assertEvidenceCommandScriptImplementations(packageJson) {
  const scripts = packageJson.scripts ?? {};
  for (const [scriptName, expectedCommand] of Object.entries(requiredEvidencePackageScripts)) {
    const actualCommand = scripts[scriptName];
    if (actualCommand !== expectedCommand) {
      failures.push(`Completion audit evidence script ${scriptName} must be "${expectedCommand}"; found "${actualCommand ?? 'missing'}".`);
    }
  }
}

function countPnpmEvidenceCommands() {
  return requiredEvidenceCommands.filter((command) => /^pnpm\s+[^\s]+$/.test(command)).length;
}

function assertStatus(audit) {
  if (/^Status:\s*not complete\./im.test(audit)) {
    return 'not-complete';
  }

  if (/^Status:\s*complete\./im.test(audit)) {
    return 'complete';
  }

  failures.push('Completion audit must explicitly say either Status: not complete. or Status: complete.');
  return 'unknown';
}

function assertSections(audit) {
  for (const section of requiredSections) {
    if (!audit.includes(`## ${section}`)) {
      failures.push(`Missing required section: ${section}`);
    }
  }
}

function assertObjectiveInputs() {
  for (const [inputPath, expectedType] of requiredObjectiveInputs) {
    const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);

    let inputStat;
    try {
      inputStat = fs.statSync(absolutePath);
    } catch (error) {
      failures.push(`Missing objective input ${expectedType}: ${inputPath} (${error.message})`);
      continue;
    }

    if (expectedType === 'file' && !inputStat.isFile()) {
      failures.push(`Objective input must be a file: ${inputPath}`);
    } else if (expectedType === 'directory' && !inputStat.isDirectory()) {
      failures.push(`Objective input must be a directory: ${inputPath}`);
    }
  }
}

function assertMarkers(label, audit, markers) {
  for (const marker of markers) {
    if (!audit.includes(marker)) {
      failures.push(`Missing ${label} marker: ${marker}`);
    }
  }
}

function assertChecklistRows(audit, status) {
  const rows = parseChecklistRows(audit);
  if (rows.length !== requiredChecklistRows.length) {
    failures.push(`Prompt-to-artifact checklist must have ${requiredChecklistRows.length} rows; found ${rows.length}.`);
  }

  for (const [requirement, expectedStatus] of requiredChecklistRows) {
    const row = rows.find((candidate) => candidate.requirement === requirement);
    if (!row) {
      failures.push(`Missing prompt-to-artifact checklist row: ${requirement}`);
      continue;
    }

    if (!row.evidence) {
      failures.push(`Prompt-to-artifact checklist row has empty evidence: ${requirement}`);
    }

    if (status === 'not-complete' && !expectedStatus.test(row.status)) {
      failures.push(`Prompt-to-artifact checklist row "${requirement}" has unexpected status: ${row.status}`);
    } else if (status === 'complete' && !isCompleteChecklistStatus(row.status)) {
      failures.push(`Complete audit checklist row "${requirement}" must have a Covered or Complete status without incomplete wording; found "${row.status}".`);
    }
  }
}

function assertCompleteAuditEvidence(audit) {
  assertMarkers('complete audit evidence', audit, requiredCompleteAuditMarkers);

  const remainingGaps = extractSection(audit, 'Remaining Completion Gaps');
  assertNoForbiddenPatterns(remainingGaps, forbiddenCompleteRemainingGapPatterns);
}

function isCompleteChecklistStatus(status) {
  return /^(Covered|Complete)\b/.test(status) && !/\b(except|pending|blocked|not complete)\b/i.test(status);
}

function parseChecklistRows(audit) {
  const section = extractSection(audit, 'Prompt-To-Artifact Checklist');
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|\s*-+/.test(line))
    .filter((line) => !/^\|\s*Requirement\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      return {
        requirement: cells[0] ?? '',
        evidence: cells[1] ?? '',
        status: cells[2] ?? ''
      };
    });
}

function extractSection(audit, sectionName) {
  const marker = `## ${sectionName}`;
  const start = audit.indexOf(marker);
  if (start === -1) {
    return '';
  }

  const nextSection = audit.indexOf('\n## ', start + marker.length);
  if (nextSection === -1) {
    return audit.slice(start);
  }

  return audit.slice(start, nextSection);
}

function assertNoForbiddenPatterns(audit, patterns = forbiddenPatterns) {
  for (const [pattern, label] of patterns) {
    if (pattern.test(audit)) {
      failures.push(`Found forbidden completion audit marker: ${label}.`);
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
