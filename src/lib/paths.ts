/** Folder containing a file path (Windows or POSIX separators); null for null/bare names. */
export function parentDir(filePath: string | null): string | null {
  if (!filePath) return null;
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  if (idx < 0) return null;
  // Keep the root separator: "C:\file.md" -> "C:\", "/file.md" -> "/"
  if (idx === 0 || (idx === 2 && filePath[1] === ':')) return filePath.slice(0, idx + 1);
  return filePath.slice(0, idx);
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
