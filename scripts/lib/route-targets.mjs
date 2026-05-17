import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function compareK3sPublicRouteTargets({
  namespace,
  webUrl,
  routePaths,
  publicHeaders = [],
  publicResolveIP = '',
  publicTargetLabel = 'public URL',
  publicRouteLabel = 'Public normal UI route',
  routeDescription = 'Normal UI route',
  log = () => undefined,
  failOnMismatch
}) {
  assertPublicHeaders(publicHeaders);
  assertResolveTarget(publicResolveIP, 'public route resolve target');
  const routeFingerprints = [];
  const mismatches = [];

  for (const routePath of routePaths) {
    const directBody = runText(log, `Direct k3s web route ${routePath}`, 'kubectl', [
      '-n',
      namespace,
      'exec',
      'deployment/web',
      '--',
      'sh',
      '-lc',
      `wget -qO- ${shellQuote(`http://127.0.0.1:3000${routePath}`)}`
    ]);
    const curlArgs = [
      '-fsS',
      ...curlResolveArgs(webUrl, publicResolveIP),
      ...publicHeaders.flatMap((header) => ['-H', header]),
      `${trimTrailingSlash(webUrl)}${routePath}`
    ];
    const redactedCurlArgs = [
      '-fsS',
      ...curlResolveArgs(webUrl, publicResolveIP),
      ...publicHeaders.flatMap((header) => ['-H', redactHeader(header)]),
      `${trimTrailingSlash(webUrl)}${routePath}`
    ];
    const publicBody = runText(log, `${publicRouteLabel} ${routePath}`, 'curl', curlArgs, {
      renderArgs: redactedCurlArgs
    });
    const directFingerprint = routeAssetFingerprint(routePath, directBody, 'direct k3s web pod');
    const publicFingerprint = routeAssetFingerprint(routePath, publicBody, publicTargetLabel);

    log(
      `${routeDescription} ${routePath} response asset fingerprints: direct k3s web pod ${directFingerprint.hash} (${directFingerprint.assetCount} assets), ${publicTargetLabel} ${publicFingerprint.hash} (${publicFingerprint.assetCount} assets).`
    );
    if (directFingerprint.hash !== publicFingerprint.hash) {
      const mismatch = `${routeDescription} ${routePath} is not proven to be served by the k3s web pod. Direct k3s response asset fingerprint ${directFingerprint.hash} does not match ${publicTargetLabel} response asset fingerprint ${publicFingerprint.hash}.`;
      if (failOnMismatch) {
        throw new Error(mismatch);
      }
      log(`BLOCKED: ${mismatch}`);
      mismatches.push({
        routePath,
        direct: directFingerprint.hash,
        public: publicFingerprint.hash
      });
    }

    routeFingerprints.push(`${routePath}:${publicFingerprint.hash}`);
  }

  return { routeFingerprints, mismatches };
}

export function parseRoutePaths(value, envName = 'BOOKMARKET_CUTOVER_ROUTE_PATHS') {
  const paths = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (paths.length === 0) {
    throw new Error(`${envName} must include at least one route path.`);
  }
  for (const routePath of paths) {
    if (!routePath.startsWith('/')) {
      throw new Error(`Route path must start with "/": ${routePath}`);
    }
    if (/[\r\n]/.test(routePath)) {
      throw new Error(`Route path must not contain line breaks: ${routePath}`);
    }
  }
  return [...new Set(paths)];
}

export function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

export function curlResolveArgs(rawUrl, resolveIP) {
  const target = resolveIP.trim();
  if (!target) {
    return [];
  }

  assertResolveTarget(target, 'curl resolve target');
  const url = new URL(rawUrl);
  const port = url.port || (url.protocol === 'http:' ? '80' : '443');
  return ['--resolve', `${url.hostname}:${port}:${target}`];
}

export function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertPublicHeaders(headers) {
  for (const header of headers) {
    if (/[\r\n]/.test(header)) {
      throw new Error('Public route target headers must not contain line breaks.');
    }
    if (!/^[^:]+:\s*.+$/.test(header)) {
      throw new Error(`Public route target header must use "Name: value" format: ${header}`);
    }
  }
}

function assertResolveTarget(value, label) {
  if (!value) {
    return;
  }
  if (/[\r\n\s,]/.test(value)) {
    throw new Error(`${label} must be a single IP address or hostname without whitespace.`);
  }
}

function redactHeader(header) {
  const [name] = header.split(':', 1);
  if (/cookie|authorization|token|secret|key/i.test(name)) {
    return `${name}: <redacted>`;
  }
  return header;
}

function runText(log, label, command, commandArgs, { renderArgs = commandArgs } = {}) {
  log(`${label}: ${renderCommand(command, renderArgs)}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    if (result.stderr?.length) {
      process.stderr.write(result.stderr);
    }
    if (result.error) {
      throw new Error(`${label} failed: ${result.error.message}`);
    }
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
  return result.stdout ?? '';
}

function routeAssetFingerprint(routePath, body, label) {
  const assets = [...new Set([...body.matchAll(/\/_next\/static\/[^"'<>\\\s)]+/g)].map((match) => match[0]).sort())];
  if (assets.length === 0) {
    throw new Error(`No Next.js static assets found in ${label} response for ${routePath}; cannot prove route target.`);
  }
  return {
    hash: sha256(assets.join('\n')),
    assetCount: assets.length
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function renderCommand(command, commandArgs) {
  return [command, ...commandArgs.map(shellQuote)].join(' ');
}
