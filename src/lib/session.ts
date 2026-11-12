import type { TabItem } from '../types/electron';

/**
 * Workspace session: the tabs open when the app closed, so the next launch reopens them.
 * Notes saved on disk are re-read from their file (content is only stored when unsaved),
 * terminals reopen with the same shell and folder, Claude chats resume their session.
 */

/** What gets written to the config for each open tab */
export function serializeTabs(tabs: TabItem[]): TabItem[] {
  const out: TabItem[] = [];
  for (const t of tabs) {
    const base = { id: t.id, title: t.title, ...(t.isPinned ? { isPinned: true } : {}) };
    if (t.kind === 'terminal') {
      // One-off command terminals (e.g. Claude sign-in) are not worth reopening
      if (t.initialCommand) continue;
      out.push({ ...base, path: null, content: '', kind: 'terminal', shell: t.shell, cwd: t.cwd });
    } else if (t.kind === 'claude') {
      out.push({ ...base, path: null, content: '', kind: 'claude', cwd: t.cwd, sessionId: t.sessionId, ...(t.provider && t.provider !== 'claude' ? { provider: t.provider } : {}) });
    } else {
      const keepContent = !t.path || t.isDirty;
      out.push({ ...base, path: t.path, content: keepContent ? t.content : '', isDirty: Boolean(t.isDirty) });
    }
  }
  return out;
}

type ReadFile = (path: string) => Promise<{ success: boolean; content?: string }>;

/**
 * Rebuilds the saved tabs. A saved note whose file is gone is dropped; an unsaved one keeps
 * the text it had. Returns null when there is nothing to restore.
 */
export async function restoreTabs(
  saved: unknown,
  savedActiveId: string | null | undefined,
  readFile: ReadFile
): Promise<{ tabs: TabItem[]; activeTabId: string } | null> {
  if (!Array.isArray(saved) || saved.length === 0) return null;
  const tabs: TabItem[] = [];
  const seen = new Set<string>();
  for (const raw of saved as TabItem[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || seen.has(raw.id)) continue;
    seen.add(raw.id);
    const pinned = raw.isPinned ? { isPinned: true } : {};
    if (raw.kind === 'terminal') {
      tabs.push({ id: raw.id, title: raw.title, path: null, content: '', isDirty: false, kind: 'terminal', shell: raw.shell || 'powershell', cwd: raw.cwd, ...pinned });
    } else if (raw.kind === 'claude') {
      const provider = raw.provider === 'antigravity' ? { provider: 'antigravity' as const } : {};
      tabs.push({ id: raw.id, title: raw.title, path: null, content: '', isDirty: false, kind: 'claude', cwd: raw.cwd, sessionId: raw.sessionId, ...provider, ...pinned });
    } else if (raw.path && !raw.isDirty) {
      const res = await readFile(raw.path).catch(() => ({ success: false }) as { success: boolean; content?: string });
      if (!res.success || res.content === undefined) continue;
      tabs.push({ id: raw.id, title: raw.title, path: raw.path, content: res.content, isDirty: false, ...pinned });
    } else {
      tabs.push({ id: raw.id, title: raw.title, path: raw.path || null, content: String(raw.content ?? ''), isDirty: Boolean(raw.isDirty), ...pinned });
    }
  }
  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === savedActiveId) ?? tabs[0];
  return { tabs, activeTabId: active.id };
}
