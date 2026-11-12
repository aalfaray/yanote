// Find-in-note for the rich-text editor. Works on the rendered DOM (not Lexical's text index), so it
// also finds text inside tables and code blocks, which render as static HTML until clicked.

/** Lower-case and strip accents so "codigo" matches "código" and "ACCIÓN" matches "accion". */
export function foldChar(ch: string): string {
  return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

interface TextIndex {
  /** Folded text of the whole root */
  text: string;
  /** For every char of `text`: the source text node and offset it came from */
  nodes: Text[];
  offsets: number[];
}

function buildIndex(root: Node): TextIndex {
  const index: TextIndex = { text: '', nodes: [], offsets: [] };
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let parts = '';
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    for (let i = 0; i < value.length; i++) {
      const folded = foldChar(value[i]);
      for (let k = 0; k < folded.length; k++) {
        parts += folded[k];
        index.nodes.push(node);
        index.offsets.push(i);
      }
    }
  }
  index.text = parts;
  return index;
}

/** All matches of `query` under `root` as DOM ranges (case- and accent-insensitive, literal text). */
export function findTextRanges(root: Node, query: string): Range[] {
  const needle = Array.from(query).map(foldChar).join('');
  if (!needle.trim()) return [];
  const { text, nodes, offsets } = buildIndex(root);
  const doc = root.ownerDocument ?? document;
  const ranges: Range[] = [];
  let from = 0;
  for (let at = text.indexOf(needle, from); at !== -1; at = text.indexOf(needle, from)) {
    const end = at + needle.length - 1;
    const range = doc.createRange();
    range.setStart(nodes[at], offsets[at]);
    range.setEnd(nodes[end], offsets[end] + 1);
    ranges.push(range);
    from = at + needle.length;
  }
  return ranges;
}
