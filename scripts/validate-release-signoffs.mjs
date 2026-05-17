#!/usr/bin/env node

import {
  missingAuthenticatedProdOracleFields,
  missingBackupSignoffFields,
  missingMigrationCutoverSignoffFields,
  missingOAuthSmokeSignoffFields,
  missingProductionSmokeSignoffFields,
  missingProductionTestAccountSignoffFields
} from './lib/release-signoffs.mjs';

process.env.BOOKMARKET_RELEASE_DATE = '2026-05-16';
delete process.env.BOOKMARKET_PROD_KUBE_CONTEXT;

const validOAuthSignoff =
  '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.';
const validBackupSignoff =
  '2026-05-16: Postgres backup file /backups/bookmarket-pre-switch.dump sha256 abc created and restore-check pg_restore rollback verified.';
const validTestAccountSignoff =
  '2026-05-16: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched.';
const validOracleSignoff =
  '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/test.';
const validProductionSmokeSignoff =
  '2026-05-16: pnpm smoke:production:release passed on Raspberry Pi k3s production context pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.';
const validMigrationCutoverSignoff =
  '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.';

const cases = [
  {
    label: 'valid OAuth signoff',
    actual: missingOAuthSmokeSignoffFields(validOAuthSignoff),
    expected: []
  },
  {
    label: 'valid OAuth canary route signoff',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 canary route target proof passed with public canary routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: []
  },
  {
    label: 'valid OAuth signoff with provider-specific identity emails',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account Google google-test@example.com and GitHub github-test@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email Google google-test@example.com, GitHub github-test@example.com confirmed.'
    ),
    expected: []
  },
  {
    label: 'valid OAuth signoff with operator-approved Chrome credentials',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: Computer Use Chrome credential OAuth check passed for Google and GitHub provider smoke using staging OAuth app and operator-approved Chrome credential account; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity account operator-approved Chrome account confirmed.'
    ),
    expected: []
  },
  {
    label: 'OAuth signoff must mention local or staging app',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['local or staging OAuth app']
  },
  {
    label: 'OAuth signoff must mention an approved provider credential account',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and account account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email account@example.com confirmed.'
    ),
    expected: ['approved provider credential account']
  },
  {
    label: 'OAuth signoff must not accept email-login test account wording',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['approved provider credential account']
  },
  {
    label: 'OAuth signoff must not accept production test-account smoke cleanup wording',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated Bookmarket production test account test-account@example.com; production email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable bookmarks/categories 0|0 and no real user data touched; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['approved provider credential account']
  },
  {
    label: 'OAuth signoff must include smoke date',
    actual: missingOAuthSmokeSignoffFields(
      'pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['smoke date 2026-05-16']
  },
  {
    label: 'OAuth signoff must match release date',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-15: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['smoke date 2026-05-16']
  },
  {
    label: 'OAuth signoff must mention real OAuth browser smoke evidence',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: Google and GitHub provider smoke passed using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['real OAuth browser smoke evidence']
  },
  {
    label: 'OAuth signoff must not accept preflight-only command evidence',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider:preflight passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['real OAuth browser smoke evidence']
  },
  {
    label: 'OAuth signoff must mention v2 route target proof',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['v2 route target proof', 'OAuth route sha256 fingerprint values']
  },
  {
    label: 'OAuth signoff must include route sha256 fingerprints',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['OAuth route sha256 fingerprint values']
  },
  {
    label: 'OAuth signoff must mention users/me identity evidence',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, and session cookies confirmed.'
    ),
    expected: ['users/me identity evidence', 'users/me identity account value']
  },
  {
    label: 'OAuth signoff must mention avatar/profile shell evidence',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, session cookies, and /api/v1/users/me identity email test-account@example.com confirmed.'
    ),
    expected: ['avatar/profile shell evidence']
  },
  {
    label: 'OAuth signoff must include users/me identity account value',
    actual: missingOAuthSmokeSignoffFields(
      '2026-05-16: pnpm smoke:oauth-provider passed for Google and GitHub provider smoke using staging OAuth app and dedicated provider test account test-account@example.com; v2 route target proof passed with public routes matching direct k3s web pod fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; redirect to /home, avatar/profile menu rendered with Settings and Logout, session cookies, and /api/v1/users/me identity email confirmed.'
    ),
    expected: ['users/me identity account value']
  },
  {
    label: 'OAuth signoff must be nontrivial',
    actual: missingOAuthSmokeSignoffFields('passed'),
    expected: ['nontrivial summary']
  },
  {
    label: 'valid backup signoff',
    actual: missingBackupSignoffFields(validBackupSignoff),
    expected: []
  },
  {
    label: 'backup signoff must include restore rehearsal evidence',
    actual: missingBackupSignoffFields(
      '2026-05-16: Postgres backup file /backups/bookmarket-pre-switch.dump created and restore rollback verified.'
    ),
    expected: ['restore rehearsal evidence']
  },
  {
    label: 'backup signoff must include backup date',
    actual: missingBackupSignoffFields(
      'Postgres backup file /backups/bookmarket-pre-switch.dump sha256 abc created and restore-check pg_restore rollback verified.'
    ),
    expected: ['backup date 2026-05-16']
  },
  {
    label: 'backup signoff must match release date',
    actual: missingBackupSignoffFields(
      '2026-05-15: Postgres backup file /backups/bookmarket-pre-switch.dump sha256 abc created and restore-check pg_restore rollback verified.'
    ),
    expected: ['backup date 2026-05-16']
  },
  {
    label: 'backup signoff must be nontrivial',
    actual: missingBackupSignoffFields('done'),
    expected: ['nontrivial summary']
  },
  {
    label: 'valid production test-account signoff',
    actual: missingProductionTestAccountSignoffFields(validTestAccountSignoff),
    expected: []
  },
  {
    label: 'production test-account signoff must mention metadata or refetch',
    actual: missingProductionTestAccountSignoffFields(
      '2026-05-16: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched.'
    ),
    expected: ['bookmark metadata/refetch evidence']
  },
  {
    label: 'production test-account signoff must mention test-account smoke command',
    actual: missingProductionTestAccountSignoffFields(
      '2026-05-16: dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched.'
    ),
    expected: ['smoke:production:test-account command evidence']
  },
  {
    label: 'production test-account signoff must match release date',
    actual: missingProductionTestAccountSignoffFields(
      '2026-05-15: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched.'
    ),
    expected: ['test-account smoke date 2026-05-16']
  },
  {
    label: 'production test-account signoff must mention bookmark open',
    actual: missingProductionTestAccountSignoffFields(
      '2026-05-16: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and verified disposable bookmarks/categories 0|0; no real user data touched.'
    ),
    expected: ['bookmark open evidence']
  },
  {
    label: 'production test-account signoff must mention cleanup',
    actual: missingProductionTestAccountSignoffFields(
      '2026-05-16: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed.'
    ),
    expected: ['cleanup/no real data evidence', 'disposable bookmark/category cleanup count evidence']
  },
  {
    label: 'production test-account signoff must include disposable cleanup counts',
    actual: missingProductionTestAccountSignoffFields(
      '2026-05-16: pnpm smoke:production:test-account passed for dedicated test account test-account@example.com email login session confirmed; bookmark create/open/copy/rename/category assignment/refetch metadata/delete passed; category create/delete passed; cleanup deleted disposable data and no real user data touched.'
    ),
    expected: ['disposable bookmark/category cleanup count evidence']
  },
  {
    label: 'valid authenticated production oracle signoff',
    actual: missingAuthenticatedProdOracleFields(validOracleSignoff),
    expected: []
  },
  {
    label: 'authenticated oracle signoff must mention command menu',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior profile settings subdomain UI and public profile behavior /s/test.'
    ),
    expected: ['command menu inspection']
  },
  {
    label: 'authenticated oracle signoff must match release date',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-15: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/test.'
    ),
    expected: ['oracle date 2026-05-16']
  },
  {
    label: 'authenticated oracle signoff must mention oracle smoke command',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/test.'
    ),
    expected: ['smoke:authenticated-prod-oracle command evidence']
  },
  {
    label: 'authenticated oracle signoff must mention read-only scope',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI and public profile behavior /s/test.'
    ),
    expected: ['read-only evidence']
  },
  {
    label: 'authenticated oracle signoff must mention bookmark list layout',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home bookmark category filter behavior command menu profile settings subdomain UI and public profile behavior /s/test.'
    ),
    expected: ['bookmark list layout inspection']
  },
  {
    label: 'authenticated oracle signoff must mention category filter behavior',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category behavior command menu profile settings subdomain UI and public profile behavior /s/test.'
    ),
    expected: ['category filter behavior inspection']
  },
  {
    label: 'authenticated oracle signoff must mention profile settings with subdomain',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile UI and public profile behavior /s/test.'
    ),
    expected: ['profile settings or subdomain inspection']
  },
  {
    label: 'authenticated oracle signoff must mention public profile behavior',
    actual: missingAuthenticatedProdOracleFields(
      '2026-05-16: pnpm smoke:authenticated-prod-oracle passed for authenticated session read-only no production mutation inspected /home current bookmark list layout category filter behavior command menu profile settings subdomain UI.'
    ),
    expected: ['public profile behavior inspection']
  },
  {
    label: 'authenticated oracle signoff must be nontrivial',
    actual: missingAuthenticatedProdOracleFields('yes'),
    expected: ['nontrivial summary']
  },
  {
    label: 'valid production smoke signoff',
    actual: missingProductionSmokeSignoffFields(validProductionSmokeSignoff),
    expected: []
  },
  {
    label: 'production smoke signoff must include expected production kube context',
    actual: missingProductionSmokeSignoffFields(
      '2026-05-16: pnpm smoke:production:release passed on Raspberry Pi k3s production context pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.',
      { expectedContext: 'bookmarket-pi-k3s' }
    ),
    expected: ['production kube context bookmarket-pi-k3s']
  },
  {
    label: 'production smoke signoff must match release date',
    actual: missingProductionSmokeSignoffFields(
      '2026-05-15: pnpm smoke:production:release passed on Raspberry Pi k3s production context pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.'
    ),
    expected: ['production smoke date 2026-05-16']
  },
  {
    label: 'production smoke signoff must mention release smoke command',
    actual: missingProductionSmokeSignoffFields(
      '2026-05-16: full production smoke passed on Raspberry Pi k3s production context pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed.'
    ),
    expected: ['smoke:production:release command evidence']
  },
  {
    label: 'production smoke signoff must mention restart/PVC survival',
    actual: missingProductionSmokeSignoffFields(
      '2026-05-16: pnpm smoke:production:release passed on Raspberry Pi k3s production context pi-k3s; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, and Elasticsearch health completed.'
    ),
    expected: ['restart/PVC survival evidence']
  },
  {
    label: 'production smoke signoff must be nontrivial',
    actual: missingProductionSmokeSignoffFields('passed'),
    expected: ['nontrivial summary']
  },
  {
    label: 'valid migration cutover signoff',
    actual: missingMigrationCutoverSignoffFields(validMigrationCutoverSignoff),
    expected: []
  },
  {
    label: 'migration cutover signoff must include expected production kube context',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.',
      { expectedContext: 'bookmarket-pi-k3s' }
    ),
    expected: ['production kube context bookmarket-pi-k3s']
  },
  {
    label: 'migration cutover signoff must match release date',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-15: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.'
    ),
    expected: ['migration/cutover date 2026-05-16']
  },
  {
    label: 'migration cutover signoff must mention export/import command evidence',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: production data move completed; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.'
    ),
    expected: ['export/import or migration command evidence']
  },
  {
    label: 'migration cutover signoff must mention count and ownership validation',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data moved; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup rollback path verified.'
    ),
    expected: ['count and ownership validation']
  },
  {
    label: 'migration cutover signoff must mention UI route cutover',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public health stayed on Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints abc and def; backup rollback path verified.'
    ),
    expected: ['public traffic cutover evidence', 'normal UI route evidence', 'normal route sha256 fingerprint values']
  },
  {
    label: 'migration cutover signoff must mention direct k3s route asset fingerprints',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; backup rollback path verified.'
    ),
    expected: ['direct k3s route fingerprint evidence', 'normal route sha256 fingerprint values']
  },
  {
    label: 'migration cutover signoff must include real sha256 route fingerprints',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:abc, /home:def; backup rollback path verified.'
    ),
    expected: ['normal route sha256 fingerprint values']
  },
  {
    label: 'migration cutover signoff must mention rollback or backup',
    actual: missingMigrationCutoverSignoffFields(
      '2026-05-16: pnpm export:v1 and pnpm import:v2 production migration completed on Raspberry Pi k3s production context bookmarket-pi-k3s; real production user data counts and ownership/orphan validation passed; public traffic cutover switched normal UI routes /login and /home to Raspberry Pi k3s ingress; direct k3s web route response asset fingerprints matched public route asset fingerprints /login:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, /home:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.'
    ),
    expected: ['backup or rollback evidence']
  },
  {
    label: 'migration cutover signoff must be nontrivial',
    actual: missingMigrationCutoverSignoffFields('done'),
    expected: ['nontrivial summary']
  }
];

for (const testCase of cases) {
  assertArrayEqual(testCase.actual, testCase.expected, testCase.label);
}

console.log(`Release signoff validators checked: ${cases.length} cases.`);

function assertArrayEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    console.error(`[release-signoffs] ${label} failed.`);
    console.error(`[release-signoffs] Expected: ${expectedJson}`);
    console.error(`[release-signoffs] Actual:   ${actualJson}`);
    process.exit(1);
  }
}
