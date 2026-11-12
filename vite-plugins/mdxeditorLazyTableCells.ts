import type { Plugin } from 'vite';

/**
 * MDXEditor (4.x) mounts a full nested Lexical editor for EVERY table cell as soon as a document
 * loads. Documents with thousands of cells (e.g. a roadmap with 75 tables / ~3,300 cells) freeze or
 * crash the renderer. This plugin rewrites MDXEditor's table `Cell` component so each cell is shown
 * as static HTML and only becomes an editor the first time it is clicked / navigated into.
 *
 * Applied at bundle time (dev pre-bundling + production build) so node_modules stays untouched.
 * If MDXEditor changes this code, the build fails loudly instead of silently losing the fix.
 */

const TARGET = /@mdxeditor[\\/]editor[\\/]dist[\\/]plugins[\\/]table[\\/]TableEditor\.js$/;

const ANCHOR = `const Cell = ({ align, ...props }) => {
  const { activeCell, setActiveCell } = props;
  const isActive = (activeCell == null ? void 0 : activeCell[0]) === props.colIndex && activeCell[1] === props.rowIndex;
  const className = AlignToTailwindClassMap[align ?? "left"];
  const CellElement = getCellType(props.rowIndex);`;

const REPLACEMENT = `const __bnRenderStatic = (nodes) => (nodes || []).map((n, i) => {
  switch (n.type) {
    case "text": return n.value;
    case "strong": return React__default.createElement("strong", { key: i }, __bnRenderStatic(n.children));
    case "emphasis": return React__default.createElement("em", { key: i }, __bnRenderStatic(n.children));
    case "delete": return React__default.createElement("s", { key: i }, __bnRenderStatic(n.children));
    case "inlineCode": return React__default.createElement("code", { key: i }, n.value);
    case "link": return React__default.createElement("a", { key: i, href: n.url, onClick: (e) => e.preventDefault() }, __bnRenderStatic(n.children));
    case "break": return React__default.createElement("br", { key: i });
    default: return n.children ? __bnRenderStatic(n.children) : (n.value ?? "");
  }
});
const Cell = ({ align, ...props }) => {
  const { activeCell, setActiveCell } = props;
  const isActive = (activeCell == null ? void 0 : activeCell[0]) === props.colIndex && activeCell[1] === props.rowIndex;
  const [__bnMounted, __bnSetMounted] = React__default.useState(false);
  if (isActive && !__bnMounted) __bnSetMounted(true);
  const className = AlignToTailwindClassMap[align ?? "left"];
  const CellElement = getCellType(props.rowIndex);
  if (!__bnMounted) {
    return React__default.createElement(
      CellElement,
      { className, "data-active": false, "data-static-cell": true, onClick: () => { setActiveCell([props.colIndex, props.rowIndex]); } },
      React__default.createElement("div", { className: "mdxeditor-static-cell" }, React__default.createElement("p", null, __bnRenderStatic(props.contents)))
    );
  }`;

export function patchTableEditorSource(code: string, id: string): string | null {
  if (!TARGET.test(id.split('?')[0])) return null;
  const normalized = code.replace(/\r\n/g, '\n');
  if (!normalized.includes(ANCHOR)) {
    throw new Error(
      '[mdxeditor-lazy-table-cells] MDXEditor TableEditor.js changed; update vite-plugins/mdxeditorLazyTableCells.ts'
    );
  }
  return normalized.replace(ANCHOR, REPLACEMENT);
}

export function mdxeditorLazyTableCells(): Plugin {
  return {
    name: 'mdxeditor-lazy-table-cells',
    enforce: 'pre',
    transform(code, id) {
      const out = patchTableEditorSource(code, id);
      return out === null ? null : { code: out, map: null };
    },
  };
}

/** Same patch for Vite's dependency pre-bundler (dev server), which bypasses normal plugins. */
export function mdxeditorLazyTableCellsOptimizer() {
  return {
    name: 'mdxeditor-lazy-table-cells-optimizer',
    transform(code: string, id: string) {
      const out = patchTableEditorSource(code, id);
      return out === null ? null : { code: out, map: null };
    },
  };
}
