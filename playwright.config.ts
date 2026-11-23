import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests on the real Electron app (`npm run test:e2e`).
 * Vite serves the renderer on its own port, so the tests never reuse another app on 5173.
 */
export const E2E_RENDERER_PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  // One Electron window at a time: the app is a single desktop window
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${E2E_RENDERER_PORT} --strictPort`,
    url: `http://localhost:${E2E_RENDERER_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
