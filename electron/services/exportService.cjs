const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Exports: a note rendered to PDF (Chromium's own printToPDF on a hidden window) and plain
 * text files (e.g. a Claude chat as Markdown) through the native "Save as" dialog.
 * Electron pieces are injected so the flow can be tested without a real window.
 */

/** 'Mi nota.md' -> 'Mi nota.pdf'; strips characters Windows does not allow in file names. */
function exportFileName(name, ext) {
  const base = String(name || 'documento')
    .replace(/\.(md|markdown|mdx|txt)$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  return `${base || 'documento'}.${ext}`;
}

function createExportService({ dialog, BrowserWindow, getParentWindow = () => null, getDefaultDir = () => os.homedir(), tmpDir = os.tmpdir(), translate = (text) => text }) {
  async function askSavePath({ defaultName, ext, filterName, defaultDir }) {
    const result = await dialog.showSaveDialog(getParentWindow(), {
      title: translate(ext === 'pdf' ? 'Exportar a PDF' : 'Guardar como'),
      defaultPath: path.join(defaultDir || getDefaultDir(), exportFileName(defaultName, ext)),
      filters: [{ name: filterName, extensions: [ext] }],
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  }

  /** Renders a full HTML document to PDF; `defaultDir` is where the dialog opens (the note's folder). */
  async function exportPdf({ html, defaultName, defaultDir } = {}) {
    if (typeof html !== 'string' || !html) return { success: false, error: 'No hay contenido para exportar' };
    const target = await askSavePath({ defaultName, ext: 'pdf', filterName: 'PDF', defaultDir });
    if (!target) return { success: false, canceled: true };

    // A temp file (not a data: URL) so big notes load and relative images resolve via <base>
    const tmpHtml = path.join(tmpDir, `yanote-export-${process.pid}-${Date.now()}.html`);
    let win = null;
    try {
      fs.writeFileSync(tmpHtml, html, 'utf8');
      win = new BrowserWindow({
        show: false,
        webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      await win.loadFile(tmpHtml);
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      });
      fs.writeFileSync(target, pdf);
      return { success: true, path: target };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    } finally {
      try {
        if (win && !win.isDestroyed()) win.destroy();
      } catch {
        // already gone
      }
      fs.rm(tmpHtml, { force: true }, () => {});
    }
  }

  /** Saves text through "Save as" (Markdown by default). */
  async function saveText({ content, defaultName, ext = 'md', filterName = 'Markdown', defaultDir } = {}) {
    if (typeof content !== 'string') return { success: false, error: 'Contenido no válido' };
    const target = await askSavePath({ defaultName, ext, filterName, defaultDir });
    if (!target) return { success: false, canceled: true };
    try {
      fs.writeFileSync(target, content, 'utf8');
      return { success: true, path: target };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  return { exportPdf, saveText };
}

module.exports = { createExportService, exportFileName };
