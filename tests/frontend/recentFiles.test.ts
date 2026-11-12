import { describe, it, expect } from 'vitest';
import {
  addRecentFile,
  removeRecentFile,
  sanitizeRecentFiles,
  formatOpenedAgo,
  MAX_RECENT_FILES,
} from '../../src/lib/recentFiles';

describe('recentFiles', () => {
  it('adds newest first and moves an existing file to the top without duplicating it', () => {
    let list = addRecentFile([], { path: 'C:\\a\\uno.md', name: 'uno.md' }, 1);
    list = addRecentFile(list, { path: 'C:\\b\\dos.md', name: 'dos.md' }, 2);
    // Same file with different case / separators (Windows) counts as the same entry
    list = addRecentFile(list, { path: 'c:/A/UNO.md', name: 'UNO.md' }, 3);
    expect(list.map((f) => f.name)).toEqual(['UNO.md', 'dos.md']);
    expect(list[0].openedAt).toBe(3);
  });

  it(`keeps at most ${MAX_RECENT_FILES} entries`, () => {
    let list: ReturnType<typeof addRecentFile> = [];
    for (let i = 0; i < MAX_RECENT_FILES + 5; i++) list = addRecentFile(list, { path: `/n/${i}.md`, name: `${i}.md` }, i);
    expect(list).toHaveLength(MAX_RECENT_FILES);
    expect(list[0].name).toBe(`${MAX_RECENT_FILES + 4}.md`);
  });

  it('removes an entry by path', () => {
    const list = addRecentFile(addRecentFile([], { path: '/x/a.md', name: 'a.md' }, 1), { path: '/x/b.md', name: 'b.md' }, 2);
    expect(removeRecentFile(list, '/x/a.md').map((f) => f.name)).toEqual(['b.md']);
  });

  it('drops malformed entries coming from the config file', () => {
    expect(sanitizeRecentFiles('nope')).toEqual([]);
    expect(sanitizeRecentFiles([{ path: '/a.md', name: 'a.md', openedAt: 1 }, { path: 5 }, null, { name: 'x' }])).toEqual([
      { path: '/a.md', name: 'a.md', openedAt: 1 },
    ]);
  });

  it('formats how long ago a file was opened', () => {
    const now = 10 * 24 * 3_600_000;
    expect(formatOpenedAgo(now - 10_000, now)).toBe('hace un momento');
    expect(formatOpenedAgo(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(formatOpenedAgo(now - 3 * 3_600_000, now)).toBe('hace 3 h');
    expect(formatOpenedAgo(now - 30 * 3_600_000, now)).toBe('ayer');
    expect(formatOpenedAgo(now - 4 * 24 * 3_600_000, now)).toBe('hace 4 días');
  });
});
