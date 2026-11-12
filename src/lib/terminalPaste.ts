import type { ElectronAPI } from '../types/electron';

/**
 * Ctrl+V in the integrated terminal: text is pasted as usual. A copied image (screenshot, etc.) has no
 * text, so it is saved as a temp PNG and its path is pasted instead; CLIs like Claude Code attach it.
 */
export async function pasteFromClipboard(
  term: { paste: (data: string) => void },
  api: Pick<ElectronAPI, 'saveClipboardImage'> | undefined
): Promise<void> {
  let text = '';
  try {
    text = (await navigator.clipboard?.readText()) ?? '';
  } catch {
    // no text on the clipboard (or not readable)
  }
  if (text) {
    term.paste(text);
    return;
  }
  const imagePath = await api?.saveClipboardImage?.().catch(() => null);
  if (imagePath) term.paste(/\s/.test(imagePath) ? `"${imagePath}"` : imagePath);
}
