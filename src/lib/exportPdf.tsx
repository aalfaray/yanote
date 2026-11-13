import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Print stylesheet for exported notes: clean, light, readable on A4. */
const PRINT_CSS = `
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #1a1a1a; background: #fff; font: 11pt/1.55 "Segoe UI", system-ui, -apple-system, sans-serif; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 0.5em; break-after: avoid; }
  h1 { font-size: 22pt; border-bottom: 2px solid #1a1a1a; padding-bottom: 0.2em; }
  h2 { font-size: 16pt; border-bottom: 1px solid #ccc; padding-bottom: 0.15em; }
  h3 { font-size: 13pt; }
  body > :first-child { margin-top: 0; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 0.8em; }
  a { color: #1d4ed8; text-decoration: underline; }
  img { max-width: 100%; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 1.4em 0; }
  blockquote { margin-left: 0; padding: 0.2em 0 0.2em 1em; border-left: 4px solid #d4d4d4; color: #444; }
  code { font: 9.5pt Consolas, "Cascadia Mono", monospace; background: #f3f3f3; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f6f6f6; border: 1px solid #e2e2e2; border-radius: 4px; padding: 0.7em 0.9em; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  th, td { border: 1px solid #cfcfcf; padding: 0.35em 0.55em; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  tr { break-inside: avoid; }
  li > input[type="checkbox"] { margin: 0 0.4em 0 0; }
  ul.contains-task-list { list-style: none; padding-left: 1.2em; }
`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** 'C:\\notas' -> 'file:///C:/notas/' so relative images in the note resolve in the PDF. */
export function folderToFileUrl(dir: string): string {
  const norm = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const prefixed = /^[a-z]:/i.test(norm) ? `/${norm}` : norm;
  return `file://${encodeURI(prefixed)}/`;
}

/**
 * A standalone HTML document for a note, ready for printToPDF.
 * `baseDir` (the note's folder) makes relative links and images work.
 */
export function markdownToPrintHtml(markdown: string, title: string, baseDir?: string | null): string {
  const body = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>);
  const base = baseDir ? `<base href="${escapeHtml(folderToFileUrl(baseDir))}">` : '';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
${base}
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}
