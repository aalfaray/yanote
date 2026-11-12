import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

const { createSpeechService, toSapiRate, encodeRequest } = require('../../electron/services/speechService.cjs');

function fakeProcess() {
  const proc: any = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { end: vi.fn() };
  proc.kill = vi.fn(() => proc.emit('close', null));
  return proc;
}

describe('Backend: SpeechService (System.Speech fallback)', () => {
  it('maps web speech rates to the SAPI range', () => {
    expect(toSapiRate(1)).toBe(0);
    expect(toSapiRate(1.5)).toBe(5);
    expect(toSapiRate(2)).toBe(10);
    expect(toSapiRate(0.75)).toBe(-2);
    expect(toSapiRate(9)).toBe(10);
    expect(toSapiRate('abc')).toBe(0);
  });

  it('encodes the request as UTF-8 base64 JSON (keeps accents)', () => {
    const decoded = JSON.parse(Buffer.from(encodeRequest({ segments: ['Canción ñandú'], start: 2, rate: 1.5 }), 'base64').toString('utf8'));
    expect(decoded).toEqual({ segments: ['Canción ñandú'], start: 2, rate: 5 });
  });

  it('spawns hidden PowerShell and forwards segment/end progress', () => {
    const proc = fakeProcess();
    const spawnFn = vi.fn(() => proc);
    const events: any[] = [];
    const service = createSpeechService({ spawnFn, platform: 'win32' });

    const res = service.speak({ segments: ['Hola', 'Mundo'], start: 3, rate: 1 }, (e: any) => events.push(e));
    expect(res.success).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-EncodedCommand']), { windowsHide: true });
    expect(proc.stdin.end).toHaveBeenCalledTimes(1);

    proc.stdout.emit('data', Buffer.from('SEG 3\r\nSE'));
    proc.stdout.emit('data', Buffer.from('G 4\r\nDONE\r\n'));
    proc.emit('close', 0);

    expect(events).toEqual([{ type: 'segment', index: 3 }, { type: 'segment', index: 4 }, { type: 'end' }]);
    expect(service.isSpeaking()).toBe(false);
  });

  it('stop() kills the process silently (no end/error event)', () => {
    const proc = fakeProcess();
    const events: any[] = [];
    const service = createSpeechService({ spawnFn: () => proc, platform: 'win32' });
    service.speak({ segments: ['Hola'] }, (e: any) => events.push(e));

    expect(service.stop()).toBe(true);
    expect(proc.kill).toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(service.stop()).toBe(false);
  });

  it('a new speak() replaces the previous one', () => {
    const first = fakeProcess();
    const second = fakeProcess();
    const spawnFn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const service = createSpeechService({ spawnFn, platform: 'win32' });
    const events: any[] = [];
    service.speak({ segments: ['uno'] }, () => events.push('first'));
    service.speak({ segments: ['dos'] }, () => events.push('second'));

    expect(first.kill).toHaveBeenCalled();
    first.stdout.emit('data', Buffer.from('SEG 0\n'));
    expect(events).toEqual([]);
  });

  it('reports PowerShell failures with stderr', () => {
    const proc = fakeProcess();
    const events: any[] = [];
    const service = createSpeechService({ spawnFn: () => proc, platform: 'win32' });
    service.speak({ segments: ['Hola'] }, (e: any) => events.push(e));
    proc.stderr.emit('data', Buffer.from('No hay voces'));
    proc.emit('close', 1);
    expect(events).toEqual([{ type: 'error', message: 'No hay voces' }]);
  });

  it('rejects empty input and non-Windows platforms without spawning', () => {
    const spawnFn = vi.fn();
    const events: any[] = [];
    const win = createSpeechService({ spawnFn, platform: 'win32' });
    expect(win.speak({ segments: ['  ', 5] }, (e: any) => events.push(e)).success).toBe(false);
    const linux = createSpeechService({ spawnFn, platform: 'linux' });
    expect(linux.speak({ segments: ['Hola'] }, (e: any) => events.push(e)).success).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
    expect(events[0]).toEqual({ type: 'end' });
    expect(events[1].type).toBe('error');
  });
});
