#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const composeFile = 'infra/docker-compose/docker-compose.yml';
const args = new Set(process.argv.slice(2));
const help = args.has('--help') || args.has('-h');
const leaveRunning = args.has('--leave-running');
const allowedArgs = new Set(['--help', '-h', '--leave-running']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const healthContainers = {
  postgres: 'bookmarket-v2-postgres',
  redis: 'bookmarket-v2-redis',
  kafka: 'bookmarket-v2-kafka',
  elasticsearch: 'bookmarket-v2-elasticsearch'
};
const kafkaInitContainer = 'bookmarket-v2-kafka-init';
const expectedKafkaTopics = [
  'bookmark.events',
  'metadata.jobs',
  'metadata.events',
  'search.jobs',
  'bookmark.events.dlq',
  'metadata.jobs.dlq',
  'metadata.events.dlq',
  'search.jobs.dlq'
];

if (help) {
  usage();
  process.exit(0);
}
if (unknownArgs.length > 0) {
  fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}

const existingContainers = listComposeContainers();
const startedFreshStack = existingContainers.length === 0;

try {
  info('Validating rendered Compose config.');
  run('Docker Compose config', 'docker', ['compose', '-f', composeFile, 'config', '-q']);

  if (startedFreshStack) {
    info('No existing Bookmarket Compose containers found; this smoke will stop the stack afterward.');
  } else {
    info('Existing Bookmarket Compose containers found; this smoke will leave them running.');
  }

  run('Start Docker Compose stack', 'docker', ['compose', '-f', composeFile, 'up', '-d']);
  await waitForHealthyStack();
  probePostgres();
  probeRedis();
  probeKafkaTopics();
  probeElasticsearch();
  info(`Docker Compose runtime smoke passed: ${Object.keys(healthContainers).length} ready services and ${expectedKafkaTopics.length} Kafka topics.`);
} finally {
  if (startedFreshStack && !leaveRunning) {
    const result = run('Stop Docker Compose stack', 'docker', ['compose', '-f', composeFile, 'down'], { exitOnFailure: false });
    if (result.status !== 0) {
      info('Docker Compose stack cleanup failed; inspect containers manually before rerunning.');
    }
  }
}

function usage() {
  console.log(`Usage: node scripts/docker-compose-smoke.mjs [--leave-running]

Starts the local dependency-only Docker Compose stack, waits for Postgres, Redis, Kafka, and Elasticsearch health, verifies required Kafka topics, and probes each service. If no Bookmarket Compose containers existed before the smoke, containers are stopped afterward without deleting volumes.
`);
}

async function waitForHealthyStack() {
  const startedAt = Date.now();
  const timeoutMs = parsePositiveInteger(process.env.BOOKMARKET_COMPOSE_SMOKE_TIMEOUT_MS, 600_000);
  const elasticsearchDirectProbeGraceMs = 60_000;
  const elasticsearchDirectProbeIntervalMs = 15_000;
  let lastElasticsearchDirectProbeAt = 0;
  let lastStatus = '';

  while (Date.now() - startedAt < timeoutMs) {
    const elapsedMs = Date.now() - startedAt;
    const statuses = Object.entries(healthContainers).map(([service, container]) => {
      const health = inspect(container, '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}');
      return [service, health || 'missing'];
    });
    const kafkaInitStatus = inspect(kafkaInitContainer, '{{.State.Status}}:{{.State.ExitCode}}') || 'missing';
    lastStatus = [...statuses.map(([service, health]) => `${service}=${health}`), `kafka-init=${kafkaInitStatus}`].join(', ');

    const servicesHealthy = statuses.every(([, health]) => health === 'healthy');
    const kafkaInitComplete = kafkaInitStatus === 'exited:0';
    if (servicesHealthy && kafkaInitComplete) {
      info(`Stack healthy: ${lastStatus}`);
      return;
    }

    const nonElasticsearchServicesHealthy = statuses.every(([service, health]) => service === 'elasticsearch' || health === 'healthy');
    const shouldProbeElasticsearchDirectly =
      kafkaInitComplete &&
      nonElasticsearchServicesHealthy &&
      elapsedMs >= elasticsearchDirectProbeGraceMs &&
      Date.now() - lastElasticsearchDirectProbeAt >= elasticsearchDirectProbeIntervalMs;

    if (shouldProbeElasticsearchDirectly) {
      lastElasticsearchDirectProbeAt = Date.now();
      if (probeElasticsearch({ exitOnFailure: false, label: 'Elasticsearch direct readiness probe while waiting' })) {
        info(`Stack readiness accepted by direct Elasticsearch probe while Docker health was still updating: ${lastStatus}`);
        return;
      }
    }

    await sleep(3_000);
  }

  fail(`Docker Compose stack did not become healthy within ${Math.round(timeoutMs / 1000)}s. Last status: ${lastStatus}`);
}

function probePostgres() {
  run('Postgres readiness probe', 'docker', composeExecArgs('postgres', ['pg_isready', '-U', 'bookmarket', '-d', 'bookmarket']));
}

function probeRedis() {
  const result = run('Redis ping probe', 'docker', composeExecArgs('redis', ['redis-cli', 'ping']));
  if (!result.stdout.includes('PONG')) {
    fail(`Redis ping did not return PONG. Output: ${result.stdout.trim()}`);
  }
}

function probeKafkaTopics() {
  const result = run(
    'Kafka topic probe',
    'docker',
    composeExecArgs('kafka', ['kafka-topics', '--bootstrap-server', 'localhost:9092', '--list'])
  );
  const topics = new Set(result.stdout.split(/\s+/).filter(Boolean));
  const missingTopics = expectedKafkaTopics.filter((topic) => !topics.has(topic));
  if (missingTopics.length > 0) {
    fail(`Kafka topic probe is missing topic(s): ${missingTopics.join(', ')}`);
  }
}

function probeElasticsearch(options = {}) {
  const label = options.label ?? 'Elasticsearch health probe';
  const result = run(
    label,
    'docker',
    composeExecArgs('elasticsearch', ['curl', '-fsS', 'http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=10s']),
    { exitOnFailure: options.exitOnFailure }
  );
  if (result.status !== 0) {
    return false;
  }
  if (!/"status"\s*:\s*"(yellow|green)"/.test(result.stdout)) {
    if (options.exitOnFailure === false) {
      return false;
    }
    fail(`Elasticsearch health probe did not return yellow/green status. Output: ${result.stdout.trim()}`);
  }
  return true;
}

function composeExecArgs(service, commandArgs) {
  return ['compose', '-f', composeFile, 'exec', '-T', service, ...commandArgs];
}

function listComposeContainers() {
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'ps', '--all', '--format', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    return [];
  }
  return parseComposeJsonLines(result.stdout);
}

function parseComposeJsonLines(output) {
  const trimmed = output.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split('\n')
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

function inspect(container, template) {
  const result = spawnSync('docker', ['inspect', '-f', template, container], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) {
    return '';
  }
  return (result.stdout ?? '').trim();
}

function run(label, command, commandArgs, options = {}) {
  info(`${label}: ${[command, ...commandArgs].join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs ?? 300_000
  });

  if (result.status !== 0 && options.exitOnFailure !== false) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    fail(`${label} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : '.'}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`BOOKMARKET_COMPOSE_SMOKE_TIMEOUT_MS must be a positive integer number of milliseconds, got ${value}.`);
  }
  return parsed;
}

function info(message) {
  console.log(`[compose-smoke] ${message}`);
}

function fail(message) {
  console.error(`[compose-smoke] ${message}`);
  process.exit(1);
}
