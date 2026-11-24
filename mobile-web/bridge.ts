/**
 * The page side of Orca Mobile's web-shell bridge (protocol v1, see stablyai/orca
 * mobile/src/mobile-web-shell/bridge): `ready` -> `init`, then `request` -> `reply`.
 * The shell forwards each request to yanote over the encrypted connection.
 */

const V = 1;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface BridgeInit {
  sessionId: string;
  colorScheme?: 'light' | 'dark';
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
  keyboardInset?: number;
  host?: { name?: string };
  hostStatus?: { machineName?: string };
}

export interface RpcReply<T> {
  ok: boolean;
  result?: T;
  error?: { code: string; message: string };
}

interface Channel {
  postMessage: (json: string) => void;
  onmessage: ((event: { data: string }) => void) | null;
}

type Pending = { resolve: (reply: RpcReply<unknown>) => void; reject: (err: Error) => void; parts?: string[] };

function newId(): string {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += ID_ALPHABET[b & 63];
  return id;
}

export interface Bridge {
  request: <T>(method: string, params?: unknown, timeoutMs?: number) => Promise<RpcReply<T>>;
  onInit: (fn: (init: BridgeInit) => void) => () => void;
}

/** Null outside the app (a desktop browser has no `orcaBridge`). */
export function connectBridge(): Bridge | null {
  const channel = (globalThis as { orcaBridge?: Channel }).orcaBridge;
  if (!channel || typeof channel.postMessage !== 'function') return null;
  const pending = new Map<string, Pending>();
  const initListeners = new Set<(init: BridgeInit) => void>();
  let lastInit: BridgeInit | null = null;
  let painted = false;
  const post = (frame: object) => channel.postMessage(JSON.stringify(frame));

  const settle = (id: string, payload: RpcReply<unknown>) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    p.resolve(payload);
  };

  channel.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const id = typeof msg.id === 'string' ? msg.id : '';
    switch (msg.type) {
      case 'init':
        // Sent again whenever the keyboard or the safe areas change
        lastInit = msg as unknown as BridgeInit;
        for (const fn of initListeners) fn(lastInit);
        if (!painted) {
          painted = true;
          requestAnimationFrame(() => post({ v: V, type: 'notify', name: 'painted' }));
        }
        return;
      case 'reply': {
        if ('payload' in msg) return settle(id, msg.payload as RpcReply<unknown>);
        const p = pending.get(id);
        const part = msg.part as { i: number; of: number } | undefined;
        if (!p || !part || typeof msg.chunk !== 'string') return;
        p.parts = p.parts || new Array(part.of).fill(undefined);
        p.parts[part.i] = msg.chunk;
        if (p.parts.every((c) => typeof c === 'string')) {
          try {
            settle(id, JSON.parse(p.parts.join('')));
          } catch {
            pending.delete(id);
            p.reject(new Error('Respuesta ilegible'));
          }
        }
        return;
      }
      case 'error': {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        const err = msg.error as { message?: string } | undefined;
        p.reject(new Error(err?.message || 'Error de conexión'));
        return;
      }
    }
  };

  post({ v: V, type: 'ready' });

  return {
    request<T>(method: string, params?: unknown, timeoutMs = 30000) {
      return new Promise<RpcReply<T>>((resolve, reject) => {
        const id = newId();
        const timer = setTimeout(() => {
          if (pending.delete(id)) reject(new Error('Sin respuesta del ordenador'));
        }, timeoutMs + 2000);
        pending.set(id, {
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r as RpcReply<T>);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        post({ v: V, type: 'request', id, method, ...(params === undefined ? {} : { params }), options: { timeoutMs } });
      });
    },
    onInit(fn) {
      initListeners.add(fn);
      if (lastInit) fn(lastInit);
      return () => initListeners.delete(fn);
    },
  };
}
