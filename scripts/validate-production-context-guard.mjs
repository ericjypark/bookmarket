#!/usr/bin/env node

import { productionKubeContextBlocker } from './lib/production-context.mjs';

const cases = [
  {
    label: 'missing expected context is blocked',
    currentContext: 'pi-k3s',
    expectedContext: '',
    expectedIncludes: 'BOOKMARKET_PROD_KUBE_CONTEXT is not set'
  },
  {
    label: 'expected kind context is blocked',
    currentContext: 'kind-kind',
    expectedContext: 'kind-kind',
    expectedIncludes: 'local/development context'
  },
  {
    label: 'current docker desktop context is blocked',
    currentContext: 'docker-desktop',
    expectedContext: 'pi-k3s',
    expectedIncludes: 'local/development context'
  },
  {
    label: 'missing current context is blocked',
    currentContext: '',
    expectedContext: 'pi-k3s',
    expectedIncludes: 'could not be read'
  },
  {
    label: 'context mismatch is blocked',
    currentContext: 'staging-k3s',
    expectedContext: 'pi-k3s',
    expectedIncludes: 'expected "pi-k3s"'
  },
  {
    label: 'matching production-looking context is allowed',
    currentContext: 'pi-k3s',
    expectedContext: 'pi-k3s',
    expectedIncludes: ''
  }
];

for (const testCase of cases) {
  const actual = productionKubeContextBlocker(testCase.currentContext, testCase.expectedContext);
  if (!testCase.expectedIncludes) {
    if (actual !== '') {
      fail(testCase, actual);
    }
    continue;
  }

  if (!actual.includes(testCase.expectedIncludes)) {
    fail(testCase, actual);
  }
}

console.log(`Production context guard checked: ${cases.length} cases.`);

function fail(testCase, actual) {
  console.error(`[production-context] ${testCase.label} failed.`);
  console.error(`[production-context] Expected to include: ${JSON.stringify(testCase.expectedIncludes)}`);
  console.error(`[production-context] Actual: ${JSON.stringify(actual)}`);
  process.exit(1);
}
