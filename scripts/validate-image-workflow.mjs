#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const services = [
  {
    name: 'web',
    image: 'ghcr.io/ericjypark/bookmarket-v2-web',
    dockerfile: 'apps/web/Dockerfile',
    requiredBuildArgs: ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GITHUB_CLIENT_ID', 'NEXT_PUBLIC_GITHUB_REDIRECT_URI'],
    terraformVariable: 'web_image'
  },
  {
    name: 'api',
    image: 'ghcr.io/ericjypark/bookmarket-v2-api',
    dockerfile: 'services/api/Dockerfile',
    requiredBuildArgs: [],
    terraformVariable: 'api_image'
  },
  {
    name: 'metadata-worker',
    image: 'ghcr.io/ericjypark/bookmarket-v2-metadata-worker',
    dockerfile: 'services/metadata-worker/Dockerfile',
    requiredBuildArgs: [],
    terraformVariable: 'metadata_worker_image'
  }
];

main();

function main() {
  const imageWorkflow = read('.github/workflows/images.yml');
  const deployWorkflow = read('.github/workflows/deploy.yml');
  const packageJson = JSON.parse(read('package.json'));
  const terraformVariables = read('infra/terraform/pi/variables.tf');

  assertPattern(imageWorkflow, /packages:\s+write/, 'Image workflow must have packages: write permission for GHCR publishing.');
  assertPattern(imageWorkflow, /runs-on:\s+ubuntu-24\.04-arm/, 'Image workflow must use the native arm64 GitHub-hosted runner.');
  assertForbidden(imageWorkflow, /docker\/setup-qemu-action@v3/, 'Image workflow should not use QEMU emulation for ARM64 builds.');
  assertPattern(imageWorkflow, /actions\/checkout@v6/, 'Image workflow must use the Node 24 checkout action.');
  assertPattern(imageWorkflow, /docker\/setup-buildx-action@v4/, 'Image workflow must set up Docker Buildx with the Node 24 action.');
  assertPattern(imageWorkflow, /docker\/login-action@v4[\s\S]*registry:\s+ghcr\.io/, 'Image workflow must log in to GHCR with the Node 24 action.');
  assertPattern(imageWorkflow, /docker\/metadata-action@v6/, 'Image workflow must generate Docker metadata with the Node 24 action.');
  assertPattern(imageWorkflow, /docker\/build-push-action@v7/, 'Image workflow must build and push with the Node 24 action.');
  assertPattern(imageWorkflow, /platforms:\s+linux\/arm64/, 'Image workflow must build linux/arm64 images.');
  assertPattern(imageWorkflow, /push:\s+true/, 'Image workflow must push images.');

  assertPattern(deployWorkflow, /packages:\s+write/, 'Deploy workflow build job must have packages: write permission for GHCR publishing.');
  assertPattern(deployWorkflow, /packages:\s+read/, 'Deploy workflow deploy job must have packages: read permission for GHCR pull secret setup.');
  assertPattern(deployWorkflow, /runs-on:\s+ubuntu-24\.04-arm/, 'Deploy workflow build job must use the native arm64 GitHub-hosted runner.');
  assertForbidden(deployWorkflow, /docker\/setup-qemu-action@v3/, 'Deploy workflow should not use QEMU emulation for ARM64 builds.');
  assertPattern(deployWorkflow, /actions\/checkout@v6/, 'Deploy workflow must use the Node 24 checkout action.');
  assertPattern(deployWorkflow, /docker\/setup-buildx-action@v4/, 'Deploy workflow must set up Docker Buildx with the Node 24 action.');
  assertPattern(deployWorkflow, /docker\/login-action@v4[\s\S]*registry:\s+ghcr\.io/, 'Deploy workflow must log in to GHCR with the Node 24 action.');
  assertPattern(deployWorkflow, /docker\/build-push-action@v7/, 'Deploy workflow must build and push with the Node 24 action.');
  assertPattern(deployWorkflow, /tailscale\/github-action@v4/, 'Deploy workflow must connect to Tailscale before SSH with the Node 24 action.');
  assertPattern(deployWorkflow, /appleboy\/ssh-action@v1\.2\.5/, 'Deploy workflow must roll out on the Raspberry Pi over SSH.');

  for (const service of services) {
    assertPattern(imageWorkflow, new RegExp(`service:\\s+${escapeRegex(service.name)}\\b`), `Image workflow is missing service matrix entry: ${service.name}`);
    assertPattern(imageWorkflow, new RegExp(`image:\\s+${escapeRegex(service.image)}\\b`), `Image workflow is missing GHCR image: ${service.image}`);
    assertPattern(imageWorkflow, new RegExp(`dockerfile:\\s+${escapeRegex(service.dockerfile)}\\b`), `Image workflow is missing Dockerfile: ${service.dockerfile}`);
    assertPattern(deployWorkflow, new RegExp(`service:\\s+${escapeRegex(service.name)}\\b`), `Deploy workflow is missing service matrix entry: ${service.name}`);
    assertPattern(deployWorkflow, new RegExp(`image:\\s+${escapeRegex(service.image)}\\b`), `Deploy workflow is missing GHCR build image: ${service.image}`);
    assertPattern(deployWorkflow, new RegExp(`dockerfile:\\s+${escapeRegex(service.dockerfile)}\\b`), `Deploy workflow is missing Dockerfile: ${service.dockerfile}`);
    assertPattern(
      deployWorkflow,
      new RegExp(`${escapeRegex(service.name)}="${escapeRegex(service.image)}:\\$\\{GHCR_TAG\\}"`),
      `Deploy workflow rollout image for ${service.name} must use ${service.image}:\${GHCR_TAG}.`
    );
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
        imageWorkflow,
        new RegExp(`${escapeRegex(buildArg)}=\\$\\{\\{\\s*vars\\.${escapeRegex(buildArg)}\\s*\\|\\|\\s*secrets\\.${escapeRegex(buildArg)}\\s*\\}\\}`),
        `Image workflow must pass ${buildArg} as a build arg from GitHub Variables with a Secrets fallback.`
      );
      assertPattern(
        deployWorkflow,
        new RegExp(`${escapeRegex(buildArg)}=\\$\\{\\{\\s*vars\\.${escapeRegex(buildArg)}\\s*\\|\\|\\s*secrets\\.${escapeRegex(buildArg)}\\s*\\}\\}`),
        `Deploy workflow must pass ${buildArg} as a build arg from GitHub Variables with a Secrets fallback.`
      );
    }
  }

  console.log(`Image workflows validated: ${services.length} GHCR linux/arm64 images with matching deploy rollout images, Dockerfiles, Terraform defaults, and local build scripts.`);
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

function assertForbidden(source, pattern, message) {
  if (pattern.test(source)) {
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
