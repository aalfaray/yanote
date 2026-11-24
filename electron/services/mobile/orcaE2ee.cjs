const crypto = require('crypto');
const nacl = require('tweetnacl');

/**
 * Orca Mobile's end-to-end encryption, version 2 (the host side).
 * Mirrors src/shared/remote-runtime/e2ee in stablyai/orca (MIT): an X25519 key
 * exchange, a transcript of the hello/ready pair hashed into HKDF-SHA256, and
 * XSalsa20-Poly1305 frames whose nonce carries a per-direction counter.
 */

const PROTOCOL = 'orca-mobile-e2ee';
const HEADER_LEN = 32 + 1 + 1 + 8;
const NONCE_LEN = 24;
const MAX_TEXT_FRAME_CHARS = 6 * 1024 * 1024;

const enc = new TextEncoder();
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const bytesOf = (s) => Buffer.from(enc.encode(s));
const field = (name, value) => Buffer.concat([u32(bytesOf(name).length), bytesOf(name), u32(value.length), Buffer.from(value)]);
const strList = (xs) => Buffer.concat([u32(xs.length), ...xs.map((x) => Buffer.concat([u32(bytesOf(x).length), bytesOf(x)]))]);
const numList = (xs) => Buffer.concat([u32(xs.length), ...xs.map(u32)]);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
const b64 = (b) => Buffer.from(b).toString('base64');

/** Strict base64 of exactly `len` bytes (the protocol refuses alternative spellings of a key). */
function canonicalB64(value, len) {
  if (typeof value !== 'string' || value.length > MAX_TEXT_FRAME_CHARS) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (len !== undefined && bytes.length !== len) return null;
  return bytes.toString('base64') === value ? bytes : null;
}

function generateKeyPair() {
  const kp = nacl.box.keyPair();
  return { publicKeyB64: b64(kp.publicKey), secretKeyB64: b64(kp.secretKey) };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function exactKeys(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const actual = Object.keys(obj).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((k, i) => k === expected[i]);
}

/** A direct-connection v2 hello, exactly as the app sends it. */
function isDirectHello(h) {
  return (
    exactKeys(h, ['type', 'v', 'clientPublicKeyB64', 'clientNonceB64', 'capabilities', 'context']) &&
    h.type === 'e2ee_hello' &&
    h.v === 2 &&
    sameJson(h.capabilities, { framing: [2], payloadKinds: ['text', 'binary'] }) &&
    exactKeys(h.context, ['protocol', 'initiator', 'responder', 'transport']) &&
    h.context.protocol === PROTOCOL &&
    h.context.initiator === 'mobile' &&
    h.context.responder === 'desktop' &&
    h.context.transport === 'direct'
  );
}

function encodeTranscript(hello, ready, keys) {
  const side = (prefix, ctx) => [
    field(`${prefix}.context.protocol`, bytesOf(ctx.protocol)),
    field(`${prefix}.context.initiator`, bytesOf(ctx.initiator)),
    field(`${prefix}.context.responder`, bytesOf(ctx.responder)),
    field(`${prefix}.context.transport`, bytesOf(ctx.transport)),
    field(`${prefix}.context.relay-host-id`, bytesOf(ctx.relayHostId ?? '')),
  ];
  return Buffer.concat([
    field('domain', bytesOf('orca-mobile-e2ee/v2/transcript')),
    field('mobile-to-desktop.type', bytesOf(hello.type)),
    field('mobile-to-desktop.version', u32(hello.v)),
    field('mobile-to-desktop.client-public-key', keys.clientPublicKey),
    field('mobile-to-desktop.client-nonce', keys.clientNonce),
    field('mobile-to-desktop.capabilities.framing', numList(hello.capabilities.framing)),
    field('mobile-to-desktop.capabilities.payload-kinds', strList(hello.capabilities.payloadKinds)),
    ...side('mobile-to-desktop', hello.context),
    field('desktop-to-mobile.type', bytesOf(ready.type)),
    field('desktop-to-mobile.version', u32(ready.v)),
    field('desktop-to-mobile.desktop-public-key', keys.desktopPublicKey),
    field('desktop-to-mobile.client-nonce-echo', keys.clientNonce),
    field('desktop-to-mobile.desktop-nonce', keys.desktopNonce),
    field('desktop-to-mobile.selection.framing', u32(ready.selection.framing)),
    field('desktop-to-mobile.selection.payload-kinds', strList(ready.selection.payloadKinds)),
    ...side('desktop-to-mobile', ready.context),
  ]);
}

function frameParts(sessionId, direction, kind, counter) {
  const dir = direction === 'mobile-to-desktop' ? 0 : 1;
  const k = kind === 'text' ? 0 : 1;
  const header = Buffer.alloc(HEADER_LEN);
  sessionId.copy(header, 0);
  header[32] = dir;
  header[33] = k;
  header.writeBigUInt64BE(counter, 34);
  const nonce = Buffer.alloc(NONCE_LEN);
  sessionId.copy(nonce, 0, 0, 12);
  nonce[12] = 2;
  nonce[13] = dir;
  nonce[14] = k;
  nonce.writeBigUInt64BE(counter, 16);
  return { header, nonce };
}

/**
 * Answers a hello as the desktop. Returns null for anything but a valid direct v2 hello.
 * `randomBytes` is injectable for deterministic tests.
 */
function createHostSession(hello, { publicKeyB64, secretKeyB64 }, randomBytes = (n) => nacl.randomBytes(n)) {
  if (!isDirectHello(hello)) return null;
  const clientPublicKey = canonicalB64(hello.clientPublicKeyB64, 32);
  const clientNonce = canonicalB64(hello.clientNonceB64, 32);
  if (!clientPublicKey || !clientNonce) return null;
  const desktopNonce = Buffer.from(randomBytes(32));
  const ready = {
    type: 'e2ee_ready',
    v: 2,
    desktopPublicKeyB64: publicKeyB64,
    clientNonceB64: hello.clientNonceB64,
    desktopNonceB64: b64(desktopNonce),
    selection: { framing: 2, payloadKinds: ['text', 'binary'] },
    context: hello.context,
  };
  const transcript = encodeTranscript(hello, ready, {
    clientPublicKey,
    clientNonce,
    desktopPublicKey: Buffer.from(publicKeyB64, 'base64'),
    desktopNonce,
  });
  const sharedSecret = nacl.box.before(clientPublicKey, Buffer.from(secretKeyB64, 'base64'));
  const transcriptHash = sha256(transcript);
  const salt = sha256(Buffer.concat([bytesOf('orca-mobile-e2ee/v2/salt\0'), clientNonce, desktopNonce]));
  const info = Buffer.concat([bytesOf('orca-mobile-e2ee/v2/session\0'), transcriptHash]);
  const okm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, info, 96));
  return new Channel(ready, b64(transcriptHash), okm.subarray(0, 32), okm.subarray(32, 64), okm.subarray(64, 96), 'desktop');
}

class Channel {
  constructor(ready, transcriptHashB64, m2d, d2m, sessionId, role) {
    this.ready = ready;
    this.transcriptHashB64 = transcriptHashB64;
    this.sessionId = sessionId;
    const outbound = role === 'desktop' ? 'desktop-to-mobile' : 'mobile-to-desktop';
    const inbound = role === 'desktop' ? 'mobile-to-desktop' : 'desktop-to-mobile';
    this.out = { key: role === 'desktop' ? d2m : m2d, direction: outbound, counter: 0n };
    this.in = { key: role === 'desktop' ? m2d : d2m, direction: inbound, counter: 0n };
  }

  sealText(text) {
    return this.seal(Buffer.from(String(text), 'utf8'), 'text').toString('base64');
  }

  /** The plaintext of the next text frame, or null when it doesn't authenticate (or is out of order). */
  openText(frameB64) {
    const frame = canonicalB64(frameB64);
    const plain = frame && this.open(frame, 'text');
    return plain ? plain.toString('utf8') : null;
  }

  seal(plaintext, kind) {
    const { header, nonce } = frameParts(this.sessionId, this.out.direction, kind, this.out.counter++);
    const box = nacl.secretbox(Buffer.concat([header, plaintext]), nonce, this.out.key);
    return Buffer.concat([nonce, Buffer.from(box)]);
  }

  open(frame, kind) {
    const { header, nonce } = frameParts(this.sessionId, this.in.direction, kind, this.in.counter);
    if (frame.length < NONCE_LEN + nacl.secretbox.overheadLength + HEADER_LEN || !frame.subarray(0, NONCE_LEN).equals(nonce)) return null;
    const plain = nacl.secretbox.open(frame.subarray(NONCE_LEN), nonce, this.in.key);
    if (!plain || !Buffer.from(plain.subarray(0, HEADER_LEN)).equals(header)) return null;
    this.in.counter++;
    return Buffer.from(plain.subarray(HEADER_LEN));
  }
}

/** The phone side, used by tests to talk to the host exactly like the app does. */
function createClientSession(desktopPublicKeyB64) {
  const kp = nacl.box.keyPair();
  const clientNonce = Buffer.from(nacl.randomBytes(32));
  const hello = {
    type: 'e2ee_hello',
    v: 2,
    clientPublicKeyB64: b64(kp.publicKey),
    clientNonceB64: b64(clientNonce),
    capabilities: { framing: [2], payloadKinds: ['text', 'binary'] },
    context: { protocol: PROTOCOL, initiator: 'mobile', responder: 'desktop', transport: 'direct' },
  };
  return {
    hello,
    acceptReady(ready) {
      if (!ready || ready.type !== 'e2ee_ready' || ready.desktopPublicKeyB64 !== desktopPublicKeyB64 || ready.clientNonceB64 !== hello.clientNonceB64) return null;
      const desktopNonce = canonicalB64(ready.desktopNonceB64, 32);
      if (!desktopNonce) return null;
      const desktopPublicKey = Buffer.from(desktopPublicKeyB64, 'base64');
      const transcript = encodeTranscript(hello, ready, { clientPublicKey: Buffer.from(kp.publicKey), clientNonce, desktopPublicKey, desktopNonce });
      const transcriptHash = sha256(transcript);
      const sharedSecret = nacl.box.before(desktopPublicKey, kp.secretKey);
      const salt = sha256(Buffer.concat([bytesOf('orca-mobile-e2ee/v2/salt\0'), clientNonce, desktopNonce]));
      const info = Buffer.concat([bytesOf('orca-mobile-e2ee/v2/session\0'), transcriptHash]);
      const okm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, info, 96));
      return new Channel(ready, b64(transcriptHash), okm.subarray(0, 32), okm.subarray(32, 64), okm.subarray(64, 96), 'mobile');
    },
  };
}

module.exports = { generateKeyPair, createHostSession, createClientSession, isDirectHello, canonicalB64 };
