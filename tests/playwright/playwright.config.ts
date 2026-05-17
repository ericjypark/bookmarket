import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BOOKMARKET_BASE_URL ?? 'https://bmkt.ericjypark.com';
const storageState = process.env.BOOKMARKET_AUTH_STORAGE || undefined;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  snapshotDir: '__screenshots__',
  use: {
    baseURL,
    storageState,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'tablet-834',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 834, height: 1112 },
        isMobile: false,
      },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
