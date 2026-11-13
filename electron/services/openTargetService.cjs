const fs = require('fs');
const path = require('path');

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdx', '.txt']);

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/**
 * What yanote was asked to open from the command line ("Abrir con yanote" in Explorer):
 * the last argument that is an existing folder or markdown file. Chromium switches are ignored.
 * `skip` = leading args that are never targets (exe, plus the app path when running unpackaged).
 */
function parseOpenTarget(argv = [], { skip = 1, cwd = process.cwd(), stat = statSafe } = {}) {
  for (let i = argv.length - 1; i >= skip; i--) {
    const raw = argv[i];
    if (typeof raw !== 'string' || !raw.trim() || raw.startsWith('-')) continue;
    // A drive root arrives as "C:\" which Windows argv parsing turns into C:" (the \" is an escaped quote)
    let cleaned = raw.trim().replace(/"+$/, '');
    if (/^[A-Za-z]:$/.test(cleaned)) cleaned += path.sep;
    const full = path.resolve(cwd, cleaned);
    const info = stat(full);
    if (!info) continue;
    if (info.isDirectory()) return { type: 'folder', path: full };
    if (info.isFile() && MARKDOWN_EXT.has(path.extname(full).toLowerCase())) return { type: 'file', path: full };
  }
  return null;
}

module.exports = { parseOpenTarget };
