#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const composeFile = 'infra/docker-compose/docker-compose.yml';
const expectedServices = ['elasticsearch', 'kafka', 'kafka-init', 'postgres', 'redis'];
const expectedVolumes = ['elasticsearch-data', 'kafka-data', 'postgres-data', 'redis-data'];
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

const compose = readComposeConfig();
const failures = [];

assertEqual(compose.name, 'bookmarket-v2', 'Compose project name must stay bookmarket-v2.');
assertArrayEqual(Object.keys(compose.services ?? {}).sort(), expectedServices, 'Compose services must remain the local dependency-only stack.');
assertArrayEqual(Object.keys(compose.volumes ?? {}).sort(), expectedVolumes, 'Compose volumes must preserve stateful dependency storage.');

validatePostgres();
validateRedis();
validateKafka();
validateKafkaInit();
validateElasticsearch();

if (failures.length > 0) {
  console.error('Docker Compose stack validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Docker Compose stack validated: ${expectedServices.length} services, ${expectedVolumes.length} volumes, ${expectedKafkaTopics.length} Kafka topics.`
);

function validatePostgres() {
  const service = requireService('postgres');
  assertEqual(service.image, 'postgres:17-alpine', 'Postgres image must remain postgres:17-alpine.');
  assertEqual(service.container_name, 'bookmarket-v2-postgres', 'Postgres container name must stay stable.');
  assertEnvironment(service, {
    POSTGRES_DB: 'bookmarket',
    POSTGRES_USER: 'bookmarket',
    POSTGRES_PASSWORD: 'bookmarket'
  });
  assertPort(service, 5432, '5432');
  assertHealthcheck(service, ['pg_isready', '-U bookmarket', '-d bookmarket']);
  assertVolume(service, 'postgres-data', '/var/lib/postgresql/data');
  assertBindMount(service, 'services/api/src/main/resources/db/migration', '/docker-entrypoint-initdb.d', true);
}

function validateRedis() {
  const service = requireService('redis');
  assertEqual(service.image, 'redis:7.4-alpine', 'Redis image must remain redis:7.4-alpine.');
  assertEqual(service.container_name, 'bookmarket-v2-redis', 'Redis container name must stay stable.');
  assertArrayEqual(service.command ?? [], ['redis-server', '--appendonly', 'yes'], 'Redis must run with append-only persistence enabled.');
  assertPort(service, 6379, '6379');
  assertHealthcheck(service, ['redis-cli', 'ping']);
  assertVolume(service, 'redis-data', '/data');
}

function validateKafka() {
  const service = requireService('kafka');
  assertEqual(service.image, 'confluentinc/cp-kafka:7.9.0', 'Kafka image must remain confluentinc/cp-kafka:7.9.0.');
  assertEqual(service.container_name, 'bookmarket-v2-kafka', 'Kafka container name must stay stable.');
  assertEnvironment(service, {
    KAFKA_NODE_ID: '1',
    KAFKA_PROCESS_ROLES: 'broker,controller',
    KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093',
    KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
    KAFKA_INTER_BROKER_LISTENER_NAME: 'INTERNAL',
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false',
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
    KAFKA_LOG_DIRS: '/var/lib/kafka/data'
  });
  assertEnvironmentContains(service, 'KAFKA_LISTENERS', ['INTERNAL://kafka:29092', 'EXTERNAL://0.0.0.0:9092', 'CONTROLLER://kafka:9093']);
  assertEnvironmentContains(service, 'KAFKA_ADVERTISED_LISTENERS', ['INTERNAL://kafka:29092', 'EXTERNAL://localhost:9092']);
  assertEnvironmentContains(service, 'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP', ['INTERNAL:PLAINTEXT', 'EXTERNAL:PLAINTEXT', 'CONTROLLER:PLAINTEXT']);
  assertPort(service, 9092, '9092');
  assertHealthcheck(service, ['kafka-topics', '--bootstrap-server localhost:9092', '--list']);
  assertVolume(service, 'kafka-data', '/var/lib/kafka/data');
}

function validateKafkaInit() {
  const service = requireService('kafka-init');
  assertEqual(service.image, 'confluentinc/cp-kafka:7.9.0', 'Kafka init image must match the Kafka broker image.');
  assertEqual(service.container_name, 'bookmarket-v2-kafka-init', 'Kafka init container name must stay stable.');
  assertEqual(service.restart, 'no', 'Kafka init must run once without restarting.');
  assertArrayEqual(service.entrypoint ?? [], ['/bin/bash', '-c'], 'Kafka init must use the shell entrypoint for topic creation.');
  assertEqual(service.depends_on?.kafka?.condition, 'service_healthy', 'Kafka init must wait for the Kafka healthcheck.');

  const command = commandText(service);
  assertContains(command, '--bootstrap-server kafka:29092', 'Kafka init must create topics through the internal listener.');
  assertContains(command, '--create --if-not-exists', 'Kafka init must create topics idempotently.');
  for (const topic of expectedKafkaTopics) {
    assertContains(command, topic, `Kafka init is missing required topic ${topic}.`);
  }
}

function validateElasticsearch() {
  const service = requireService('elasticsearch');
  assertEqual(
    service.image,
    'docker.elastic.co/elasticsearch/elasticsearch:8.17.1',
    'Elasticsearch image must remain docker.elastic.co/elasticsearch/elasticsearch:8.17.1.'
  );
  assertEqual(service.container_name, 'bookmarket-v2-elasticsearch', 'Elasticsearch container name must stay stable.');
  assertEnvironment(service, {
    'discovery.type': 'single-node',
    'xpack.security.enabled': 'false',
    ES_JAVA_OPTS: '-Xms512m -Xmx512m',
    _JAVA_OPTIONS: '-XX:UseSVE=0',
    'cluster.routing.allocation.disk.threshold_enabled': 'false'
  });
  assertPort(service, 9200, '9200');
  assertHealthcheck(service, ['curl -fsS', 'http://localhost:9200/_cluster/health', 'wait_for_status=yellow']);
  assertVolume(service, 'elasticsearch-data', '/usr/share/elasticsearch/data');
}

function readComposeConfig() {
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'config', '--format', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    fail(`Unable to render Docker Compose config${stderr ? `: ${stderr}` : '.'}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`Docker Compose JSON output could not be parsed: ${error.message}`);
  }
}

function requireService(name) {
  const service = compose.services?.[name];
  if (!service) {
    failures.push(`Missing Compose service ${name}.`);
    return {};
  }
  return service;
}

function assertEnvironment(service, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(service.environment?.[key], value, `${service.container_name ?? 'service'} environment ${key} must be ${value}.`);
  }
}

function assertEnvironmentContains(service, key, expectedParts) {
  const value = service.environment?.[key] ?? '';
  for (const part of expectedParts) {
    assertContains(value, part, `${service.container_name ?? 'service'} environment ${key} is missing ${part}.`);
  }
}

function assertPort(service, target, published) {
  const port = (service.ports ?? []).find((candidate) => candidate.target === target && candidate.published === published);
  if (!port) {
    failures.push(`${service.container_name ?? 'service'} must publish ${published}:${target}.`);
  }
}

function assertHealthcheck(service, expectedParts) {
  const healthcheck = (service.healthcheck?.test ?? []).join(' ');
  if (!healthcheck) {
    failures.push(`${service.container_name ?? 'service'} must define a healthcheck.`);
    return;
  }
  for (const part of expectedParts) {
    assertContains(healthcheck, part, `${service.container_name ?? 'service'} healthcheck is missing ${part}.`);
  }
}

function assertVolume(service, source, target) {
  const volume = (service.volumes ?? []).find(
    (candidate) => candidate.type === 'volume' && candidate.source === source && candidate.target === target
  );
  if (!volume) {
    failures.push(`${service.container_name ?? 'service'} must mount volume ${source} at ${target}.`);
  }
}

function assertBindMount(service, sourceSuffix, target, readOnly) {
  const normalizedSuffix = sourceSuffix.split('/').join(pathSeparatorPattern());
  const mount = (service.volumes ?? []).find((candidate) => {
    const source = candidate.source ?? '';
    return (
      candidate.type === 'bind' &&
      new RegExp(`${normalizedSuffix}$`).test(source) &&
      candidate.target === target &&
      Boolean(candidate.read_only) === readOnly
    );
  });
  if (!mount) {
    failures.push(`${service.container_name ?? 'service'} must bind ${sourceSuffix} to ${target}${readOnly ? ' read-only' : ''}.`);
  }
}

function commandText(service) {
  const command = service.command ?? '';
  if (Array.isArray(command)) {
    return command.join('\n');
  }
  return String(command);
}

function assertArrayEqual(actual, expected, message) {
  const actualValue = JSON.stringify(actual);
  const expectedValue = JSON.stringify(expected);
  if (actualValue !== expectedValue) {
    failures.push(`${message} Expected ${expectedValue}, received ${actualValue}.`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failures.push(`${message} Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertContains(value, expected, message) {
  if (!String(value).includes(expected)) {
    failures.push(message);
  }
}

function pathSeparatorPattern() {
  return String.raw`[/\\]`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
