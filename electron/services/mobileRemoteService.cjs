const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { generateKeyPair, createHostSession } = require('./mobile/orcaE2ee.cjs');
const { getLogger } = require('./logService.cjs');

const log = getLogger('mobileRemoteService');

/**
 * Lets the Orca Mobile app (iOS/Android, MIT, stablyai/orca) use yanote's chats.
 *
 * The app pairs by QR, opens a WebSocket to this computer on the local network
 * (or Tailscale), runs Orca's end-to-end encryption, and then downloads a web page
 * from us (the "mobile web bundle") that it shows full screen. That page is ours:
 * dist/mobile-web, built from mobile-web/. It talks back through the app's bridge
 * with the `yanote.*` methods below, which mirror the chat tabs open in yanote.
 */

const DEFAULT_PORT = 6769;
const STATE_FILE = 'mobile-remote.json';
/** A QR nobody scanned stops working after this long */
const UNUSED_PAIRING_TTL_MS = 15 * 60 * 1000;
const MAX_DEVICES = 10;
const MAX_WAIT_MS = 25000;
const CHUNK_BYTES = 48 * 1024;
const RANGE_BYTES = 384 * 1024;
const MAX_TEXT_CHARS = 100000;
const PROTOCOL_VERSION = 3;
const MIN_MOBILE_VERSION = 2;
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
const FALLBACK_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<body style="font-family:system-ui;background:#111;color:#eee;padding:48px 24px">' +
  '<h2>yanote</h2><p>Falta la página móvil. Ejecuta <code>npm run build:mobile</code> y vuelve a abrir este equipo.</p></body>';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const now = () => Date.now();

function lanAddresses(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces)
    .flatMap(([name, list]) => (list || []).map((a) => ({ name, address: a.address, family: a.family, internal: a.internal })))
    .filter((a) => (a.family === 'IPv4' || a.family === 4) && !a.internal)
    .map(({ name, address }) => ({
      name,
      address,
      kind: address.startsWith('100.') ? 'tailscale' : /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(address) ? 'lan' : 'other',
    }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'lan' ? -1 : b.kind === 'lan' ? 1 : a.kind === 'tailscale' ? -1 : 1));
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (CONTENT_TYPES[path.extname(entry.name).toLowerCase()]) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** The page the app downloads, as Orca's manifest describes it (buildId = hash of the asset list). */
function buildBundle(bundleDir, appVersion) {
  let files = [];
  try {
    files = fs.existsSync(path.join(bundleDir, 'index.html')) ? listFiles(bundleDir) : [];
  } catch (err) {
    log.warn('mobile page could not be read', err, { bundleDir });
  }
  const sources = files.length
    ? files.map((p) => ({ path: p, bytes: fs.readFileSync(path.join(bundleDir, p)) }))
    : [{ path: 'index.html', bytes: Buffer.from(FALLBACK_HTML) }];
  const assets = sources
    .map(({ path: p, bytes }) => ({ path: p, sha256: sha256(bytes), byteLength: bytes.length, contentType: CONTENT_TYPES[path.extname(p).toLowerCase()], bytes }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hashed = assets.map(({ path: p, sha256: s, byteLength, contentType }) => ({ path: p, sha256: s, byteLength, contentType }));
  return {
    manifest: {
      schemaVersion: 1,
      buildId: sha256(JSON.stringify(hashed)),
      desktopVersion: `yanote-${appVersion}`.slice(0, 64),
      minCompatibleRuntimeProtocolVersion: MIN_MOBILE_VERSION,
      runtimeProtocolVersion: PROTOCOL_VERSION,
      pageVersion: 3,
      entrypoint: 'index.html',
      totalBytes: hashed.reduce((n, a) => n + a.byteLength, 0),
      assets: hashed,
      // Only the host's home screen: the page navigates between chats by itself
      routes: [{ pathname: '/h/[hostId]', grants: [] }],
    },
    byPath: new Map(assets.map((a) => [a.path, a])),
  };
}

function bundleWindow(bundle, params, windowBytes) {
  const p = params && typeof params === 'object' ? params : {};
  if (p.buildId !== bundle.manifest.buildId) return { error: 'mobile_web_bundle_build_changed' };
  const asset = bundle.byPath.get(p.path);
  if (!asset) return { error: 'mobile_web_bundle_asset_unknown' };
  const offset = p.offset;
  const valid = Number.isInteger(offset) && offset >= 0 && offset % windowBytes === 0 && (offset < asset.byteLength || offset === 0);
  if (!valid) return { error: 'mobile_web_bundle_offset_invalid' };
  const end = Math.min(offset + windowBytes, asset.byteLength);
  return {
    result: {
      buildId: p.buildId,
      path: p.path,
      offset,
      assetByteLength: asset.byteLength,
      sha256: asset.sha256,
      eof: end >= asset.byteLength,
      dataBase64: asset.bytes.subarray(offset, end).toString('base64'),
    },
  };
}

/**
 * Latest state of the chat tabs, as the renderer publishes it, with a version per change
 * so the phone downloads only the items that changed since its last read.
 */
function createChatMirror() {
  let tabs = { version: 0, list: [] };
  const chats = new Map();
  const waiters = new Set();

  const wake = () => {
    for (const w of [...waiters]) w();
  };

  function waitFor(isReady, timeoutMs, signal) {
    if (isReady()) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        waiters.delete(check);
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', done);
        resolve();
      };
      const check = () => {
        if (isReady()) done();
      };
      const timer = setTimeout(done, Math.max(0, Math.min(timeoutMs, MAX_WAIT_MS)));
      signal?.addEventListener?.('abort', done);
      waiters.add(check);
    });
  }

  return {
    publishTabs(list) {
      const clean = Array.isArray(list) ? list.filter((t) => t && typeof t.tabId === 'string') : [];
      if (JSON.stringify(clean) === JSON.stringify(tabs.list)) return;
      const alive = new Set(clean.map((t) => t.tabId));
      for (const id of [...chats.keys()]) if (!alive.has(id)) chats.delete(id);
      tabs = { version: tabs.version + 1, list: clean };
      wake();
    },
    publishChat(tabId, snapshot) {
      if (typeof tabId !== 'string' || !snapshot || !Array.isArray(snapshot.items)) return;
      const prev = chats.get(tabId) || { version: 0, keys: [], items: [], meta: null, log: [] };
      const keys = snapshot.items.map((i) => JSON.stringify(i));
      const metaKey = JSON.stringify(snapshot.meta ?? null);
      let from = 0;
      while (from < keys.length && from < prev.keys.length && keys[from] === prev.keys[from]) from++;
      if (from === keys.length && keys.length === prev.keys.length && metaKey === prev.metaKey) return;
      const version = prev.version + 1;
      const changeLog = [...prev.log, { version, from }].slice(-300);
      chats.set(tabId, { version, keys, items: snapshot.items, meta: snapshot.meta ?? null, metaKey, log: changeLog });
      wake();
    },
    tabs: () => tabs,
    /** Items changed after `since`: the phone keeps its first `from` items and appends these. */
    chat(tabId, since) {
      const c = chats.get(tabId);
      if (!c) return null;
      let from = 0;
      if (Number.isInteger(since) && since > 0 && since <= c.version) {
        const oldest = c.log[0];
        if (since === c.version) from = c.items.length;
        else if (oldest && since >= oldest.version - 1) from = Math.min(...c.log.filter((e) => e.version > since).map((e) => e.from));
      }
      return { version: c.version, from, total: c.items.length, items: c.items.slice(from), meta: c.meta };
    },
    chatVersion: (tabId) => chats.get(tabId)?.version ?? 0,
    waitFor,
  };
}

const NOTE_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const MAX_NOTES = 3000;
const MAX_NOTE_DEPTH = 8;
const MAX_NOTE_BYTES = 2 * 1024 * 1024;

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const isInside = (root, file) => {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** Notes under `root` (subfolders included), newest first. Hidden folders and node_modules are skipped. */
function listNoteFiles(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > MAX_NOTE_DEPTH || out.length >= MAX_NOTES) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      log.warn('notes folder unreadable', err, { dir });
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_NOTES) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && NOTE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const stat = fs.statSync(full);
          out.push({ path: full, name: entry.name, folder: path.relative(root, dir).split(path.sep).join('/'), mtime: stat.mtimeMs, size: stat.size });
        } catch {
          // vanished while listing
        }
      }
    }
  };
  if (root && fs.existsSync(root)) walk(root, 0);
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * `requestAction(action)` runs a phone action in the renderer (send, decide, interrupt, noteSaved) and
 * resolves with its result; `getNotesRoot()` is the notes folder; `WebSocketServer` and `qrcode` are
 * injectable for tests.
 */
function createMobileRemoteService({
  dataDir,
  bundleDir,
  appVersion = '0.0.0',
  machineName = os.hostname(),
  requestAction = async () => ({ success: false, error: 'yanote no está listo' }),
  getNotesRoot = () => null,
  loadWs = () => require('ws'),
  loadQr = () => require('qrcode'),
  interfaces,
} = {}) {
  const statePath = path.join(dataDir, STATE_FILE);
  const mirror = createChatMirror();
  let state = null;
  let server = null;
  let port = DEFAULT_PORT;
  let lastError = null;
  let bundle = null;
  const sockets = new Set();

  function loadState() {
    if (state) return state;
    try {
      const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (saved && typeof saved.publicKeyB64 === 'string' && typeof saved.secretKeyB64 === 'string') {
        state = { runtimeId: crypto.randomUUID(), devices: [], ...saved };
        state.devices = Array.isArray(state.devices) ? state.devices.filter((d) => d && typeof d.tokenHash === 'string') : [];
        return state;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn('mobile pairing state unreadable; starting over', err);
    }
    state = { ...generateKeyPair(), runtimeId: crypto.randomUUID(), devices: [] };
    saveState();
    return state;
  }

  function saveState() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    } catch (err) {
      log.error('mobile pairing state could not be saved', err);
    }
  }

  function pruneUnusedPairings() {
    const s = loadState();
    const before = s.devices.length;
    s.devices = s.devices.filter((d) => d.lastSeenAt || now() - d.createdAt < UNUSED_PAIRING_TTL_MS);
    if (s.devices.length !== before) saveState();
  }

  const findDevice = (token) => {
    if (typeof token !== 'string' || !token) return null;
    const hash = sha256(token);
    return loadState().devices.find((d) => d.tokenHash === hash) || null;
  };

  function currentBundle() {
    if (!bundle) bundle = buildBundle(bundleDir, appVersion);
    return bundle;
  }

  function statusResult() {
    return {
      runtimeId: loadState().runtimeId,
      protocolVersion: PROTOCOL_VERSION,
      minCompatibleMobileVersion: MIN_MOBILE_VERSION,
      runtimeProtocolVersion: PROTOCOL_VERSION,
      minCompatibleRuntimeClientVersion: MIN_MOBILE_VERSION,
      appVersion,
      capabilities: ['mobileWeb.bundle.v1'],
      hostPlatform: process.platform,
      machineName,
      floatingWorkspaceEnabled: false,
      graphStatus: 'ready',
      desktopWindowStatus: 'available',
      liveTabCount: mirror.tabs().list.length,
      liveLeafCount: 0,
    };
  }

  const tabExists = (tabId) => mirror.tabs().list.some((t) => t.tabId === tabId);

  /** Note tabs open in yanote: { path, title, isDirty } */
  let openNotes = [];
  const openNote = (file) => openNotes.find((n) => samePath(n.path, file));

  /** The phone may only touch notes in the notes folder, or ones open in a tab. */
  function allowedNote(file) {
    if (typeof file !== 'string' || !file || !NOTE_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
    if (openNote(file)) return true;
    const root = getNotesRoot();
    if (!root) return false;
    // Real paths, so a link inside the notes folder can't lead the phone out of it
    const real = (p) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return path.resolve(p);
      }
    };
    return isInside(real(root), real(file));
  }

  function listNotes() {
    const root = getNotesRoot();
    const files = listNoteFiles(root);
    const seen = new Set(files.map((f) => path.resolve(f.path).toLowerCase()));
    // Open notes from other folders too
    for (const n of openNotes) {
      if (seen.has(path.resolve(n.path).toLowerCase()) || !fs.existsSync(n.path)) continue;
      try {
        const stat = fs.statSync(n.path);
        files.push({ path: n.path, name: path.basename(n.path), folder: path.dirname(n.path), mtime: stat.mtimeMs, size: stat.size });
      } catch {
        // unreadable: skip
      }
    }
    return files.map((f) => {
      const open = openNote(f.path);
      return { ...f, open: Boolean(open), dirty: Boolean(open && open.isDirty) };
    });
  }

  function readNote(file) {
    if (!allowedNote(file)) return { error: 'forbidden', message: 'Esa nota no está en tu carpeta de notas' };
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_NOTE_BYTES) return { error: 'too_large', message: 'La nota es demasiado grande para el teléfono' };
      const open = openNote(file);
      return { ok: { path: file, name: path.basename(file), content: fs.readFileSync(file, 'utf8'), mtime: stat.mtimeMs, dirty: Boolean(open && open.isDirty) } };
    } catch (err) {
      return { error: 'not_found', message: err.code === 'ENOENT' ? 'La nota ya no existe' : err.message };
    }
  }

  async function writeNote(file, content, baseMtime) {
    if (!allowedNote(file)) return { error: 'forbidden', message: 'Esa nota no está en tu carpeta de notas' };
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_NOTE_BYTES) return { error: 'invalid_argument', message: 'Contenido no válido' };
    const open = openNote(file);
    if (open && open.isDirty) {
      return { error: 'desktop_dirty', message: 'Esta nota tiene cambios sin guardar en el ordenador. Guárdala allí primero.' };
    }
    try {
      const stat = fs.statSync(file);
      if (Math.abs(stat.mtimeMs - Number(baseMtime)) > 1) {
        return { error: 'conflict', message: 'La nota cambió en el ordenador mientras la editabas. Ábrela de nuevo para ver la última versión.' };
      }
      fs.writeFileSync(file, content, 'utf8');
      const mtime = fs.statSync(file).mtimeMs;
      // The open tab (if any) shows the new text
      if (open) void requestAction({ type: 'noteSaved', path: open.path, content }).catch(() => {});
      return { ok: { success: true, mtime } };
    } catch (err) {
      return { error: 'write_failed', message: err.code === 'ENOENT' ? 'La nota ya no existe' : err.message };
    }
  }

  async function rendererAction(action) {
    if (!tabExists(action.tabId)) return { success: false, error: 'Ese chat ya no está abierto en yanote' };
    try {
      const res = await requestAction(action);
      return res && typeof res === 'object' ? res : { success: Boolean(res) };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  /** One RPC from an authenticated phone. `signal` aborts long waits when the socket closes. */
  async function handleRpc(method, params, signal) {
    const p = params && typeof params === 'object' ? params : {};
    switch (method) {
      case 'status.get':
        return { ok: statusResult() };
      case 'mobileWeb.bundle.manifest':
        bundle = buildBundle(bundleDir, appVersion);
        return { ok: { manifest: bundle.manifest, chunkBytes: CHUNK_BYTES, rangeBytes: RANGE_BYTES } };
      case 'mobileWeb.bundle.chunk':
      case 'mobileWeb.bundle.range': {
        const isRange = method === 'mobileWeb.bundle.range';
        const w = bundleWindow(currentBundle(), p, isRange ? RANGE_BYTES : CHUNK_BYTES);
        if (w.error) return { error: w.error };
        return { ok: isRange ? { ...w.result, encoding: 'identity' } : w.result };
      }
      case 'yanote.chats.list': {
        const since = Number.isInteger(p.version) ? p.version : -1;
        await mirror.waitFor(() => mirror.tabs().version !== since, Number(p.waitMs) || 0, signal);
        const t = mirror.tabs();
        return { ok: { version: t.version, tabs: t.list, machineName } };
      }
      case 'yanote.chat.get': {
        if (typeof p.tabId !== 'string') return { error: 'invalid_argument', message: 'Falta el chat' };
        const since = Number.isInteger(p.version) ? p.version : 0;
        await mirror.waitFor(() => !tabExists(p.tabId) || mirror.chatVersion(p.tabId) !== since, Number(p.waitMs) || 0, signal);
        if (!tabExists(p.tabId)) return { error: 'chat_closed', message: 'Ese chat ya no está abierto en yanote' };
        return { ok: mirror.chat(p.tabId, since) || { version: 0, from: 0, total: 0, items: [], meta: null } };
      }
      case 'yanote.chat.send': {
        const text = typeof p.text === 'string' ? p.text.trim().slice(0, MAX_TEXT_CHARS) : '';
        if (!text || typeof p.tabId !== 'string') return { error: 'invalid_argument', message: 'Mensaje vacío' };
        return { ok: await rendererAction({ type: 'send', tabId: p.tabId, text }) };
      }
      case 'yanote.chat.decide': {
        if (typeof p.tabId !== 'string' || typeof p.requestId !== 'string' || !['allow', 'deny'].includes(p.behavior)) {
          return { error: 'invalid_argument', message: 'Decisión inválida' };
        }
        return { ok: await rendererAction({ type: 'decide', tabId: p.tabId, requestId: p.requestId, behavior: p.behavior }) };
      }
      case 'yanote.chat.interrupt':
        if (typeof p.tabId !== 'string') return { error: 'invalid_argument', message: 'Falta el chat' };
        return { ok: await rendererAction({ type: 'interrupt', tabId: p.tabId }) };
      case 'yanote.notes.list':
        return { ok: { root: getNotesRoot(), notes: listNotes() } };
      case 'yanote.notes.read':
        return readNote(p.path);
      case 'yanote.notes.write':
        return writeNote(p.path, p.content, p.mtime);
      default:
        return { error: 'method_not_found', message: `Unknown method: ${method}` };
    }
  }

  function onConnection(socket, req) {
    const remote = req && req.socket ? req.socket.remoteAddress : 'unknown';
    const abort = new AbortController();
    const conn = { socket, channel: null, device: null, abort };
    sockets.add(conn);
    const close = (code, reason) => {
      try {
        socket.close(code, reason);
      } catch {
        // already closed
      }
    };
    const reply = (msg) => {
      if (socket.readyState === 1 && conn.channel) socket.send(conn.channel.sealText(JSON.stringify(msg)));
    };

    socket.on('message', (data, isBinary) => {
      if (isBinary) return; // the phone sends no binary frames to these methods
      const text = data.toString('utf8');
      if (!conn.channel) {
        let hello;
        try {
          hello = JSON.parse(text);
        } catch {
          return close(1008, 'expected hello');
        }
        conn.channel = createHostSession(hello, loadState());
        if (!conn.channel) {
          socket.send(JSON.stringify({ type: 'e2ee_error', error: { code: 'bad_hello', message: 'Expected an E2EE v2 hello' } }));
          return close(1008, 'bad hello');
        }
        socket.send(JSON.stringify(conn.channel.ready));
        return;
      }
      const plain = conn.channel.openText(text);
      if (plain === null) return close(1008, 'bad frame');
      let msg;
      try {
        msg = JSON.parse(plain);
      } catch {
        return;
      }
      if (!conn.device) {
        const device = msg && msg.type === 'e2ee_auth' && msg.v === 2 && msg.transcriptHashB64 === conn.channel.transcriptHashB64 ? findDevice(msg.deviceToken) : null;
        if (!device) {
          log.info('mobile device refused', { remote });
          reply({ type: 'e2ee_error', error: { code: 'unauthorized', message: 'Unauthorized' } });
          return close(1008, 'unauthorized');
        }
        conn.device = device;
        conn.token = msg.deviceToken;
        device.lastSeenAt = now();
        saveState();
        log.info('mobile device connected', { device: device.id, remote });
        reply({ type: 'e2ee_authenticated', v: 2, transcriptHashB64: conn.channel.transcriptHashB64 });
        return;
      }
      if (!msg || typeof msg.id !== 'string' || typeof msg.method !== 'string') return;
      const meta = { runtimeId: loadState().runtimeId };
      if (msg.deviceToken !== conn.token || !findDevice(conn.token)) {
        reply({ id: msg.id, ok: false, error: { code: 'unauthorized', message: 'Unauthorized' }, _meta: meta });
        return close(1008, 'revoked');
      }
      handleRpc(msg.method, msg.params, abort.signal)
        .then((res) =>
          reply(
            'ok' in res
              ? { id: msg.id, ok: true, result: res.ok, _meta: meta }
              : { id: msg.id, ok: false, error: { code: res.error, message: res.message || res.error }, _meta: meta }
          )
        )
        .catch((err) => {
          log.error('mobile RPC failed', err, { method: msg.method });
          reply({ id: msg.id, ok: false, error: { code: 'internal_error', message: 'Error interno de yanote' }, _meta: meta });
        });
    });
    socket.on('close', () => {
      abort.abort();
      sockets.delete(conn);
    });
    socket.on('error', (err) => log.warn('mobile socket error', err, { remote }));
  }

  function start({ port: wanted } = {}) {
    if (server) return Promise.resolve({ success: true, port });
    loadState();
    // 0 = any free port (tests)
    port = Number.isInteger(wanted) && wanted >= 0 ? wanted : DEFAULT_PORT;
    return new Promise((resolve) => {
      let WebSocketServer;
      try {
        ({ WebSocketServer } = loadWs());
      } catch (err) {
        lastError = err.message;
        return resolve({ success: false, error: err.message });
      }
      const wss = new WebSocketServer({ host: '0.0.0.0', port, maxPayload: 8 * 1024 * 1024 });
      wss.on('connection', onConnection);
      wss.once('listening', () => {
        server = wss;
        port = wss.address().port;
        lastError = null;
        log.info('mobile server listening', { port });
        resolve({ success: true, port });
      });
      wss.once('error', (err) => {
        lastError = err.code === 'EADDRINUSE' ? `El puerto ${port} ya está en uso` : err.message;
        log.warn('mobile server could not start', err, { port });
        try {
          wss.close();
        } catch {
          // never opened
        }
        resolve({ success: false, error: lastError });
      });
    });
  }

  function stop() {
    for (const conn of sockets) {
      conn.abort.abort();
      try {
        conn.socket.terminate();
      } catch {
        // gone
      }
    }
    sockets.clear();
    const s = server;
    server = null;
    if (!s) return Promise.resolve();
    return new Promise((resolve) => s.close(() => resolve()));
  }

  /** A new QR: a fresh token for one phone, valid until revoked (or 15 minutes if never used). */
  async function createPairing({ address } = {}) {
    pruneUnusedPairings();
    const s = loadState();
    if (s.devices.length >= MAX_DEVICES) return { success: false, error: `Máximo ${MAX_DEVICES} teléfonos: quita alguno antes` };
    const addrs = lanAddresses(interfaces);
    const host = (address && addrs.some((a) => a.address === address) && address) || addrs[0]?.address;
    if (!host) return { success: false, error: 'Este equipo no está conectado a ninguna red' };
    const token = crypto.randomBytes(24).toString('hex');
    const device = { id: crypto.randomUUID(), name: `Teléfono ${new Date().toLocaleDateString()}`, tokenHash: sha256(token), createdAt: now(), lastSeenAt: null };
    s.devices.push(device);
    saveState();
    const endpoint = `ws://${host}:${port}`;
    const offer = { v: 2, endpoint, deviceToken: token, publicKeyB64: s.publicKeyB64 };
    const code = Buffer.from(JSON.stringify(offer)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = `orca://pair?code=${code}`;
    let qrDataUrl = null;
    try {
      qrDataUrl = await loadQr().toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    } catch (err) {
      log.warn('QR could not be drawn', err);
    }
    return { success: true, url, qrDataUrl, endpoint, deviceId: device.id };
  }

  function listDevices() {
    pruneUnusedPairings();
    const online = new Set([...sockets].filter((c) => c.device).map((c) => c.device.id));
    return loadState().devices.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt, connected: online.has(id) }));
  }

  function revokeDevice(id) {
    const s = loadState();
    const before = s.devices.length;
    s.devices = s.devices.filter((d) => d.id !== id);
    if (s.devices.length === before) return false;
    saveState();
    for (const conn of sockets) {
      if (conn.device && conn.device.id === id) {
        conn.abort.abort();
        try {
          conn.socket.close(1008, 'revoked');
        } catch {
          // gone
        }
      }
    }
    return true;
  }

  return {
    start,
    stop,
    isRunning: () => Boolean(server),
    status: () => ({ running: Boolean(server), port, error: lastError, addresses: lanAddresses(interfaces), devices: listDevices() }),
    createPairing,
    listDevices,
    revokeDevice,
    publishTabs: mirror.publishTabs,
    publishChat: mirror.publishChat,
    publishNotes: (list) => {
      openNotes = Array.isArray(list) ? list.filter((n) => n && typeof n.path === 'string' && n.path) : [];
    },
    /** For tests */
    handleRpc,
  };
}

module.exports = { createMobileRemoteService, createChatMirror, buildBundle, lanAddresses, DEFAULT_PORT };
