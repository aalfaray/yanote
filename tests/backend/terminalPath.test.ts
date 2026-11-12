import { describe, it, expect, vi } from 'vitest';

const { withFreshPath, createTerminalService } = require('../../electron/services/terminalService.cjs');

describe('Backend: integrated terminal PATH refresh', () => {
  const registry = (machine: string, user: string) => (key: string) => (key.startsWith('HKLM') ? machine : user);

  it('adds PATH entries installed after the app started (e.g. claude)', () => {
    const env = { Path: 'C:\\old\\bin;C:\\Windows', USERPROFILE: 'C:\\Users\\me' };
    const fresh = withFreshPath(env, 'win32', registry('C:\\Windows;%SystemRoot%\\x', '%USERPROFILE%\\.local\\bin'));
    const entries = fresh.Path.split(';');

    expect(entries).toContain('C:\\Users\\me\\.local\\bin');
    expect(entries).toContain('C:\\old\\bin'); // process-only entries are kept
    expect(entries.filter((e: string) => e.toLowerCase() === 'c:\\windows')).toHaveLength(1); // deduplicated
    expect(entries).toContain('%SystemRoot%\\x'); // unknown vars left untouched
    expect(env.Path).toBe('C:\\old\\bin;C:\\Windows'); // input not mutated
  });

  it('keeps the original env when not on Windows or the registry is unreadable', () => {
    const env = { PATH: '/usr/bin' };
    expect(withFreshPath(env, 'linux', registry('x', 'y'))).toBe(env);
    expect(withFreshPath(env, 'win32', registry('', ''))).toBe(env);
  });

  it('spawns new terminals with the refreshed PATH', () => {
    const spawn = vi.fn(() => ({ onData: vi.fn(), onExit: vi.fn() }));
    const service = createTerminalService({
      ptyModule: { spawn },
      platform: 'win32',
      env: { Path: 'C:\\old' },
      readPath: registry('', 'C:\\Users\\me\\.local\\bin'),
    });
    service.create({ id: 't1' }, () => {});
    expect(spawn.mock.calls[0][2].env.Path).toBe('C:\\Users\\me\\.local\\bin;C:\\old');
  });
});

describe('Backend: terminal starting folder', () => {
  const { resolveCwd } = require('../../electron/services/terminalService.cjs');
  const os = require('os');
  const existing = new Set(['C:\\notes', 'C:\\proj\\docs']);
  const isDir = (p: string) => existing.has(p);

  it('uses the requested folder (active note) when it exists', () => {
    expect(resolveCwd(['C:\\proj\\docs', 'C:\\notes'], isDir)).toBe('C:\\proj\\docs');
  });

  it('falls back to the notes folder, then to the home folder', () => {
    expect(resolveCwd([undefined, 'C:\\notes'], isDir)).toBe('C:\\notes');
    expect(resolveCwd(['C:\\deleted', 'C:\\notes'], isDir)).toBe('C:\\notes');
    expect(resolveCwd(['C:\\deleted', ''], isDir)).toBe(os.homedir());
  });
});
