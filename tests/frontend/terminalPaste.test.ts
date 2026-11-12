import { describe, it, expect, vi, beforeEach } from 'vitest';

import { pasteFromClipboard } from '../../src/lib/terminalPaste';

function setClipboardText(readText: () => Promise<string>) {
  Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
}

describe('Terminal Ctrl+V', () => {
  let term: { paste: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    term = { paste: vi.fn() };
  });

  it('pastes text when the clipboard has text', async () => {
    setClipboardText(async () => 'echo hola');
    const saveClipboardImage = vi.fn();
    await pasteFromClipboard(term, { saveClipboardImage });
    expect(term.paste).toHaveBeenCalledWith('echo hola');
    expect(saveClipboardImage).not.toHaveBeenCalled();
  });

  it('pastes the saved image path when the clipboard only has an image', async () => {
    setClipboardText(async () => '');
    await pasteFromClipboard(term, { saveClipboardImage: async () => 'C:\\Temp\\yanote-paste\\imagen-1.png' });
    expect(term.paste).toHaveBeenCalledWith('C:\\Temp\\yanote-paste\\imagen-1.png');
  });

  it('quotes image paths that contain spaces', async () => {
    setClipboardText(async () => {
      throw new Error('no text');
    });
    await pasteFromClipboard(term, { saveClipboardImage: async () => 'C:\\Mis Archivos\\imagen-1.png' });
    expect(term.paste).toHaveBeenCalledWith('"C:\\Mis Archivos\\imagen-1.png"');
  });

  it('does nothing when the clipboard is empty', async () => {
    setClipboardText(async () => '');
    await pasteFromClipboard(term, { saveClipboardImage: async () => null });
    expect(term.paste).not.toHaveBeenCalled();
  });
});
