import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { createLogService, describeError, isNotFound, configureSharedLog, getLogger } = require('../../electron/services/logService.cjs');
const { createSafeIpc, summarizeArgs } = require('../../electron/services/safeIpc.cjs');
const { createEditCommandService } = require('../../electron/services/editCommandService.cjs');

const fixedNow = () => new Date('2026-11-13T06:30:00.000Z');

describe('logService', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-log-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('appends level, scope, message, context and stack to yanote.log', () => {
    const log = createLogService({ dir, now: fixedNow, mirrorToConsole: false });
    log.scoped('fileService').error('read failed', new Error('ENOENT'), { filePath: 'C:\\a.md' });
    const text = fs.readFileSync(log.filePath, 'utf8');
    expect(text).toContain('2026-11-13T06:30:00.000Z [ERROR] [fileService] read failed: ENOENT  {"filePath":"C:\\\\a.md"}');
    expect(text).toMatch(/\n {4}Error: ENOENT\n {4}\s*at /);
  });

  it('takes renderer entries under a renderer: scope and ignores junk', () => {
    const log = createLogService({ dir, now: fixedNow, mirrorToConsole: false });
    expect(log.writeFromRenderer({ level: 'warn', scope: 'contextMenu.buildMenu', message: 'boom', stack: 'Error: boom\n at x' })).toBe(true);
    expect(log.writeFromRenderer(null)).toBe(false);
    const text = fs.readFileSync(log.filePath, 'utf8');
    expect(text).toContain('[WARN] [renderer:contextMenu.buildMenu] boom');
    expect(text).toContain('    Error: boom');
  });

  it('rotates the file when it grows too big', () => {
    const log = createLogService({ dir, maxBytes: 50, now: fixedNow, mirrorToConsole: false });
    log.write('info', 'a', 'x'.repeat(80));
    log.write('info', 'a', 'second');
    expect(fs.readFileSync(path.join(dir, 'yanote.old.log'), 'utf8')).toContain('xxxx');
    expect(fs.readFileSync(log.filePath, 'utf8')).toContain('second');
  });

  it('never throws when the disk write fails', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogService({ dir: path.join(dir, 'f.txt', 'nested'), mirrorToConsole: false });
    fs.writeFileSync(path.join(dir, 'f.txt'), '');
    expect(() => log.write('error', 'x', 'y')).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('describes anything thrown', () => {
    expect(describeError('texto').message).toBe('texto');
    expect(describeError({ code: 1 }).message).toBe('{"code":1}');
    expect(describeError(undefined).message).toBe('');
  });
});

describe('safeIpc', () => {
  const fakeIpc = () => {
    const handlers: Record<string, Function> = {};
    return { handlers, handle: (c: string, f: Function) => (handlers[c] = f), on: (c: string, f: Function) => (handlers[c] = f) };
  };

  it('logs a failing handler with its channel and args, then rethrows', async () => {
    const ipcMain = fakeIpc();
    const log = { error: vi.fn() };
    const ipc = createSafeIpc(ipcMain, log);
    ipc.handle('fs:readFile', async () => {
      throw new Error('nope');
    });
    await expect(ipcMain.handlers['fs:readFile']({}, 'C:/a.md')).rejects.toThrow('nope');
    expect(log.error).toHaveBeenCalledWith('IPC handler "fs:readFile" failed', expect.any(Error), { channel: 'fs:readFile', args: ['C:/a.md'] });
  });

  it('passes results through and swallows (but logs) listener failures', async () => {
    const ipcMain = fakeIpc();
    const log = { error: vi.fn() };
    const ipc = createSafeIpc(ipcMain, log);
    ipc.handle('ok', (_e: unknown, n: number) => n * 2);
    ipc.on('term:write', () => {
      throw new Error('dead pty');
    });
    expect(await ipcMain.handlers.ok({}, 21)).toBe(42);
    expect(() => ipcMain.handlers['term:write']({}, 't1', 'ls')).not.toThrow();
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('shortens big arguments', () => {
    const [s] = summarizeArgs(['x'.repeat(500)]);
    expect(s).toMatch(/… \(500 chars\)$/);
  });
});

describe('editCommandService', () => {
  const log = () => ({ error: vi.fn(), warn: vi.fn() });

  it('runs known commands on the webContents', () => {
    const wc = { copy: vi.fn() };
    expect(createEditCommandService(log()).run(wc, 'copy')).toBe(true);
    expect(wc.copy).toHaveBeenCalled();
  });

  it('refuses unknown commands and logs failures instead of throwing', () => {
    const l = log();
    const svc = createEditCommandService(l);
    expect(svc.run({ close: vi.fn() }, 'close')).toBe(false);
    expect(l.warn).toHaveBeenCalled();
    expect(
      svc.run(
        {
          paste: () => {
            throw new Error('destroyed');
          },
        },
        'paste'
      )
    ).toBe(false);
    expect(l.error).toHaveBeenCalledWith('edit command failed', expect.any(Error), { command: 'paste' });
  });
});

describe('shared log (getLogger)', () => {
  it('writes every service logger into the configured file and tells "not found" apart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-shared-'));
    try {
      const svc = configureSharedLog({ dir, now: fixedNow, mirrorToConsole: false });
      getLogger('terminalService').warn('terminal kill failed', new Error('gone'), { id: 't1' });
      expect(fs.readFileSync(svc.filePath, 'utf8')).toContain('[WARN] [terminalService] terminal kill failed: gone  {"id":"t1"}');
      expect(isNotFound(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true);
      expect(isNotFound(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
