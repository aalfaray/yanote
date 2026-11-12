import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

const { createUpdateService, compareVersions, notesToText } = require('../../electron/services/updateService.cjs');

function fakeUpdater() {
  const u: any = new EventEmitter();
  u.checkForUpdates = vi.fn(async () => undefined);
  u.downloadUpdate = vi.fn(async () => undefined);
  u.quitAndInstall = vi.fn();
  return u;
}

describe('Backend: UpdateService', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('2.0', '1.9.9')).toBe(1);
  });

  it('turns release notes into plain text', () => {
    expect(notesToText('<h2>Novedades</h2><ul><li>Chat</li><li>Voz &amp; más</li></ul>')).toBe('Novedades\n• Chat\n• Voz & más');
    expect(notesToText([{ version: '1', note: 'Arreglos' }])).toBe('Arreglos');
    expect(notesToText(null)).toBe('');
  });

  it('installed build: asks first (no auto download), then downloads and restarts on accept', async () => {
    const u = fakeUpdater();
    const events: any[] = [];
    const svc = createUpdateService({ mode: 'auto', autoUpdater: u, currentVersion: '1.0.0', emit: (e: any) => events.push(e) });
    expect(u.autoDownload).toBe(false);

    await svc.check();
    expect(u.checkForUpdates).toHaveBeenCalled();
    u.emit('update-available', { version: '1.1.0', releaseNotes: '<p>Nuevo</p>' });
    expect(events.at(-1)).toMatchObject({ type: 'available', version: '1.1.0', currentVersion: '1.0.0', notes: 'Nuevo', mode: 'auto' });
    expect(u.downloadUpdate).not.toHaveBeenCalled();

    expect(await svc.accept()).toEqual({ success: true });
    u.emit('download-progress', { percent: 42.4 });
    u.emit('update-downloaded', { version: '1.1.0' });
    expect(events.slice(-2)).toEqual([
      { type: 'progress', percent: 42, transferred: undefined, total: undefined },
      { type: 'downloaded', version: '1.1.0' },
    ]);

    expect(svc.install()).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(u.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('background checks stay quiet when up to date or offline; manual checks report', async () => {
    const u = fakeUpdater();
    const events: any[] = [];
    const svc = createUpdateService({ mode: 'auto', autoUpdater: u, currentVersion: '1.0.0', emit: (e: any) => events.push(e) });
    await svc.check();
    u.emit('update-not-available', {});
    u.emit('error', new Error('offline'));
    expect(events).toEqual([]);

    await svc.check({ manual: true });
    u.emit('update-not-available', {});
    u.emit('error', new Error('offline'));
    expect(events.map((e) => e.type)).toEqual(['none', 'error']);
  });

  it('portable build: checks GitHub releases and opens the download page', async () => {
    const events: any[] = [];
    const openExternal = vi.fn(async () => undefined);
    const fetchLatest = vi.fn(async () => ({ version: '1.2.0', notes: 'Notas', url: 'https://github.com/aalfaray/yanote/releases/tag/v1.2.0' }));
    const svc = createUpdateService({ mode: 'portable', currentVersion: '1.0.0', fetchLatest, openExternal, emit: (e: any) => events.push(e) });

    await svc.check();
    expect(events[0]).toMatchObject({ type: 'available', mode: 'portable', version: '1.2.0' });
    expect(await svc.accept()).toEqual({ success: true, opened: true });
    expect(openExternal).toHaveBeenCalledWith('https://github.com/aalfaray/yanote/releases/tag/v1.2.0');
    expect(svc.install()).toBe(false);
  });

  it('portable build: same or older release is not offered', async () => {
    const events: any[] = [];
    const svc = createUpdateService({
      mode: 'portable',
      currentVersion: '1.2.0',
      fetchLatest: async () => ({ version: '1.2.0', notes: '', url: '' }),
      emit: (e: any) => events.push(e),
    });
    await svc.check();
    expect(events).toEqual([]);
    await svc.check({ manual: true });
    expect(events).toEqual([{ type: 'none', currentVersion: '1.2.0' }]);
  });

  it('development build: disabled', async () => {
    const events: any[] = [];
    const svc = createUpdateService({ mode: 'disabled', currentVersion: '1.0.0', emit: (e: any) => events.push(e) });
    expect((await svc.check()).success).toBe(false);
    expect(events).toEqual([]);
    expect((await svc.accept()).success).toBe(false);
  });
});
