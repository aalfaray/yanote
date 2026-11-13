import { describe, it, expect } from 'vitest';
import path from 'path';

const { parseOpenTarget } = require('../../electron/services/openTargetService.cjs');

const fakeFs = (entries: Record<string, 'dir' | 'file'>) => (p: string) => {
  const kind = entries[path.resolve(p)];
  return kind ? { isDirectory: () => kind === 'dir', isFile: () => kind === 'file' } : null;
};

const root = path.resolve('/proyectos');
const folder = path.join(root, 'web');
const note = path.join(root, 'notas.md');
const image = path.join(root, 'foto.png');
const stat = fakeFs({ [root]: 'dir', [folder]: 'dir', [note]: 'file', [image]: 'file' });

describe('parseOpenTarget ("Abrir con yanote")', () => {
  it('returns the folder passed by Explorer', () => {
    expect(parseOpenTarget(['yanote.exe', folder], { stat })).toEqual({ type: 'folder', path: folder });
  });

  it('opens markdown files but ignores other file types', () => {
    expect(parseOpenTarget(['yanote.exe', note], { stat })).toEqual({ type: 'file', path: note });
    expect(parseOpenTarget(['yanote.exe', image], { stat })).toBeNull();
  });

  it('ignores Chromium switches, missing paths and the skipped leading args', () => {
    expect(parseOpenTarget(['yanote.exe', '--allow-file-access-from-files', folder, '--flag'], { stat })).toEqual({ type: 'folder', path: folder });
    expect(parseOpenTarget(['yanote.exe', path.join(root, 'no-existe')], { stat })).toBeNull();
    // unpackaged: `electron . <folder>` -> "." is the app, not a target
    expect(parseOpenTarget(['electron.exe', root], { stat, skip: 2 })).toBeNull();
    expect(parseOpenTarget([], { stat })).toBeNull();
  });

  it('resolves relative paths against the launching directory', () => {
    expect(parseOpenTarget(['yanote.exe', 'web'], { stat, cwd: root })).toEqual({ type: 'folder', path: folder });
  });

  it('repairs a drive root mangled by Windows quoting (C:\\" -> C:")', () => {
    const drive = path.parse(process.cwd()).root; // e.g. C:\ or /
    const driveStat = fakeFs({ [drive]: 'dir' });
    const mangled = process.platform === 'win32' ? `${drive.slice(0, 2)}"` : drive;
    expect(parseOpenTarget(['yanote.exe', mangled], { stat: driveStat })).toEqual({ type: 'folder', path: drive });
  });
});
