#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const visualSpecPath = path.join(repoRoot, 'tests/playwright/v1-visual-baseline.spec.ts');
const configPath = path.join(repoRoot, 'tests/playwright/playwright.config.ts');
const snapshotDir = path.join(
  repoRoot,
  'tests/playwright/__screenshots__/v1-visual-baseline.spec.ts-snapshots'
);

const requiredRoutes = [
  { name: 'landing', scope: 'public', marker: "path: '/'" },
  { name: 'login', scope: 'public', marker: "path: '/login'" },
  { name: 'signup', scope: 'public', marker: "path: '/signup'" },
  { name: 'home', scope: 'seeded', marker: "path: '/home'", extraMarker: 'requiresAuth: true' },
  {
    name: 'shared-profile',
    scope: 'seeded',
    marker: 'path: () => `/s/${seedUsername}`',
    extraMarker: 'requiresSeedUsername: true'
  }
];

const requiredProjects = [
  { name: 'desktop-1440', viewport: 'viewport: { width: 1440, height: 1000 }' },
  { name: 'tablet-834', viewport: 'viewport: { width: 834, height: 1112 }' },
  { name: 'mobile-390', viewport: 'viewport: { width: 390, height: 844 }' }
];

const failures = [];

main();

function main() {
  const spec = readText(visualSpecPath);
  const config = readText(configPath);
  const snapshots = listSnapshotFiles(snapshotDir);

  assertSpecShape(spec);
  assertConfigShape(config);
  assertSnapshotMatrix(snapshots);

  if (failures.length > 0) {
    console.error('Visual baseline matrix check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Visual baseline matrix validated: ${requiredRoutes.length} routes x ${requiredProjects.length} viewports = ${
      requiredRoutes.length * requiredProjects.length
    } PNG baselines.`
  );
}

function assertSpecShape(spec) {
  for (const route of requiredRoutes) {
    for (const marker of [`name: '${route.name}'`, `scope: '${route.scope}'`, route.marker, route.extraMarker].filter(Boolean)) {
      if (!spec.includes(marker)) {
        failures.push(`Missing visual spec marker for ${route.name}: ${marker}`);
      }
    }
  }

  for (const marker of [
    "BOOKMARKET_VISUAL_SCOPE ?? 'all'",
    'BOOKMARKET_AUTH_STORAGE',
    'BOOKMARKET_SEED_USERNAME',
    "await expect(page).toHaveScreenshot(`${testInfo.project.name}-${route.name}.png`",
    'maxDiffPixelRatio: 0.001'
  ]) {
    if (!spec.includes(marker)) {
      failures.push(`Missing visual spec guard marker: ${marker}`);
    }
  }
}

function assertConfigShape(config) {
  for (const project of requiredProjects) {
    for (const marker of [`name: '${project.name}'`, project.viewport]) {
      if (!config.includes(marker)) {
        failures.push(`Missing Playwright project marker for ${project.name}: ${marker}`);
      }
    }
  }

  for (const marker of ["snapshotDir: '__screenshots__'", "baseURL = process.env.BOOKMARKET_BASE_URL"]) {
    if (!config.includes(marker)) {
      failures.push(`Missing Playwright config marker: ${marker}`);
    }
  }
}

function assertSnapshotMatrix(snapshots) {
  for (const project of requiredProjects) {
    for (const route of requiredRoutes) {
      const snapshotPattern = new RegExp(
        `^${escapeRegExp(project.name)}-${escapeRegExp(route.name)}-${escapeRegExp(project.name)}-.+\\.png$`
      );
      const matches = snapshots.filter((file) => snapshotPattern.test(file));
      if (matches.length === 0) {
        failures.push(`Missing PNG baseline for ${project.name} / ${route.name}`);
        continue;
      }

      for (const file of matches) {
        assertPngFile(path.join(snapshotDir, file));
      }
    }
  }
}

function assertPngFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const hasSignature = pngSignature.every((byte, index) => buffer[index] === byte);
  if (!hasSignature) {
    failures.push(`Baseline is not a PNG: ${path.relative(repoRoot, filePath)}`);
  }
  if (buffer.length < 1024) {
    failures.push(`Baseline PNG is unexpectedly small: ${path.relative(repoRoot, filePath)}`);
  }
}

function listSnapshotFiles(dir) {
  if (!fs.existsSync(dir)) {
    failures.push(`Missing visual snapshot directory: ${path.relative(repoRoot, dir)}`);
    return [];
  }
  return fs.readdirSync(dir).filter((entry) => entry.endsWith('.png'));
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    failures.push(`Unable to read ${path.relative(repoRoot, filePath)}: ${error.message}`);
    return '';
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
