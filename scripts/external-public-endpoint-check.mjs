#!/usr/bin/env node

import process from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const webOrigin = normaliseOrigin(process.env.BOOKMARKET_WEB_URL ?? 'https://bmkt.ericjypark.com');
const apiOrigin = normaliseOrigin(process.env.BOOKMARKET_API_URL ?? 'https://api.bmkt.ericjypark.com');
const maxNodes = positiveInteger(process.env.BOOKMARKET_EXTERNAL_PUBLIC_PROBE_NODES, 3);
const minSuccesses = positiveInteger(
  process.env.BOOKMARKET_EXTERNAL_PUBLIC_PROBE_MIN_SUCCESSES,
  Math.min(2, maxNodes)
);
const timeoutMs = positiveInteger(process.env.BOOKMARKET_EXTERNAL_PUBLIC_PROBE_TIMEOUT_MS, 60_000);
const pollIntervalMs = positiveInteger(process.env.BOOKMARKET_EXTERNAL_PUBLIC_PROBE_POLL_MS, 2_000);

const endpointSpecs = [
  { label: 'BOOKMARKET_WEB_URL /health', origin: webOrigin, path: '/health' },
  { label: 'BOOKMARKET_API_URL /health', origin: apiOrigin, path: '/health' },
  { label: 'BOOKMARKET_API_URL /actuator/health/readiness', origin: apiOrigin, path: '/actuator/health/readiness' }
];

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

async function main() {
  if (help) {
    usage();
    return;
  }
  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }

  section('Bookmarket External Public Endpoint Check');
  line('Read-only public health evidence. Sends only public URLs to check-host.net; no cookies, tokens, or secrets are sent.');
  line('This helper is not a production-smoke result by itself.');
  line(`Max nodes per endpoint: ${maxNodes}`);
  line(`Required successful external nodes per endpoint: ${minSuccesses}`);

  if (dryRun) {
    line('Dry run: no external requests will be sent.');
    for (const spec of endpointSpecs) {
      bullet(`${spec.label}: ${endpointUrl(spec)}`);
    }
    return;
  }

  const failures = [];
  for (const spec of endpointSpecs) {
    const result = await checkEndpoint(spec);
    if (!result.ok) {
      failures.push(`${spec.label}: ${result.summary}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      bullet(`BLOCKED: ${failure}`);
    }
    fail(`External public endpoint check failed for ${failures.length} endpoint(s).`);
  }

  line('External public endpoint check passed. Record these results as public-health evidence only; production readiness still requires the real production smoke.');
}

function usage() {
  console.log(`Usage: node scripts/external-public-endpoint-check.mjs [--dry-run]

Checks BOOKMARKET_WEB_URL /health, BOOKMARKET_API_URL /health, and
BOOKMARKET_API_URL /actuator/health/readiness from external check-host.net HTTP
nodes. This is useful when the release operator is on the same LAN as the Pi
and local public-IP curls fail because of NAT loopback. It does not replace
pnpm smoke:production.
`);
}

async function checkEndpoint(spec) {
  const url = endpointUrl(spec);
  line(`${spec.label}: requesting external nodes for ${url}`);
  const request = await fetchJson(
    `https://check-host.net/check-http?host=${encodeURIComponent(url)}&max_nodes=${maxNodes}`
  );
  if (!request?.ok || !request?.request_id) {
    return { ok: false, summary: `check-host request failed: ${JSON.stringify(request)}` };
  }

  const nodeLabels = Object.entries(request.nodes ?? {}).map(([node, details]) => {
    const [countryCode, country, city, ip, asn] = Array.isArray(details) ? details : [];
    return `${node} (${[country, city, ip, asn].filter(Boolean).join(', ') || countryCode || 'unknown'})`;
  });
  bullet(`${spec.label}: request ${request.request_id}; nodes ${nodeLabels.join('; ') || 'unknown'}`);

  const result = await pollResult(request.request_id);
  const summaries = summariseNodeResults(result);
  for (const summary of summaries) {
    bullet(`${spec.label}: ${summary}`);
  }

  const successCount = summaries.filter((summary) => / HTTP 2\d\d\b/.test(summary)).length;
  const failures = summaries.filter((summary) => !/ HTTP 2\d\d\b/.test(summary));
  if (summaries.length === 0) {
    return { ok: false, summary: `no completed check-host results for request ${request.request_id}` };
  }
  if (successCount < minSuccesses) {
    return {
      ok: false,
      summary: `${successCount}/${minSuccesses} required external nodes returned HTTP 2xx; completed results: ${summaries.join('; ')}`
    };
  }
  if (failures.length > 0) {
    return { ok: false, summary: failures.join('; ') };
  }

  bullet(`${spec.label}: ${successCount}/${summaries.length} completed external nodes returned HTTP 2xx.`);
  return { ok: true, summary: summaries.join('; ') };
}

async function pollResult(requestId) {
  const deadline = Date.now() + timeoutMs;
  let latest = {};
  while (Date.now() < deadline) {
    latest = await fetchJson(`https://check-host.net/check-result/${encodeURIComponent(requestId)}`);
    if (hasCompletedResult(latest)) {
      return latest;
    }
    await delay(pollIntervalMs);
  }
  return latest;
}

function summariseNodeResults(result) {
  return Object.entries(result ?? {}).flatMap(([node, entries]) => {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .filter((entry) => Array.isArray(entry))
      .map((entry) => {
        const ok = entry[0] === 1;
        const duration = typeof entry[1] === 'number' ? `${entry[1].toFixed(3)}s` : 'unknown duration';
        const statusText = String(entry[2] ?? '').trim() || (ok ? 'OK' : 'FAILED');
        const httpCode = String(entry[3] ?? '').trim() || 'no-code';
        const ip = String(entry[4] ?? '').trim() || 'unknown-ip';
        return `${node}: ${statusText} HTTP ${httpCode} via ${ip} in ${duration}`;
      });
  });
}

function hasCompletedResult(result) {
  return Object.values(result ?? {}).some((entries) => Array.isArray(entries) && entries.some((entry) => Array.isArray(entry)));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function endpointUrl(spec) {
  return new URL(spec.path, spec.origin).toString();
}

function normaliseOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    fail(`Invalid URL: ${rawUrl}`);
  }
}

function positiveInteger(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`Expected positive integer, received ${rawValue}.`);
  }
  return value;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  console.error(`[external-public-endpoint-check] ${message}`);
  process.exit(1);
}
