import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_RENDERER_PORT } from '../playwright.config.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface YanoteApp {
  app: ElectronApplication;
  window: Page;
}

/**
 * Starts the real yanote (Electron) on `dataDir`, a throwaway folder: the user's notes and
 * settings are never touched. The entry file is passed instead of "." so the app does not take
 * the repo folder as something to open.
 */
export async function launchYanote(dataDir: string): Promise<YanoteApp> {
  // Terminals inside VS Code / Claude Code set ELECTRON_RUN_AS_NODE, which would start Electron as plain Node
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env;
  const app = await electron.launch({
    args: [path.join(ROOT, 'electron', 'main.cjs')],
    cwd: ROOT,
    env: {
      ...(env as Record<string, string>),
      NODE_ENV: 'development',
      YANOTE_USER_DATA: dataDir,
      YANOTE_RENDERER_URL: `http://localhost:${E2E_RENDERER_PORT}`,
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}

/** Fresh data folder with the UI in Spanish (the texts the tests look for). */
export function createDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-e2e-'));
  fs.writeFileSync(path.join(dir, 'app-config.json'), JSON.stringify({ language: 'es' }));
  return dir;
}

type Fixtures = { dataDir: string; yanote: YanoteApp };

export const test = base.extend<Fixtures>({
  // Playwright reads the fixtures a function needs from its first argument, so it must be a pattern
  // oxlint-disable-next-line no-empty-pattern
  dataDir: async ({}, provide) => {
    const dir = createDataDir();
    await provide(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  yanote: async ({ dataDir }, provide) => {
    const running = await launchYanote(dataDir);
    await provide(running);
    await running.app.close().catch(() => undefined);
  },
});

export { expect } from '@playwright/test';
