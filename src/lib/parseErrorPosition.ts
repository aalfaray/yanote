export interface TextPoint {
  /** 1-based line */
  line: number;
  /** 1-based column */
  column: number;
}

export interface TextRange {
  from: TextPoint;
  to: TextPoint;
}

/**
 * Reads the location from an MDXEditor / micromark parse error, e.g.
 * "Expected a closing tag for `<la>` (116:110-116:119) before the end of `paragraph`".
 * Accepts "(line:col-line:col)", "(line:col-col)" and "(line:col)". Returns null when absent.
 */
export function parseErrorPosition(message: string | null | undefined): TextRange | null {
  if (!message) return null;
  const m = /\((\d+):(\d+)(?:-(?:(\d+):)?(\d+))?\)/.exec(message);
  if (!m) return null;
  const from = { line: Number(m[1]), column: Number(m[2]) };
  const to = m[4] ? { line: m[3] ? Number(m[3]) : from.line, column: Number(m[4]) } : from;
  return { from, to };
}
