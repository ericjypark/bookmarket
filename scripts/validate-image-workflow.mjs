#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesWorkflowPath = path.join(repoRoot, '.github/workflows/images.yml');

const services = [
  {
    name: 'web',
    image: 'ghcr.io/eric-jy-park/bookmarket-v2-web',
    dockerfile: 'apps/web/Dockerfile',
    requiredBuildArgs: ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GITHUB_CLIENT_ID', 'NEXT_PUBLIC_GITHUB_REDIRECT_URI'],
    terraformVariable: 'web_image'
  },
  {
    name: 'api',
    image: 'ghcr.io/eric-jy-park/bookmarket-v2-api',
    dockerfile: 'services/api/Dockerfile',
    requiredBuildArgs: [],
    terraformVariable: 'api_image'
  },
  {
    name: 'metadata-worker',
    image: 'ghcr.io/eric-jy-park/bookmarket-v2-metadata-worker',
    dockerfile: 'services/metadata-worker/Dockerfile',
    requiredBuildArgs: [],
    terraformVariable: 'metadata_worker_image'
  }
];

main();

function main() {
  const workflow = read('.github/workflows/images.yml');
  const packageJson = JSON.parse(read('package.json'));
  const terraformVariables = read('infra/terraform/pi/variables.tf');

  assertPattern(workflow, /packages:\s+write/, 'Image workflow must have packages: write permission for GHCR publishing.');
  assertPattern(workflow, /docker\/setup-qemu-action@v3/, 'Image workflow must set up QEMU for ARM64 builds.');
  assertPattern(workflow, /docker\/setup-buildx-action@v3/, 'Image workflow must set up Docker Buildx.');
  assertPattern(workflow, /docker\/login-action@v3[\s\S]*registry:\s+ghcr\.io/, 'Image workflow must log in to GHCR.');
  assertPattern(workflow, /platforms:\s+linux\/arm64/, 'Image workflow must build linux/arm64 images.');
  assertPattern(workflow, /push:\s+true/, 'Image workflow must push images.');

  for (const service of services) {
    assertPattern(workflow, new RegExp(`service:\\s+${escapeRegex(service.name)}\\b`), `Image workflow is missing service matrix entry: ${service.name}`);
    assertPattern(workflow, new RegExp(`image:\\s+${escapeRegex(service.image)}\\b`), `Image workflow is missing GHCR image: ${service.image}`);
    assertPattern(workflow, new RegExp(`dockerfile:\\s+${escapeRegex(service.dockerfile)}\\b`), `Image workflow is missing Dockerfile: ${service.dockerfile}`);
    assertExists(service.dockerfile, `Dockerfile does not exist: ${service.dockerfile}`);
    assertPattern(terraformVariables, new RegExp(`variable\\s+"${service.terraformVariable}"[\\s\\S]*${escapeRegex(service.image)}:latest`), `Terraform default image for ${service.name} must match GHCR image.`);
    const buildScript = packageJson.scripts?.[`image:build:${service.name}`] ?? '';
    assertPattern(buildScript, /--platform linux\/arm64/, `package.json must build linux/arm64 for ${service.name}.`);
    assertPattern(buildScript, new RegExp(`-f\\s+${escapeRegex(service.dockerfile)}\\b`), `package.json build script for ${service.name} must use ${service.dockerfile}.`);

    const dockerfile = read(service.dockerfile);
    assertPattern(dockerfile, /USER\s+\S+/, `Dockerfile for ${service.name} must run as a non-root user.`);
    for (const buildArg of service.requiredBuildArgs) {
      assertPattern(dockerfile, new RegExp(`ARG\\s+${escapeRegex(buildArg)}=`), `Dockerfile for ${service.name} must declare ${buildArg}.`);
      assertPattern(
        workflow,
        new RegExp(`${escapeRegex(buildArg)}=\\$\\{\\{\\s*vars\\.${escapeRegex(buildArg)}\\s*\\|\\|\\s*secrets\\.${escapeRegex(buildArg)}\\s*\\}\\}`),
        `Image workflow must pass ${buildArg} as a build arg from GitHub Variables with a Secrets fallback.`
      );
    }
  }

  console.log(`Image workflow validated: ${services.length} GHCR linux/arm64 images with matching Dockerfiles, Terraform defaults, and local build scripts.`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertExists(relativePath, message) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(message);
  }
}

function assertPattern(source, pattern, message) {
  if (!pattern.test(source)) {
    fail(message);
  }
}

function fail(message) {
  console.error(`[image-workflow] ${message}`);
  process.exit(1);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
