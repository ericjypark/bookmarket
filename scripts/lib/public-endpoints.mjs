import { spawnSync } from 'node:child_process';

const defaultWebUrl = 'https://bmkt.ericjypark.com';
const defaultApiUrl = 'https://api.bmkt.ericjypark.com';
const defaultPublicProfileSubdomain = 'profile-smoke';

const endpointSpecs = [
  { label: 'BOOKMARKET_WEB_URL /login', base: 'web', path: '/login', required: false },
  { label: 'BOOKMARKET_WEB_URL /health', base: 'web', path: '/health', required: true },
  { label: 'BOOKMARKET_API_URL /health', base: 'api', path: '/health', required: true },
  {
    label: 'BOOKMARKET_API_URL /actuator/health/readiness',
    base: 'api',
    path: '/actuator/health/readiness',
    required: true
  }
];

export function publicEndpointDiagnostics(env = process.env) {
  return probePublicEndpoints(env).map((result) => `${result.label}: ${result.summary}`);
}

export function publicEndpointCertificateDiagnostics(env = process.env) {
  const origins = publicEndpointOrigins(env);
  const publicProfileOrigin = publicProfileSubdomainOrigin(origins.web, env);

  return [
    certificateDiagnostic('BOOKMARKET_WEB_URL TLS certificate', origins.web),
    certificateDiagnostic('Public profile wildcard TLS certificate', publicProfileOrigin),
    certificateDiagnostic('BOOKMARKET_API_URL TLS certificate', origins.api)
  ];
}

export function publicEndpointBlockers(env = process.env) {
  return probePublicEndpoints(env)
    .filter((result) => result.required && !result.ok)
    .map((result) => `${result.label} is not healthy: ${result.summary}.`);
}

function probePublicEndpoints(env) {
  const origins = publicEndpointOrigins(env);

  return endpointSpecs.map((spec) => {
    const url = urlForPath(origins[spec.base], spec.path);
    const probe = probePublicUrl(url);
    return {
      ...spec,
      url,
      ...probe
    };
  });
}

function publicEndpointOrigins(env) {
  return {
    web: normaliseOrigin(env.BOOKMARKET_WEB_URL ?? defaultWebUrl),
    api: normaliseOrigin(env.BOOKMARKET_API_URL ?? defaultApiUrl)
  };
}

function publicProfileSubdomainOrigin(webOrigin, env) {
  const configuredUrl = normaliseOrigin(env.BOOKMARKET_PUBLIC_PROFILE_URL ?? '');
  if (configuredUrl) {
    return configuredUrl;
  }

  try {
    const parsed = new URL(webOrigin);
    const subdomain = (env.BOOKMARKET_PUBLIC_PROFILE_USERNAME ?? defaultPublicProfileSubdomain).trim();
    if (!subdomain) {
      return '';
    }
    return `${parsed.protocol}//${subdomain}.${parsed.host}`;
  } catch {
    return '';
  }
}

function normaliseOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
}

function urlForPath(origin, pathname) {
  if (!origin) {
    return '';
  }
  return new URL(pathname, origin).toString();
}

function probePublicUrl(url) {
  if (!url) {
    return {
      ok: false,
      summary: 'skipped: invalid URL'
    };
  }

  const result = spawnSync(
    'curl',
    ['-sS', '--max-time', '10', '-o', '/dev/null', '-w', 'HTTP %{http_code} %{url_effective}', url],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  if (result.status !== 0) {
    const error = (result.stderr ?? '')
      .split('\n')
      .map((lineValue) => lineValue.trim())
      .find(Boolean);
    return {
      ok: false,
      summary: `failed: ${error || `curl exited ${result.status ?? 'unknown'}`}`
    };
  }

  const summary = (result.stdout ?? '').trim() || 'ok';
  const httpCode = Number.parseInt(summary.match(/HTTP\s+(\d{3})/)?.[1] ?? '', 10);
  return {
    ok: Number.isInteger(httpCode) && httpCode >= 200 && httpCode < 300,
    summary
  };
}

function certificateDiagnostic(label, origin) {
  if (!origin) {
    return `${label}: skipped invalid URL`;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(origin);
  } catch {
    return `${label}: skipped invalid URL`;
  }

  if (parsedUrl.protocol !== 'https:') {
    return `${label}: skipped non-HTTPS origin ${parsedUrl.origin}`;
  }

  const host = parsedUrl.hostname;
  const port = parsedUrl.port || '443';
  const connectTarget = `${host}:${port}`;
  const sClient = spawnSync(
    'openssl',
    ['s_client', '-connect', connectTarget, '-servername', host, '-showcerts'],
    {
      encoding: 'utf8',
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000
    }
  );

  if (!sClient.stdout) {
    const error = (sClient.stderr ?? '')
      .split('\n')
      .map((lineValue) => lineValue.trim())
      .find(Boolean);
    return `${label}: unavailable for ${host} (${error || `openssl exited ${sClient.status ?? 'unknown'}`})`;
  }

  const x509 = spawnSync(
    'openssl',
    ['x509', '-noout', '-subject', '-issuer', '-dates', '-ext', 'subjectAltName'],
    {
      encoding: 'utf8',
      input: sClient.stdout,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000
    }
  );

  if (x509.status !== 0 || !x509.stdout) {
    const error = (x509.stderr ?? '')
      .split('\n')
      .map((lineValue) => lineValue.trim())
      .find(Boolean);
    return `${label}: certificate parse failed for ${host} (${error || `openssl exited ${x509.status ?? 'unknown'}`})`;
  }

  return `${label}: ${summariseCertificate(host, x509.stdout)}`;
}

function summariseCertificate(host, certificateText) {
  const lines = certificateText
    .split('\n')
    .map((lineValue) => lineValue.trim())
    .filter(Boolean);
  const subject = lines.find((lineValue) => lineValue.startsWith('subject=')) ?? 'subject=unknown';
  const issuer = lines.find((lineValue) => lineValue.startsWith('issuer=')) ?? 'issuer=unknown';
  const notAfter = lines.find((lineValue) => lineValue.startsWith('notAfter=')) ?? 'notAfter=unknown';
  const sanLine = lines.find((lineValue) => lineValue.startsWith('DNS:')) ?? 'SAN=missing';

  return `${host}; ${subject}; ${issuer}; ${notAfter}; ${sanLine}`;
}
