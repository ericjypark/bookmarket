import { expect, test } from '@playwright/test';

const seedUsername = process.env.BOOKMARKET_SEED_USERNAME;
const authStorage = process.env.BOOKMARKET_AUTH_STORAGE;
const visualScope = process.env.BOOKMARKET_VISUAL_SCOPE ?? 'all';

type BaselineRoute = {
  name: string;
  path: string | (() => string);
  scope: 'public' | 'seeded';
  requiresAuth?: boolean;
  requiresSeedUsername?: boolean;
};

const routes: BaselineRoute[] = [
  {
    name: 'landing',
    scope: 'public',
    path: '/',
  },
  {
    name: 'login',
    scope: 'public',
    path: '/login',
  },
  {
    name: 'signup',
    scope: 'public',
    path: '/signup',
  },
  {
    name: 'home',
    scope: 'seeded',
    path: '/home',
    requiresAuth: true,
  },
  {
    name: 'shared-profile',
    scope: 'seeded',
    path: () => `/s/${seedUsername}`,
    requiresSeedUsername: true,
  },
];

for (const route of routes) {
  const skipReason = visualScope !== 'all' && route.scope !== visualScope
    ? `BOOKMARKET_VISUAL_SCOPE=${visualScope} excludes ${route.scope} route`
    : route.requiresAuth && !authStorage
    ? 'BOOKMARKET_AUTH_STORAGE is required'
    : route.requiresSeedUsername && !seedUsername
      ? 'BOOKMARKET_SEED_USERNAME is required'
      : '';
  const defineTest = skipReason ? test.skip : test;

  defineTest(`v1 visual baseline: ${route.name}${skipReason ? ` (${skipReason})` : ''}`, async ({ page }, testInfo) => {

    const path = typeof route.path === 'function' ? route.path() : route.path;

    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
      `,
    });
    await page.locator('body').waitFor({ state: 'visible' });

    await expect(page).toHaveScreenshot(`${testInfo.project.name}-${route.name}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.001,
    });
  });
}
