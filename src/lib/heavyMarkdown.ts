// Safety net for truly huge files. Table cells and code blocks no longer matter here: they render
// as static HTML until clicked (vite-plugins/mdxeditorLazyTableCells + components/LazyCodeBlock),
// so a 525 KB roadmap with ~3,300 cells opens in the rich editor in about a second. Only files far
// beyond that size fall back to the plain source editor.

export const HEAVY_MAX_CHARS = 3_000_000;

export function isHeavyMarkdown(markdown: string): boolean {
  return markdown.length > HEAVY_MAX_CHARS;
}
