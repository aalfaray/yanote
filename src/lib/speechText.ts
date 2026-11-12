// Helpers that turn editor content into speakable segments (one per paragraph/block).

export interface SpeechSegment {
  text: string;
  /** Block element in the rich-text editor, used for highlighting while reading. */
  el?: HTMLElement | null;
}

const EMOJI_RE = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** Removes emojis and collapses whitespace so the voice doesn't read noise. */
export function cleanSpeechText(text: string): string {
  return text.replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim();
}

/** Strips inline markdown syntax from a single line. */
export function stripInlineMarkdown(line: string): string {
  return line
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
    .replace(/(\*|_)(.+?)\1/g, '$2') // italic
    .replace(/~~(.+?)~~/g, '$1') // strikethrough
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1'); // escaped characters
}

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isHorizontalRule = (line: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);

/** Splits raw markdown into speakable segments (headings, paragraphs, list items, table rows). */
export function markdownToSegments(markdown: string): string[] {
  const segments: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      const text = cleanSpeechText(stripInlineMarkdown(paragraph.join(' ')));
      if (text) segments.push(text);
      paragraph = [];
    }
  };
  const push = (raw: string) => {
    flush();
    const text = cleanSpeechText(stripInlineMarkdown(raw));
    if (text) segments.push(text);
  };

  // Front matter and fenced code blocks are not read aloud.
  const body = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm, '\n');

  for (const line of body.split('\n')) {
    if (line.trim() === '' || isHorizontalRule(line) || isTableSeparator(line)) {
      flush();
      continue;
    }
    if (isTableRow(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean);
      push(cells.join(', '));
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      push(heading[1]);
      continue;
    }
    const listItem = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (listItem) {
      push(listItem[1]);
      continue;
    }
    paragraph.push(line.replace(/^\s*(>\s?)+/, ''));
  }
  flush();
  return segments;
}

/** Splits arbitrary (selected) text into segments, one per non-empty line. */
export function plainTextToSegments(text: string): string[] {
  return text
    .split(/\n+/)
    .map(cleanSpeechText)
    .filter((t) => t.length > 0);
}

const textOf = (node: Node): string => {
  const el = node as HTMLElement;
  return (typeof el.innerText === 'string' ? el.innerText : null) ?? node.textContent ?? '';
};

const isList = (el: Element) => el.tagName === 'UL' || el.tagName === 'OL';
const isCodeBlock = (el: Element) => el.tagName === 'PRE' || el.querySelector('.cm-editor, pre') !== null;

function pushListItems(list: Element, out: SpeechSegment[]) {
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;
    const ownText = Array.from(li.childNodes)
      .filter((n) => !(n instanceof Element && isList(n)))
      .map(textOf)
      .join(' ');
    const text = cleanSpeechText(ownText);
    if (text) out.push({ text, el: li as HTMLElement });
    for (const nested of Array.from(li.children)) {
      if (isList(nested)) pushListItems(nested, out);
    }
  }
}

/** Builds segments from the rich-text editor's root content-editable element. */
export function collectDomSegments(root: HTMLElement): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const child of Array.from(root.children) as HTMLElement[]) {
    if (child.tagName === 'HR') continue;
    if (isList(child)) {
      pushListItems(child, out);
      continue;
    }
    const table = child.tagName === 'TABLE' ? child : child.querySelector('table');
    if (table) {
      for (const row of Array.from(table.querySelectorAll('tr'))) {
        const cells = Array.from(row.querySelectorAll('th, td'))
          .map((c) => cleanSpeechText(textOf(c)))
          .filter(Boolean);
        if (cells.length > 0) out.push({ text: cells.join(', '), el: row as HTMLElement });
      }
      continue;
    }
    if (isCodeBlock(child)) continue;
    const text = cleanSpeechText(textOf(child));
    if (text) out.push({ text, el: child });
  }
  return out;
}

/** Index of the segment whose element contains `node`, or -1. */
export function findSegmentIndex(segments: SpeechSegment[], node: Node | null): number {
  if (!node) return -1;
  return segments.findIndex((s) => s.el != null && s.el.contains(node));
}
