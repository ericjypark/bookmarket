#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { completionAuditStatusBlocker } from './lib/completion-audit-status.mjs';
import { releaseBlockerHint } from './lib/release-blocker-hints.mjs';
import { productionBoundBlockers } from './lib/release-blockers.mjs';

const args = new Set(process.argv.slice(2));
const allowExternalBlockers = args.has('--allow-external-blockers');
const externalOnly = args.has('--external-only');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--allow-external-blockers', '--external-only', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const localGuards = [
  ['Contracts', 'pnpm', ['contracts:validate']],
  ['Architecture support', 'pnpm', ['check:architecture-support']],
  ['Web UI parity', 'pnpm', ['check:web-ui-parity']],
  ['V1 parity checklist', 'pnpm', ['check:v1-parity-checklist']],
  ['Completion audit', 'pnpm', ['check:completion-audit']],
  ['Production release docs', 'pnpm', ['check:production-release-docs']],
  ['CI workflow', 'pnpm', ['check:ci-workflow']],
  ['Playwright safety', 'pnpm', ['check:playwright-safety']],
  ['Visual baseline matrix', 'pnpm', ['test:v1-visual:verify']],
  ['Web lint', 'pnpm', ['lint:web']],
  ['Web build', 'pnpm', ['build:web']],
  ['API tests', 'pnpm', ['test:api']],
  ['API package', 'mvn', ['-f', 'services/api/pom.xml', '-DskipTests', 'package']],
  ['Metadata worker tests', 'pnpm', ['test:metadata-worker']],
  ['Metadata worker build', 'pnpm', ['build:metadata-worker']],
  ['Playwright auth parity spec compile', 'pnpm', ['test:v1-auth-parity']],
  ['Playwright interaction parity spec compile', 'pnpm', ['test:v1-interactions']],
  ['Playwright routing parity spec compile', 'pnpm', ['test:v1-routing-parity']],
  ['Docker Compose stack guard', 'pnpm', ['compose:verify']],
  ['Docker Compose config', 'pnpm', ['compose:config']],
  ['Docker Compose runtime smoke', 'pnpm', ['compose:smoke']],
  ['Pi Terraform manifest guard', 'pnpm', ['infra:pi:verify']],
  ['Terraform init', 'terraform', ['-chdir=infra/terraform/pi', 'init', '-backend=false']],
  ['Terraform validate', 'terraform', ['-chdir=infra/terraform/pi', 'validate']],
  ['Terraform plan', 'terraform', terraformPlanArgs()],
  ['Image workflow guard', 'pnpm', ['images:verify']],
  ['Production context guard', 'pnpm', ['check:production-context-guard']],
  ['Production context preflight dry-run', 'pnpm', ['preflight:production-context:dry-run']],
  ['Release signoff validator guard', 'pnpm', ['release:signoffs:verify']],
  ['Release blocker validator guard', 'pnpm', ['release:blockers:verify']],
  ['Release readiness validator guard', 'pnpm', ['release:readiness:verify']],
  ['Migration safety guard', 'pnpm', ['migration:safety:verify']],
  ['Production backup dry-run', 'pnpm', ['backup:production:dry-run']],
  ['Production restore rehearsal dry-run', 'pnpm', ['backup:production:restore-check:dry-run']],
  ['Basic production smoke dry-run', 'pnpm', ['smoke:production:dry-run']],
  ['OAuth provider smoke dry-run', 'pnpm', ['smoke:oauth-provider:dry-run']],
  ['OAuth provider evidence audit', 'pnpm', ['smoke:oauth-provider:evidence-audit']],
  ['Production test-account smoke dry-run', 'pnpm', ['smoke:production:test-account:dry-run']],
  ['Production disposable cleanup check dry-run', 'pnpm', ['smoke:production:cleanup-check:dry-run']],
  ['Authenticated production oracle dry-run', 'pnpm', ['smoke:authenticated-prod-oracle:dry-run']],
  ['Production migration/cutover dry-run', 'pnpm', ['migration:production-cutover:dry-run']],
  ['Full production smoke dry-run', 'node', [
    'scripts/production-smoke-check.mjs',
    '--dry-run',
    '--require-restarts',
    '--include-restarts',
    '--require-test-account',
    '--require-authenticated-oracle'
  ]]
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

  if (externalOnly) {
    info('Skipping local release readiness guards; checking production-bound blockers only.');
  } else {
    info('Running local release readiness guards.');
    for (const [label, command, commandArgs] of localGuards) {
      run(label, command, commandArgs);
    }
  }

  const blockers = externalBlockers();
  if (blockers.length === 0 && !externalOnly) {
    const auditStatusBlocker = completionAuditStatusBlocker();
    if (auditStatusBlocker) {
      info(`BLOCKED: ${auditStatusBlocker}`);
      fail('Release readiness is blocked by completion-audit status.');
    }
  }

  if (blockers.length === 0) {
    if (externalOnly) {
      info('Production-bound blocker check passed. Local release readiness guards were skipped.');
    } else {
      info('Release readiness gate passed. Local and production-bound requirements are satisfied.');
    }
    return;
  }

  for (const blocker of blockers) {
    info(`BLOCKED: ${blocker}`);
    const hint = releaseBlockerHint(blocker);
    if (hint) {
      info(`NEXT: ${hint}`);
    }
  }

  if (allowExternalBlockers) {
    const prefix = externalOnly ? 'Production-bound blocker check completed' : 'Local guards passed';
    info(`${prefix}; ${blockers.length} production-bound blocker(s) remain.`);
    return;
  }

  fail(`Release readiness is blocked by ${blockers.length} production-bound requirement(s).`);
}

function usage() {
  console.log(`Usage: node scripts/release-readiness-check.mjs [--allow-external-blockers] [--external-only]

Runs the local release guards and checks the production-bound signoffs required before declaring the goal complete, including OAuth, backup/restore, production release smoke, test-account smoke, restart/PVC approval, authenticated production-oracle evidence, migration/cutover evidence, and public BOOKMARKET_WEB_URL / BOOKMARKET_API_URL health.

Without --allow-external-blockers, missing production context/signoffs make the command fail.
With --allow-external-blockers, known production blockers are reported without failing; local guards still must pass when they are run.
With --external-only, skip local guard execution and report only the current production-bound blockers.
`);
}

function externalBlockers() {
  return productionBoundBlockers({ currentContext: readCurrentKubeContext() });
}

function readCurrentKubeContext() {
  const result = spawnSync('kubectl', ['config', 'current-context'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) {
    return '';
  }
  return (result.stdout ?? '').trim();
}

function run(label, command, commandArgs) {
  info(`${label}: ${[command, ...commandArgs].join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    if (result.error) {
      fail(`${label} failed: ${result.error.message}`);
    }
    fail(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function terraformPlanArgs() {
  const args = ['-chdir=infra/terraform/pi', 'plan', '-input=false', '-lock=false', '-no-color'];
  const vars = terraformVarArgs();
  if (vars.length > 0) {
    args.push(...vars);
  }
  if (process.env.BOOKMARKET_PROD_KUBE_CONTEXT) {
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
  addTerraformVar(vars, 'domain', process.env.TF_VAR_domain ?? hostnameFromUrl(process.env.BOOKMARKET_WEB_URL));
  addTerraformVar(vars, 'api_host', process.env.TF_VAR_api_host ?? hostnameFromUrl(process.env.BOOKMARKET_API_URL));
  addTerraformVar(vars, 'web_tls_secret_name', process.env.TF_VAR_web_tls_secret_name ?? process.env.BOOKMARKET_WEB_TLS_SECRET_NAME);
  addTerraformVar(vars, 'api_tls_secret_name', process.env.TF_VAR_api_tls_secret_name ?? process.env.BOOKMARKET_API_TLS_SECRET_NAME);
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
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return '';
  }
  try {
    return new URL(trimmed).hostname;
  } catch {
    return '';
  }
}

function info(message) {
  console.log(`[release-readiness] ${message}`);
}

function fail(message) {
  console.log(`[release-readiness] ${message}`);
  process.exit(1);
}
