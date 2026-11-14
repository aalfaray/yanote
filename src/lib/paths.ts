import { logError } from './logger';

/** Folder containing a file path (Windows or POSIX separators); null for null/bare names. */
export function parentDir(filePath: string | null): string | null {
  if (!filePath) return null;
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  if (idx < 0) return null;
  // Keep the root separator: "C:\file.md" -> "C:\", "/file.md" -> "/"
  if (idx === 0 || (idx === 2 && filePath[1] === ':')) return filePath.slice(0, idx + 1);
  return filePath.slice(0, idx);
}

/** Parent for folder navigation; drive, POSIX and network share roots have no parent. */
export function parentFolder(folder: string): string | null {
  const trimmed = folder.replace(/[\\/]+$/, '');
  if (!trimmed || /^[a-z]:$/i.test(trimmed) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+$/.test(trimmed)) return null;
  return parentDir(trimmed);
}

/**
 * Breadcrumb segments of a folder, each with the full path to jump to:
 * "C:\Users\me" -> [C:\, Users, me]; "/home/me" -> [/, home, me]; "\\srv\share\x" -> [\\srv\share, x].
 */
export function pathCrumbs(folder: string | null | undefined): { name: string; path: string }[] {
  try {
    if (!folder) return [];
    const crumbs: { name: string; path: string }[] = [];
    let current: string | null = folder.replace(/[\\/]+$/, '') || folder;
    while (current) {
      const up = parentFolder(current);
      const name = up ? baseName(current) : current.replace(/[\\/]+$/, '') || current;
      crumbs.unshift({ name, path: /^[a-z]:$/i.test(current) ? `${current}\\` : current });
      if (!up || up === current) break;
      current = up;
    }
    return crumbs;
  } catch (err) {
    logError('paths.pathCrumbs', err, { folder });
    return folder ? [{ name: folder, path: folder }] : [];
  }
}

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

/** Files yanote opens as notes when dropped on the window (by name: Windows gives .md no MIME type). */
export function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Last segment of a Windows or POSIX path. */
export function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

/** Full path of a tab's note: its file, or where an unsaved note would go in the notes folder. */
export function notePathOf(tab: { path?: string | null; title: string }, notesDir: string | null | undefined): string {
  try {
    if (tab.path) return tab.path;
    const baseDir = notesDir || '';
    const sep = baseDir.includes('\\') ? '\\' : '/';
    return baseDir ? `${baseDir}${sep}${tab.title}` : tab.title;
  } catch (err) {
    logError('paths.notePathOf', err, { title: tab?.title });
    return tab?.title ?? '';
  }
}
