import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { createExportService, exportFileName } = require('../../electron/services/exportService.cjs');

function setup(savePath: string | null) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-export-test-'));
  const loaded: string[] = [];
  const win = {
    loadFile: vi.fn(async (f: string) => {
      loaded.push(fs.readFileSync(f, 'utf8'));
    }),
    webContents: { printToPDF: vi.fn(async () => Buffer.from('%PDF-fake')) },
    isDestroyed: () => false,
    destroy: vi.fn(),
  };
  const BrowserWindow = vi.fn(function () {
    return win;
  });
  const dialog = {
    showSaveDialog: vi.fn(async () => (savePath ? { canceled: false, filePath: path.join(tmp, savePath) } : { canceled: true })),
  };
  const service = createExportService({ dialog, BrowserWindow, getDefaultDir: () => tmp, tmpDir: tmp });
  return { service, dialog, BrowserWindow, win, loaded, tmp };
}

describe('Backend: ExportService (PDF + save as)', () => {
  it('builds safe file names for the dialog', () => {
    expect(exportFileName('Mi nota.md', 'pdf')).toBe('Mi nota.pdf');
    expect(exportFileName('a:b?.markdown', 'pdf')).toBe('a_b_.pdf');
    expect(exportFileName('', 'md')).toBe('documento.md');
  });

  it('renders the HTML on a hidden window and writes the PDF where the user chose', async () => {
    const { service, dialog, win, loaded, tmp } = setup('nota.pdf');
    const res = await service.exportPdf({ html: '<h1>Hola</h1>', defaultName: 'nota.md', defaultDir: 'C:\\notas' });
    expect(res).toEqual({ success: true, path: path.join(tmp, 'nota.pdf') });
    expect(fs.readFileSync(res.path, 'utf8')).toBe('%PDF-fake');
    expect(loaded).toEqual(['<h1>Hola</h1>']);
    expect(dialog.showSaveDialog.mock.calls[0][1].defaultPath).toBe(path.join('C:\\notas', 'nota.pdf'));
    expect(win.webContents.printToPDF).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 'A4', printBackground: true }));
    expect(win.destroy).toHaveBeenCalled();
    // The temp HTML is cleaned up
    await new Promise((r) => setTimeout(r, 20));
    expect(fs.readdirSync(tmp).filter((f) => f.endsWith('.html'))).toEqual([]);
  });

  it('does nothing when the dialog is cancelled or there is no content', async () => {
    const { service, BrowserWindow } = setup(null);
    expect(await service.exportPdf({ html: '<p>x</p>', defaultName: 'x' })).toEqual({ success: false, canceled: true });
    expect((await service.exportPdf({ html: '' })).success).toBe(false);
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it('saves text (e.g. a chat as Markdown) through Save as', async () => {
    const { service, tmp } = setup('chat.md');
    const res = await service.saveText({ content: '# Chat', defaultName: 'chat' });
    expect(res).toEqual({ success: true, path: path.join(tmp, 'chat.md') });
    expect(fs.readFileSync(res.path, 'utf8')).toBe('# Chat');
    expect((await service.saveText({ content: 42 as any, defaultName: 'x' })).success).toBe(false);
  });
});
