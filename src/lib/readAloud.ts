import { logError } from './logger';

/** Window event that asks the view owning `targetId` (chat, note editor or terminal tab) to read text aloud. */
export const READ_ALOUD_EVENT = 'yanote:read-aloud';

export interface ReadAloudRequest {
  /** tab id of the view that should read it (its own player bar shows) */
  targetId: string;
  text: string;
}

/** Asks a tab's view to read `text` aloud (right-click > "Leer en voz alta"). */
export function requestReadAloud(targetId: string, text: string): void {
  try {
    const clean = text.trim();
    if (!targetId || !clean) return;
    window.dispatchEvent(new CustomEvent<ReadAloudRequest>(READ_ALOUD_EVENT, { detail: { targetId, text: clean } }));
  } catch (err) {
    logError('readAloud.requestReadAloud', err, { targetId, length: text?.length });
  }
}

/** Which tab reads the selection: the chat or terminal it came from, else the tab on screen. */
export function readAloudTarget(chatTabId: string | null, termTabId: string | null, activeTabId: string | null | undefined): string | null {
  try {
    return chatTabId || termTabId || activeTabId || null;
  } catch (err) {
    logError('readAloud.readAloudTarget', err);
    return null;
  }
}
