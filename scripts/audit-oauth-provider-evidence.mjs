#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { missingOAuthSmokeSignoffFields } from './lib/release-signoffs.mjs';

const args = new Set(process.argv.slice(2));
const requireEvidence = args.has('--require');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--require', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const repoRoot = process.cwd();
const defaultReferenceFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.example',
  'apps/server/.env',
  'apps/web/.env',
  'apps/web/.env.example',
  'tests/fixtures/v1-root/apps/server/.env',
  'tests/fixtures/v1-root/apps/web/.env',
  'tests/fixtures/v1-root/apps/web/.env.example'
];
const envFileCandidates = [
  ...defaultReferenceFiles,
  ...splitList(process.env.BOOKMARKET_OAUTH_EVIDENCE_FILES ?? '')
].map(resolveMaybeRelative);
const githubRepos = splitList(
  process.env.BOOKMARKET_OAUTH_EVIDENCE_GITHUB_REPOS
    ?? 'ericjypark/bookmarket'
);
const artifactRoots = splitList(
  process.env.BOOKMARKET_OAUTH_EVIDENCE_ARTIFACT_ROOTS
    ?? 'artifacts,tests/playwright/.auth'
).map(resolveMaybeRelative);

const providerEvidenceEnvNames = [
  'BOOKMARKET_OAUTH_SMOKE_SIGNOFF',
  'BOOKMARKET_OAUTH_TEST_ACCOUNT_LABEL',
  'BOOKMARKET_OAUTH_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GOOGLE_EXPECTED_EMAIL',
  'BOOKMARKET_OAUTH_GITHUB_EXPECTED_EMAIL'
];
const providerSessionInputEnvNames = [
  'BOOKMARKET_OAUTH_PROVIDER_STORAGE_STATE',
  'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR'
];
const providerEvidenceKeyPattern = /\b(?:BOOKMARKET_OAUTH_(?:SMOKE_SIGNOFF|TEST_ACCOUNT_LABEL|EXPECTED_EMAIL|GOOGLE_EXPECTED_EMAIL|GITHUB_EXPECTED_EMAIL)|OAUTH_TEST_ACCOUNT|GOOGLE_TEST|GITHUB_TEST|PROVIDER_TEST|DEDICATED_PROVIDER|PROVIDER_ACCOUNT)\b/i;
const providerSessionInputKeyPattern = /\bBOOKMARKET_OAUTH_PROVIDER_(?:STORAGE_STATE|USER_DATA_DIR)\b/i;
const oauthAppCredentialPattern = /\b(?:GOOGLE_CLIENT|GITHUB_CLIENT|NEXT_PUBLIC_GOOGLE_CLIENT_ID|NEXT_PUBLIC_GITHUB_CLIENT_ID|NEXT_PUBLIC_GITHUB_REDIRECT_URI|google-client|github-client)\b/i;
const evidenceFilePattern = /(?:provider|oauth|google|github|test.?account|storage.?state|auth.?state)/i;

const findings = [];
const sessionInputFindings = [];
const secretPointerFindings = [];
const notes = [];

main();

function main() {
  if (help) {
    usage();
    return;
  }
  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  section('Bookmarket OAuth Provider Evidence Audit');
  line('Read-only audit. Secret values are never printed.');
  auditProcessEnv();
  auditEnvFiles();
  auditArtifactFiles();
  auditLegacyLocalOAuthProfiles();
  auditKubernetesSecretKeys();
  auditGitHubSecretNames();

  section('Summary');
  for (const note of notes) {
    bullet(note);
  }
  if (sessionInputFindings.length > 0) {
    bullet(`Provider session input names found: ${sessionInputFindings.length}.`);
    for (const finding of sessionInputFindings) {
      bullet(`${finding.source}: ${finding.description}`);
    }
    bullet('Provider storage-state and browser-profile inputs are not provider-account/signoff evidence unless a real provider smoke verifies /api/v1/users/me and emits BOOKMARKET_OAUTH_SMOKE_SIGNOFF.');
  }
  if (secretPointerFindings.length > 0) {
    bullet(`Provider evidence secret key names found: ${secretPointerFindings.length}.`);
    for (const finding of secretPointerFindings) {
      bullet(`${finding.source}: ${finding.description}`);
    }
    bullet('Secret key names are pointers only and are not provider-account/signoff evidence unless their values are loaded into a real provider smoke and validated by /api/v1/users/me.');
  }
  if (findings.length === 0) {
    bullet('No dedicated Google/GitHub provider test-account evidence or OAuth provider smoke signoff evidence was found.');
    bullet('OAuth app credentials, deployment usernames, and email-login smoke accounts do not satisfy BOOKMARKET_OAUTH_SMOKE_SIGNOFF.');
    if (requireEvidence) {
      process.exitCode = 1;
    }
    return;
  }

  bullet(`Potential dedicated provider evidence findings: ${findings.length}`);
  for (const finding of findings) {
    bullet(`${finding.source}: ${finding.description}`);
  }
}

function usage() {
  console.log(`Usage: node scripts/audit-oauth-provider-evidence.mjs [--require]

Checks the local shell, selected env files, artifact paths, k3s secret key names,
and GitHub secret names for dedicated OAuth provider test-account or provider
smoke signoff evidence. Values are never printed. With --require, exits nonzero
when no provider-account/signoff evidence is found. Provider storage-state and
browser-profile inputs are reported separately because they are session inputs,
not signoff evidence by themselves. Secret key names are reported as pointers,
not validated evidence, because this audit does not print or decode secret values.
`);
}

function auditProcessEnv() {
  const names = Object.keys(process.env).sort();
  const expectedNames = new Set(providerEvidenceEnvNames);
  const sessionInputNames = new Set(providerSessionInputEnvNames);
  const matchedEvidence = names.filter((name) => expectedNames.has(name) || providerEvidenceKeyPattern.test(name));
  const matchedSessionInputs = names.filter((name) => sessionInputNames.has(name) || providerSessionInputKeyPattern.test(name));
  if (matchedEvidence.length > 0 || matchedSessionInputs.length > 0) {
    section('Process Environment');
    for (const name of matchedEvidence) {
      addEvidenceKeyFinding('env', name, process.env[name] ?? '');
    }
    for (const name of matchedSessionInputs) {
      addSessionInputFinding('env', `${name}=*** (${classifyValue(process.env[name] ?? '')})`);
    }
  } else {
    notes.push('No provider test-account/signoff env var names are exported in this shell.');
  }
}

function auditEnvFiles() {
  const seenFiles = new Set();
  for (const filePath of envFileCandidates) {
    if (seenFiles.has(filePath) || !fs.existsSync(filePath)) {
      continue;
    }
    seenFiles.add(filePath);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let fileHadOAuthAppCredentials = false;
    for (const lineValue of lines) {
      const trimmed = lineValue.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        continue;
      }
      const [, key, rawValue] = match;
      if (providerEvidenceKeyPattern.test(key)) {
        addEvidenceKeyFinding(relativeLabel(filePath), key, rawValue);
      } else if (providerSessionInputKeyPattern.test(key)) {
        addSessionInputFinding(relativeLabel(filePath), `${key}=*** (${classifyValue(rawValue)})`);
      } else if (oauthAppCredentialPattern.test(key)) {
        fileHadOAuthAppCredentials = true;
      }
    }
    if (fileHadOAuthAppCredentials) {
      notes.push(`${relativeLabel(filePath)} contains OAuth app credential key names only, not dedicated provider account evidence.`);
    }
  }
}

function auditArtifactFiles() {
  const matches = [];
  for (const root of artifactRoots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    walkFiles(root, (filePath) => {
      const relativePath = relativeLabel(filePath);
      if (evidenceFilePattern.test(relativePath)) {
        matches.push(relativePath);
      }
    });
  }

  if (matches.length === 0) {
    notes.push('No matching provider/storage-state/test-account artifact files were found under the configured artifact roots.');
    return;
  }

  section('Artifact File Names');
  for (const filePath of matches.sort()) {
    bullet(filePath);
  }
  notes.push('Artifact file names alone are not OAuth provider signoff evidence unless the real provider smoke uses them and verifies /api/v1/users/me.');
}

function auditLegacyLocalOAuthProfiles() {
  const tmpRoot = path.join(repoRoot, '.tmp');
  const legacyHelper = path.join(tmpRoot, 'oauth-chrome-profile-check.mjs');
  const legacyProfileDirs = fs.existsSync(tmpRoot)
    ? fs.readdirSync(tmpRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^chrome-oauth/i.test(entry.name))
      .map((entry) => path.join(tmpRoot, entry.name))
      .sort()
    : [];
  const legacyPaths = [
    ...(fs.existsSync(legacyHelper) ? [legacyHelper] : []),
    ...legacyProfileDirs
  ];

  if (legacyPaths.length === 0) {
    return;
  }

  section('Legacy Local OAuth Session Artifacts');
  for (const filePath of legacyPaths) {
    bullet(relativeLabel(filePath));
  }
  if (fs.existsSync(legacyHelper) && helperHasHardCodedPersonalAccount(legacyHelper)) {
    notes.push('Legacy .tmp OAuth helper contains a hard-coded personal provider-account selector and is not dedicated provider test-account evidence.');
  }
  notes.push('Legacy .tmp OAuth browser profiles are local session artifacts, not provider-account/signoff evidence unless a fresh real provider smoke verifies /api/v1/users/me for a dedicated provider test account.');
}

function auditKubernetesSecretKeys() {
  if (!process.env.KUBECONFIG && !process.env.BOOKMARKET_PROD_KUBE_CONTEXT) {
    notes.push('Kubernetes secret key audit skipped because no production kube context env was supplied.');
    return;
  }

  const namespace = process.env.BOOKMARKET_KUBE_NAMESPACE ?? 'bookmarket';
  const secretName = process.env.BOOKMARKET_APP_SECRET_NAME ?? 'bookmarket-app-secrets';
  const result = spawnSync('kubectl', ['-n', namespace, 'get', 'secret', secretName, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  if (result.status !== 0) {
    notes.push(`Kubernetes secret key audit unavailable for ${namespace}/${secretName}.`);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    notes.push(`Kubernetes secret key audit could not parse ${namespace}/${secretName}.`);
    return;
  }

  const keys = Object.keys(parsed.data ?? {}).sort();
  const evidenceKeys = keys.filter((key) => providerEvidenceKeyPattern.test(key));
  const sessionInputKeys = keys.filter((key) => providerSessionInputKeyPattern.test(key));
  const oauthAppKeys = keys.filter((key) => oauthAppCredentialPattern.test(key));
  if (evidenceKeys.length > 0) {
    for (const key of evidenceKeys) {
      addSecretPointerFinding(`k8s secret ${namespace}/${secretName}`, `${key}=***`);
    }
  }
  if (sessionInputKeys.length > 0) {
    for (const key of sessionInputKeys) {
      addSessionInputFinding(`k8s secret ${namespace}/${secretName}`, `${key}=***`);
    }
  }
  if (oauthAppKeys.length > 0) {
    notes.push(`Kubernetes secret ${namespace}/${secretName} contains OAuth app credential key names only: ${oauthAppKeys.join(', ')}.`);
  }
}

function auditGitHubSecretNames() {
  if (githubRepos.length === 0) {
    return;
  }

  let ghAvailable = true;
  for (const repo of githubRepos) {
    const result = spawnSync('gh', ['secret', 'list', '-R', repo], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    if (result.error) {
      ghAvailable = false;
      continue;
    }
    if (result.status !== 0) {
      notes.push(`GitHub secret-name audit unavailable for ${repo}.`);
      continue;
    }
    const names = result.stdout
      .split('\n')
      .map((lineValue) => lineValue.trim().split(/\s+/)[0])
      .filter(Boolean);
    const evidenceNames = names.filter((name) => providerEvidenceKeyPattern.test(name));
    const sessionInputNames = names.filter((name) => providerSessionInputKeyPattern.test(name));
    const oauthAppNames = names.filter((name) => oauthAppCredentialPattern.test(name));
    if (evidenceNames.length > 0) {
      for (const name of evidenceNames) {
        addSecretPointerFinding(`GitHub secret ${repo}`, `${name}=***`);
      }
    }
    if (sessionInputNames.length > 0) {
      for (const name of sessionInputNames) {
        addSessionInputFinding(`GitHub secret ${repo}`, `${name}=***`);
      }
    }
    if (oauthAppNames.length > 0) {
      notes.push(`GitHub repo ${repo} contains OAuth app credential secret names only: ${oauthAppNames.join(', ')}.`);
    }
  }
  if (!ghAvailable) {
    notes.push('GitHub secret-name audit skipped because gh is unavailable.');
  }
}

function addFinding(source, description) {
  findings.push({ source, description });
}

function addEvidenceKeyFinding(source, key, rawValue) {
  const normalizedValue = normalizeEnvValue(rawValue);
  if (!normalizedValue) {
    notes.push(`${source} contains ${key}, but the value is empty and is not provider-account/signoff evidence.`);
    return;
  }

  if (key === 'BOOKMARKET_OAUTH_SMOKE_SIGNOFF') {
    const missingFields = missingOAuthSmokeSignoffFields(normalizedValue);
    if (missingFields.length > 0) {
      notes.push(`${source} contains BOOKMARKET_OAUTH_SMOKE_SIGNOFF, but the value is not valid OAuth provider-smoke signoff evidence. Missing: ${missingFields.join(', ')}.`);
      return;
    }
  }

  addFinding(source, `${key}=*** (${classifyValue(rawValue)})`);
}

function addSessionInputFinding(source, description) {
  sessionInputFindings.push({ source, description });
}

function addSecretPointerFinding(source, description) {
  secretPointerFindings.push({ source, description });
}

function classifyValue(value) {
  const trimmed = normalizeEnvValue(value);
  if (!trimmed) {
    return 'empty value';
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'email-like value present';
  }
  if (/smoke:oauth-provider|Google|GitHub|\/api\/v1\/users\/me/i.test(trimmed)) {
    return 'signoff-like value present';
  }
  return 'non-empty value present';
}

function helperHasHardCodedPersonalAccount(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return /[\w.+-]+@(?:gmail|googlemail)(?:\\)?\.com/i.test(source)
    || /eric(?:\\)?\.joonyoul(?:\\)?\.park/i.test(source);
}

function normalizeEnvValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function walkFiles(root, visit) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'target') {
        continue;
      }
      walkFiles(entryPath, visit);
    } else if (entry.isFile()) {
      visit(entryPath);
    }
  }
}

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveMaybeRelative(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function relativeLabel(filePath) {
  return path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) || filePath : filePath;
}

function section(title) {
  console.log(`\n## ${title}`);
}

function line(value) {
  console.log(value);
}

function bullet(value) {
  console.log(`- ${value}`);
}

function fail(message) {
  console.error(`[oauth-provider-evidence-audit] ${message}`);
  process.exit(1);
}
