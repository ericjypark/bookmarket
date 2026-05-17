#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  completionAuditStatusBlocker,
  completionAuditTextStatusBlocker
} from './lib/completion-audit-status.mjs';

const repoRoot = process.cwd();
const releaseReadinessScriptPath = path.join(repoRoot, 'scripts/release-readiness-check.mjs');
const completionAuditValidatorPath = path.join(repoRoot, 'scripts/validate-completion-audit.mjs');

const cases = [
  {
    label: 'complete audit status has no blocker',
    actual: completionAuditTextStatusBlocker('# Completion Audit\n\nStatus: complete.\n'),
    expected: ''
  },
  {
    label: 'not-complete audit status blocks final readiness',
    actual: completionAuditTextStatusBlocker('# Completion Audit\n\nStatus: not complete.\n'),
    expected:
      'docs/testing/completion-audit.md still says Status: not complete; update the completion audit after every goal.md requirement is actually satisfied.'
  },
  {
    label: 'missing explicit audit status blocks final readiness',
    actual: completionAuditTextStatusBlocker('# Completion Audit\n\nAll checks look good.\n'),
    expected: 'docs/testing/completion-audit.md does not contain an explicit Status: complete. line.'
  },
  {
    label: 'read failure blocks final readiness',
    actual: completionAuditStatusBlocker({
      readFile: () => {
        throw new Error('synthetic missing file');
      }
    }),
    expected:
      'docs/testing/completion-audit.md could not be read before final release readiness pass: synthetic missing file'
  }
];

const requiredReleaseReadinessScriptMarkers = [
  {
    label: 'local guards include completion-audit validation',
    marker: "['Completion audit', 'pnpm', ['check:completion-audit']]"
  },
  {
    label: 'local guards include production release-doc validation',
    marker: "['Production release docs', 'pnpm', ['check:production-release-docs']]"
  },
  {
    label: 'local guards include release readiness validator',
    marker: "['Release readiness validator guard', 'pnpm', ['release:readiness:verify']]"
  },
  {
    label: 'terraform plan resolves relative kubeconfig path before chdir',
    marker: 'resolveRepoPath(process.env.TF_VAR_kubeconfig_path ?? firstKubeconfigPath(process.env.KUBECONFIG))'
  },
  {
    label: 'relative kubeconfig path resolves from repo root',
    marker: 'return path.resolve(process.cwd(), trimmed);'
  },
  {
    label: 'local guards include OAuth provider evidence audit',
    marker: "['OAuth provider evidence audit', 'pnpm', ['smoke:oauth-provider:evidence-audit']]"
  },
  {
    label: 'final readiness checks audit status only after production blockers clear',
    marker: 'if (blockers.length === 0 && !externalOnly) {'
  },
  {
    label: 'final readiness calls completion audit status blocker',
    marker: 'const auditStatusBlocker = completionAuditStatusBlocker();'
  },
  {
    label: 'final readiness fails on not-complete audit status',
    marker: "fail('Release readiness is blocked by completion-audit status.');"
  },
];

const requiredCompletionAuditValidatorMarkers = [
  {
    label: 'completion-audit validator supports eventual complete status',
    marker: "return 'complete';"
  },
  {
    label: 'completion-audit validator keeps current blocker mode strict',
    marker: "if (status === 'not-complete') {"
  },
  {
    label: 'completion-audit validator checks rows against status mode',
    marker: 'assertChecklistRows(audit, status);'
  },
  {
    label: 'completion-audit validator requires OAuth provider evidence audit command',
    marker: "'pnpm smoke:oauth-provider:evidence-audit'"
  },
  {
    label: 'completion-audit validator requires OAuth provider evidence audit require command',
    marker: "'pnpm smoke:oauth-provider:evidence-audit:require'"
  },
  {
    label: 'completion-audit validator forbids incomplete row wording in complete mode',
    marker: 'isCompleteChecklistStatus(row.status)'
  },
  {
    label: 'completion-audit validator requires final complete evidence',
    marker: 'assertCompleteAuditEvidence(audit);'
  }
];

const failures = [];

for (const testCase of cases) {
  if (testCase.actual !== testCase.expected) {
    failures.push(`${testCase.label}: expected ${JSON.stringify(testCase.expected)}, got ${JSON.stringify(testCase.actual)}`);
  }
}

const releaseReadinessScript = fs.readFileSync(releaseReadinessScriptPath, 'utf8');
for (const { label, marker } of requiredReleaseReadinessScriptMarkers) {
  if (!releaseReadinessScript.includes(marker)) {
    failures.push(`${label}: scripts/release-readiness-check.mjs is missing ${JSON.stringify(marker)}`);
  }
}

const completionAuditValidator = fs.readFileSync(completionAuditValidatorPath, 'utf8');
for (const { label, marker } of requiredCompletionAuditValidatorMarkers) {
  if (!completionAuditValidator.includes(marker)) {
    failures.push(`${label}: scripts/validate-completion-audit.mjs is missing ${JSON.stringify(marker)}`);
  }
}

if (failures.length > 0) {
  console.error('Release readiness validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Release readiness validators checked: ${cases.length} status cases, ${requiredReleaseReadinessScriptMarkers.length} release script markers, and ${requiredCompletionAuditValidatorMarkers.length} completion-audit validator markers.`
);
