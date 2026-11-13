import type { SavedTab, TabItem } from '../types/electron';

/** Unsaved scratch notes keep their text across restarts, up to this size. */
export const MAX_SCRATCH_CHARS = 500_000;

/**
 * What to remember of the open tabs so the next start looks the same:
 * notes by path, unsaved notes with their text, terminals by shell/folder,
 * Claude chats by session (to resume them), account and pins.
 */
export function toSavedTabs(tabs: TabItem[], skipIds: string[] = []): SavedTab[] {
  const out: SavedTab[] = [];
  for (const t of tabs) {
    if (skipIds.includes(t.id)) continue;
    if (t.kind === 'terminal') {
      out.push({ kind: 'terminal', title: t.title, shell: t.shell || 'powershell', ...(t.cwd ? { cwd: t.cwd } : {}) });
    } else if (t.kind === 'claude') {
      out.push({
        kind: 'claude',
        title: t.title,
        ...(t.cwd ? { cwd: t.cwd } : {}),
        ...(t.sessionId ? { sessionId: t.sessionId } : {}),
        ...(t.accountId ? { accountId: t.accountId } : {}),
        ...(t.chatPins?.length ? { pins: t.chatPins } : {}),
        ...(t.provider && t.provider !== 'claude' ? { provider: t.provider } : {}),
      });
    } else if (t.path) {
      out.push({ kind: 'note', path: t.path, title: t.title, isPinned: Boolean(t.isPinned) });
    } else {
      out.push({ kind: 'scratch', title: t.title, content: t.content.slice(0, MAX_SCRATCH_CHARS), isPinned: Boolean(t.isPinned) });
    }
  }
  return out;
}

/** Tab for a saved entry that needs no disk read (everything but saved notes). */
export function restoreTab(saved: SavedTab, id: string): TabItem | null {
  switch (saved.kind) {
    case 'terminal':
      return { id, title: saved.title, path: null, content: '', isDirty: false, kind: 'terminal', shell: saved.shell, cwd: saved.cwd };
    case 'claude':
      return {
        id,
        title: saved.title,
        path: null,
        content: '',
        isDirty: false,
        kind: 'claude',
        cwd: saved.cwd,
        sessionId: saved.sessionId,
        accountId: saved.accountId,
        chatPins: saved.pins,
        ...(saved.provider === 'antigravity' ? { provider: 'antigravity' as const } : {}),
      };
    case 'scratch':
      // Never saved to disk: it still counts as unsaved
      return { id, title: saved.title, path: null, content: saved.content, isDirty: saved.content.trim().length > 0, isPinned: saved.isPinned };
    default:
      return null;
  }
}
