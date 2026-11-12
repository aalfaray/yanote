import { describe, it, expect, vi } from 'vitest';

const { createTerminalService, resolveShell } = require('../../electron/services/terminalService.cjs');

function fakePty() {
  const handlers: { data?: (d: string) => void; exit?: (e: { exitCode: number }) => void } = {};
  const proc = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => handlers.exit?.({ exitCode: 1 })),
    onData: (cb: (d: string) => void) => (handlers.data = cb),
    onExit: (cb: (e: { exitCode: number }) => void) => (handlers.exit = cb),
    handlers,
  };
  return proc;
}

describe('Backend: TerminalService (PowerShell / CMD)', () => {
  it('resolves the shell executable per type on Windows', () => {
    expect(resolveShell('powershell', 'win32').file).toBe('powershell.exe');
    expect(resolveShell('cmd', 'win32').file).toBe('cmd.exe');
    expect(resolveShell('unknown', 'win32').file).toBe('powershell.exe');
    expect(resolveShell('cmd', 'linux', { SHELL: '/bin/zsh' }).file).toBe('/bin/zsh');
  });

  it('spawns a pty, forwards output/exit and routes input and resize', () => {
    const proc = fakePty();
    const spawn = vi.fn(() => proc);
    const events: any[] = [];
    const service = createTerminalService({ ptyModule: { spawn }, platform: 'win32', env: {} });

    const res = service.create({ id: 't1', shell: 'cmd', cols: 100, rows: 30, cwd: 'C:\\' }, (e: any) => events.push(e));
    expect(res.success).toBe(true);
    expect(spawn).toHaveBeenCalledWith('cmd.exe', [], expect.objectContaining({ cols: 100, rows: 30, cwd: 'C:\\' }));

    proc.handlers.data!('hola');
    service.write('t1', 'dir\r');
    service.resize('t1', 120, 40);
    expect(proc.write).toHaveBeenCalledWith('dir\r');
    expect(proc.resize).toHaveBeenCalledWith(120, 40);

    proc.handlers.exit!({ exitCode: 0 });
    expect(events).toEqual([
      { id: 't1', type: 'data', data: 'hola' },
      { id: 't1', type: 'exit', exitCode: 0 },
    ]);
    expect(service.has('t1')).toBe(false);
  });

  it('kill() stops the pty without emitting a stale exit event', () => {
    const proc = fakePty();
    const events: any[] = [];
    const service = createTerminalService({ ptyModule: { spawn: () => proc }, platform: 'win32', env: {} });
    service.create({ id: 't2', shell: 'powershell' }, (e: any) => events.push(e));

    expect(service.kill('t2')).toBe(true);
    expect(proc.kill).toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(service.kill('t2')).toBe(false);
  });

  it('reuses an existing session and reports spawn errors', () => {
    const spawn = vi.fn(() => fakePty());
    const service = createTerminalService({ ptyModule: { spawn }, platform: 'win32', env: {} });
    service.create({ id: 't3' }, () => {});
    expect(service.create({ id: 't3' }, () => {})).toEqual({ success: true, reused: true });
    expect(spawn).toHaveBeenCalledTimes(1);

    const failing = createTerminalService({ ptyModule: { spawn: () => { throw new Error('boom'); } }, platform: 'win32', env: {} });
    expect(failing.create({ id: 'x' }, () => {})).toEqual({ success: false, error: 'boom' });
    expect(failing.create({}, () => {}).success).toBe(false);
  });
});
