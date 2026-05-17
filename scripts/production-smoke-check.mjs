#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {
  missingAuthenticatedProdOracleFields,
  missingBackupSignoffFields,
  missingOAuthSmokeSignoffFields,
  missingProductionTestAccountSignoffFields
} from './lib/release-signoffs.mjs';
import { productionKubeContextBlocker } from './lib/production-context.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const includeRestarts = args.has('--include-restarts') || process.env.BOOKMARKET_INCLUDE_RESTARTS === '1';
const requireRestarts = args.has('--require-restarts') || process.env.BOOKMARKET_REQUIRE_RESTARTS === '1';
const requireTestAccount = args.has('--require-test-account') || process.env.BOOKMARKET_REQUIRE_TEST_ACCOUNT_SMOKE === '1';
const requireAuthenticatedOracle =
  args.has('--require-authenticated-oracle') || process.env.BOOKMARKET_REQUIRE_AUTHENTICATED_ORACLE === '1';

const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
const secretName = process.env.BOOKMARKET_APP_SECRET_NAME ?? 'bookmarket-app-secrets';
const webTlsSecretName = process.env.BOOKMARKET_WEB_TLS_SECRET_NAME ?? 'bookmarket-web-tls';
const apiTlsSecretName = process.env.BOOKMARKET_API_TLS_SECRET_NAME ?? 'bookmarket-api-tls';
const expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT;
const webUrl = trimTrailingSlash(process.env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
const apiUrl = trimTrailingSlash(process.env.BOOKMARKET_API_URL ?? 'https://api.bmkt.ericjypark.com');
const publicProfileUsername = process.env.BOOKMARKET_PUBLIC_PROFILE_USERNAME;
const runPublicVisual = process.env.BOOKMARKET_RUN_PUBLIC_VISUAL === '1';
const oauthSmokeSignoff = (process.env.BOOKMARKET_OAUTH_SMOKE_SIGNOFF ?? '').trim();
const backupSignoff = (process.env.BOOKMARKET_BACKUP_SIGNOFF ?? '').trim();
const testAccountSignoff = (process.env.BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF ?? '').trim();
const authenticatedOracleSignoff = (process.env.BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF ?? '').trim();
const releaseDate = (process.env.BOOKMARKET_RELEASE_DATE ?? localDate(new Date())).trim();

const requiredSecretKeys = ['database-user', 'database-password', 'jwt-secret'];
const requiredTlsSecretKeys = ['tls.crt', 'tls.key'];
const optionalSecretKeys = [
  'google-client-id',
  'google-client-secret',
  'github-client-id',
  'github-client-secret',
  'search-rebuild-token'
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

main();

function main() {
  info('Bookmarket production smoke check');
  info(`Namespace: ${namespace}`);
  info(`Web URL: ${webUrl}`);
  info(`API URL: ${apiUrl}`);
  info(`Web TLS secret: ${webTlsSecretName}`);
  info(`API TLS secret: ${apiTlsSecretName}`);

  if (dryRun) {
    info('Dry run: printing commands without executing them.');
  } else if (!expectedContext) {
    fail(
      'Set BOOKMARKET_PROD_KUBE_CONTEXT to the exact Raspberry Pi k3s context before running production smoke checks.'
    );
  }

  const currentContext = run('Read active kube context', 'kubectl', ['config', 'current-context'], {
    capture: true
  }).trim();

  if (!dryRun) {
    const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
    if (contextBlocker) {
      fail(`${contextBlocker} Refusing to run smoke checks.`);
    }
  }

  assertOAuthProviderSmokeSignoff();
  assertBackupSignoff();
  assertTestAccountSmokeSignoff();
  assertAuthenticatedProdOracleSignoff();
  assertRestartRequirement();

  run('Terraform init', 'terraform', ['-chdir=infra/terraform/pi', 'init', '-backend=false']);
  run('Terraform plan', 'terraform', terraformPlanArgs());

  const secretJson = run('Read app secret metadata', 'kubectl', ['-n', namespace, 'get', 'secret', secretName, '-o', 'json'], {
    capture: true
  });
  let appSecret = null;
  if (!dryRun) {
    appSecret = assertSecretKeys(secretJson);
  }
  const webTlsSecretJson = run('Read web TLS secret metadata', 'kubectl', [
    '-n',
    namespace,
    'get',
    'secret',
    webTlsSecretName,
    '-o',
    'json'
  ], { capture: true });
  if (!dryRun) {
    assertTlsSecretKeys(webTlsSecretName, webTlsSecretJson);
  }
  const apiTlsSecretJson = run('Read API TLS secret metadata', 'kubectl', [
    '-n',
    namespace,
    'get',
    'secret',
    apiTlsSecretName,
    '-o',
    'json'
  ], { capture: true });
  if (!dryRun) {
    assertTlsSecretKeys(apiTlsSecretName, apiTlsSecretJson);
  }

  run('List pods', 'kubectl', ['-n', namespace, 'get', 'pods', '-o', 'wide']);
  run('List PVCs', 'kubectl', ['-n', namespace, 'get', 'pvc']);

  for (const workload of [
    'deployment/web',
    'deployment/api',
    'deployment/metadata-worker',
    'statefulset/postgres',
    'statefulset/redis',
    'statefulset/kafka',
    'statefulset/elasticsearch'
  ]) {
    run(`Rollout status ${workload}`, 'kubectl', ['-n', namespace, 'rollout', 'status', workload, '--timeout=180s']);
  }

  run('Wait for Kafka topic init job', 'kubectl', [
    '-n',
    namespace,
    'wait',
    '--for=condition=complete',
    'job/kafka-topics-init',
    '--timeout=120s'
  ]);

  run('Web health', 'curl', ['-fsS', `${webUrl}/health`]);
  run('API health', 'curl', ['-fsS', `${apiUrl}/health`]);
  run('API readiness', 'curl', ['-fsS', `${apiUrl}/actuator/health/readiness`]);

  if (publicProfileUsername) {
    run('Public profile HTTP check', 'curl', ['-fsS', `${webUrl}/s/${publicProfileUsername}`]);
  } else {
    info('Skipping public profile HTTP check; set BOOKMARKET_PUBLIC_PROFILE_USERNAME to enable it.');
  }

  run('Postgres readiness in cluster', 'kubectl', [
    '-n',
    namespace,
    'exec',
    'statefulset/postgres',
    '--',
    'sh',
    '-lc',
    'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ]);
  run('Redis ping in cluster', 'kubectl', ['-n', namespace, 'exec', 'statefulset/redis', '--', 'redis-cli', 'ping']);
  const kafkaTopics = run('Kafka topic list in cluster', 'kubectl', [
    '-n',
    namespace,
    'exec',
    'statefulset/kafka',
    '--',
    'kafka-topics',
    '--bootstrap-server',
    'localhost:9092',
    '--list'
  ], { capture: true });
  if (!dryRun) {
    assertKafkaTopics(kafkaTopics);
  }
  run('Elasticsearch health in cluster', 'kubectl', [
    '-n',
    namespace,
    'exec',
    'statefulset/elasticsearch',
    '--',
    'curl',
    '-fsS',
    'http://localhost:9200/_cluster/health'
  ]);
  runSearchRebuildSmoke(appSecret);

  if (runPublicVisual) {
    run('Read-only public visual baseline', 'pnpm', ['test:v1-visual:public'], {
      env: {
        BOOKMARKET_BASE_URL: webUrl
      }
    });
  } else {
    info('Skipping Playwright public visual baseline; set BOOKMARKET_RUN_PUBLIC_VISUAL=1 to enable it.');
  }

  if (includeRestarts) {
    if (!dryRun && process.env.BOOKMARKET_RESTART_SMOKE_APPROVED !== '1') {
      fail('Restart smoke requires BOOKMARKET_RESTART_SMOKE_APPROVED=1 because it restarts production pods.');
    }
    runRestartSmoke();
  } else {
    info('Skipping restart/PVC survival smoke; pass --include-restarts and set BOOKMARKET_RESTART_SMOKE_APPROVED=1.');
  }

  if (includeRestarts) {
    info('Full production smoke check completed with restart/PVC survival coverage.');
    if (!dryRun && requireTestAccount && requireAuthenticatedOracle) {
      info('After this real full release smoke, set BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF with this template:');
      info(
        `BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF='${releaseDate}: pnpm smoke:production:release passed on Raspberry Pi k3s production context ${expectedContext}; web health, API readiness, pod rollout and PVC checks passed; Postgres pg_isready, Redis PONG, Kafka topics, Elasticsearch health, and restart/PVC survival completed'`
      );
    }
  } else {
    info('Basic production smoke check completed; restart/PVC survival is not covered.');
  }
}

function assertOAuthProviderSmokeSignoff() {
  if (dryRun) {
    info(
      'OAuth provider smoke signoff gate: set BOOKMARKET_OAUTH_SMOKE_SIGNOFF after Google and GitHub pass with the local/staging OAuth app, a dedicated provider test account or explicitly approved operator Chrome credentials, v2 route target proof, avatar/profile menu evidence, and /api/v1/users/me identity confirmation.'
    );
    return;
  }

  const missingFields = missingOAuthSmokeSignoffFields(oauthSmokeSignoff);
  if (missingFields.length > 0) {
    fail(
      `Set BOOKMARKET_OAUTH_SMOKE_SIGNOFF to a release-note summary after provider smoke passes. Missing: ${missingFields.join(', ')}.`
    );
  }

  info('OAuth provider smoke signoff accepted.');
}

function assertBackupSignoff() {
  if (dryRun) {
    info('Database backup signoff gate: set BOOKMARKET_BACKUP_SIGNOFF after the pre-switch backup exists and restore-check or pg_restore rehearsal passes.');
    return;
  }

  const missingFields = missingBackupSignoffFields(backupSignoff);
  if (missingFields.length > 0) {
    fail(`Set BOOKMARKET_BACKUP_SIGNOFF to a backup release-note summary before production smoke. Missing: ${missingFields.join(', ')}.`);
  }

  info('Database backup signoff accepted.');
}

function assertTestAccountSmokeSignoff() {
  if (!requireTestAccount) {
    return;
  }

  if (dryRun) {
    info(
      'Test-account smoke signoff gate: set BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF after disposable bookmark/category CRUD, metadata/refetch, cleanup, and no-real-user-data checks pass.'
    );
    return;
  }

  const missingFields = missingProductionTestAccountSignoffFields(testAccountSignoff);
  if (missingFields.length > 0) {
    fail(
      `Set BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF to a production test-account smoke summary. Missing: ${missingFields.join(', ')}.`
    );
  }

  info('Production test-account smoke signoff accepted.');
}

function assertAuthenticatedProdOracleSignoff() {
  if (!requireAuthenticatedOracle) {
    return;
  }

  if (dryRun) {
    info(
      'Authenticated production-oracle signoff gate: set BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF after pnpm smoke:authenticated-prod-oracle passes read-only v1 production inspection for /home, bookmark list layout, category filters, command menu, profile/subdomain UI, and public profile behavior.'
    );
    return;
  }

  const missingFields = missingAuthenticatedProdOracleFields(authenticatedOracleSignoff);
  if (missingFields.length > 0) {
    fail(
      `Set BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF to a read-only authenticated production-oracle summary. Missing: ${missingFields.join(', ')}.`
    );
  }

  info('Authenticated production-oracle signoff accepted.');
}

function assertRestartRequirement() {
  if (!requireRestarts) {
    return;
  }

  if (dryRun) {
    info('Restart/PVC survival is required for this run; dry-run mode will print the command plan only.');
    return;
  }

  if (!includeRestarts) {
    fail('Restart/PVC survival is required for this run. Pass --include-restarts and set BOOKMARKET_RESTART_SMOKE_APPROVED=1.');
  }
}

function runRestartSmoke() {
  for (const deployment of ['api', 'metadata-worker', 'web']) {
    run(`Restart deployment/${deployment}`, 'kubectl', ['-n', namespace, 'rollout', 'restart', `deployment/${deployment}`]);
    run(`Rollout status deployment/${deployment}`, 'kubectl', [
      '-n',
      namespace,
      'rollout',
      'status',
      `deployment/${deployment}`,
      '--timeout=180s'
    ]);
  }

  for (const app of ['postgres', 'redis', 'kafka', 'elasticsearch']) {
    run(`Delete ${app} pod for PVC survival check`, 'kubectl', ['-n', namespace, 'delete', 'pod', '-l', `app=${app}`]);
    run(`Rollout status statefulset/${app}`, 'kubectl', [
      '-n',
      namespace,
      'rollout',
      'status',
      `statefulset/${app}`,
      '--timeout=240s'
    ]);
  }
}

function run(label, command, commandArgs, options = {}) {
  const renderedArgs = options.redactedArgs ?? commandArgs;
  const rendered = [command, ...renderedArgs.map(shellQuote)].join(' ');
  info(`${label}: ${rendered}`);

  if (dryRun) {
    return '';
  }

  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(options.env ?? {})
    },
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }

  return result.stdout ?? '';
}

function assertSecretKeys(secretJson) {
  const secret = JSON.parse(secretJson);
  const keys = new Set(Object.keys(secret.data ?? {}));
  for (const key of requiredSecretKeys) {
    if (!keys.has(key)) {
      fail(`Secret ${secretName} is missing required key: ${key}`);
    }
  }
  for (const key of optionalSecretKeys) {
    if (!keys.has(key)) {
      info(`Secret ${secretName} does not include optional key: ${key}`);
    }
  }
  return secret;
}

function assertTlsSecretKeys(tlsSecretName, secretJson) {
  const secret = JSON.parse(secretJson);
  if (secret.type && secret.type !== 'kubernetes.io/tls') {
    fail(`${tlsSecretName} must be type kubernetes.io/tls; found ${secret.type}`);
  }

  const keys = new Set(Object.keys(secret.data ?? {}));
  for (const key of requiredTlsSecretKeys) {
    if (!keys.has(key)) {
      fail(`Secret ${tlsSecretName} is missing required TLS key: ${key}`);
    }
  }
  info(`TLS secret ${tlsSecretName} required keys present: ${requiredTlsSecretKeys.join(', ')}`);
}

function runSearchRebuildSmoke(secret) {
  if (dryRun) {
    info(
      `Search rebuild smoke: if ${secretName} includes search-rebuild-token, POST ${apiUrl}/api/v1/ops/search/bookmarks/rebuild with X-Bookmarket-Ops-Token.`
    );
    return;
  }

  const encodedToken = secret?.data?.['search-rebuild-token'];
  if (!encodedToken) {
    info(`Skipping search rebuild smoke; secret ${secretName} does not include optional key: search-rebuild-token.`);
    return;
  }

  const token = Buffer.from(encodedToken, 'base64').toString('utf8').trim();
  if (!token) {
    fail(`Secret ${secretName} key search-rebuild-token is present but empty.`);
  }

  run('Search rebuild from Postgres', 'curl', [
    '-fsS',
    '-X',
    'POST',
    '-H',
    `X-Bookmarket-Ops-Token: ${token}`,
    `${apiUrl}/api/v1/ops/search/bookmarks/rebuild`
  ], {
    redactedArgs: [
      '-fsS',
      '-X',
      'POST',
      '-H',
      'X-Bookmarket-Ops-Token: <redacted>',
      `${apiUrl}/api/v1/ops/search/bookmarks/rebuild`
    ]
  });
}

function assertKafkaTopics(topicOutput) {
  const topics = new Set(topicOutput.split(/\s+/).filter(Boolean));
  for (const topic of requiredTopics) {
    if (!topics.has(topic)) {
      fail(`Kafka topic is missing: ${topic}`);
    }
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function terraformPlanArgs() {
  const args = ['-chdir=infra/terraform/pi', 'plan', '-input=false', '-lock=false', '-no-color'];
  const vars = terraformVarArgs();
  if (vars.length > 0) {
    args.push(...vars);
  }
  if (expectedContext) {
    args.push('-detailed-exitcode');
  }
  return args;
}

function terraformVarArgs() {
  const vars = [];
  addTerraformVar(
    vars,
    'kubeconfig_path',
    resolveRepoPath(process.env.TF_VAR_kubeconfig_path ?? firstKubeconfigPath(process.env.KUBECONFIG))
  );
  addTerraformVar(vars, 'domain', process.env.TF_VAR_domain ?? hostnameFromUrl(webUrl));
  addTerraformVar(vars, 'api_host', process.env.TF_VAR_api_host ?? hostnameFromUrl(apiUrl));
  addTerraformVar(vars, 'web_tls_secret_name', process.env.TF_VAR_web_tls_secret_name ?? webTlsSecretName);
  addTerraformVar(vars, 'api_tls_secret_name', process.env.TF_VAR_api_tls_secret_name ?? apiTlsSecretName);
  addTerraformVar(vars, 'web_image', process.env.TF_VAR_web_image ?? process.env.BOOKMARKET_WEB_IMAGE);
  addTerraformVar(vars, 'api_image', process.env.TF_VAR_api_image ?? process.env.BOOKMARKET_API_IMAGE);
  addTerraformVar(
    vars,
    'metadata_worker_image',
    process.env.TF_VAR_metadata_worker_image ?? process.env.BOOKMARKET_METADATA_WORKER_IMAGE
  );
  return vars;
}

function addTerraformVar(vars, name, value) {
  const trimmed = (value ?? '').trim();
  if (trimmed) {
    vars.push(`-var=${name}=${trimmed}`);
  }
}

function firstKubeconfigPath(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.split(':').find(Boolean) ?? '';
}

function resolveRepoPath(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed || path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(process.cwd(), trimmed);
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function localDate(date) {
  const timeZone = process.env.TZ || 'Asia/Seoul';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function info(message) {
  console.log(`[production-smoke] ${message}`);
}

function fail(message) {
  console.error(`[production-smoke] ${message}`);
  process.exit(1);
}
