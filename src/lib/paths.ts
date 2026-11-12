/** Folder containing a file path (Windows or POSIX separators); null for null/bare names. */
export function parentDir(filePath: string | null): string | null {
  if (!filePath) return null;
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  if (idx < 0) return null;
  // Keep the root separator: "C:\file.md" -> "C:\", "/file.md" -> "/"
  if (idx === 0 || (idx === 2 && filePath[1] === ':')) return filePath.slice(0, idx + 1);
  return filePath.slice(0, idx);
}
