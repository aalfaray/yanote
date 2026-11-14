/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    // e2e/ holds the Playwright tests on the real app (npm run test:e2e)
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
