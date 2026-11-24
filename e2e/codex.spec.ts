import { test, expect, launchYanote } from './fixtures.ts';

type Renderer = { electronAPI: {
  getAppConfig: () => Promise<{ openTabs?: { kind?: string; provider?: string }[] }>;
  codexLoginCommand: () => Promise<string>;
} };

test('Codex opens through real Electron IPC and remains a Codex tab after restarting', async ({ yanote, dataDir }) => {
  const { window } = yanote;
  await window.getByTitle('Elegir tipo de pestaña nueva').click();
  await window.getByRole('menuitem', { name: /Chat con Codex/ }).click();
  await expect(window.getByLabel('Mensaje para Codex')).toBeVisible();
  await expect(window.getByLabel('Modo de permisos')).toHaveValue('read-only');
  await expect(window.getByLabel('Modelo', { exact: true })).toBeVisible();
  await expect(window.getByLabel('Iniciar sesión en Codex')).toBeVisible();
  await expect(window.getByText(/No se pudo iniciar Codex/)).toHaveCount(0);
  await expect.poll(async () => window.evaluate(async () => {
    const config = await (globalThis as unknown as Renderer).electronAPI.getAppConfig();
    return config.openTabs?.some((t) => t.kind === 'claude' && t.provider === 'codex');
  })).toBe(true);
  const loginCommand = await window.evaluate(() => (globalThis as unknown as Renderer).electronAPI.codexLoginCommand());
  expect(loginCommand).toContain('codex.exe');
  expect(loginCommand).toMatch(/ login$/);
  const closed = yanote.app.waitForEvent('close');
  await window.getByTitle('Cerrar', { exact: true }).click();
  await window.getByRole('button', { name: 'Sí, cerrar' }).click();
  await closed;
  const again = await launchYanote(dataDir);
  try {
    await expect(again.window.getByLabel('Mensaje para Codex')).toBeVisible();
    await expect(again.window.getByLabel('Modo de permisos')).toHaveValue('read-only');
    await expect(again.window.getByLabel('Modelo', { exact: true })).toBeVisible();
  } finally {
    const closedAgain = again.app.waitForEvent('close');
    await again.window.getByTitle('Cerrar', { exact: true }).click();
    await again.window.getByRole('button', { name: 'Sí, cerrar' }).click();
    await closedAgain;
  }
});
