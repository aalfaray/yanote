import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

const { listDir, parseGitStatus, gitStatus, createFileTreeWatcher, claudeInstallInfo } = require('../../electron/services/fileTreeService.cjs');

describe('Backend: fileTreeService', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-tree-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists folders first, in natural numeric order, and hides .git', () => {
    for (const name of ['file10.md', 'file9.md', 'File2.md']) fs.writeFileSync(path.join(dir, name), '');
    for (const name of ['src', '.git', 'docs100', 'docs99']) fs.mkdirSync(path.join(dir, name));
    const res = listDir(dir);
    expect(res.success).toBe(true);
    expect(res.entries.map((e: any) => e.name)).toEqual(['docs99', 'docs100', 'src', 'File2.md', 'file9.md', 'file10.md']);
    expect(res.entries[0]).toEqual({ name: 'docs99', path: path.join(dir, 'docs99'), isDir: true });
  });

  it('reports missing folders and invalid input without throwing', () => {
    expect(listDir(path.join(dir, 'nope'))).toMatchObject({ success: false, error: 'ENOENT', entries: [] });
    expect(listDir('')).toMatchObject({ success: false, entries: [] });
    expect(listDir(undefined)).toMatchObject({ success: false, entries: [] });
  });

  it('parses porcelain -z git status, including renames and conflicts', () => {
    const out = [' M src/a.ts', '?? new.md', 'R  b.ts', 'old-b.ts', 'A  added.ts', ' D gone.ts', 'UU clash.ts', ''].join('\0');
    const status = parseGitStatus(out, 'C:\\repo');
    expect(status).toEqual({
      [path.join('C:\\repo', 'src/a.ts')]: 'M',
      [path.join('C:\\repo', 'new.md')]: '?',
      [path.join('C:\\repo', 'b.ts')]: 'R',
      [path.join('C:\\repo', 'added.ts')]: 'A',
      [path.join('C:\\repo', 'gone.ts')]: 'D',
      [path.join('C:\\repo', 'clash.ts')]: 'U',
    });
    expect(parseGitStatus('', 'C:\\repo')).toEqual({});
    expect(parseGitStatus(null, 'C:\\repo')).toEqual({});
  });

  it('says "not a repository" when git fails', async () => {
    const execImpl = vi.fn((_f, _a, _o, cb) => cb(new Error('not a git repo')));
    expect(await gitStatus(dir, { execImpl })).toEqual({ success: true, repo: false, status: {} });
    expect(await gitStatus('', { execImpl })).toMatchObject({ success: false, repo: false });
  });

  it('reads branch and status of the enclosing repository', async () => {
    const execImpl = vi.fn((_f, args: string[], _o, cb) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return cb(null, `${dir}\n`);
      if (args[0] === 'rev-parse') return cb(null, 'main\n');
      return cb(null, ' M a.md\0');
    });
    const res = await gitStatus(dir, { execImpl });
    expect(res).toMatchObject({ success: true, repo: true, branch: 'main', root: path.normalize(dir) });
    expect(res.status).toEqual({ [path.join(path.normalize(dir), 'a.md')]: 'M' });
  });

  it('batches watcher events into changed folders and separates git-only changes', () => {
    vi.useFakeTimers();
    try {
      let handler: (ev: string, name: string | null) => void = () => {};
      const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
      const watchImpl = vi.fn((_root, _opts, cb) => {
        handler = cb;
        return watcher;
      });
      const tree = createFileTreeWatcher({ watchImpl, delay: 50 });
      const emit = vi.fn();
      expect(tree.watch(1, dir, emit)).toEqual({ success: true });
      handler('change', path.join('src', 'a.ts'));
      handler('rename', 'b.md');
      vi.advanceTimersByTime(60);
      expect(emit).toHaveBeenCalledTimes(1);
      const change = emit.mock.calls[0][0];
      expect(change.root).toBe(dir);
      expect(change.git).toBe(true);
      expect(change.dirs.sort()).toEqual([dir, path.join(dir, 'src')].sort());

      handler('change', path.join('.git', 'index'));
      vi.advanceTimersByTime(60);
      expect(emit.mock.calls[1][0]).toEqual({ root: dir, dirs: [], git: true });

      // Same root again is reused; another root replaces (and closes) the old watcher
      expect(tree.watch(1, dir, emit)).toEqual({ success: true, reused: true });
      expect(tree.watch(1, path.join(dir, 'x'), emit)).toEqual({ success: true });
      expect(watcher.close).toHaveBeenCalled();
      expect(tree.unwatch(1)).toBe(true);
      expect(tree.unwatch(1)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a failing watcher instead of throwing', () => {
    const tree = createFileTreeWatcher({
      watchImpl: () => {
        throw new Error('EPERM');
      },
    });
    expect(tree.watch(1, dir, vi.fn())).toMatchObject({ success: false, error: 'EPERM' });
    expect(tree.watch(1, '', vi.fn())).toMatchObject({ success: false });
  });

  it('describes which Claude Code is used, preferring the user install', async () => {
    const execImpl = vi.fn((_f, _a, _o, cb) => cb(null, '2.1.0 (Claude Code)\n'));
    expect(await claudeInstallInfo({ findUser: () => 'C:\\u\\claude.exe', findBundled: () => 'C:\\b\\claude.exe', execImpl })).toEqual({
      used: 'C:\\u\\claude.exe',
      source: 'user',
      user: 'C:\\u\\claude.exe',
      bundled: 'C:\\b\\claude.exe',
      version: '2.1.0 (Claude Code)',
    });
    expect(await claudeInstallInfo({ findUser: () => undefined, findBundled: () => 'C:\\b\\claude.exe', execImpl })).toMatchObject({ used: 'C:\\b\\claude.exe', source: 'bundled' });
    expect(await claudeInstallInfo({ findUser: () => undefined, findBundled: () => undefined, execImpl })).toEqual({
      used: null,
      source: null,
      user: null,
      bundled: null,
      version: null,
    });
  });
});
