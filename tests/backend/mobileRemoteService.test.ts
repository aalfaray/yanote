// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import WebSocket from 'ws';

const { createMobileRemoteService, createChatMirror, buildBundle } = require('../../electron/services/mobileRemoteService.cjs');
const { createClientSession, createHostSession, generateKeyPair } = require('../../electron/services/mobile/orcaE2ee.cjs');

const LAN = { 'Wi-Fi': [{ address: '192.168.1.20', family: 'IPv4', internal: false }] };
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-mobile-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function startService(options: Record<string, unknown> = {}) {
  const dataDir = tempDir();
  const bundleDir = tempDir();
  fs.writeFileSync(path.join(bundleDir, 'index.html'), '<!doctype html><script type="module" src="/assets/app.js"></script>');
  fs.mkdirSync(path.join(bundleDir, 'assets'));
  fs.writeFileSync(path.join(bundleDir, 'assets', 'app.js'), 'console.log("x");'.repeat(30000));
  const requestAction = vi.fn(async () => ({ success: true }));
  const service = createMobileRemoteService({ dataDir, bundleDir, appVersion: '9.9.9', machineName: 'PC-prueba', requestAction, interfaces: LAN, ...options });
  const started = await service.start({ port: 0 });
  expect(started.success).toBe(true);
  cleanups.push(() => service.stop());
  return { service, dataDir, bundleDir, requestAction, port: started.port as number };
}

/** Decodes the QR's orca://pair URL like the app does. */
function decodeOffer(url: string) {
  const code = new URL(url.replace('orca://', 'http://')).searchParams.get('code')!;
  return JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

/** A phone: pairs with the offer, then sends RPCs over the encrypted socket. */
async function connectPhone(port: number, offer: { deviceToken: string; publicKeyB64: string }, token = offer.deviceToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on('error', () => {});
  const inbox: string[] = [];
  const waiting: ((s: string) => void)[] = [];
  let closed = false;
  ws.on('message', (d) => (waiting.length ? waiting.shift()!(d.toString()) : inbox.push(d.toString())));
  ws.on('close', () => {
    closed = true;
  });
  const next = () =>
    new Promise<string>((resolve, reject) => {
      if (inbox.length) return resolve(inbox.shift()!);
      waiting.push(resolve);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
  await new Promise((r) => ws.once('open', r));
  const client = createClientSession(offer.publicKeyB64);
  ws.send(JSON.stringify(client.hello));
  const channel = client.acceptReady(JSON.parse(await next()));
  expect(channel).toBeTruthy();
  ws.send(channel.sealText(JSON.stringify({ type: 'e2ee_auth', v: 2, transcriptHashB64: channel.transcriptHashB64, deviceToken: token })));
  const auth = JSON.parse(channel.openText(await next()));
  let n = 0;
  const rpc = async (method: string, params?: unknown) => {
    const id = `r${n++}`;
    ws.send(channel.sealText(JSON.stringify({ id, deviceToken: token, method, params })));
    const reply = JSON.parse(channel.openText(await next()));
    expect(reply.id).toBe(id);
    return reply;
  };
  cleanups.push(() => ws.close());
  return { auth, rpc, isClosed: () => closed, waitClosed: () => new Promise((r) => (closed ? r(null) : ws.once('close', r))) };
}

async function pairPhone(service: any, port: number) {
  const pairing = await service.createPairing({ address: '192.168.1.20' });
  expect(pairing).toMatchObject({ success: true, endpoint: expect.stringMatching(/^ws:\/\/192\.168\.1\.20:\d+$/) });
  expect(pairing.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  const offer = decodeOffer(pairing.url);
  expect(offer).toMatchObject({ v: 2, endpoint: pairing.endpoint, publicKeyB64: expect.any(String), deviceToken: expect.any(String) });
  return { phone: await connectPhone(port, offer), offer };
}

describe('Orca Mobile E2EE v2 (host side)', () => {
  it('derives the same keys as the phone and rejects tampered or replayed frames', () => {
    const keys = generateKeyPair();
    const client = createClientSession(keys.publicKeyB64);
    const host = createHostSession(client.hello, keys);
    const phone = client.acceptReady(host.ready);
    expect(phone.transcriptHashB64).toBe(host.transcriptHashB64);

    const frame = phone.sealText('hola ñ 👋');
    expect(host.openText(frame)).toBe('hola ñ 👋');
    expect(host.openText(frame)).toBeNull(); // the counter moved on: no replay
    expect(phone.openText(host.sealText('respuesta'))).toBe('respuesta');

    const bytes = Buffer.from(phone.sealText('otro'), 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(host.openText(bytes.toString('base64'))).toBeNull();
  });

  it('only answers a direct v2 hello', () => {
    const keys = generateKeyPair();
    const { hello } = createClientSession(keys.publicKeyB64);
    expect(createHostSession({ ...hello, v: 1 }, keys)).toBeNull();
    expect(createHostSession({ ...hello, context: { ...hello.context, transport: 'relay', relayHostId: 'abcdefghijklmnop' } }, keys)).toBeNull();
    expect(createHostSession({ ...hello, extra: true }, keys)).toBeNull();
    expect(createHostSession({ type: 'e2ee_hello', publicKeyB64: keys.publicKeyB64 }, keys)).toBeNull();
  });
});

describe('mobile remote service', () => {
  it('pairs a phone by QR, reports a compatible desktop and serves the page', async () => {
    const { service, port } = await startService();
    const { phone } = await pairPhone(service, port);
    expect(phone.auth).toMatchObject({ type: 'e2ee_authenticated', v: 2 });

    const status = await phone.rpc('status.get');
    expect(status.result).toMatchObject({ protocolVersion: 3, minCompatibleMobileVersion: 2, machineName: 'PC-prueba', capabilities: ['mobileWeb.bundle.v1'] });
    expect((await phone.rpc('worktree.ps')).error.code).toBe('method_not_found');

    const { result } = await phone.rpc('mobileWeb.bundle.manifest', null);
    const { manifest } = result;
    const hashed = manifest.assets.map(({ path: p, sha256, byteLength, contentType }: any) => ({ path: p, sha256, byteLength, contentType }));
    expect(manifest.buildId).toBe(crypto.createHash('sha256').update(JSON.stringify(hashed)).digest('hex'));
    expect(manifest.assets.map((a: any) => a.path)).toEqual(['assets/app.js', 'index.html']);
    expect(manifest.totalBytes).toBe(hashed.reduce((n: number, a: any) => n + a.byteLength, 0));
    expect(manifest.routes).toEqual([{ pathname: '/h/[hostId]', grants: [] }]);

    const js = manifest.assets[0];
    const parts: Buffer[] = [];
    for (let offset = 0, eof = false; !eof; offset += result.rangeBytes) {
      const r = await phone.rpc('mobileWeb.bundle.range', { buildId: manifest.buildId, path: js.path, offset });
      expect(r.result.encoding).toBe('identity');
      parts.push(Buffer.from(r.result.dataBase64, 'base64'));
      eof = r.result.eof;
    }
    expect(crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex')).toBe(js.sha256);
    expect((await phone.rpc('mobileWeb.bundle.range', { buildId: manifest.buildId, path: js.path, offset: 7 })).error.code).toBe('mobile_web_bundle_offset_invalid');
    expect((await phone.rpc('mobileWeb.bundle.chunk', { buildId: 'f'.repeat(64), path: js.path, offset: 0 })).error.code).toBe('mobile_web_bundle_build_changed');
  });

  it('refuses unknown tokens and disconnects a revoked phone', async () => {
    const { service, port } = await startService();
    const { phone, offer } = await pairPhone(service, port);
    const intruder = await connectPhone(port, offer, 'a'.repeat(48));
    expect(intruder.auth).toMatchObject({ type: 'e2ee_error', error: { code: 'unauthorized' } });

    const [device] = service.listDevices();
    expect(device).toMatchObject({ connected: true, lastSeenAt: expect.any(Number) });
    expect(service.revokeDevice(device.id)).toBe(true);
    await phone.waitClosed();
    expect(service.listDevices()).toEqual([]);
    const again = await connectPhone(port, offer);
    expect(again.auth.type).toBe('e2ee_error');
  });

  it('keeps the keys across restarts and forgets QR codes nobody scanned', async () => {
    const { service, dataDir, bundleDir } = await startService();
    const first = decodeOffer((await service.createPairing({})).url);
    await service.stop();
    const later = createMobileRemoteService({ dataDir, bundleDir, interfaces: LAN });
    await later.start({ port: 0 });
    cleanups.push(() => later.stop());
    expect(decodeOffer((await later.createPairing({})).url).publicKeyB64).toBe(first.publicKeyB64);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 16 * 60 * 1000);
      expect(later.listDevices()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mirrors the chat tabs and forwards phone actions to the renderer', async () => {
    const { service, port, requestAction } = await startService();
    const { phone } = await pairPhone(service, port);
    service.publishTabs([{ tabId: 'tab-1', title: 'Arreglar tests', provider: 'codex', active: true }]);

    const list = await phone.rpc('yanote.chats.list', { version: -1 });
    expect(list.result.tabs).toEqual([{ tabId: 'tab-1', title: 'Arreglar tests', provider: 'codex', active: true }]);

    // A long poll waits for the next change instead of answering at once
    const waiting = phone.rpc('yanote.chat.get', { tabId: 'tab-1', version: 0, waitMs: 5000 });
    await new Promise((r) => setTimeout(r, 50));
    service.publishChat('tab-1', { items: [{ kind: 'user', id: 'u1', text: 'hola', imageCount: 0 }], meta: { running: true, ended: false, starting: false } });
    const first = (await waiting).result;
    expect(first).toMatchObject({ version: 1, from: 0, total: 1, meta: { running: true } });

    service.publishChat('tab-1', {
      items: [
        { kind: 'user', id: 'u1', text: 'hola', imageCount: 0 },
        { kind: 'text', id: 't1', text: '¡Hola!', streaming: false },
      ],
      meta: { running: false, ended: false, starting: false },
    });
    const second = (await phone.rpc('yanote.chat.get', { tabId: 'tab-1', version: first.version })).result;
    expect(second).toMatchObject({ version: 2, from: 1, total: 2, items: [{ kind: 'text', text: '¡Hola!' }] });

    expect((await phone.rpc('yanote.chat.send', { tabId: 'tab-1', text: '  sigue  ' })).result).toEqual({ success: true });
    expect((await phone.rpc('yanote.chat.decide', { tabId: 'tab-1', requestId: 'perm-1', behavior: 'allow' })).result).toEqual({ success: true });
    expect((await phone.rpc('yanote.chat.interrupt', { tabId: 'tab-1' })).result).toEqual({ success: true });
    expect(requestAction.mock.calls.map(([a]: any[]) => a)).toEqual([
      { type: 'send', tabId: 'tab-1', text: 'sigue' },
      { type: 'decide', tabId: 'tab-1', requestId: 'perm-1', behavior: 'allow' },
      { type: 'interrupt', tabId: 'tab-1' },
    ]);
    expect((await phone.rpc('yanote.chat.decide', { tabId: 'tab-1', requestId: 'perm-1', behavior: 'always' })).error.code).toBe('invalid_argument');

    service.publishTabs([]);
    expect((await phone.rpc('yanote.chat.get', { tabId: 'tab-1', version: 2 })).error.code).toBe('chat_closed');
    expect((await phone.rpc('yanote.chat.send', { tabId: 'tab-1', text: 'hola' })).result).toMatchObject({ success: false });
    expect(requestAction).toHaveBeenCalledTimes(3);
  });

  it('lists, reads and saves notes from the phone without overwriting desktop work', async () => {
    const notesRoot = tempDir();
    fs.mkdirSync(path.join(notesRoot, 'proyectos'));
    fs.mkdirSync(path.join(notesRoot, '.oculta'));
    const idea = path.join(notesRoot, 'idea.md');
    const plan = path.join(notesRoot, 'proyectos', 'plan.md');
    fs.writeFileSync(idea, '# Idea\n');
    fs.writeFileSync(plan, '- paso 1\n');
    fs.writeFileSync(path.join(notesRoot, 'foto.png'), 'x');
    fs.writeFileSync(path.join(notesRoot, '.oculta', 'secreta.md'), 'x');
    const outside = path.join(tempDir(), 'fuera.md');
    fs.writeFileSync(outside, 'privado');

    const { service, port, requestAction } = await startService({ getNotesRoot: () => notesRoot });
    const { phone } = await pairPhone(service, port);
    service.publishNotes([{ path: plan, title: 'plan.md', isDirty: true }]);

    const { notes } = (await phone.rpc('yanote.notes.list')).result;
    expect(notes.map((n: any) => [n.name, n.folder, n.dirty])).toEqual(
      expect.arrayContaining([['idea.md', '', false], ['plan.md', 'proyectos', true]])
    );
    expect(notes).toHaveLength(2);

    const read = (await phone.rpc('yanote.notes.read', { path: idea })).result;
    expect(read).toMatchObject({ content: '# Idea\n', dirty: false });
    expect((await phone.rpc('yanote.notes.read', { path: outside })).error.code).toBe('forbidden');
    expect((await phone.rpc('yanote.notes.read', { path: path.join(notesRoot, '..', path.basename(path.dirname(outside)), 'fuera.md') })).error.code).toBe('forbidden');

    const saved = (await phone.rpc('yanote.notes.write', { path: idea, content: '# Idea\nDesde el móvil\n', mtime: read.mtime })).result;
    expect(saved).toMatchObject({ success: true });
    expect(fs.readFileSync(idea, 'utf8')).toBe('# Idea\nDesde el móvil\n');
    // Not open in a tab: nothing to refresh on the desktop
    expect(requestAction).not.toHaveBeenCalled();

    // Changed on the computer after the phone read it
    fs.writeFileSync(idea, 'otra versión');
    fs.utimesSync(idea, new Date(), new Date(Date.now() + 5000));
    expect((await phone.rpc('yanote.notes.write', { path: idea, content: 'pisar', mtime: saved.mtime })).error.code).toBe('conflict');
    expect(fs.readFileSync(idea, 'utf8')).toBe('otra versión');

    // Unsaved edits in the desktop tab win
    const planRead = (await phone.rpc('yanote.notes.read', { path: plan })).result;
    expect(planRead.dirty).toBe(true);
    expect((await phone.rpc('yanote.notes.write', { path: plan, content: 'x', mtime: planRead.mtime })).error.code).toBe('desktop_dirty');

    // Once saved there, the phone can edit it and the open tab gets the new text
    service.publishNotes([{ path: plan, title: 'plan.md', isDirty: false }]);
    expect((await phone.rpc('yanote.notes.write', { path: plan, content: '- paso 2\n', mtime: planRead.mtime })).result.success).toBe(true);
    expect(requestAction).toHaveBeenCalledWith({ type: 'noteSaved', path: plan, content: '- paso 2\n' });

    // An open note outside the notes folder is reachable while it stays open
    service.publishNotes([{ path: outside, title: 'fuera.md', isDirty: false }]);
    expect((await phone.rpc('yanote.notes.read', { path: outside })).result.content).toBe('privado');
    expect((await phone.rpc('yanote.notes.read', { path: path.join(notesRoot, 'foto.png') })).error.code).toBe('forbidden');
  });

  it('reports a busy port instead of failing silently', async () => {
    const { port } = await startService();
    const other = createMobileRemoteService({ dataDir: tempDir(), bundleDir: tempDir(), interfaces: LAN });
    expect(await other.start({ port })).toEqual({ success: false, error: `El puerto ${port} ya está en uso` });
    expect(other.isRunning()).toBe(false);
  });
});

describe('chat mirror', () => {
  it('sends only the items that changed since the phone last read', () => {
    const mirror = createChatMirror();
    mirror.publishTabs([{ tabId: 'a', title: 'A', provider: 'claude', active: false }]);
    const items = (n: number, last = 'x') => Array.from({ length: n }, (_, i) => ({ kind: 'text', id: `i${i}`, text: i === n - 1 ? last : `m${i}`, streaming: false }));
    mirror.publishChat('a', { items: items(3), meta: null });
    mirror.publishChat('a', { items: items(3), meta: null }); // no change: same version
    expect(mirror.chatVersion('a')).toBe(1);
    mirror.publishChat('a', { items: items(3, 'y'), meta: null });
    mirror.publishChat('a', { items: items(5), meta: null });
    expect(mirror.chat('a', 1)).toMatchObject({ version: 3, from: 2, total: 5 });
    expect(mirror.chat('a', 3)).toMatchObject({ from: 5, items: [] });
    expect(mirror.chat('a', 0)).toMatchObject({ from: 0, total: 5 });
    mirror.publishTabs([]);
    expect(mirror.chat('a', 0)).toBeNull();
  });

  it('serves a placeholder page when the mobile page was not built', () => {
    const bundle = buildBundle(path.join(os.tmpdir(), 'no-such-yanote-bundle'), '1.0.0');
    expect(bundle.manifest.assets.map((a: any) => a.path)).toEqual(['index.html']);
    expect(bundle.byPath.get('index.html').bytes.toString()).toContain('npm run build:mobile');
  });
});
