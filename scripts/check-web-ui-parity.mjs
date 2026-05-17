#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const v1WebRoot = process.env.BOOKMARKET_V1_WEB_ROOT ?? path.join(repoRoot, 'tests/fixtures/v1-root/apps/web');
const v2WebRoot = path.join(repoRoot, 'apps/web');

const exactParityPaths = [
  'components.json',
  'postcss.config.cjs',
  'tailwind.config.ts',
  'src',
  'sentry.client.config.ts',
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
  'public',
  'next-env.d.ts',
];

const allowedV2OnlyFiles = new Set([
  'src/app/api/oauth/state/route.ts',
  'src/app/health/route.ts',
]);

const allowedAsyncMetadataUiDiffs = new Set([
  'src/app/(pages)/(home)/home/_components/bookmark-card.tsx',
  'src/app/(pages)/(home)/home/_components/bookmark-input.tsx',
  'src/app/(pages)/(home)/home/_components/bookmark-list.tsx',
  'src/app/(pages)/(home)/home/_hooks/use-bookmark-context.tsx',
  'src/app/(pages)/(home)/home/_hooks/use-bookmark-refetch.tsx',
  'src/app/_common/interfaces/bookmark.interface.ts',
  'src/app/_common/utils/bookmark-metadata.ts',
  'src/app/_common/utils/url.ts',
]);

const allowedSessionRoutingDiffs = new Set([
  'src/middleware.ts',
  'src/path.ts',
]);

const allowedAdapterDiffs = new Set([
  'src/app/(pages)/(auth)/_actions/create-user.action.ts',
  'src/app/(pages)/(auth)/_actions/create-oauth-state.action.ts',
  'src/app/(pages)/(auth)/_actions/fetch-github-user-info.action.ts',
  'src/app/(pages)/(auth)/_actions/fetch-google-user-info.action.ts',
  'src/app/(pages)/(auth)/_actions/fetch-slot-status.action.ts',
  'src/app/(pages)/(auth)/_actions/login-user.action.ts',
  'src/app/(pages)/(auth)/_hooks/use-oauth.tsx',
  'src/app/(pages)/(auth)/oauth/github/page.tsx',
  'src/app/(pages)/(home)/home/_actions/create-bookmark.action.ts',
  'src/app/(pages)/(home)/home/_actions/fix-broken-favicon.action.ts',
  'src/app/(pages)/(shared)/_actions/shared.actions.ts',
  'src/app/_common/actions/auth.action.ts',
  'src/app/_common/actions/bookmark.action.ts',
  'src/app/_common/utils/auth-cookies.ts',
  'src/app/_common/actions/user.action.ts',
  'src/app/_common/utils/http.ts',
]);

const allowedV2OnlyAdapterFiles = new Set([
  'src/app/(pages)/(auth)/_actions/create-oauth-state.action.ts',
  'src/app/_common/utils/auth-cookies.ts',
]);

const generatedPublicArtifacts = new Set([
  'public/sw.js',
  'public/sw.js.map',
  'public/workbox-01fd22c6.js',
  'public/workbox-01fd22c6.js.map',
]);

const ignoredFiles = new Set(['public/.DS_Store']);
const failures = [];
const resolvedWebLockVersionParityDependencies = [
  '@radix-ui/react-avatar',
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-hover-card',
  '@radix-ui/react-icons',
  '@radix-ui/react-label',
  '@radix-ui/react-slot',
  '@radix-ui/react-switch',
  '@react-oauth/google',
  '@sentry/nextjs',
  '@t3-oss/env-nextjs',
  '@tanstack/react-query',
  '@tanstack/react-query-devtools',
  '@uidotdev/usehooks',
  '@vercel/analytics',
  '@vercel/speed-insights',
  '@types/next-pwa',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  'class-variance-authority',
  'clsx',
  'cmdk',
  'framer-motion',
  'geist',
  'ky',
  'lucide-react',
  'motion',
  'next',
  'next-pwa',
  'next-themes',
  'nuqs',
  'postcss',
  'qss',
  'react',
  'react-dom',
  'sass',
  'sonner',
  'tailwind-merge',
  'tailwindcss',
  'tailwindcss-animate',
  'typescript',
  'vaul',
  'zod',
  'zustand',
];
const webDesignBuildDevDependencyNames = [
  '@types/next-pwa',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  'postcss',
  'tailwindcss',
  'typescript',
];
const allowedV2WebPackageScripts = new Set(['build', 'dev', 'lint', 'start']);
const allowedV2WebDevDependencies = new Set([
  '@types/next-pwa',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  'eslint',
  'eslint-config-next',
  'postcss',
  'tailwindcss',
  'typescript',
]);
const forbiddenVisualSourcePatterns = [
  [/className\s*=/, 'className styling'],
  [/\bstyle\s*=/, 'inline style'],
  [/from ['"][^'"]*\/_core\/components/, 'core UI component import'],
  [/return\s*(?:\(|)\s*</m, 'JSX return'],
  [
    /\b(?:text|bg|rounded|px|py|mx|my|mt|mb|ml|mr|gap|flex|grid|border|shadow|w|h|min-w|max-w|min-h|max-h|font|leading|tracking|opacity|animate)-[A-Za-z0-9/:[\]._-]+/,
    'Tailwind/style token',
  ],
];

for (const relativePath of exactParityPaths) {
  const v1Path = path.join(v1WebRoot, relativePath);
  const v2Path = path.join(v2WebRoot, relativePath);
  const v1Entries = await collectFiles(v1Path, relativePath, 'v1');
  const v2Entries = await collectFiles(v2Path, relativePath, 'v2');
  const allFiles = new Set([...v1Entries.keys(), ...v2Entries.keys()]);

  for (const file of [...allFiles].sort()) {
    if (
      ignoredFiles.has(file) ||
      generatedPublicArtifacts.has(file) ||
      allowedAdapterDiffs.has(file) ||
      allowedAsyncMetadataUiDiffs.has(file) ||
      allowedSessionRoutingDiffs.has(file) ||
      allowedV2OnlyFiles.has(file)
    ) continue;

    const v1Hash = v1Entries.get(file);
    const v2Hash = v2Entries.get(file);

    if (!v1Hash) {
      failures.push(`Unexpected v2 UI file: ${file}`);
    } else if (!v2Hash) {
      failures.push(`Missing v1 UI file in v2: ${file}`);
    } else if (v1Hash !== v2Hash) {
      failures.push(`UI drift from v1: ${file}`);
    }
  }
}

await assertAllowedExceptionInventory();
await assertTsConfigParity();
await assertNextConfigParity();
await assertRuntimeDependencyParity();
await assertWebLockResolvedVersionParity();
await assertPackageSurfaceParity();
await assertOAuthStateAdapterWiring();
await assertVisibleAdapterStringsAndRedirects();
await assertAllowedV2OnlyFilesAreNonVisual();
await assertAllowedAdapterDiffsAreNonVisual();
await assertAsyncBookmarkCreationBoundary();
await assertAsyncMetadataUiDiffs();
await assertSessionRoutingDiffs();

if (failures.length > 0) {
  console.error('Web UI parity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log([
  'Web UI parity check passed.',
  `Exact v1 source/design roots checked: ${exactParityPaths.length}.`,
  `Allowed v2 API adapter diffs: ${allowedAdapterDiffs.size}.`,
  `Allowed async metadata UI diffs: ${allowedAsyncMetadataUiDiffs.size}.`,
  `Allowed session routing diffs: ${allowedSessionRoutingDiffs.size}.`,
  `Allowed v2-only adapter helpers: ${allowedV2OnlyAdapterFiles.size}.`,
  `Allowed v2-only route handlers: ${allowedV2OnlyFiles.size}.`,
  `Generated PWA artifacts ignored: ${generatedPublicArtifacts.size}.`,
  'Resolved v1 TypeScript config checked.',
  `Resolved v1 web lock versions checked: ${resolvedWebLockVersionParityDependencies.length}.`,
].join(' '));

async function collectFiles(absolutePath, relativePath, side) {
  const files = new Map();

  try {
    const entryStat = await stat(absolutePath);
    if (entryStat.isFile()) {
      files.set(relativePath, await hashFile(absolutePath));
      return files;
    }
    if (!entryStat.isDirectory()) return files;
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }

  await walk(absolutePath, relativePath, files, side);
  return files;
}

async function walk(absoluteDir, relativeDir, files, side) {
  for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.posix.join(relativeDir.split(path.sep).join(path.posix.sep), entry.name);

    if (entry.isDirectory()) {
      await walk(absolutePath, relativePath, files, side);
    } else if (entry.isFile()) {
      files.set(relativePath, await hashFile(absolutePath));
    } else if (side === 'v2') {
      failures.push(`Unexpected non-file UI entry in v2: ${relativePath}`);
    }
  }
}

async function hashFile(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function assertAllowedExceptionInventory() {
  for (const file of allowedV2OnlyAdapterFiles) {
    if (!allowedAdapterDiffs.has(file)) {
      failures.push(`Allowed v2-only adapter helper is not listed as an allowed adapter diff: ${file}`);
    }
  }

  for (const file of allowedAdapterDiffs) {
    const v1Path = path.join(v1WebRoot, file);
    const v2Path = path.join(v2WebRoot, file);
    const v1Exists = await isFile(v1Path);
    const v2Exists = await isFile(v2Path);

    if (!v2Exists) {
      failures.push(`Allowed adapter diff is missing in v2: ${file}`);
      continue;
    }

    if (allowedV2OnlyAdapterFiles.has(file)) {
      if (v1Exists) {
        failures.push(`Allowed v2-only adapter helper now exists in v1 and must be reclassified: ${file}`);
      }
      continue;
    }

    if (!v1Exists) {
      failures.push(`Allowed adapter diff is missing in v1 and must be classified as v2-only: ${file}`);
      continue;
    }

    const v1Hash = await hashFile(v1Path);
    const v2Hash = await hashFile(v2Path);
    if (v1Hash === v2Hash) {
      failures.push(`Allowed adapter diff no longer differs from v1 and should be removed from the exception list: ${file}`);
    }
  }

  for (const file of allowedV2OnlyFiles) {
    const v1Path = path.join(v1WebRoot, file);
    const v2Path = path.join(v2WebRoot, file);
    if (await isFile(v1Path)) {
      failures.push(`Allowed v2-only route handler now exists in v1 and must be reclassified: ${file}`);
    }
    if (!(await isFile(v2Path))) {
      failures.push(`Allowed v2-only route handler is missing in v2: ${file}`);
    }
  }
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertNextConfigParity() {
  const v1NextConfig = await readText(path.join(v1WebRoot, 'next.config.mjs'));
  const nextConfig = await readText(path.join(v2WebRoot, 'next.config.mjs'));
  for (const required of [
    'withSentryConfig',
    'next-pwa',
    "dest: 'public'",
    'register: true',
    'skipWaiting: true',
    'X-XSS-Protection',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'icon.horse',
    'api.microlink.io',
  ]) {
    if (!nextConfig.includes(required)) failures.push(`next.config.mjs is missing v1 behavior marker: ${required}`);
  }

  assertStringSetEqual(
    'next.config.mjs image host allow-list',
    extractStringValues(nextConfig, /\bhostname:\s*['"]([^'"]+)['"]/g),
    extractStringValues(v1NextConfig, /\bhostname:\s*['"]([^'"]+)['"]/g),
  );
  assertStringSetEqual(
    'next.config.mjs security headers',
    extractHeaderPairs(nextConfig),
    extractHeaderPairs(v1NextConfig),
  );
  assertStringSetEqual(
    'next.config.mjs image behavior',
    extractPropertyAssignments(nextConfig, ['dangerouslyAllowSVG', 'contentDispositionType', 'contentSecurityPolicy']),
    extractPropertyAssignments(v1NextConfig, ['dangerouslyAllowSVG', 'contentDispositionType', 'contentSecurityPolicy']),
  );
  assertStringSetEqual(
    'next.config.mjs PWA behavior',
    extractPropertyAssignments(nextConfig, ['dest', 'register', 'skipWaiting', 'disable']),
    extractPropertyAssignments(v1NextConfig, ['dest', 'register', 'skipWaiting', 'disable']),
  );
  assertStringSetEqual(
    'next.config.mjs Sentry behavior',
    extractPropertyAssignments(nextConfig, [
      'org',
      'project',
      'silent',
      'widenClientFileUpload',
      'tunnelRoute',
      'disableLogger',
      'automaticVercelMonitors',
    ]),
    extractPropertyAssignments(v1NextConfig, [
      'org',
      'project',
      'silent',
      'widenClientFileUpload',
      'tunnelRoute',
      'disableLogger',
      'automaticVercelMonitors',
    ]),
  );
  if (!/reactComponentAnnotation:\s*{\s*enabled:\s*true\s*,?\s*}/m.test(nextConfig)) {
    failures.push('next.config.mjs Sentry react component annotation drift from v1.');
  }
  if (!/reactComponentAnnotation:\s*{\s*enabled:\s*true\s*,?\s*}/m.test(v1NextConfig)) {
    failures.push('next.config.mjs v1 Sentry react component annotation baseline is missing.');
  }

  for (const [label, pattern] of [
    ['SVG image support', /\bdangerouslyAllowSVG:\s*true\b/],
    ['image content disposition', /\bcontentDispositionType:\s*['"]attachment['"]/],
    ['image CSP', /\bcontentSecurityPolicy:\s*["']default-src 'self'; script-src 'none'; sandbox;["']/],
    ['PWA public destination', /\bdest:\s*['"]public['"]/],
    ['PWA registration', /\bregister:\s*true\b/],
    ['PWA skipWaiting', /\bskipWaiting:\s*true\b/],
    ['PWA dev disable condition', /\bdisable:\s*process\.env\.NODE_ENV\s*===\s*['"]development['"]/],
    ['Sentry org', /\borg:\s*['"]bokdol['"]/],
    ['Sentry project', /\bproject:\s*['"]bookmarket['"]/],
    ['Sentry monitoring tunnel', /\btunnelRoute:\s*['"]\/monitoring['"]/],
    ['Sentry logger removal', /\bdisableLogger:\s*true\b/],
    ['standalone deployment output', /\boutput:\s*['"]standalone['"]/],
    ['local Google client id fallback', /NEXT_PUBLIC_GOOGLE_CLIENT_ID:\s*process\.env\.NEXT_PUBLIC_GOOGLE_CLIENT_ID\s*\?\?\s*['"]bookmarket-local-dev-client['"]/],
  ]) {
    if (!pattern.test(nextConfig)) failures.push(`next.config.mjs is missing allowed config marker: ${label}`);
  }

  assertStringSetEqual(
    'next.config.mjs env keys',
    extractNextConfigEnvKeys(nextConfig),
    ['NEXT_PUBLIC_GOOGLE_CLIENT_ID'],
  );

  for (const [label, pattern] of [
    ['route rewrites', /\brewrites\s*(?:[:(]|\()/],
    ['route redirects', /\bredirects\s*(?:[:(]|\()/],
    ['base path', /\bbasePath\s*:/],
    ['asset prefix', /\bassetPrefix\s*:/],
    ['trailing slash', /\btrailingSlash\s*:/],
    ['i18n routing', /\bi18n\s*:/],
    ['custom webpack hook', /\bwebpack\s*(?:[:(]|\()/],
    ['custom compiler config', /\bcompiler\s*:/],
    ['custom experimental config', /\bexperimental\s*:/],
    ['transpile packages', /\btranspilePackages\s*:/],
    ['custom page extensions', /\bpageExtensions\s*:/],
    ['custom dist dir', /\bdistDir\s*:/],
  ]) {
    if (pattern.test(nextConfig)) failures.push(`next.config.mjs contains unapproved UI-affecting config: ${label}`);
  }
}

async function assertTsConfigParity() {
  const v1Resolved = await resolveTsConfig(path.join(v1WebRoot, 'tsconfig.json'));
  const v2Resolved = await resolveTsConfig(path.join(v2WebRoot, 'tsconfig.json'));
  const comparedCompilerKeys = [
    'target',
    'module',
    'moduleDetection',
    'moduleResolution',
    'checkJs',
    'lib',
    'allowJs',
    'skipLibCheck',
    'strict',
    'forceConsistentCasingInFileNames',
    'esModuleInterop',
    'resolveJsonModule',
    'isolatedModules',
    'jsx',
    'incremental',
    'plugins',
    'baseUrl',
    'paths',
    'noEmit',
  ];

  for (const key of comparedCompilerKeys) {
    const v1Value = normalizeTsConfigValue(v1Resolved.compilerOptions?.[key]);
    const v2Value = normalizeTsConfigValue(v2Resolved.compilerOptions?.[key]);
    if (JSON.stringify(v1Value) !== JSON.stringify(v2Value)) {
      failures.push(`Effective tsconfig compiler option drift from v1: ${key} expected ${JSON.stringify(v1Value)}; found ${JSON.stringify(v2Value)}`);
    }
  }

  for (const key of ['include', 'exclude']) {
    const v1Value = normalizeTsConfigValue(v1Resolved[key]);
    const v2Value = normalizeTsConfigValue(v2Resolved[key]);
    if (JSON.stringify(v1Value) !== JSON.stringify(v2Value)) {
      failures.push(`Effective tsconfig ${key} drift from v1: expected ${JSON.stringify(v1Value)}; found ${JSON.stringify(v2Value)}`);
    }
  }

  const v2PathAliases = Object.keys(v2Resolved.compilerOptions?.paths ?? {});
  if (v2PathAliases.some((alias) => alias !== '~/*')) {
    failures.push(`V2 tsconfig contains non-v1 path aliases: ${v2PathAliases.join(', ')}`);
  }
}

async function resolveTsConfig(filePath, seen = new Set()) {
  if (seen.has(filePath)) {
    failures.push(`Circular tsconfig extends chain: ${filePath}`);
    return {};
  }
  seen.add(filePath);

  const config = JSON.parse(await readText(filePath));
  const parentPath = resolveTsConfigExtends(filePath, config.extends);
  const parent = parentPath ? await resolveTsConfig(parentPath, seen) : {};

  return {
    ...parent,
    ...config,
    compilerOptions: {
      ...(parent.compilerOptions ?? {}),
      ...(config.compilerOptions ?? {}),
    },
    extends: undefined,
  };
}

function resolveTsConfigExtends(filePath, extendsValue) {
  if (!extendsValue) return '';
  if (extendsValue === '@repo/typescript-config/nextjs') {
    return path.join(v1WebRoot, '../..', 'packages/typescript-config/nextjs.json');
  }
  if (extendsValue.startsWith('./') || extendsValue.startsWith('../')) {
    return path.resolve(path.dirname(filePath), extendsValue);
  }

  failures.push(`Unsupported tsconfig extends value: ${extendsValue}`);
  return '';
}

function normalizeTsConfigValue(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) return value.map(normalizeTsConfigValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeTsConfigValue(entryValue)]),
  );
}

async function assertRuntimeDependencyParity() {
  const v1Package = JSON.parse(await readText(path.join(v1WebRoot, 'package.json')));
  const v2Package = JSON.parse(await readText(path.join(v2WebRoot, 'package.json')));
  const v1LockEntries = await readWebLockImporterEntries(path.join(v1WebRoot, '../..', 'pnpm-lock.yaml'));
  const allowedMissingRuntimeDeps = new Set(['postgres']);
  const allowedExtraRuntimeDeps = new Set(['@vercel/analytics', '@vercel/speed-insights']);

  for (const dependencyName of Object.keys(v1Package.dependencies ?? {})) {
    if (allowedMissingRuntimeDeps.has(dependencyName)) continue;
    const v1Version = v1Package.dependencies?.[dependencyName];
    const v2Version = v2Package.dependencies?.[dependencyName];
    if (!v2Version) {
      failures.push(`Missing v1 runtime UI dependency in v2: ${dependencyName}`);
      continue;
    }
    if (!dependencySpecMatchesV1(dependencyName, v2Version, v1Version, v1LockEntries.get(dependencyName)?.version)) {
      failures.push(
        `Runtime UI dependency drift from v1: ${dependencyName} expected ${formatAllowedDependencySpec(v1Version, v1LockEntries.get(dependencyName)?.version)}; found ${v2Version}`,
      );
    }
  }

  for (const dependencyName of Object.keys(v2Package.dependencies ?? {})) {
    if (v1Package.dependencies?.[dependencyName]) continue;
    if (allowedExtraRuntimeDeps.has(dependencyName)) {
      const v1Version = v1Package.devDependencies?.[dependencyName];
      const v2Version = v2Package.dependencies?.[dependencyName];
      if (!v1Version) {
        failures.push(`Allowed v2 runtime dependency has no v1 dev dependency baseline: ${dependencyName}`);
        continue;
      }
      if (!dependencySpecMatchesV1(dependencyName, v2Version, v1Version, v1LockEntries.get(dependencyName)?.version)) {
        failures.push(
          `Runtime UI dependency moved from v1 dev dependency with drift: ${dependencyName} expected ${formatAllowedDependencySpec(v1Version, v1LockEntries.get(dependencyName)?.version)}; found ${v2Version}`,
        );
      }
      continue;
    }
    failures.push(`Unexpected v2 runtime dependency that could affect UI parity: ${dependencyName}`);
  }
}

async function assertWebLockResolvedVersionParity() {
  const v1LockEntries = await readWebLockImporterEntries(path.join(v1WebRoot, '../..', 'pnpm-lock.yaml'));
  const v2LockEntries = await readWebLockImporterEntries(path.join(repoRoot, 'pnpm-lock.yaml'));

  for (const dependencyName of resolvedWebLockVersionParityDependencies) {
    const v1Entry = v1LockEntries.get(dependencyName);
    const v2Entry = v2LockEntries.get(dependencyName);

    if (!v1Entry) {
      failures.push(`Missing v1 lockfile baseline for web UI dependency: ${dependencyName}`);
      continue;
    }
    if (!v2Entry) {
      failures.push(`Missing v2 lockfile entry for v1 web UI dependency: ${dependencyName}`);
      continue;
    }

    const v1ResolvedVersion = lockBaseVersion(v1Entry.version);
    const v2ResolvedVersion = lockBaseVersion(v2Entry.version);
    if (v1ResolvedVersion !== v2ResolvedVersion) {
      failures.push(
        `Web lockfile resolved UI dependency drift from v1: ${dependencyName} ${v1ResolvedVersion} -> ${v2ResolvedVersion}`,
      );
    }
  }
}

async function assertPackageSurfaceParity() {
  const v1Package = JSON.parse(await readText(path.join(v1WebRoot, 'package.json')));
  const v2Package = JSON.parse(await readText(path.join(v2WebRoot, 'package.json')));
  const v1LockEntries = await readWebLockImporterEntries(path.join(v1WebRoot, '../..', 'pnpm-lock.yaml'));

  for (const scriptName of Object.keys(v2Package.scripts ?? {})) {
    if (!allowedV2WebPackageScripts.has(scriptName)) {
      failures.push(`Unexpected v2 web package script that could change build/run behavior: ${scriptName}`);
    }
  }

  for (const [scriptName, expectedCommand] of [
    ['build', 'next build'],
    ['start', 'next start'],
  ]) {
    if (v1Package.scripts?.[scriptName] !== expectedCommand) {
      failures.push(`Unexpected v1 package script baseline for ${scriptName}: ${v1Package.scripts?.[scriptName] ?? 'missing'}`);
      continue;
    }
    if (v2Package.scripts?.[scriptName] !== expectedCommand) {
      failures.push(`V2 web package script drift from v1 for ${scriptName}: expected ${expectedCommand}; found ${v2Package.scripts?.[scriptName] ?? 'missing'}`);
    }
  }

  for (const scriptName of ['dev']) {
    if (!/\bnext dev\b/.test(v1Package.scripts?.[scriptName] ?? '')) {
      failures.push(`Unexpected v1 package script baseline for ${scriptName}: ${v1Package.scripts?.[scriptName] ?? 'missing'}`);
      continue;
    }
    if (!/\bnext dev\b/.test(v2Package.scripts?.[scriptName] ?? '')) {
      failures.push(`V2 web package script drift from v1 for ${scriptName}: expected a next dev command; found ${v2Package.scripts?.[scriptName] ?? 'missing'}`);
    }
  }

  if (v2Package.scripts?.lint !== 'tsc --noEmit') {
    failures.push(`V2 web package lint script must remain the non-rendering typecheck guard: ${v2Package.scripts?.lint ?? 'missing'}`);
  }

  for (const dependencyName of Object.keys(v2Package.devDependencies ?? {})) {
    if (!allowedV2WebDevDependencies.has(dependencyName)) {
      failures.push(`Unexpected v2 web dev dependency that could affect the copied UI build surface: ${dependencyName}`);
    }
  }

  for (const dependencyName of webDesignBuildDevDependencyNames) {
    const v1Version = v1Package.devDependencies?.[dependencyName];
    const v2Version = v2Package.devDependencies?.[dependencyName];
    if (!v1Version || !v2Version) {
      failures.push(`Web styling/build dev dependency missing v1/v2 baseline: ${dependencyName} ${v1Version ?? 'missing'} -> ${v2Version ?? 'missing'}`);
      continue;
    }
    if (!dependencySpecMatchesV1(dependencyName, v2Version, v1Version, v1LockEntries.get(dependencyName)?.version)) {
      failures.push(
        `Web styling/build dev dependency drift from v1: ${dependencyName} expected ${formatAllowedDependencySpec(v1Version, v1LockEntries.get(dependencyName)?.version)}; found ${v2Version}`,
      );
    }
  }
}

async function readWebLockImporterEntries(lockfilePath) {
  const lockfile = await readText(lockfilePath);
  return parseLockImporterEntries(extractLockImporter(lockfile, 'apps/web'));
}

function extractLockImporter(lockfile, importerName) {
  const lines = lockfile.split('\n');
  const importerStart = lines.findIndex((line) => line === `  ${importerName}:`);
  if (importerStart === -1) return '';

  const importerLines = [];
  for (const line of lines.slice(importerStart + 1)) {
    if (/^\S/.test(line)) break;
    if (/^  \S.*:\s*$/.test(line)) break;
    importerLines.push(line);
  }
  return importerLines.join('\n');
}

function parseLockImporterEntries(importerSource) {
  const entries = new Map();
  let currentSection = null;
  let currentEntry = null;

  for (const line of importerSource.split('\n')) {
    const sectionMatch = /^    (dependencies|devDependencies):\s*$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      currentEntry = null;
      continue;
    }

    if (/^    \S/.test(line)) {
      currentSection = null;
      currentEntry = null;
      continue;
    }
    if (!currentSection) continue;

    const dependencyMatch = /^      (?:'([^']+)'|([^:]+)):\s*$/.exec(line);
    if (dependencyMatch) {
      const name = dependencyMatch[1] ?? dependencyMatch[2];
      currentEntry = { name, section: currentSection, specifier: undefined, version: undefined };
      entries.set(name, currentEntry);
      continue;
    }

    if (!currentEntry) continue;
    const specifierMatch = /^        specifier:\s*(.+?)\s*$/.exec(line);
    if (specifierMatch) {
      currentEntry.specifier = normalizeLockScalar(specifierMatch[1]);
      continue;
    }
    const versionMatch = /^        version:\s*(.+?)\s*$/.exec(line);
    if (versionMatch) currentEntry.version = normalizeLockScalar(versionMatch[1]);
  }

  return entries;
}

function normalizeLockScalar(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function dependencySpecMatchesV1(dependencyName, actualSpec, v1Spec, v1ResolvedVersion) {
  if (normalizeDependencyVersion(dependencyName, actualSpec) === normalizeDependencyVersion(dependencyName, v1Spec)) {
    return true;
  }

  const v1ResolvedBaseVersion = lockBaseVersion(v1ResolvedVersion);
  if (!v1ResolvedBaseVersion) return false;

  const normalizedActualSpec = normalizeDependencyVersion(dependencyName, actualSpec);
  return normalizedActualSpec === v1ResolvedBaseVersion || normalizedActualSpec === `^${v1ResolvedBaseVersion}`;
}

function formatAllowedDependencySpec(v1Spec, v1ResolvedVersion) {
  const v1ResolvedBaseVersion = lockBaseVersion(v1ResolvedVersion);
  if (!v1ResolvedBaseVersion || v1Spec === v1ResolvedBaseVersion || v1Spec === `^${v1ResolvedBaseVersion}`) {
    return v1Spec;
  }
  return `${v1Spec} or ${v1ResolvedBaseVersion}/^${v1ResolvedBaseVersion}`;
}

function lockBaseVersion(version) {
  return typeof version === 'string' ? version.replace(/\(.*/, '') : undefined;
}

function normalizeDependencyVersion(dependencyName, version) {
  if ((dependencyName === 'react' || dependencyName === 'react-dom') && typeof version === 'string') {
    return version.replace(/^\^/, '');
  }
  return version;
}

function extractStringValues(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function extractHeaderPairs(source) {
  const headerPattern = /key:\s*['"]([^'"]+)['"],\s*value:\s*['"]([^'"]+)['"]/g;
  return [...source.matchAll(headerPattern)].map((match) => `${match[1]}=${match[2]}`);
}

function extractPropertyAssignments(source, propertyNames) {
  return propertyNames.map((propertyName) => {
    const escapedPropertyName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedPropertyName}\\s*:\\s*([^,\\n}]+)`);
    const value = pattern.exec(source)?.[1];
    return `${propertyName}=${normalizeNextConfigValue(value)}`;
  });
}

function normalizeNextConfigValue(value) {
  return (value ?? 'missing')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ');
}

function extractNextConfigEnvKeys(source) {
  const envBlock = /env:\s*{([\s\S]*?)},\s*async\s+headers/.exec(source)?.[1] ?? '';
  return [...envBlock.matchAll(/\b([A-Z][A-Z0-9_]*)\s*:/g)].map((match) => match[1]);
}

function assertStringSetEqual(label, actual, expected) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    failures.push(`${label} drift from v1: expected ${expectedSorted.join(', ')}; found ${actualSorted.join(', ')}`);
  }
}

async function assertOAuthStateAdapterWiring() {
  const files = {
    stateAction: 'src/app/(pages)/(auth)/_actions/create-oauth-state.action.ts',
    oauthHook: 'src/app/(pages)/(auth)/_hooks/use-oauth.tsx',
    googleAction: 'src/app/(pages)/(auth)/_actions/fetch-google-user-info.action.ts',
    githubAction: 'src/app/(pages)/(auth)/_actions/fetch-github-user-info.action.ts',
    githubCallback: 'src/app/(pages)/(auth)/oauth/github/page.tsx',
  };

  const stateAction = await readText(path.join(v2WebRoot, files.stateAction));
  const oauthHook = await readText(path.join(v2WebRoot, files.oauthHook));
  const googleAction = await readText(path.join(v2WebRoot, files.googleAction));
  const githubAction = await readText(path.join(v2WebRoot, files.githubAction));
  const githubCallback = await readText(path.join(v2WebRoot, files.githubCallback));

  for (const [file, marker] of [
    [files.stateAction, "fetch('/api/oauth/state'"],
    [files.oauthHook, "refreshOAuthState('google')"],
    [files.oauthHook, "refreshOAuthState('github')"],
    [files.oauthHook, 'window.setInterval'],
    [files.oauthHook, 'const googleState = oauthStates.google'],
    [files.oauthHook, 'startGoogleLogin({ state })'],
    [files.oauthHook, 'state,'],
    [files.googleAction, 'state: codeResponse.state'],
    [files.githubAction, 'state,'],
    [files.githubCallback, "searchParams.get('state')"],
    [files.githubCallback, 'fetchGithubUserInfo(code, state)'],
  ]) {
    const source = {
      [files.stateAction]: stateAction,
      [files.oauthHook]: oauthHook,
      [files.googleAction]: googleAction,
      [files.githubAction]: githubAction,
      [files.githubCallback]: githubCallback,
    }[file];

    if (!source.includes(marker)) {
      failures.push(`OAuth state adapter wiring missing marker in ${file}: ${marker}`);
    }
  }
}

async function assertVisibleAdapterStringsAndRedirects() {
  const requiredMarkersByFile = {
    'src/app/(pages)/(auth)/_actions/create-user.action.ts': [
      'An account with this email already exists. Please try logging in instead.',
      'Sign up is currently unavailable. All slots are taken.',
      'Please check your email and password are valid.',
      'Something went wrong. Please try again.',
    ],
    'src/app/(pages)/(auth)/_actions/login-user.action.ts': [
      'Invalid email or password. Please try again.',
      'Please check your email and password are valid.',
      'Something went wrong. Please try again.',
    ],
    'src/app/(pages)/(home)/home/_actions/create-bookmark.action.ts': [
      'URL is required',
      'Invalid URL',
      'Bookmark created',
      'Failed to create bookmark. Please try again.',
    ],
    'src/app/(pages)/(auth)/_actions/fetch-google-user-info.action.ts': [
      "redirect('/home')",
      "redirect('/signup?error=slots_full')",
      "redirect('/login?error=oauth_failed')",
    ],
    'src/app/(pages)/(auth)/_actions/fetch-github-user-info.action.ts': [
      "redirect('/home')",
      "redirect('/signup?error=slots_full')",
      "redirect('/login?error=oauth_failed')",
    ],
    'src/app/(pages)/(auth)/_hooks/use-oauth.tsx': [
      "scope: 'user:email'",
      "window.location.href = '/login?error=oauth_failed'",
      'client_id:',
      'redirect_uri:',
      'state,',
    ],
    'src/app/(pages)/(auth)/oauth/github/page.tsx': [
      "searchParams.get('code')",
      "searchParams.get('state')",
      'fetchGithubUserInfo(code, state)',
      'trackAuthEvent.loginSuccess',
    ],
    'src/app/(pages)/(shared)/_actions/shared.actions.ts': [
      '${username} does not exist or is a private profile',
      "redirect('/')",
    ],
    'src/app/_common/actions/auth.action.ts': [
      "post('auth/refresh'",
      "post('auth/logout'",
      'getAccessTokenCookieOptions()',
      'getRefreshTokenCookieOptions()',
      'getExpiredAuthCookieOptions()',
      "redirect('/')",
    ],
    'src/app/_common/utils/auth-cookies.ts': [
      "ACCESS_TOKEN_COOKIE_NAME = 'access_token'",
      "REFRESH_TOKEN_COOKIE_NAME = 'refresh_token'",
      'ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60',
      'REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60',
      'BOOKMARKET_COOKIE_DOMAIN',
      'NEXT_PUBLIC_DOMAIN',
      "path: '/'",
      'httpOnly: true',
      "sameSite: 'lax'",
    ],
    'src/app/_common/actions/user.action.ts': [
      "picture: user.picture ?? user.pictureUrl ?? ''",
      ".get('users/me'",
      ".patch('users/me'",
      ".get('users/check-username'",
    ],
  };

  for (const [file, markers] of Object.entries(requiredMarkersByFile)) {
    const source = await readText(path.join(v2WebRoot, file));
    for (const marker of markers) {
      if (!source.includes(marker)) {
        failures.push(`Visible adapter string or redirect marker drift in ${file}: ${marker}`);
      }
    }
  }
}

async function assertAllowedAdapterDiffsAreNonVisual() {
  for (const file of allowedAdapterDiffs) {
    const source = await readText(path.join(v2WebRoot, file));

    for (const [pattern, label] of forbiddenVisualSourcePatterns) {
      if (pattern.test(source)) {
        failures.push(`Allowed adapter diff contains visual code (${label}): ${file}`);
      }
    }
  }
}

async function assertAllowedV2OnlyFilesAreNonVisual() {
  for (const file of allowedV2OnlyFiles) {
    if (!file.endsWith('/route.ts')) {
      failures.push(`Allowed v2-only source file is not a route handler: ${file}`);
    }

    const source = await readText(path.join(v2WebRoot, file));
    if (!/\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(source)) {
      failures.push(`Allowed v2-only route handler is missing an HTTP method export: ${file}`);
    }
    if (/\bexport\s+default\b/.test(source)) {
      failures.push(`Allowed v2-only route handler contains a default export: ${file}`);
    }

    for (const [pattern, label] of forbiddenVisualSourcePatterns) {
      if (pattern.test(source)) {
        failures.push(`Allowed v2-only route handler contains visual code (${label}): ${file}`);
      }
    }
  }
}

async function assertAsyncBookmarkCreationBoundary() {
  const createBookmarkActionPath = 'src/app/(pages)/(home)/home/_actions/create-bookmark.action.ts';
  const bookmarkActionPath = 'src/app/_common/actions/bookmark.action.ts';
  const bookmarkServicePath = path.join(
    repoRoot,
    'services/api/src/main/kotlin/com/bookmarket/api/bookmarks/BookmarkService.kt',
  );

  const createBookmarkAction = await readText(path.join(v2WebRoot, createBookmarkActionPath));
  const bookmarkAction = await readText(path.join(v2WebRoot, bookmarkActionPath));
  const bookmarkService = await readText(bookmarkServicePath);

  for (const marker of ['getMetadata', 'get-metadata', 'bookmarks/metadata']) {
    if (createBookmarkAction.includes(marker)) {
      failures.push(`Bookmark creation blocks on synchronous metadata marker in ${createBookmarkActionPath}: ${marker}`);
    }
    if (bookmarkAction.includes(marker)) {
      failures.push(`Bookmark client action blocks on synchronous metadata marker in ${bookmarkActionPath}: ${marker}`);
    }
  }

  for (const marker of [
    'metadataFetchRequested(created.bookmark',
    'MetadataJobStatusDto(',
    'return created.bookmark',
  ]) {
    if (!bookmarkService.includes(marker)) {
      failures.push(`Bookmark service async creation boundary is missing marker: ${marker}`);
    }
  }
}

async function assertAsyncMetadataUiDiffs() {
  const requiredMarkersByFile = {
    'src/app/(pages)/(home)/home/_components/bookmark-card.tsx': [
      'isBookmarkMetadataActive(bookmark)',
      "aria-label='Fetching metadata'",
      'getFallbackFaviconUrl(bookmark.url)',
      'const BookmarkFavicon =',
    ],
    'src/app/(pages)/(home)/home/_components/bookmark-input.tsx': [
      'buildOptimisticBookmark',
      'queryClient.setQueryData(bookmarksQuery().queryKey',
      "metadataStatus: 'PENDING'",
      'formRef.current?.reset()',
    ],
    'src/app/(pages)/(home)/home/_components/bookmark-list.tsx': [
      'hasPendingMetadata',
      'window.setInterval',
      'void refetch()',
    ],
    'src/app/(pages)/(home)/home/_hooks/use-bookmark-context.tsx': [
      'isTransientBookmark',
      'disabled: isCurrentBookmarkRefetching || isTransientBookmark',
    ],
    'src/app/(pages)/(home)/home/_hooks/use-bookmark-refetch.tsx': [
      "metadataStatus: 'PENDING'",
      "toast.message('Refreshing metadata in the background')",
      "queryClient.invalidateQueries({ queryKey: ['bookmarks'] })",
    ],
    'src/app/_common/interfaces/bookmark.interface.ts': [
      'metadataUpdatedAt?: Date',
      'isOptimistic?: boolean',
      'export interface MetadataJobStatus',
    ],
    'src/app/_common/utils/bookmark-metadata.ts': [
      'activePendingWindowMs',
      'isBookmarkMetadataActive',
      'bookmark.metadataStatus !==',
    ],
    'src/app/_common/utils/url.ts': [
      'getFallbackFaviconUrl',
      'normalizeBookmarkUrl',
      'isValidBookmarkUrl',
    ],
  };

  for (const file of allowedAsyncMetadataUiDiffs) {
    const source = await readText(path.join(v2WebRoot, file));
    const markers = requiredMarkersByFile[file];
    if (!markers) {
      failures.push(`Async metadata UI diff is missing guard markers: ${file}`);
      continue;
    }

    for (const marker of markers) {
      if (!source.includes(marker)) {
        failures.push(`Async metadata UI diff marker missing in ${file}: ${marker}`);
      }
    }
  }
}

async function assertSessionRoutingDiffs() {
  const requiredMarkersByFile = {
    'src/middleware.ts': [
      'refreshSession',
      'nextWithAuthCookies',
      'redirectWithAuthCookies',
      'redirectToLogin',
      'BOOKMARKET_API_BASE_URL',
      'getRefreshTokenCookieOptions',
    ],
    'src/path.ts': [
      "'/health'",
      "'/signup'",
      "'/login'",
    ],
  };

  for (const file of allowedSessionRoutingDiffs) {
    const source = await readText(path.join(v2WebRoot, file));
    const markers = requiredMarkersByFile[file];
    if (!markers) {
      failures.push(`Session routing diff is missing guard markers: ${file}`);
      continue;
    }

    for (const marker of markers) {
      if (!source.includes(marker)) {
        failures.push(`Session routing diff marker missing in ${file}: ${marker}`);
      }
    }
  }
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}
