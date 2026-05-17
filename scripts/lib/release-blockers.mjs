import { spawnSync } from 'node:child_process';
import {
  missingAuthenticatedProdOracleFields,
  missingBackupSignoffFields,
  missingMigrationCutoverSignoffFields,
  missingOAuthSmokeSignoffFields,
  missingProductionSmokeSignoffFields,
  missingProductionTestAccountSignoffFields
} from './release-signoffs.mjs';
import { productionKubeContextBlocker } from './production-context.mjs';
import { publicEndpointBlockers } from './public-endpoints.mjs';
import {
  compareK3sPublicRouteTargets,
  parseRoutePaths,
  trimTrailingSlash
} from './route-targets.mjs';

const requiredMigrationCutoverApprovalFlags = [
  ['BOOKMARKET_REAL_DATA_MIGRATION_APPROVED', 'real-data migration approval'],
  ['BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED', 'public-traffic cutover approval'],
  ['BOOKMARKET_CONFIRM_PRODUCTION_MIGRATION_COMPLETED', 'production migration completion confirmation'],
  ['BOOKMARKET_CONFIRM_MIGRATION_COUNTS_VALIDATED', 'migration count validation confirmation'],
  ['BOOKMARKET_CONFIRM_NORMAL_UI_ROUTES_ON_K3S', 'normal UI route cutover confirmation'],
  ['BOOKMARKET_CONFIRM_ROLLBACK_PATH_VERIFIED', 'rollback-path verification confirmation']
];
const requiredTopics = [
  'bookmark.events',
  'metadata.jobs',
  'metadata.events',
  'search.jobs',
  'bookmark.events.dlq',
  'metadata.jobs.dlq',
  'metadata.events.dlq',
  'search.jobs.dlq'
];

// publicEndpointBlockers checks BOOKMARKET_WEB_URL and BOOKMARKET_API_URL health/readiness.
export function productionBoundBlockers({
  currentContext = '',
  env = process.env,
  endpointBlockers,
  productionSmokeRuntimeBlockers,
  migrationRouteTargetBlockers
} = {}) {
  const blockers = [];
  const expectedContext = env.BOOKMARKET_PROD_KUBE_CONTEXT;
  const oauthSignoff = (env.BOOKMARKET_OAUTH_SMOKE_SIGNOFF ?? '').trim();
  const backupSignoff = (env.BOOKMARKET_BACKUP_SIGNOFF ?? '').trim();
  const testAccountSignoff = (env.BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF ?? '').trim();
  const prodOracleSignoff = (env.BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF ?? '').trim();
  const productionSmokeSignoff = (env.BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF ?? '').trim();
  const migrationCutoverSignoff = (env.BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF ?? '').trim();

  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    blockers.push(contextBlocker);
  }

  blockers.push(...(endpointBlockers ?? publicEndpointBlockers(env)));

  const missingOAuthFields = missingOAuthSmokeSignoffFields(oauthSignoff);
  if (missingOAuthFields.length > 0) {
    blockers.push(`BOOKMARKET_OAUTH_SMOKE_SIGNOFF is missing: ${missingOAuthFields.join(', ')}.`);
  }

  const missingBackupFields = missingBackupSignoffFields(backupSignoff);
  if (missingBackupFields.length > 0) {
    blockers.push(`BOOKMARKET_BACKUP_SIGNOFF is missing: ${missingBackupFields.join(', ')}.`);
  }

  if (env.BOOKMARKET_RESTART_SMOKE_APPROVED !== '1') {
    blockers.push('BOOKMARKET_RESTART_SMOKE_APPROVED=1 is not set for the required restart/PVC survival smoke.');
  }

  const missingTestAccountFields = missingProductionTestAccountSignoffFields(testAccountSignoff);
  const missingOracleFields = missingAuthenticatedProdOracleFields(prodOracleSignoff);

  const missingProductionSmokeFields = missingProductionSmokeSignoffFields(productionSmokeSignoff, {
    expectedContext: contextBlocker ? undefined : expectedContext
  });
  const productionSmokeDependencyFields = [];
  if (missingProductionSmokeFields.length === 0 && missingOAuthFields.length > 0) {
    productionSmokeDependencyFields.push('OAuth provider smoke signoff dependency');
  }
  if (missingProductionSmokeFields.length === 0 && missingBackupFields.length > 0) {
    productionSmokeDependencyFields.push('backup/restore signoff dependency');
  }
  if (missingProductionSmokeFields.length === 0 && env.BOOKMARKET_RESTART_SMOKE_APPROVED !== '1') {
    productionSmokeDependencyFields.push('restart/PVC survival approval dependency');
  }
  if (missingProductionSmokeFields.length === 0 && missingTestAccountFields.length > 0) {
    productionSmokeDependencyFields.push('production test-account smoke signoff dependency');
  }
  if (missingProductionSmokeFields.length === 0 && missingOracleFields.length > 0) {
    productionSmokeDependencyFields.push('authenticated production-oracle signoff dependency');
  }
  const productionSmokeFields = [...missingProductionSmokeFields, ...productionSmokeDependencyFields];
  if (productionSmokeFields.length > 0) {
    blockers.push(`BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF is missing: ${productionSmokeFields.join(', ')}.`);
  } else if (!contextBlocker) {
    blockers.push(...(productionSmokeRuntimeBlockers ?? productionReleaseSmokeRuntimeBlockers(env)));
  }

  if (missingTestAccountFields.length > 0) {
    blockers.push(`BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF is missing: ${missingTestAccountFields.join(', ')}.`);
  }

  if (missingOracleFields.length > 0) {
    blockers.push(`BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF is missing: ${missingOracleFields.join(', ')}.`);
  }

  const missingMigrationCutoverFields = missingMigrationCutoverSignoffFields(migrationCutoverSignoff, {
    expectedContext: contextBlocker ? undefined : expectedContext
  });
  const migrationCutoverDependencyFields = [];
  if (missingMigrationCutoverFields.length === 0 && productionSmokeFields.length > 0) {
    migrationCutoverDependencyFields.push('production release-smoke signoff dependency');
  }
  const migrationCutoverFields = [...missingMigrationCutoverFields, ...migrationCutoverDependencyFields];
  if (migrationCutoverFields.length > 0) {
    blockers.push(`BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF is missing: ${migrationCutoverFields.join(', ')}.`);
  } else {
    const approvalFlagBlockers = missingMigrationCutoverApprovalFlagBlockers(env);
    blockers.push(...approvalFlagBlockers);
    if (!contextBlocker && approvalFlagBlockers.length === 0) {
      blockers.push(...(migrationRouteTargetBlockers ?? migrationCutoverRouteTargetBlockers(env)));
    }
  }

  return blockers;
}

function productionReleaseSmokeRuntimeBlockers(env) {
  const namespace = env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
  const blockers = [];

  for (const workload of [
    'deployment/web',
    'deployment/api',
    'deployment/metadata-worker',
    'statefulset/postgres',
    'statefulset/redis',
    'statefulset/kafka',
    'statefulset/elasticsearch'
  ]) {
    const result = run('kubectl', ['-n', namespace, 'rollout', 'status', workload, '--timeout=180s']);
    if (result.status !== 0) {
      blockers.push(runtimeProofBlocker(`rollout status ${workload}`, result));
    }
  }

  const pvcResult = run('kubectl', ['-n', namespace, 'get', 'pvc', '-o', 'json']);
  if (pvcResult.status !== 0) {
    blockers.push(runtimeProofBlocker('PVC check', pvcResult));
  } else {
    const pvcBlocker = pvcStatusBlocker(pvcResult.stdout);
    if (pvcBlocker) {
      blockers.push(pvcBlocker);
    }
  }

  const postgresResult = run('kubectl', [
    '-n',
    namespace,
    'exec',
    'statefulset/postgres',
    '--',
    'sh',
    '-lc',
    'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ]);
  if (postgresResult.status !== 0) {
    blockers.push(runtimeProofBlocker('Postgres pg_isready', postgresResult));
  }

  const redisResult = run('kubectl', ['-n', namespace, 'exec', 'statefulset/redis', '--', 'redis-cli', 'ping']);
  if (redisResult.status !== 0 || !/\bPONG\b/i.test(redisResult.stdout)) {
    blockers.push(runtimeProofBlocker('Redis PONG', redisResult));
  }

  const kafkaResult = run('kubectl', [
    '-n',
    namespace,
    'exec',
    'statefulset/kafka',
    '--',
    'kafka-topics',
    '--bootstrap-server',
    'localhost:9092',
    '--list'
  ]);
  if (kafkaResult.status !== 0) {
    blockers.push(runtimeProofBlocker('Kafka topic list', kafkaResult));
  } else {
    const missingTopics = requiredTopics.filter((topic) => !kafkaResult.stdout.split(/\s+/).includes(topic));
    if (missingTopics.length > 0) {
      blockers.push(`BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF runtime proof is missing: Kafka topics missing ${missingTopics.join(', ')}.`);
    }
  }

  const elasticsearchResult = run('kubectl', [
    '-n',
    namespace,
    'exec',
    'statefulset/elasticsearch',
    '--',
    'curl',
    '-fsS',
    'http://localhost:9200/_cluster/health'
  ]);
  if (elasticsearchResult.status !== 0) {
    blockers.push(runtimeProofBlocker('Elasticsearch health', elasticsearchResult));
  }

  return blockers;
}

function pvcStatusBlocker(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return 'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF runtime proof is missing: PVC check returned invalid JSON.';
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length === 0) {
    return 'BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF runtime proof is missing: no PVCs found in the production namespace.';
  }

  const unbound = items
    .filter((item) => item?.status?.phase !== 'Bound')
    .map((item) => item?.metadata?.name ?? '<unknown>');
  if (unbound.length > 0) {
    return `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF runtime proof is missing: PVCs not Bound ${unbound.join(', ')}.`;
  }

  return '';
}

function runtimeProofBlocker(label, result) {
  const detail = firstLine(result.stderr) || firstLine(result.stdout) || `exit ${result.status ?? 'unknown'}`;
  return `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF runtime proof is missing: ${label} failed (${detail}).`;
}

function firstLine(value) {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? '';
}

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function missingMigrationCutoverApprovalFlagBlockers(env) {
  return requiredMigrationCutoverApprovalFlags
    .filter(([name]) => env[name] !== '1')
    .map(([name, label]) => `${name}=1 is not set for the required migration/cutover ${label}.`);
}

function migrationCutoverRouteTargetBlockers(env) {
  const namespace = env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
  const webUrl = trimTrailingSlash(env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
  let routePaths;
  try {
    routePaths = parseRoutePaths(env.BOOKMARKET_CUTOVER_ROUTE_PATHS ?? '/login,/home');
  } catch (error) {
    return [
      `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF route proof is missing: ${error instanceof Error ? error.message : String(error)}`
    ];
  }

  try {
    const { mismatches } = compareK3sPublicRouteTargets({
      namespace,
      webUrl,
      routePaths,
      routeDescription: 'Normal UI route',
      failOnMismatch: false
    });
    if (mismatches.length === 0) {
      return [];
    }

    const mismatchRoutes = mismatches.map((mismatch) => mismatch.routePath).join(', ');
    return [
      `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF route proof is missing: public normal UI route asset fingerprints do not match direct k3s web pod fingerprints for ${mismatchRoutes}.`
    ];
  } catch (error) {
    return [
      `BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF route proof is missing: ${error instanceof Error ? error.message : String(error)}`
    ];
  }
}
