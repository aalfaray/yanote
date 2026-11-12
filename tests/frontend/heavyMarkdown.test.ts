import { describe, it, expect } from 'vitest';
import { isHeavyMarkdown, HEAVY_MAX_CHARS } from '../../src/lib/heavyMarkdown';

const table = (rows: number, cols: number) =>
  Array.from({ length: rows }, () => '|' + ' x |'.repeat(cols)).join('\n');

describe('heavyMarkdown', () => {
  it('keeps table-heavy notes in the rich editor (cells render lazily)', () => {
    expect(isHeavyMarkdown('# Roadmap\n\n' + table(1000, 4))).toBe(false);
  });

  it('only falls back to source mode for extremely large files', () => {
    expect(isHeavyMarkdown('a'.repeat(HEAVY_MAX_CHARS))).toBe(false);
    expect(isHeavyMarkdown('a'.repeat(HEAVY_MAX_CHARS + 1))).toBe(true);
  });
});
