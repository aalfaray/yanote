import { describe, it, expect } from 'vitest';
import { parentDir } from '../../src/lib/paths';

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
