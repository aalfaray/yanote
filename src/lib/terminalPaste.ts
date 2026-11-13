import type { ElectronAPI } from '../types/electron';
import { logError, logWarn } from './logger';

/**
 * Ctrl+V in the integrated terminal: text is pasted as usual. A copied image (screenshot, etc.) has no
 * text, so it is saved as a temp PNG and its path is pasted instead; CLIs like Claude Code attach it.
 */
export async function pasteFromClipboard(
  term: { paste: (data: string) => void },
  api: Pick<ElectronAPI, 'saveClipboardImage'> | undefined
): Promise<void> {
  try {
    let text = '';
    try {
      text = (await navigator.clipboard?.readText()) ?? '';
    } catch (err) {
      // no text on the clipboard (or not readable): try an image below
      logWarn('terminalPaste.readText', `clipboard text not readable: ${(err as Error)?.message ?? err}`);
    }
    if (text) {
      term.paste(text);
      return;
    }
    const imagePath = await api?.saveClipboardImage?.().catch((err: unknown) => {
      logError('terminalPaste.saveClipboardImage', err);
      return null;
    });
    if (imagePath) term.paste(/\s/.test(imagePath) ? `"${imagePath}"` : imagePath);
  } catch (err) {
    logError('terminalPaste.pasteFromClipboard', err);
  }
}
