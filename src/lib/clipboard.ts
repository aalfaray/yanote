import { logError, logWarn } from './logger';

/**
 * Copies text to the clipboard. Resolves false (and logs where it came from) when the clipboard
 * is unavailable or refuses the write, so callers can tell the user.
 */
export async function copyText(text: string, scope: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      logWarn(scope, 'clipboard not available');
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    logError(scope, err, { chars: text?.length }, 'copy to clipboard failed');
    return false;
  }
}
