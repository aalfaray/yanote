const fs = require('fs');
const path = require('path');
const { spawn: nodeSpawn } = require('child_process');
const { withFreshPath, resolveCwd } = require('./terminalService.cjs');

/**
 * Chat sessions with Google Antigravity CLI (`agy acp`, Agent Client Protocol over stdio).
 *
 * The renderer already knows how to draw Claude Code sessions, so ACP updates are translated
 * into the same message shapes the Claude Agent SDK emits (stream_event / assistant / user /
 * result / system init). One `agy acp` process per chat tab.
 */

const PROTOCOL_VERSION = 1;

/** Finds `agy` on PATH, else in its default install folder (%LOCALAPPDATA%\agy\bin). */
function findAgyExecutable(env, platform = process.platform, exists = fs.existsSync) {
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const names = platform === 'win32' ? ['agy.exe'] : ['agy'];
  const sep = platform === 'win32' ? ';' : ':';
  const dirs = String(env[pathKey] || '').split(sep).map((d) => d.trim()).filter(Boolean);
  const localAppData = env.LOCALAPPDATA || env.localappdata;
  if (platform === 'win32' && localAppData) dirs.push(path.join(localAppData, 'agy', 'bin'));
  if (platform !== 'win32' && env.HOME) dirs.push(path.join(env.HOME, '.local', 'bin'));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Minimal JSON-RPC 2.0 peer over newline-delimited JSON (what ACP uses on stdio). */
function createRpc(child, { onNotification, onRequest, onClose }) {
  let nextId = 1;
  let buffer = '';
  let closed = false;
  const pending = new Map();
  const write = (msg) => {
    if (closed || !child.stdin || child.stdin.destroyed) return false;
    child.stdin.write(`${JSON.stringify(msg)}\n`);
    return true;
  };
  const failAll = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // stray log line
      }
      if (msg.method && msg.id !== undefined) {
        Promise.resolve()
          .then(() => onRequest(msg.method, msg.params || {}))
          .then(
            (result) => write({ jsonrpc: '2.0', id: msg.id, result: result ?? null }),
            (err) => write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(err && err.message ? err.message : err) } })
          );
      } else if (msg.method) {
        onNotification(msg.method, msg.params || {});
      } else if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(Object.assign(new Error(msg.error.message || 'Error de Antigravity'), { code: msg.error.code, data: msg.error.data }));
        else resolve(msg.result);
      }
    }
  });
  child.on('close', (code) => {
    closed = true;
    failAll(new Error('Antigravity se cerró'));
    onClose(code);
  });
  child.on('error', (err) => {
    closed = true;
    failAll(err);
    onClose(null, err);
  });

  return {
    call(method, params) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        if (!write({ jsonrpc: '2.0', id, method, params })) {
          pending.delete(id);
          reject(new Error('Antigravity no está en ejecución'));
        }
      });
    },
    notify(method, params) {
      write({ jsonrpc: '2.0', method, params });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// ACP -> Claude-SDK-shaped messages
// ---------------------------------------------------------------------------------------------

const KIND_NAMES = {
  execute: 'Bash',
  read: 'Read',
  edit: 'Edit',
  delete: 'Delete',
  move: 'Move',
  search: 'Grep',
  fetch: 'WebFetch',
  think: 'Think',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const firstString = (obj, keys) => {
  for (const k of keys) if (isObj(obj) && typeof obj[k] === 'string' && obj[k]) return obj[k];
  return '';
};

/** A tool call as the chat draws it: Claude-like names and the arguments its renderers read. */
function normalizeTool(call) {
  const raw = isObj(call.rawInput) ? call.rawInput : isObj(call.args) ? call.args : {};
  const kind = typeof call.kind === 'string' ? call.kind : '';
  const name = KIND_NAMES[kind] || (typeof call.name === 'string' && call.name) || 'Herramienta';
  const input = { ...raw };
  const filePath = (Array.isArray(call.locations) && call.locations[0] && call.locations[0].path) || firstString(raw, ['AbsolutePath', 'TargetFile', 'FilePath', 'file_path', 'path']);
  if (kind === 'execute') {
    input.command = firstString(raw, ['CommandLine', 'command', 'Command']) || call.title || '';
    const summary = firstString(raw, ['toolSummary', 'toolAction', 'description']);
    if (summary) input.description = summary;
  } else if (name === 'Grep') {
    input.pattern = firstString(raw, ['Query', 'Pattern', 'pattern', 'query']) || call.title || '';
  } else if (name === 'WebFetch') {
    input.url = firstString(raw, ['Url', 'URL', 'url']) || call.title || '';
  }
  if (filePath && !input.file_path) input.file_path = filePath;
  if (!input.description && call.title && kind !== 'execute') input.description = call.title;
  return { name, input };
}

/** Text of a tool result: ACP content blocks, else the raw output. */
function toolResultText(update) {
  const parts = [];
  for (const c of Array.isArray(update.content) ? update.content : []) {
    if (!isObj(c)) continue;
    if (c.type === 'content' && isObj(c.content) && typeof c.content.text === 'string') parts.push(c.content.text);
    else if (c.type === 'diff') parts.push(`Cambios en ${c.path || 'archivo'}`);
    else if (c.type === 'terminal') parts.push('(salida en terminal)');
  }
  if (parts.length) return parts.join('\n');
  const out = update.rawOutput;
  if (typeof out === 'string') return out;
  if (isObj(out)) return firstString(out, ['output', 'Output', 'result', 'text', 'error']) || JSON.stringify(out);
  return '';
}

/** Models / thinking levels / modes from the session's config options (or the older fields). */
function readConfig(result) {
  const opts = Array.isArray(result && result.configOptions) ? result.configOptions : [];
  const byCategory = (cat) => opts.find((o) => o && (o.category === cat || o.id === cat));
  const modelOpt = byCategory('model');
  const levelOpt = byCategory('thought_level');
  const modeOpt = byCategory('mode');
  const levels = levelOpt && Array.isArray(levelOpt.options) ? levelOpt.options.map((o) => o.value).filter((v) => ['low', 'medium', 'high', 'xhigh', 'max'].includes(v)) : [];

  let models = [];
  let model = null;
  if (modelOpt && Array.isArray(modelOpt.options)) {
    models = modelOpt.options.map((o) => ({ value: o.value, displayName: o.name || o.value, description: o.description, supportsEffort: levels.length > 0, supportedEffortLevels: levels }));
    model = modelOpt.currentValue || null;
  } else if (result && isObj(result.models)) {
    models = (result.models.availableModels || []).map((m) => ({ value: m.modelId, displayName: m.name || m.modelId, description: m.description }));
    model = result.models.currentModelId || null;
  }

  let modes = [];
  let mode = null;
  if (modeOpt && Array.isArray(modeOpt.options)) {
    modes = modeOpt.options.map((o) => ({ id: o.value, name: o.name || o.value, description: o.description || '' }));
    mode = modeOpt.currentValue || null;
  } else if (result && isObj(result.modes)) {
    modes = (result.modes.availableModes || []).map((m) => ({ id: m.id, name: m.name || m.id, description: m.description || '' }));
    mode = result.modes.currentModeId || null;
  }
  // Fill in descriptions the config option omits from the modes list, when both are present
  if (result && isObj(result.modes) && modes.length) {
    for (const m of modes) {
      const full = (result.modes.availableModes || []).find((x) => x.id === m.id);
      if (full && !m.description) m.description = full.description || '';
    }
  }
  const effort = levelOpt ? levelOpt.currentValue || null : null;
  return { models, model, effort, modes, mode, hasConfigOptions: opts.length > 0, hasThoughtLevel: Boolean(levelOpt) };
}

/**
 * Stateful translator for one session: ACP `session/update` -> renderer events.
 * `emitMessage(message)` sends a Claude-SDK-shaped message; `emit(event)` any other event.
 */
function createTranslator({ emitMessage, emit, newId = () => `agy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }) {
  let msgId = null; // current assistant message (one per turn)
  let index = -1; // current streamed block index
  let blockKind = null; // 'text' | 'thinking' | null
  let planId = null;
  let replaying = false;
  const finishedTools = new Set();

  const stream = (event) => emitMessage({ type: 'stream_event', event, parent_tool_use_id: null });
  const ensureMessage = () => {
    if (msgId) return;
    msgId = newId();
    index = -1;
    stream({ type: 'message_start', message: { id: msgId } });
  };
  const closeBlock = () => {
    if (blockKind !== null) stream({ type: 'content_block_stop', index });
    blockKind = null;
  };
  const chunk = (kind, text) => {
    if (!text) return;
    ensureMessage();
    if (blockKind !== kind) {
      closeBlock();
      index += 1;
      blockKind = kind;
      stream({ type: 'content_block_start', index, content_block: kind === 'text' ? { type: 'text', text: '' } : { type: 'thinking', thinking: '' } });
    }
    stream({
      type: 'content_block_delta',
      index,
      delta: kind === 'text' ? { type: 'text_delta', text } : { type: 'thinking_delta', thinking: text },
    });
  };
  const toolUse = (id, name, input) => {
    closeBlock();
    ensureMessage();
    emitMessage({ type: 'assistant', parent_tool_use_id: null, message: { id: msgId, content: [{ type: 'tool_use', id, name, input }] } });
  };
  const toolResult = (update) => {
    const id = update.toolCallId;
    if (!id || finishedTools.has(id)) return;
    finishedTools.add(id);
    emitMessage({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: toolResultText(update), is_error: update.status === 'failed' }] },
    });
  };

  return {
    setReplaying(value) {
      replaying = value;
    },
    update(u) {
      if (!isObj(u)) return;
      switch (u.sessionUpdate) {
        case 'agent_message_chunk':
          if (isObj(u.content) && u.content.type === 'text') chunk('text', u.content.text);
          return;
        case 'agent_thought_chunk':
          if (isObj(u.content) && u.content.type === 'text') chunk('thinking', u.content.text);
          return;
        case 'user_message_chunk':
          // Live turns echo the prompt the chat already shows; only a replayed session needs it
          if (replaying && isObj(u.content) && u.content.type === 'text') {
            this.endTurn();
            emit({ type: 'user_message', text: u.content.text });
          }
          return;
        case 'tool_call': {
          const { name, input } = normalizeTool(u);
          toolUse(u.toolCallId, name, input);
          if (u.status === 'completed' || u.status === 'failed') toolResult(u);
          return;
        }
        case 'tool_call_update': {
          if (u.rawInput || u.title || u.kind || u.locations) {
            const { name, input } = normalizeTool(u);
            toolUse(u.toolCallId, name, input);
          }
          if (u.status === 'completed' || u.status === 'failed') toolResult(u);
          return;
        }
        case 'plan': {
          const entries = Array.isArray(u.entries) ? u.entries : [];
          planId = planId || newId();
          const todos = entries.map((e) => ({
            content: String(e.content || ''),
            activeForm: String(e.content || ''),
            status: e.status === 'in_progress' || e.status === 'completed' ? e.status : 'pending',
          }));
          toolUse(planId, 'TodoWrite', { todos });
          return;
        }
        case 'available_commands_update':
          emit({
            type: 'capabilities',
            commands: (u.availableCommands || []).map((c) => ({ name: String(c.name || ''), description: String(c.description || ''), argumentHint: (c.input && c.input.hint) || '' })),
            models: [],
          });
          return;
        case 'current_mode_update':
          emitMessage({ type: 'system', subtype: 'init', permissionMode: u.currentModeId });
          return;
        case 'config_option_update':
          this.config({ configOptions: u.configOptions });
          return;
        default:
      }
    },
    /** Models / modes / applied settings after session start or any config change */
    config(result, extra = {}) {
      const cfg = readConfig(result);
      emitMessage({ type: 'system', subtype: 'init', ...extra, ...(cfg.model ? { model: cfg.model } : {}), ...(cfg.mode ? { permissionMode: cfg.mode } : {}) });
      if (cfg.models.length || cfg.modes.length) emit({ type: 'capabilities', commands: [], models: cfg.models, modes: cfg.modes });
      emit({ type: 'applied_settings', model: cfg.model, effort: cfg.effort });
      return cfg;
    },
    /** Closes the streamed message; the next chunk starts a new one */
    endTurn() {
      closeBlock();
      msgId = null;
      index = -1;
      planId = null;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------

function createAntigravityChatService({
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
  readPath,
  findExecutable = findAgyExecutable,
} = {}) {
  const sessions = new Map();
  let nextRequest = 1;

  async function start({ id, cwd, fallbackCwd, resume, permissionMode, model, effort } = {}, emit) {
    if (!id) return { success: false, error: 'Falta el identificador del chat' };
    if (sessions.has(id)) return { success: true, reused: true };

    const childEnv = withFreshPath({ ...env }, platform, readPath);
    const executable = findExecutable(childEnv, platform);
    if (!executable) {
      return {
        success: false,
        error: 'No encontré Antigravity CLI (agy). Instálalo desde https://antigravity.google y vuelve a abrir el chat.',
      };
    }

    const session = { child: null, rpc: null, sessionId: null, pending: new Map(), queue: [], busy: false, closed: false, cfg: null };
    sessions.set(id, session);
    const isCurrent = () => sessions.get(id) === session;
    const send = (payload) => {
      if (isCurrent()) emit({ id, ...payload });
    };
    const translator = createTranslator({ emitMessage: (message) => send({ type: 'message', message }), emit: send });
    session.translator = translator;
    session.send = send;

    const workDir = resolveCwd([cwd, fallbackCwd]);
    let child;
    try {
      child = spawn(executable, ['acp'], { cwd: workDir, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      sessions.delete(id);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
    session.child = child;
    child.stdout.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stderr?.on('data', (data) => send({ type: 'stderr', data: String(data) }));

    session.rpc = createRpc(child, {
      onNotification: (method, params) => {
        if (method === 'session/update' && params.sessionId === session.sessionId) {
          if (params.update?.sessionUpdate === 'config_option_update') session.cfg = readConfig({ configOptions: params.update.configOptions });
          translator.update(params.update);
        }
      },
      onRequest: (method, params) => {
        if (method === 'session/request_permission') return askPermission(session, params);
        throw new Error(`Método no soportado: ${method}`);
      },
      onClose: (code, err) => {
        session.closed = true;
        for (const p of session.pending.values()) p.resolve({ outcome: { outcome: 'cancelled' } });
        session.pending.clear();
        if (!isCurrent()) return;
        if (err) send({ type: 'error', error: err.message || String(err) });
        else send({ type: 'exit', code });
        sessions.delete(id);
      },
    });

    try {
      const init = await session.rpc.call('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'yanote', version: '1' },
      });
      if (!isCurrent()) throw new Error('Inicio del chat cancelado');
      const caps = (init && init.agentCapabilities) || {};

      let result = null;
      if (resume && caps.loadSession) {
        // Loading replays the conversation as session/update notifications (the transcript)
        session.sessionId = resume;
        translator.setReplaying(true);
        try {
          result = await session.rpc.call('session/load', { sessionId: resume, cwd: workDir, mcpServers: [] });
        } catch (err) {
          session.sessionId = null;
          send({ type: 'message', message: { type: 'system', subtype: 'informational', content: `No se pudo retomar la conversación anterior (${err.message}); empiezo una nueva.` } });
        } finally {
          translator.endTurn();
          translator.setReplaying(false);
        }
      }
      if (!session.sessionId) {
        if (!isCurrent()) throw new Error('Inicio del chat cancelado');
        result = await session.rpc.call('session/new', { cwd: workDir, mcpServers: [] });
        session.sessionId = result && result.sessionId;
      }
      if (!isCurrent()) throw new Error('Inicio del chat cancelado');
      if (!session.sessionId) throw new Error('Antigravity no devolvió una sesión');

      session.cfg = translator.config(result || {}, { session_id: session.sessionId, cwd: workDir });
      // Apply what the chat asked for (remembered model / effort / mode)
      if (model && model !== session.cfg.model) await setConfig(session, 'model', model).catch(() => {});
      if (effort && effort !== session.cfg.effort) await setConfig(session, 'thought_level', effort).catch(() => {});
      if (permissionMode && permissionMode !== session.cfg.mode && session.cfg.modes.some((m) => m.id === permissionMode)) {
        await setConfig(session, 'mode', permissionMode).catch(() => {});
      }
      if (!isCurrent()) throw new Error('Inicio del chat cancelado');
      return { success: true, executable, source: 'user' };
    } catch (err) {
      // A stopped startup can finish after a new process has taken over the tab.
      if (isCurrent()) stop(id);
      const message = err && err.message ? err.message : String(err);
      const auth = /auth|log ?in|sign ?in|credential/i.test(message);
      return { success: false, error: auth ? `${message}. Inicia sesión ejecutando "agy" en una terminal.` : message };
    }
  }

  function askPermission(session, params) {
    return new Promise((resolve) => {
      const requestId = `agy-perm-${nextRequest++}`;
      const call = isObj(params.toolCall) ? params.toolCall : {};
      const options = Array.isArray(params.options) ? params.options : [];
      session.pending.set(requestId, { resolve, options });
      const { name, input } = normalizeTool(call);
      session.send({
        type: 'permission',
        requestId,
        toolName: name,
        input,
        toolUseId: call.toolCallId,
        title: call.title || undefined,
        canAlwaysAllow: options.some((o) => o.kind === 'allow_always'),
      });
    });
  }

  function respondPermission(id, requestId, decision = {}) {
    const session = sessions.get(id);
    const pending = session && session.pending.get(requestId);
    if (!pending) return false;
    session.pending.delete(requestId);
    const pick = (...kinds) => {
      for (const k of kinds) {
        const o = pending.options.find((x) => x.kind === k);
        if (o) return o;
      }
      return null;
    };
    const option = decision.behavior === 'allow' ? (decision.always ? pick('allow_always', 'allow_once') : pick('allow_once', 'allow_always')) : pick('reject_once', 'reject_always');
    pending.resolve(option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : { outcome: { outcome: 'cancelled' } });
    return true;
  }

  /** Prompts run one at a time; messages sent meanwhile wait their turn (like Claude's queue). */
  async function drain(session) {
    if (session.busy) return;
    session.busy = true;
    while (session.queue.length && !session.closed) {
      const prompt = session.queue.shift();
      const startedAt = Date.now();
      try {
        const res = await session.rpc.call('session/prompt', { sessionId: session.sessionId, prompt });
        session.translator.endTurn();
        const stopReason = (res && res.stopReason) || 'end_turn';
        session.send({
          type: 'message',
          message: {
            type: 'result',
            subtype: stopReason === 'refusal' ? 'error_during_execution' : 'success',
            is_error: stopReason === 'refusal',
            errors: stopReason === 'refusal' ? ['El modelo se negó a responder'] : [],
            duration_ms: Date.now() - startedAt,
            num_turns: 1,
            session_id: session.sessionId,
          },
        });
      } catch (err) {
        session.translator.endTurn();
        session.send({
          type: 'message',
          message: {
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            errors: [err && err.message ? err.message : String(err)],
            duration_ms: Date.now() - startedAt,
            num_turns: 1,
            session_id: session.sessionId,
          },
        });
      }
    }
    session.busy = false;
  }

  function sendMessage(id, { text = '', images = [] } = {}) {
    const session = sessions.get(id);
    if (!session || !session.sessionId) return { success: false, error: 'La sesión de Antigravity no está activa' };
    const prompt = [];
    for (const img of images) {
      if (img && typeof img.data === 'string' && typeof img.mediaType === 'string') prompt.push({ type: 'image', mimeType: img.mediaType, data: img.data });
    }
    if (text) prompt.push({ type: 'text', text: String(text) });
    if (!prompt.length) return { success: false, error: 'Mensaje vacío' };
    session.queue.push(prompt);
    void drain(session);
    return { success: true };
  }

  async function setConfig(session, configId, value) {
    const hasOptions = session.cfg && session.cfg.hasConfigOptions;
    let result;
    if (hasOptions) {
      result = await session.rpc.call('session/set_config_option', { sessionId: session.sessionId, configId, value });
    } else if (configId === 'model') {
      result = await session.rpc.call('session/set_model', { sessionId: session.sessionId, modelId: value });
    } else if (configId === 'mode') {
      result = await session.rpc.call('session/set_mode', { sessionId: session.sessionId, modeId: value });
    } else {
      throw new Error('Esta versión de Antigravity no permite cambiarlo');
    }
    if (result && Array.isArray(result.configOptions)) session.cfg = session.translator.config(result);
    else if (session.cfg) session.cfg = { ...session.cfg, [configId === 'thought_level' ? 'effort' : configId]: value };
  }

  async function control(id, fn) {
    const session = sessions.get(id);
    if (!session || !session.sessionId) return { success: false, error: 'La sesión de Antigravity no está activa' };
    try {
      await fn(session);
      return { success: true };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  const interrupt = (id) =>
    control(id, async (s) => {
      s.queue.length = 0;
      for (const p of s.pending.values()) p.resolve({ outcome: { outcome: 'cancelled' } });
      s.pending.clear();
      s.rpc.notify('session/cancel', { sessionId: s.sessionId });
    });
  const setPermissionMode = (id, mode) => control(id, (s) => setConfig(s, 'mode', mode));
  const setModel = (id, model) => (model ? control(id, (s) => setConfig(s, 'model', model)) : Promise.resolve({ success: true }));
  /** null returns to Antigravity's default thinking level (high); models without levels ignore a reset */
  const setEffort = (id, level) =>
    control(id, async (s) => {
      if (!s.cfg || !s.cfg.hasThoughtLevel) {
        if (!level) return;
        throw new Error('Este modelo no tiene nivel de razonamiento');
      }
      await setConfig(s, 'thought_level', level || 'high');
    });

  function stop(id) {
    const session = sessions.get(id);
    if (!session) return false;
    sessions.delete(id);
    session.closed = true;
    for (const p of session.pending.values()) p.resolve({ outcome: { outcome: 'cancelled' } });
    session.pending.clear();
    try {
      session.child?.stdin?.end();
      session.child?.kill();
    } catch {
      // already gone
    }
    return true;
  }

  function stopAll() {
    for (const id of [...sessions.keys()]) stop(id);
  }

  return {
    start,
    sendMessage,
    respondPermission,
    interrupt,
    setPermissionMode,
    setModel,
    setEffort,
    stop,
    stopAll,
    modelOf: (id) => sessions.get(id)?.cfg?.model || null,
    has: (id) => sessions.has(id),
  };
}

module.exports = { createAntigravityChatService, findAgyExecutable, createTranslator, normalizeTool, readConfig, toolResultText };
