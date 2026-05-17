#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const checklistPath = path.join(repoRoot, 'docs/testing/v1-parity-checklist.md');
const packageJsonPath = path.join(repoRoot, 'package.json');

const requiredSections = [
  'Public Routes',
  'Auth',
  'Bookmarks',
  'Categories',
  'Command Menu',
  'Profile Settings',
  'Interaction Regression',
  'Visual Regression',
  'Non-Goals During Parity'
];

const requiredMarkers = [
  ['public route /', '`/` renders the same landing experience.'],
  ['public route /login', '`/login` renders the same login form and OAuth actions.'],
  ['public route /signup', '`/signup` renders the same signup form and slot state.'],
  ['public route /s/[username]', '`/s/[username]` renders the same public bookmark profile.'],
  ['subdomain rewrite', 'User subdomain rewrite behavior matches v1.'],
  ['shared profile click', 'Shared profile bookmark click behavior matches v1.'],
  ['email signup', 'Email signup returns the same visible success and error behavior.'],
  ['email login', 'Email login returns the same visible success and error behavior.'],
  ['Google login', 'Google login keeps the same user-facing flow.'],
  ['GitHub login', 'GitHub login keeps the same user-facing flow.'],
  ['access token refresh', 'Expired access token refresh behavior matches v1.'],
  ['logout', 'Logout clears the user session.'],
  ['bookmark create', 'User can create a bookmark by URL.'],
  ['async bookmark creation', 'Creation returns immediately before metadata fetch completes.'],
  ['bookmark order', 'Bookmark order matches v1.'],
  ['bookmark title edit', 'Bookmark title edit behavior matches v1.'],
  ['bookmark delete', 'Bookmark deletion behavior matches v1.'],
  ['bookmark open', 'Bookmark open behavior matches v1.'],
  ['copy URL', 'Copy URL behavior matches v1.'],
  ['metadata refetch visual parity', 'Metadata refetch behavior matches v1 visually.'],
  ['category creation', 'Category creation behavior matches v1.'],
  ['category filter query', 'Category filter query parameter behavior matches v1.'],
  ['bookmark category assignment', 'Bookmark category assignment and removal match v1.'],
  ['mobile category drawer', 'Mobile category drawer behavior matches v1.'],
  ['command menu shortcut', 'Keyboard shortcut opens command menu.'],
  ['command menu recent bookmarks', 'Recent bookmark display matches v1.'],
  ['command menu search filtering', 'Search filtering behavior matches v1 until server search replaces it.'],
  ['command menu category selection', 'Category selection behavior matches v1.'],
  ['profile avatar menu', 'User avatar opens the profile/settings menu.'],
  ['edit profile dialog', 'Settings opens the `Edit profile` dialog.'],
  ['profile fields', '`First Name`, `Last Name`, and `Personal Subdomain` fields match v1.'],
  ['profile subdomain visual', 'Personal subdomain renders the same `https://` and `.bmkt.tech` visual composition.'],
  ['taken username validation', 'Taken username validation and disabled save behavior match v1.'],
  ['profile save toast', 'Saving a valid profile change shows the same success toast and closes the dialog.'],
  ['local-only interactions', 'Local-only interaction checks must not target production.'],
  ['context menu actions', 'Desktop bookmark context menu exposes and preserves Copy, Rename, Refetch, Delete, and Category actions.'],
  ['mobile filter query parameter', 'Mobile category drawer filters through the same `c` query parameter.'],
  ['desktop visual regression', 'Desktop screenshots match v1 for all main routes.'],
  ['mobile visual regression', 'Mobile screenshots match v1 for all main routes.'],
  ['empty states', 'Empty states match v1.'],
  ['loading and error states', 'Loading and error states match v1.'],
  ['marketplace UI non-goal', 'Marketplace UI.'],
  ['visual redesign non-goal', 'Visual redesign.'],
  ['new category model non-goal', 'New category model visible to users.'],
  ['new search ranking non-goal', 'New search ranking visible to users.']
];

const requiredCoverageCommands = [
  'pnpm test:v1-routing-parity',
  'pnpm test:v1-auth-parity',
  'pnpm test:api',
  'pnpm test:v1-interactions',
  'pnpm check:web-ui-parity',
  'pnpm test:v1-visual:verify',
  'pnpm test:v1-visual:public',
  'pnpm test:v1-visual:seeded'
];

const requiredCoverageFiles = ['docs/testing/oauth-verification.md'];
const forbiddenPatterns = [
  [/(^|\n)\s*-\s*\[\s\]/, 'unchecked Markdown checkbox'],
  [/\b(TODO|TBD|FIXME|unchecked)\b/i, 'unfinished checklist marker']
];

const failures = [];

main();

function main() {
  const checklist = readText(checklistPath);
  const packageJson = readJson(packageJsonPath);

  assertNoForbiddenMarkers(checklist);
  assertSections(checklist);
  assertRequiredMarkers(checklist);
  assertCoverageCommands(checklist, packageJson);
  assertCoverageFiles(checklist);

  if (failures.length > 0) {
    console.error('V1 parity checklist validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `V1 parity checklist validated: ${requiredSections.length} sections, ${requiredMarkers.length} parity markers, ${requiredCoverageCommands.length} coverage commands.`
  );
}

function assertNoForbiddenMarkers(checklist) {
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(checklist)) {
      failures.push(`Found ${label}.`);
    }
  }
}

function assertSections(checklist) {
  for (const section of requiredSections) {
    if (!checklist.includes(`## ${section}`)) {
      failures.push(`Missing required section: ${section}`);
    }
  }
}

function assertRequiredMarkers(checklist) {
  for (const [label, marker] of requiredMarkers) {
    if (!checklist.includes(marker)) {
      failures.push(`Missing parity checklist marker for ${label}: ${marker}`);
    }
  }
}

function assertCoverageCommands(checklist, packageJson) {
  const scripts = packageJson.scripts ?? {};
  for (const command of requiredCoverageCommands) {
    if (!checklist.includes(`\`${command}\``)) {
      failures.push(`Missing documented coverage command: ${command}`);
    }

    const scriptName = command.replace(/^pnpm\s+/, '');
    if (!Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
      failures.push(`Documented coverage command has no package.json script: ${command}`);
    }
  }
}

function assertCoverageFiles(checklist) {
  for (const file of requiredCoverageFiles) {
    if (!checklist.includes(`\`${file}\``)) {
      failures.push(`Missing documented coverage file: ${file}`);
    }
    if (!fs.existsSync(path.join(repoRoot, file))) {
      failures.push(`Documented coverage file does not exist: ${file}`);
    }
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    failures.push(`Unable to read ${path.relative(repoRoot, filePath)}: ${error.message}`);
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`Unable to read ${path.relative(repoRoot, filePath)} as JSON: ${error.message}`);
    return {};
  }
}
