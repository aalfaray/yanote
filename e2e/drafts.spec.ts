import { test, expect, launchYanote } from './fixtures.ts';

test.describe('Notas pendientes entre reinicios', () => {
  test('el primer inicio muestra una nota vacía, sin pestaña de bienvenida', async ({ yanote }) => {
    const { window } = yanote;
    const editor = window.getByRole('textbox', { name: 'markdown editable' });

    await expect(editor).toBeVisible();
    await expect(editor).toHaveText('');
    // Tabs carry "(Doble clic para renombrar…)" in their tooltip: exactly one, the empty note
    const tabs = window.getByTitle(/\(Doble clic para renombrar/);
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toHaveText('scratch-1.md');
    await expect(window.getByText(/bienvenid/i)).toHaveCount(0);
  });

  test('el texto escrito sin guardar sigue ahí al volver a abrir yanote', async ({ yanote, dataDir }) => {
    const first = yanote.window;
    const editor = first.getByRole('textbox', { name: 'markdown editable' });
    await editor.click();
    await first.keyboard.type('Lista de compras: pan y café');
    await expect(editor).toContainText('Lista de compras: pan y café');

    // Close like the user does: title bar button, then confirm
    await first.getByTitle('Cerrar', { exact: true }).click();
    await first.getByRole('button', { name: 'Sí, cerrar' }).click();
    await yanote.app.waitForEvent('close');

    const again = await launchYanote(dataDir);
    try {
      await expect(again.window.getByRole('textbox', { name: 'markdown editable' })).toContainText('Lista de compras: pan y café');
    } finally {
      await again.app.close().catch(() => undefined);
    }
  });
});
