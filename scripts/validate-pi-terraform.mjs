#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terraformRoot = path.join(repoRoot, 'infra/terraform/pi');

const requiredModules = ['namespace', 'postgres', 'redis', 'kafka', 'elasticsearch', 'api', 'metadata_worker', 'web', 'ingress'];
const deployments = ['web', 'api', 'metadata-worker'];
const statefulSets = ['postgres', 'redis', 'kafka', 'elasticsearch'];
const requiredKafkaTopics = [
  'bookmark.events',
  'metadata.jobs',
  'metadata.events',
  'search.jobs',
  'bookmark.events.dlq',
  'metadata.jobs.dlq',
  'metadata.events.dlq',
  'search.jobs.dlq'
];

const maxMemoryRequestMi = 4096;
const maxMemoryLimitMi = 7168;
const maxCpuRequestMilli = 3000;

main();

function main() {
  const totals = { memoryRequestMi: 0, memoryLimitMi: 0, cpuRequestMilli: 0 };
  const rootMain = readTerraform('main.tf');

  for (const moduleName of requiredModules) {
    assertPattern(rootMain, new RegExp(`module\\s+"${escapeRegex(moduleName)}"\\s+\\{`), `Missing root Terraform module: ${moduleName}`);
  }

  for (const moduleName of deployments) {
    const source = readTerraform(`modules/${moduleName}/main.tf`);
    assertPattern(
      source,
      /resource\s+"kubernetes_deployment_v1"\s+"/,
      `Module ${moduleName} must define a Kubernetes Deployment.`
    );
    assertDeploymentSafety(moduleName, source);
    addResourceTotals(totals, moduleName, source);
  }

  for (const moduleName of statefulSets) {
    const source = readTerraform(`modules/${moduleName}/main.tf`);
    assertPattern(
      source,
      /resource\s+"kubernetes_stateful_set_v1"\s+"/,
      `Module ${moduleName} must define a Kubernetes StatefulSet.`
    );
    assertStatefulSafety(moduleName, source);
    addResourceTotals(totals, moduleName, source);
  }

  const kafkaSource = readTerraform('modules/kafka/main.tf');
  assertPattern(kafkaSource, /resource\s+"kubernetes_job_v1"\s+"kafka_topics"/, 'Kafka module must define kafka-topics-init Job.');
  for (const topic of requiredKafkaTopics) {
    assertPattern(kafkaSource, new RegExp(`\\b${escapeRegex(topic)}\\b`), `Kafka topic init job is missing topic: ${topic}`);
  }

  const ingressSource = readTerraform('modules/ingress/main.tf');
  const ingressVariablesSource = readTerraform('modules/ingress/variables.tf');
  const rootVariablesSource = readTerraform('variables.tf');
  assertPattern(ingressSource, /resource\s+"kubernetes_ingress_v1"\s+"web"/, 'Ingress module must define web ingress.');
  assertPattern(ingressSource, /resource\s+"kubernetes_ingress_v1"\s+"api"/, 'Ingress module must define api ingress.');
  assertPattern(ingressSource, /host\s+=\s+"\*\.\$\{var\.domain\}"/, 'Web ingress must include wildcard subdomain host for public profiles.');
  assertPattern(ingressSource, /tls\s+\{[\s\S]*var\.web_tls_secret_name/, 'Web ingress must reference the configured TLS secret.');
  assertPattern(ingressSource, /tls\s+\{[\s\S]*"\*\.\$\{var\.domain\}"/, 'Web ingress TLS hosts must include wildcard public-profile subdomains.');
  assertPattern(ingressSource, /tls\s+\{[\s\S]*var\.api_tls_secret_name/, 'API ingress must reference the configured TLS secret.');
  assertPattern(ingressSource, /hosts\s+=\s+\[var\.api_host\]/, 'API ingress TLS hosts must include api_host.');
  assertPattern(ingressVariablesSource, /variable\s+"web_tls_secret_name"/, 'Ingress module must expose web_tls_secret_name.');
  assertPattern(ingressVariablesSource, /variable\s+"api_tls_secret_name"/, 'Ingress module must expose api_tls_secret_name.');
  assertPattern(rootVariablesSource, /variable\s+"web_tls_secret_name"/, 'Root Terraform variables must expose web_tls_secret_name.');
  assertPattern(rootVariablesSource, /variable\s+"api_tls_secret_name"/, 'Root Terraform variables must expose api_tls_secret_name.');
  assertPattern(rootMain, /web_tls_secret_name\s+=\s+var\.web_tls_secret_name/, 'Root ingress module must pass web_tls_secret_name.');
  assertPattern(rootMain, /api_tls_secret_name\s+=\s+var\.api_tls_secret_name/, 'Root ingress module must pass api_tls_secret_name.');

  const apiSource = readTerraform('modules/api/main.tf');
  assertPattern(apiSource, /BOOKMARKET_SEARCH_REBUILD_TOKEN/, 'API module must wire the optional search rebuild token.');
  assertPattern(apiSource, /key\s+=\s+"search-rebuild-token"/, 'API module must read the search rebuild token from the app secret.');

  assertBudget(totals.memoryRequestMi <= maxMemoryRequestMi, `Memory requests ${totals.memoryRequestMi}Mi exceed ${maxMemoryRequestMi}Mi Pi budget.`);
  assertBudget(totals.memoryLimitMi <= maxMemoryLimitMi, `Memory limits ${totals.memoryLimitMi}Mi exceed ${maxMemoryLimitMi}Mi Pi budget.`);
  assertBudget(totals.cpuRequestMilli <= maxCpuRequestMilli, `CPU requests ${totals.cpuRequestMilli}m exceed ${maxCpuRequestMilli}m Pi budget.`);

  console.log(
    `Pi Terraform validated: ${deployments.length} Deployments, ${statefulSets.length} StatefulSets, ${requiredKafkaTopics.length} Kafka topics, ${totals.memoryRequestMi}Mi requested, ${totals.memoryLimitMi}Mi limited, ${totals.cpuRequestMilli}m CPU requested.`
  );
}

function assertDeploymentSafety(moduleName, source) {
  assertPattern(source, /strategy\s+\{[\s\S]*type\s+=\s+"RollingUpdate"/, `Deployment ${moduleName} must use RollingUpdate.`);
  assertPattern(source, /rolling_update\s+\{[\s\S]*max_unavailable\s+=\s+"0"/, `Deployment ${moduleName} must keep max_unavailable at 0.`);
  assertWorkloadHealthAndResources(`Deployment ${moduleName}`, source);
}

function assertStatefulSafety(moduleName, source) {
  assertWorkloadHealthAndResources(`StatefulSet ${moduleName}`, source);
  assertPattern(source, /volume_claim_template\s+\{/, `StatefulSet ${moduleName} must define a PVC template.`);
  assertPattern(source, /storage_class_name\s+=\s+var\.storage_class_name/, `StatefulSet ${moduleName} must use the configured storage class.`);
  assertPattern(source, /storage\s+=\s+"\d+(Mi|Gi|Ti)"/, `StatefulSet ${moduleName} must request persistent storage.`);
}

function assertWorkloadHealthAndResources(label, source) {
  assertPattern(source, /resources\s+\{[\s\S]*requests\s+=\s+\{[\s\S]*cpu\s+=\s+"[^"]+"[\s\S]*memory\s+=\s+"[^"]+"/, `${label} must set CPU and memory requests.`);
  assertPattern(source, /resources\s+\{[\s\S]*limits\s+=\s+\{[\s\S]*cpu\s+=\s+"[^"]+"[\s\S]*memory\s+=\s+"[^"]+"/, `${label} must set CPU and memory limits.`);
  assertPattern(source, /readiness_probe\s+\{/, `${label} must define a readiness probe.`);
  assertPattern(source, /liveness_probe\s+\{/, `${label} must define a liveness probe.`);
}

function addResourceTotals(totals, moduleName, source) {
  const resources = resourcePairs(source);
  assertBudget(resources.length > 0, `Module ${moduleName} must include at least one CPU/memory resource block.`);

  for (const resource of resources) {
    totals.memoryRequestMi += parseMemory(resource.requestMemory);
    totals.memoryLimitMi += parseMemory(resource.limitMemory);
    totals.cpuRequestMilli += parseCpu(resource.requestCpu);
  }
}

function resourcePairs(source) {
  const blocks = [];
  const pattern = /resources\s+\{\s*requests\s+=\s+\{(?<requests>[^}]+)\}\s*limits\s+=\s+\{(?<limits>[^}]+)\}\s*\}/g;
  for (const match of source.matchAll(pattern)) {
    const requestCpu = valueFor(match.groups.requests, 'cpu');
    const requestMemory = valueFor(match.groups.requests, 'memory');
    const limitMemory = valueFor(match.groups.limits, 'memory');
    if (requestCpu && requestMemory && limitMemory) {
      blocks.push({ requestCpu, requestMemory, limitMemory });
    }
  }
  return blocks;
}

function valueFor(block, name) {
  return block.match(new RegExp(`${name}\\s*=\\s+"([^"]+)"`))?.[1];
}

function parseMemory(value) {
  const match = value.match(/^(\d+)(Mi|Gi|Ti)$/);
  assertBudget(match, `Unsupported memory value: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'Mi') return amount;
  if (unit === 'Gi') return amount * 1024;
  return amount * 1024 * 1024;
}

function parseCpu(value) {
  const milli = value.match(/^(\d+)m$/);
  if (milli) return Number(milli[1]);
  const cores = value.match(/^(\d+)$/);
  assertBudget(cores, `Unsupported CPU value: ${value}`);
  return Number(cores[1]) * 1000;
}

function readTerraform(relativePath) {
  return fs.readFileSync(path.join(terraformRoot, relativePath), 'utf8');
}

function assertPattern(source, pattern, message) {
  if (!pattern.test(source)) {
    console.error(`[pi-terraform] ${message}`);
    process.exit(1);
  }
}

function assertBudget(condition, message) {
  if (!condition) {
    console.error(`[pi-terraform] ${message}`);
    process.exit(1);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
