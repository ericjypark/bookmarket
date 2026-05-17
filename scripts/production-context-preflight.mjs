#!/usr/bin/env node

import fs from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { productionKubeContextBlocker } from './lib/production-context.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
const secretName = process.env.BOOKMARKET_APP_SECRET_NAME ?? 'bookmarket-app-secrets';
const webTlsSecretName = process.env.BOOKMARKET_WEB_TLS_SECRET_NAME ?? 'bookmarket-web-tls';
const apiTlsSecretName = process.env.BOOKMARKET_API_TLS_SECRET_NAME ?? 'bookmarket-api-tls';
const expectedContext = (process.env.BOOKMARKET_PROD_KUBE_CONTEXT ?? '').trim();
const webUrl = trimTrailingSlash(process.env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
const apiUrl = trimTrailingSlash(process.env.BOOKMARKET_API_URL ?? 'https://api.bmkt.ericjypark.com');
const publicProfileTlsProbeUsername = process.env.BOOKMARKET_PUBLIC_PROFILE_USERNAME ?? 'profile-smoke';
const requiredSecretKeys = ['database-user', 'database-password', 'jwt-secret'];
const requiredTlsSecretKeys = ['tls.crt', 'tls.key'];
const optionalSecretKeys = [
  'google-client-id',
  'google-client-secret',
  'github-client-id',
  'github-client-secret',
  'search-rebuild-token'
];

main();

function main() {
  if (help) {
    usage();
    return;
  }

  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  section('Bookmarket production context preflight');
  info(`Namespace: ${namespace}`);
  info(`Web URL: ${webUrl}`);
  info(`API URL: ${apiUrl}`);
  info(`Public profile TLS probe host: ${publicProfileSubdomainUrl(publicProfileTlsProbeUsername)}`);
  info(`App secret: ${secretName}`);
  info(`Web TLS secret: ${webTlsSecretName}`);
  info(`API TLS secret: ${apiTlsSecretName}`);

  if (dryRun) {
    printDryRunPlan();
    return;
  }

  const currentContext = run('Read active kube context', 'kubectl', ['config', 'current-context'], {
    capture: true
  }).trim();
  info(`Current context: ${currentContext || 'unavailable'}`);
  info(`Expected context: ${expectedContext || 'unset'}`);

  const contexts = run('List kube contexts', 'kubectl', ['config', 'get-contexts', '-o', 'name'], {
    capture: true
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  info(`Available contexts: ${contexts.join(', ') || 'none found'}`);

  const fileIssues = readKubeContextFileIssues();
  if (fileIssues.length > 0) {
    for (const issue of fileIssues) {
      info(`Kubeconfig file issue: ${issue}`);
    }
  } else {
    info('Kubeconfig file references are readable.');
  }

  const contextBlocker = productionKubeContextBlocker(currentContext, expectedContext);
  if (contextBlocker) {
    fail(`${contextBlocker} Refusing production context preflight.`);
  }

  run('Cluster info', 'kubectl', ['cluster-info']);
  run('List nodes', 'kubectl', ['get', 'nodes', '-o', 'wide']);
  run('Read namespace', 'kubectl', ['get', 'namespace', namespace]);
  const secretJson = run('Read app secret metadata', 'kubectl', ['-n', namespace, 'get', 'secret', secretName, '-o', 'json'], {
    capture: true
  });
  assertSecretKeys(secretJson);
  const webTlsSecretJson = run('Read web TLS secret metadata', 'kubectl', [
    '-n',
    namespace,
    'get',
    'secret',
    webTlsSecretName,
    '-o',
    'json'
  ], {
    capture: true
  });
  assertTlsSecretKeys(webTlsSecretName, webTlsSecretJson);
  assertTlsSecretCertificateHosts(webTlsSecretName, webTlsSecretJson, webTlsExpectedHosts());
  const apiTlsSecretJson = run('Read API TLS secret metadata', 'kubectl', [
    '-n',
    namespace,
    'get',
    'secret',
    apiTlsSecretName,
    '-o',
    'json'
  ], {
    capture: true
  });
  assertTlsSecretKeys(apiTlsSecretName, apiTlsSecretJson);
  assertTlsSecretCertificateHosts(apiTlsSecretName, apiTlsSecretJson, [hostnameFromUrl(apiUrl)]);

  info('Production context preflight passed.');
  info(`Use this exact context export for the release shell: export BOOKMARKET_PROD_KUBE_CONTEXT='${currentContext}'`);
}

function usage() {
  console.log(`Usage: node scripts/production-context-preflight.mjs [--dry-run]

Runs read-only kube context diagnostics before production backup or smoke commands.
Real runs read kube context, nodes, namespace, and app-secret metadata only.
`);
}

function printDryRunPlan() {
  info('Dry run: no kubectl command will run.');
  info('Real run requires BOOKMARKET_PROD_KUBE_CONTEXT to match the active Raspberry Pi k3s context.');
  ordered([
    'Read active kube context with kubectl config current-context.',
    'List available kube contexts with kubectl config get-contexts -o name.',
    'Parse kubeconfig file references and report missing certificate/key/token files.',
    'Reject missing, mismatched, or common local/development contexts.',
    'Run read-only kubectl cluster-info, kubectl get nodes -o wide, namespace, and app-secret metadata checks.',
    'Verify required app-secret keys exist by name without printing secret values.',
    'Verify web and API TLS secrets exist with tls.crt and tls.key keys without printing secret values.',
    'Verify web TLS certificate SANs cover the primary host and a wildcard public-profile subdomain.',
    'Verify API TLS certificate SANs cover the API host.',
    'Print the exact BOOKMARKET_PROD_KUBE_CONTEXT export line after success.'
  ]);
}

function assertSecretKeys(secretJson) {
  let secret;
  try {
    secret = JSON.parse(secretJson);
  } catch (error) {
    fail(`Unable to parse ${secretName} JSON: ${error.message}`);
  }

  const data = secret.data ?? {};
  const missingRequired = requiredSecretKeys.filter((key) => !Object.prototype.hasOwnProperty.call(data, key));
  if (missingRequired.length > 0) {
    fail(`${secretName} is missing required key(s): ${missingRequired.join(', ')}`);
  }

  const presentOptional = optionalSecretKeys.filter((key) => Object.prototype.hasOwnProperty.call(data, key));
  info(`${secretName} required keys present: ${requiredSecretKeys.join(', ')}`);
  info(`${secretName} optional keys present: ${presentOptional.join(', ') || 'none'}`);
}

function assertTlsSecretKeys(tlsSecretName, secretJson) {
  let secret;
  try {
    secret = JSON.parse(secretJson);
  } catch (error) {
    fail(`Unable to parse ${tlsSecretName} JSON: ${error.message}`);
  }

  if (secret.type && secret.type !== 'kubernetes.io/tls') {
    fail(`${tlsSecretName} must be type kubernetes.io/tls; found ${secret.type}`);
  }

  const data = secret.data ?? {};
  const missingRequired = requiredTlsSecretKeys.filter((key) => !Object.prototype.hasOwnProperty.call(data, key));
  if (missingRequired.length > 0) {
    fail(`${tlsSecretName} is missing required TLS key(s): ${missingRequired.join(', ')}`);
  }

  info(`${tlsSecretName} TLS keys present: ${requiredTlsSecretKeys.join(', ')}`);
}

function assertTlsSecretCertificateHosts(tlsSecretName, secretJson, expectedHosts) {
  let secret;
  try {
    secret = JSON.parse(secretJson);
  } catch (error) {
    fail(`Unable to parse ${tlsSecretName} JSON: ${error.message}`);
  }

  const encodedCertificate = secret.data?.['tls.crt'];
  if (!encodedCertificate) {
    fail(`${tlsSecretName} is missing tls.crt`);
  }

  let certificate;
  try {
    certificate = new X509Certificate(Buffer.from(encodedCertificate, 'base64').toString('utf8'));
  } catch (error) {
    fail(`${tlsSecretName} tls.crt is not a parseable X.509 certificate: ${error.message}`);
  }

  const dnsNames = certificateDnsNames(certificate);
  for (const host of expectedHosts.filter(Boolean)) {
    if (!certificateCoversHost(host, dnsNames)) {
      fail(`${tlsSecretName} certificate does not cover ${host}. SANs: ${dnsNames.join(', ') || 'none'}`);
    }
  }

  info(`${tlsSecretName} certificate covers: ${expectedHosts.filter(Boolean).join(', ')}`);
}

function certificateDnsNames(certificate) {
  return (certificate.subjectAltName ?? '')
    .split(/,\s*/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('DNS:'))
    .map((entry) => entry.slice('DNS:'.length).toLowerCase());
}

function certificateCoversHost(host, dnsNames) {
  const normalizedHost = host.toLowerCase();
  return dnsNames.some((name) => {
    if (name === normalizedHost) {
      return true;
    }
    if (!name.startsWith('*.')) {
      return false;
    }
    const suffix = name.slice(1);
    return normalizedHost.endsWith(suffix) && normalizedHost.slice(0, -suffix.length).includes('.') === false;
  });
}

function readKubeContextFileIssues() {
  const result = spawnSync('kubectl', ['config', 'view', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    return [`unable to read kubeconfig: ${(result.stderr ?? '').trim() || `exit ${result.status}`}`];
  }

  let kubeConfig;
  try {
    kubeConfig = JSON.parse(result.stdout);
  } catch {
    return ['unable to parse kubeconfig'];
  }

  const clustersByName = new Map((kubeConfig.clusters ?? []).map((entry) => [entry.name, entry.cluster ?? {}]));
  const usersByName = new Map((kubeConfig.users ?? []).map((entry) => [entry.name, entry.user ?? {}]));
  const issues = [];

  for (const contextEntry of kubeConfig.contexts ?? []) {
    const contextName = contextEntry.name;
    const context = contextEntry.context ?? {};
    const cluster = clustersByName.get(context.cluster) ?? {};
    const user = usersByName.get(context.user) ?? {};
    const missingKinds = [];

    if (isMissingConfiguredFile(cluster['certificate-authority'])) {
      missingKinds.push('certificate-authority');
    }
    if (isMissingConfiguredFile(user['client-certificate'])) {
      missingKinds.push('client-certificate');
    }
    if (isMissingConfiguredFile(user['client-key'])) {
      missingKinds.push('client-key');
    }
    if (isMissingConfiguredFile(user.tokenFile)) {
      missingKinds.push('token-file');
    }

    if (missingKinds.length > 0) {
      issues.push(`${contextName}: missing ${missingKinds.join(', ')}`);
    }
  }

  return issues;
}

function isMissingConfiguredFile(filePath) {
  return typeof filePath === 'string' && filePath.length > 0 && !fs.existsSync(filePath);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function webTlsExpectedHosts() {
  const webHost = hostnameFromUrl(webUrl);
  return [webHost, `${publicProfileTlsProbeUsername}.${webHost}`];
}

function publicProfileSubdomainUrl(username) {
  try {
    const parsed = new URL(webUrl);
    return `${parsed.protocol}//${username}.${parsed.host}`;
  } catch {
    return '';
  }
}

function run(label, command, commandArgs, options = {}) {
  const renderedCommand = [command, ...commandArgs].join(' ');
  info(`${label}: ${renderedCommand}`);
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    env: process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });

  if (result.status !== 0) {
    if (result.error) {
      fail(`${label} failed: ${result.error.message}`);
    }
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}: ${(result.stderr ?? '').trim()}`);
  }

  return options.capture ? result.stdout ?? '' : '';
}

function section(title) {
  console.log(`\n## ${title}`);
}

function ordered(items) {
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
}

function info(message) {
  console.log(`[production-context-preflight] ${message}`);
}

function fail(message) {
  console.log(`[production-context-preflight] ${message}`);
  process.exit(1);
}
