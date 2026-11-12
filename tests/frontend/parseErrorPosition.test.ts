import { describe, it, expect } from 'vitest';
import { parseErrorPosition } from '../../src/lib/parseErrorPosition';

describe('parseErrorPosition', () => {
  it('reads a line:col-line:col range from an MDXEditor error', () => {
    const msg = 'Error parsing markdown: Expected a closing tag for `<la>` (116:110-116:119) before the end of `paragraph`';
    expect(parseErrorPosition(msg)).toEqual({ from: { line: 116, column: 110 }, to: { line: 116, column: 119 } });
  });

  it('accepts a single point and a same-line column range', () => {
    expect(parseErrorPosition('Unexpected character (3:7)')).toEqual({ from: { line: 3, column: 7 }, to: { line: 3, column: 7 } });
    expect(parseErrorPosition('Bad tag (10:2-9)')).toEqual({ from: { line: 10, column: 2 }, to: { line: 10, column: 9 } });
  });

  it('returns null without a position', () => {
    expect(parseErrorPosition('Something failed')).toBeNull();
    expect(parseErrorPosition(null)).toBeNull();
  });
});
