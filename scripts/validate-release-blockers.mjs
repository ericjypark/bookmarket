#!/usr/bin/env node

import process from 'node:process';
import { releaseBlockerHint } from './lib/release-blocker-hints.mjs';
import { productionBoundBlockers } from './lib/release-blockers.mjs';

process.env.BOOKMARKET_RELEASE_DATE = '2026-05-16';

const validEnv = {
  BOOKMARKET_PROD_KUBE_CONTEXT: 'bookmarket-pi-k3s',
  BOOKMARKET_OAUTH_SMOKE_SIGNOFF:
    '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.',
  BOOKMARKET_BACKUP_SIGNOFF:
    '2026-05-16: Postgres backup file /backups/bookmarket-pre-switch.dump sha256 abc created and restore-check pg_restore rollback verified.',
  BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF:
    '2026-05-16: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched.',
  BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF:
    '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/test.',
  BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF:
    '2026-05-16: pnpm smoke:production:release passed on Raspberry Pi k3s production context bookmarket-pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.',
  BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF:
    '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.',
  BOOKMARKET_RESTART_SMOKE_APPROVED: '1',
  BOOKMARKET_REAL_DATA_MIGRATION_APPROVED: '1',
  BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED: '1',
  BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED: '1',
  BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED: '1',
  BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S: '1',
  BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED: '1',
  BOOKMARKET_WEB_URL: 'https://bmkt.ericjypark.com',
  BOOKMARKET_API_URL: 'https://api.bmkt.ericjypark.com'
};

const cases = [
  {
    label: 'complete evidence has no blockers',
    currentContext: 'bookmarket-pi-k3s',
    env: validEnv,
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: []
  },
  {
    label: 'missing production context is reported',
    currentContext: '',
    env: without(validEnv, 'BOOKMARKET_PROD_KUBE_CONTEXT'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: ['BOOKMARKET_PROD_KUBE_CONTEXT is not set to the Raspberry Pi k3s context.']
  },
  {
    label: 'local kube context is rejected even when expected matches',
    currentContext: 'kind-kind',
    env: { ...validEnv, BOOKMARKET_PROD_KUBE_CONTEXT: 'kind-kind' },
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PROD_KUBE_CONTEXT is unsafe: "kind-kind" looks like a local/development context, not the Raspberry Pi k3s production context.'
    ]
  },
  {
    label: 'public endpoint blockers are included',
    currentContext: 'bookmarket-pi-k3s',
    env: validEnv,
    endpointBlockers: ['BOOKMARKET_API_URL /health is not healthy: HTTP 502 https://api.bmkt.ericjypark.com/health.'],
    migrationRouteTargetBlockers: [],
    expected: ['BOOKMARKET_API_URL /health is not healthy: HTTP 502 https://api.bmkt.ericjypark.com/health.']
  },
  {
    label: 'missing OAuth signoff is reported',
    currentContext: 'bookmarket-pi-k3s',
    env: withoutAll(validEnv, ['BOOKMARKET_OAUTH_SMOKE_SIGNOFF', 'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF']),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_OAUTH_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'stale OAuth signoff is reported with active release date',
    currentContext: 'bookmarket-pi-k3s',
    env: {
      ...validEnv,
      BOOKMARKET_OAUTH_SMOKE_SIGNOFF:
        '2026-05-15: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    },
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_OAUTH_SMOKE_SIGNOFF is missing: smoke date 2026-05-16.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: OAuth provider smoke signoff dependency.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'production smoke signoff still requires OAuth signoff',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_OAUTH_SMOKE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_OAUTH_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: OAuth provider smoke signoff dependency.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'restart approval is required',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_RESTART_SMOKE_APPROVED'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_RESTART_SMOKE_APPROVED=1 is not set for the required restart/PVC survival smoke.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: restart/PVC survival approval dependency.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'production smoke signoff still requires backup signoff',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_BACKUP_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_BACKUP_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: backup/restore signoff dependency.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'production smoke signoff still requires restart approval',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_RESTART_SMOKE_APPROVED'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_RESTART_SMOKE_APPROVED=1 is not set for the required restart/PVC survival smoke.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: restart/PVC survival approval dependency.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'current post-Pi evidence retains exactly three release blockers',
    currentContext: 'bookmarket-pi-k3s',
    env: withoutAll(validEnv, [
      'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF'
    ]),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_OAUTH_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: nontrivial summary.'
    ]
  },
  {
    label: 'missing production smoke signoff is reported',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'migration/cutover signoff still requires production smoke signoff',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'production smoke signoff must match production context',
    currentContext: 'bookmarket-pi-k3s',
    env: {
      ...validEnv,
      BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF:
        '2026-05-16: pnpm smoke:production:release passed on Raspberry Pi k3s production context pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.'
    },
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: production kube context bookmarket-pi-k3s.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'stale production smoke signoff is reported with active release date',
    currentContext: 'bookmarket-pi-k3s',
    env: {
      ...validEnv,
      BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF:
        '2026-05-15: pnpm smoke:production:release passed on Raspberry Pi k3s production context bookmarket-pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.'
    },
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: production smoke date 2026-05-16.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'missing test-account signoff is reported',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: production test-account smoke signoff dependency.',
      'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'production smoke signoff still requires test-account signoff',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: production test-account smoke signoff dependency.',
      'BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'missing authenticated-oracle signoff is reported',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: authenticated production-oracle signoff dependency.',
      'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'production smoke signoff still requires authenticated-oracle signoff',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: authenticated production-oracle signoff dependency.',
      'BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF is missing: nontrivial summary.',
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production release-smoke signoff dependency.'
    ]
  },
  {
    label: 'missing migration/cutover signoff is reported',
    currentContext: 'bookmarket-pi-k3s',
    env: without(validEnv, 'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF'),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: ['BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: nontrivial summary.']
  },
  {
    label: 'migration/cutover signoff must match production context',
    currentContext: 'bookmarket-pi-k3s',
    env: {
      ...validEnv,
      BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF:
        '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.'
    },
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: ['BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: production kube context bookmarket-pi-k3s.']
  },
  {
    label: 'stale migration/cutover signoff is reported with active release date',
    currentContext: 'bookmarket-pi-k3s',
    env: {
      ...validEnv,
      BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF:
        '2026-05-15: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.'
    },
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: ['BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: migration/cutover date 2026-05-16.']
  },
  {
    label: 'migration/cutover signoff requires approval and confirmation flags',
    currentContext: 'bookmarket-pi-k3s',
    env: withoutAll(validEnv, [
      'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED',
      'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED',
      'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED',
      'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED',
      'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S',
      'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED'
    ]),
    endpointBlockers: [],
    migrationRouteTargetBlockers: [],
    expected: [
      'BOOKMARKET_REAL_DATA_MIGRATION_APPROVED=1 is not set for the required migration/cutover real-data migration approval.',
      'BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED=1 is not set for the required migration/cutover public-traffic cutover approval.',
      'BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED=1 is not set for the required migration/cutover production migration completion confirmation.',
      'BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED=1 is not set for the required migration/cutover migration count validation confirmation.',
      'BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S=1 is not set for the required migration/cutover normal UI route cutover confirmation.',
      'BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED=1 is not set for the required migration/cutover rollback-path verification confirmation.'
    ]
  },
  {
    label: 'migration/cutover signoff still requires normal route proof',
    currentContext: 'bookmarket-pi-k3s',
    env: validEnv,
    endpointBlockers: [],
    migrationRouteTargetBlockers: [
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF route proof is missing: public normal UI route asset fingerprints do not match direct k3s web pod fingerprints for /login, /home.'
    ],
    expected: [
      'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF route proof is missing: public normal UI route asset fingerprints do not match direct k3s web pod fingerprints for /login, /home.'
    ]
  }
];

const failures = [];
const hintCases = [
  {
    label: 'OAuth blocker hint points to provider evidence audit, provider-starts, and provider smoke',
    blocker: 'BOOKMARKET_OAUTH_SMOKE_SIGNOFF is missing: nontrivial summary.',
    expected:
      'Run pnpm smoke:oauth-provider:evidence-audit first to confirm whether dedicated provider evidence exists without printing secrets; use pnpm smoke:oauth-provider:evidence-audit:require when you expect it to fail until evidence exists. Run pnpm smoke:oauth-provider:preflight to prove the route/profile/env is ready, and pnpm smoke:oauth-provider:provider-starts with BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1 to verify pre-login Google/GitHub authorization URLs from the copied v1 buttons. Then run pnpm smoke:oauth-provider with a local/staging OAuth app and a dedicated provider test account, or use an explicitly approved operator Chrome credential browser check; require v2 route-target proof, redirect/session cookies, avatar/profile menu evidence, and /api/v1/users/me identity evidence before setting BOOKMARKET_OAUTH_SMOKE_SIGNOFF.'
  },
  {
    label: 'production release-smoke blocker hint preserves dependency on OAuth',
    blocker: 'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: nontrivial summary.',
    expected:
      'After the OAuth provider signoff exists, run pnpm smoke:production:release against the Pi k3s context with restart/PVC approval and set BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF only from that real run.'
  },
  {
    label: 'migration/cutover blocker hint preserves real-data and normal-route requirements',
    blocker: 'BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: nontrivial summary.',
    expected:
      'After explicit real-user-data migration and normal public-traffic cutover approval, run the production v1 export, v2 import, count/ownership validation, normal-route cutover to k3s, rollback check, and pnpm migration:production-cutover.'
  },
  {
    label: 'unknown blocker has no hint',
    blocker: 'SYNTHETIC_UNKNOWN_BLOCKER',
    expected: ''
  }
];

for (const testCase of cases) {
  const actual = productionBoundBlockers({
    productionSmokeRuntimeBlockers: [],
    migrationRouteTargetBlockers: [],
    ...testCase
  });
  assertArrayEqual(testCase.label, actual, testCase.expected);
}

for (const testCase of hintCases) {
  const actual = releaseBlockerHint(testCase.blocker);
  if (actual !== testCase.expected) {
    failures.push(`${testCase.label}: expected ${JSON.stringify(testCase.expected)}, got ${JSON.stringify(actual)}`);
  }
}

if (failures.length > 0) {
  console.error('Release blocker validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Release blocker validators checked: ${cases.length} cases and ${hintCases.length} hints.`);

function without(env, key) {
  const nextEnv = { ...env };
  delete nextEnv[key];
  return nextEnv;
}

function withoutAll(env, keys) {
  const nextEnv = { ...env };
  for (const key of keys) {
    delete nextEnv[key];
  }
  return nextEnv;
}

function assertArrayEqual(label, actual, expected) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
