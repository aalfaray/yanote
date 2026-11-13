import { describe, it, expect } from 'vitest';
import { parentDir, baseName, isMarkdownFile } from '../../src/lib/paths';

describe('parentDir', () => {
  it('returns the folder of Windows and POSIX paths', () => {
    expect(parentDir('C:\\Users\\me\\nube-linda\\roadmaps\\README.md')).toBe('C:\\Users\\me\\nube-linda\\roadmaps');
    expect(parentDir('C:/Users/me/notes/a.md')).toBe('C:/Users/me/notes');
    expect(parentDir('/home/me/a.md')).toBe('/home/me');
  });

  it('keeps the root separator', () => {
    expect(parentDir('C:\\a.md')).toBe('C:\\');
    expect(parentDir('/a.md')).toBe('/');
  });

  it('returns null without a usable path (unsaved scratch notes)', () => {
    expect(parentDir(null)).toBeNull();
    expect(parentDir('nota.md')).toBeNull();
  });
});

describe('baseName / isMarkdownFile (drag & drop)', () => {
  it('takes the file name from Windows and POSIX paths', () => {
    expect(baseName(String.raw`C:\Users\ana\docs\plan de trabajo.md`)).toBe('plan de trabajo.md');
    expect(baseName('/home/ana/notas/a.md')).toBe('a.md');
    expect(baseName('solo.md')).toBe('solo.md');
  });

  it('recognises markdown files by extension, case-insensitively', () => {
    expect(isMarkdownFile('Plan.MD')).toBe(true);
    expect(isMarkdownFile('ideas.markdown')).toBe(true);
    expect(isMarkdownFile('doc.mdx')).toBe(true);
    expect(isMarkdownFile('foto.png')).toBe(false);
    expect(isMarkdownFile('md')).toBe(false);
  });
});
