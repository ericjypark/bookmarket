#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const help = args.has('--help') || args.has('-h');
const allowedArgs = new Set(['--dry-run', '--help', '-h']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

const repoRoot = process.cwd();
const requestedProfileDir =
  (process.env.BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR ?? 'artifacts/auth/oauth-provider-profile').trim();
const markerFileName = '.bookmarket-dedicated-oauth-provider-profile';
const metadataFileName = 'bookmarket-oauth-provider-profile.json';

main();

function main() {
  if (help) {
    usage();
    return;
  }
  if (unknownArgs.length > 0) {
    fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }
  if (!requestedProfileDir) {
    fail('BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR must not be empty.');
  }

  const profileDir = resolveWorkspacePath(requestedProfileDir);
  assertDedicatedProviderUserDataDir(profileDir);

  section('Bookmarket OAuth Provider Browser Profile Preparation');
  line('This helper prepares an isolated Chromium user-data directory for dedicated Google/GitHub provider test accounts.');
  line('It does not open a browser, visit providers, store passwords, or create OAuth signoff evidence.');
  line(`Profile directory: ${profileDir}`);
  line(`Marker file: ${path.join(profileDir, markerFileName)}`);

  if (dryRun) {
    line('Dry run: no files or directories will be written.');
    printNextSteps(profileDir);
    return;
  }

  prepareProfileDirectory(profileDir);
  printNextSteps(profileDir);
}

function prepareProfileDirectory(profileDir) {
  const markerPath = path.join(profileDir, markerFileName);
  const metadataPath = path.join(profileDir, metadataFileName);

  if (fs.existsSync(profileDir)) {
    const stat = fs.statSync(profileDir);
    if (!stat.isDirectory()) {
      fail(`Profile path exists but is not a directory: ${profileDir}`);
    }

    const entries = fs.readdirSync(profileDir).filter((entry) => entry !== '.DS_Store');
    if (entries.length > 0 && !entries.includes(markerFileName)) {
      fail(
        `Profile directory is not empty and lacks ${markerFileName}; refusing to reuse a possibly real-user browser profile.`
      );
    }
  } else {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  fs.writeFileSync(
    markerPath,
    [
      'Dedicated Bookmarket OAuth provider smoke browser profile.',
      'Use only for local/staging Google and GitHub provider test accounts.',
      'Do not point BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR at a real-user Chrome/Chromium profile.',
      ''
    ].join('\n'),
    { flag: 'w' }
  );
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        purpose: 'bookmarket-oauth-provider-smoke',
        dedicatedProviderProfile: true,
        createdAt: new Date().toISOString(),
        profileDir,
        nextCommandEnv: {
          BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR: profileDir,
          BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE: '1'
        }
      },
      null,
      2
    ) + '\n',
    { flag: 'w' }
  );

  line('Profile directory prepared.');
}

function printNextSteps(profileDir) {
  section('Next Steps');
  bullet('Open the real OAuth smoke with this dedicated profile only after the dedicated provider test accounts exist.');
  bullet('Sign into the dedicated Google/GitHub provider test accounts in this profile when the browser opens.');
  bullet('The profile path alone is not signoff evidence; the smoke must still verify /api/v1/users/me identity.');
  line('');
  line('Use these env vars with the real smoke command:');
  line(`export BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR='${profileDir.replaceAll("'", "'\\''")}'`);
  line('export BOOKMARKET_CONFIRM_DEDICATED_PROVIDER_BROWSER_PROFILE=1');
}

function resolveWorkspacePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function assertDedicatedProviderUserDataDir(profileDir) {
  const normalised = profileDir.replaceAll(path.sep, '/').toLowerCase();
  const unsafeProfilePattern =
    /(?:\/\.config\/(?:chromium|google-chrome)|\/library\/application support\/google\/chrome)(?:\/(?:default|profile [0-9]+))?$/;
  if (unsafeProfilePattern.test(normalised)) {
    fail(
      'BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR must be a dedicated provider-test browser profile directory; refusing a known default Chrome/Chromium real-user profile path.'
    );
  }
}

function usage() {
  console.log(`Usage: node scripts/prepare-oauth-provider-profile.mjs [--dry-run]

Prepares an isolated Chromium user-data directory for the guarded Bookmarket
OAuth provider smoke. Defaults to artifacts/auth/oauth-provider-profile, or set
BOOKMARKET_OAUTH_PROVIDER_USER_DATA_DIR to choose a different dedicated path.
`);
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
  console.error(`[prepare-oauth-provider-profile] ${message}`);
  process.exit(1);
}
