const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');
const { withFreshPath, resolveCwd } = require('./terminalService.cjs');

// exec/SDK has no interactive approval callback. The selected sandbox is the
// boundary; a blocked operation fails instead of silently gaining permissions.
const MODES = [
  { id: 'read-only', name: 'Solo lectura', description: 'Consulta archivos sin modificarlos.' },
  { id: 'workspace-write', name: 'Editar carpeta', description: 'Permite modificar archivos dentro de la carpeta de trabajo.' },
  { id: 'danger-full-access', name: 'Acceso total', description: 'Permite ejecutar comandos y modificar archivos fuera de la carpeta de trabajo.' },
];
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const validSession = (id) => typeof id === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
const errorText = (err) => err instanceof Error ? err.message : String(err);
const codexHome = (env) => env.CODEX_HOME || path.join(os.homedir(), '.codex');

/** SDK's native package, outside app.asar so Windows can execute it. */
function findBundledCodex(platform = process.platform, arch = process.arch, exists = fs.existsSync, resolve = require.resolve) {
  const triple = { win32: { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' }, darwin: { x64: 'x86_64-apple-darwin', arm64: 'aarch64-apple-darwin' }, linux: { x64: 'x86_64-unknown-linux-musl', arm64: 'aarch64-unknown-linux-musl' } }[platform]?.[arch];
  if (!triple) return undefined;
  try {
    const codexRequire = createRequire(resolve('@openai/codex/package.json'));
    const pkg = codexRequire.resolve(`@openai/codex-${platform}-${arch}/package.json`);
    const root = path.join(path.dirname(pkg), 'vendor', triple);
    const exe = platform === 'win32' ? 'codex.exe' : 'codex';
    for (const dir of ['bin', 'codex']) {
      const candidate = path.join(root, dir, exe);
      const unpacked = candidate.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      if (exists(unpacked)) return unpacked;
      if (exists(candidate)) return candidate;
    }
  } catch {
    // Missing optional native package: report an actionable error at startup.
  }
  return undefined;
}

/** Read the CLI's model cache; no hard-coded model names or account credentials. */
async function readModels(env) {
  const models = [{ value: 'default', displayName: 'Predeterminado', supportsEffort: false }];
  try {
    const cache = JSON.parse(await fs.promises.readFile(path.join(codexHome(env), 'models_cache.json'), 'utf8'));
    for (const model of Array.isArray(cache.models) ? cache.models : []) {
      if (typeof model.slug !== 'string' || model.visibility === 'hide' || models.some((m) => m.value === model.slug)) continue;
      const levels = (model.supported_reasoning_levels || []).map((l) => typeof l === 'string' ? l : l.effort).filter((l) => EFFORTS.has(l));
      models.push({ value: model.slug, displayName: model.display_name || model.slug, description: model.description || '', supportsEffort: levels.length > 0, supportedEffortLevels: levels });
    }
  } catch {
    // A first-time user has no cache; the CLI still resolves its default model.
  }
  return models;
}

/** Restore visible user/assistant messages from a CLI rollout, skipping injected instructions. */
async function readHistory(sessionId, env = process.env) {
  if (!validSession(sessionId)) return [];
  async function find(dir) {
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`)) return file;
      if (entry.isDirectory()) { const match = await find(file); if (match) return match; }
    }
    return null;
  }
  const home = codexHome(env);
  const file = await find(path.join(home, 'sessions')) || await find(path.join(home, 'archived_sessions'));
  if (!file) throw new Error('No se encontró el historial de Codex');
  const messages = [];
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let index = 0;
  try {
    for await (const line of lines) {
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      // event_msg user_message represents a real prompt, whereas response_item
      // user entries can also contain AGENTS.md and environment context.
      if (row.type === 'event_msg' && row.payload?.type === 'user_message') {
        const p = row.payload;
        messages.push({ type: 'user', message: { content: [
          { type: 'text', text: p.message || '' },
          ...(p.images || []).map(() => ({ type: 'image' })),
        ] } });
      } else if (row.type === 'response_item' && row.payload?.type === 'message' && row.payload.role === 'assistant') {
        const content = (row.payload.content || []).filter((b) => b.type === 'output_text').map((b) => ({ type: 'text', text: b.text || '' }));
        if (content.length) messages.push({ type: 'assistant', message: { id: `codex-history-${index++}`, content } });
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return messages;
}

/** SDK snapshots -> the shared chat's streamed text, reasoning, tools and plans. */
function createTranslator(send, prefix) {
  const texts = new Map();
  const completed = new Set();
  const message = (msg) => send({ type: 'message', message: msg });
  const tool = (id, name, input, result, failed = false) => {
    message({ type: 'assistant', message: { id, content: [{ type: 'tool_use', id, name, input }] } });
    if (result !== undefined) message({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: result, is_error: failed }] } });
  };
  return (event) => {
    const item = event.item;
    if (!item || !item.id) return;
    const id = `${prefix}:${item.id}`;
    if (completed.has(id)) return;
    const done = event.type === 'item.completed';
    if (done) completed.add(id);
    const failed = item.status === 'failed';
    switch (item.type) {
      case 'agent_message':
      case 'reasoning': {
        const stream = (event) => message({ type: 'stream_event', message_id: id, event });
        const thinking = item.type === 'reasoning';
        const text = item.text || '';
        if (!texts.has(id)) {
          stream({ type: 'message_start', message: { id } });
          stream({ type: 'content_block_start', index: 0, content_block: thinking ? { type: 'thinking', thinking: '' } : { type: 'text', text: '' } });
          texts.set(id, '');
        }
        const previous = texts.get(id);
        const delta = text.startsWith(previous) ? text.slice(previous.length) : '';
        if (delta) stream({ type: 'content_block_delta', index: 0, delta: thinking ? { type: 'thinking_delta', thinking: delta } : { type: 'text_delta', text: delta } });
        texts.set(id, text);
        if (done) {
          stream({ type: 'content_block_stop', index: 0 });
          message({ type: 'assistant', message: { id, content: [thinking ? { type: 'thinking', thinking: text } : { type: 'text', text }] } });
        }
        break;
      }
      case 'command_execution':
        tool(id, 'Bash', { command: item.command || '' }, done ? item.aggregated_output || '' : undefined, failed || (item.exit_code !== undefined && item.exit_code !== 0));
        break;
      case 'file_change':
        (item.changes || []).forEach((change, i) => tool(`${id}:${i}`, change.kind === 'delete' ? 'Delete' : change.kind === 'add' ? 'Write' : 'Edit', { file_path: change.path }, done ? `${change.kind}: ${change.path}` : undefined, failed));
        break;
      case 'mcp_tool_call':
        tool(id, `mcp__${item.server}__${item.tool}`, item.arguments && typeof item.arguments === 'object' ? item.arguments : {}, done ? item.error?.message || (item.result?.content || []).map((c) => c.text || '').join('\n') || JSON.stringify(item.result || {}) : undefined, failed);
        break;
      case 'web_search':
        tool(id, 'WebSearch', { query: item.query || '' }, done ? item.query || '' : undefined);
        break;
      case 'todo_list':
        tool(id, 'TodoWrite', { todos: (item.items || []).map((t) => ({ content: t.text, activeForm: t.text, status: t.completed ? 'completed' : 'pending' })) }, done ? '' : undefined);
        break;
      case 'error':
        message({ type: 'system', subtype: 'informational', level: 'warning', content: item.message || 'Error de Codex' });
        break;
      default:
    }
  };
}

function createCodexChatService({ loadSdk = () => import('@openai/codex-sdk'), env = process.env, platform = process.platform, readPath, findBundled = findBundledCodex, getModels = readModels } = {}) {
  const sessions = new Map();
  let nextTurn = 0;
  const optionsFor = (s) => ({ workingDirectory: s.cwd, skipGitRepoCheck: true, sandboxMode: s.mode, approvalPolicy: 'never', ...(s.model ? { model: s.model } : {}), ...(s.effort ? { modelReasoningEffort: s.effort } : {}) });
  const settings = (s) => {
    s.send({ type: 'message', message: { type: 'system', subtype: 'init', cwd: s.cwd, permissionMode: s.mode, ...(s.sessionId ? { session_id: s.sessionId } : {}), model: s.model || '' } });
    s.send({ type: 'applied_settings', model: s.model || null, effort: s.effort || null });
  };

  async function start({ id, cwd, fallbackCwd, resume, permissionMode, model } = {}, emit) {
    if (!id) return { success: false, error: 'Falta el identificador del chat' };
    if (sessions.has(id)) return { success: true, reused: true };
    if (resume && !validSession(resume)) return { success: false, error: 'Sesión de Codex inválida' };
    const s = { cwd: resolveCwd([cwd, fallbackCwd]), mode: MODES.some((m) => m.id === permissionMode) ? permissionMode : 'read-only', model: model && model !== 'default' ? model : null, effort: null, sessionId: resume || null, queue: [], busy: false, closed: false, refresh: true, controller: null };
    sessions.set(id, s);
    s.send = (payload) => { if (sessions.get(id) === s) emit({ id, ...payload }); };
    try {
      const sdk = await loadSdk();
      const executable = findBundled(platform);
      if (!executable) throw new Error('No encontré el ejecutable de Codex. Reinstala yanote con las dependencias opcionales.');
      const childEnv = withFreshPath({ ...env }, platform, readPath);
      const root = path.dirname(path.dirname(executable));
      const pathKey = Object.keys(childEnv).find((k) => k.toLowerCase() === 'path') || 'PATH';
      childEnv[pathKey] = [path.join(root, 'codex-path'), path.join(root, 'path'), childEnv[pathKey]].filter(Boolean).join(platform === 'win32' ? ';' : ':');
      s.client = new sdk.Codex({ codexPathOverride: executable, env: childEnv });
      const models = await getModels(env);
      if (s.closed) return { success: false, error: 'Chat cerrado' };
      // A saved/custom model remains selectable even if it isn't in the CLI cache.
      if (s.model && !models.some((m) => m.value === s.model)) models.push({ value: s.model, displayName: s.model });
      s.send({ type: 'capabilities', commands: [], models, modes: MODES });
      settings(s);
      return { success: true, executable, source: 'bundled' };
    } catch (err) {
      if (sessions.get(id) === s) sessions.delete(id);
      return { success: false, error: errorText(err) };
    }
  }

  async function drain(s) {
    if (s.busy) return;
    s.busy = true;
    try {
      while (s.queue.length && !s.closed) {
        const payload = s.queue.shift();
        const startedAt = Date.now();
        const translate = createTranslator(s.send, `codex-${++nextTurn}`);
        s.controller = new AbortController();
        let tempDir;
        let failure = null;
        let finished = false;
        try {
          if (s.refresh) {
            s.thread = s.sessionId ? s.client.resumeThread(s.sessionId, optionsFor(s)) : s.client.startThread(optionsFor(s));
            s.refresh = false;
          }
          const input = [{ type: 'text', text: payload.text }];
          if (payload.images.length) {
            tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yanote-codex-'));
            for (const [i, image] of payload.images.entries()) {
              const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[image.mediaType];
              const file = path.join(tempDir, `${i}.${ext}`);
              await fs.promises.writeFile(file, Buffer.from(image.data, 'base64'));
              input.push({ type: 'local_image', path: file });
            }
          }
          const { events } = await s.thread.runStreamed(payload.images.length ? input : payload.text, { signal: s.controller.signal });
          for await (const event of events) {
            if (s.closed) break;
            if (event.type === 'thread.started') {
              s.sessionId = event.thread_id;
              settings(s);
            } else if (event.type === 'turn.started') s.send({ type: 'turn_started' });
            else if (event.type.startsWith('item.')) translate(event);
            else if (event.type === 'turn.completed') {
              finished = true;
              // Codex input_tokens already includes cached input tokens.
              s.send({ type: 'message', message: { type: 'stream_event', event: { type: 'message_start', message: { id: `codex-usage-${nextTurn}`, usage: { input_tokens: event.usage?.input_tokens || 0 } } } } });
            } else if (event.type === 'turn.failed' || event.type === 'error') {
              failure = event.error?.message || event.message || 'Error de Codex';
            }
          }
          if (!finished && !failure && !s.controller.signal.aborted && !s.closed) failure = 'Codex terminó sin completar la respuesta';
        } catch (err) {
          if (!s.controller.signal.aborted) failure = errorText(err);
        } finally {
          if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
        if (failure && /unauthorized|not logged in|authentication|401|sign in|login required/i.test(failure)) {
          s.send({ type: 'message', message: { type: 'assistant', error: 'authentication_failed', message: { content: [] } } });
        }
        s.send({ type: 'message', message: { type: 'result', subtype: failure ? 'error_during_execution' : 'success', is_error: Boolean(failure), errors: failure ? [failure] : [], duration_ms: Date.now() - startedAt, num_turns: 1, session_id: s.sessionId } });
        if (s.controller.signal.aborted && !s.closed) s.send({ type: 'message', message: { type: 'system', subtype: 'informational', content: 'Turno detenido' } });
        s.controller = null;
      }
    } finally { s.busy = false; }
  }

  function sendMessage(id, { text = '', images = [] } = {}) {
    const s = sessions.get(id);
    if (!s?.client || s.closed) return { success: false, error: 'La sesión de Codex no está activa' };
    if (typeof text !== 'string' || !Array.isArray(images) || images.some((i) => !i || typeof i.data !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(i.mediaType))) return { success: false, error: 'Mensaje o imagen inválidos' };
    if (!text.trim() && !images.length) return { success: false, error: 'Mensaje vacío' };
    s.queue.push({ text, images });
    void drain(s);
    return { success: true };
  }

  function control(id, update) {
    const s = sessions.get(id);
    if (!s?.client || s.closed) return { success: false, error: 'La sesión de Codex no está activa' };
    const error = update(s);
    if (error) return { success: false, error };
    s.refresh = true;
    settings(s);
    return { success: true };
  }
  const setPermissionMode = (id, mode) => control(id, (s) => { if (!MODES.some((m) => m.id === mode)) return 'Modo de permisos inválido'; s.mode = mode; });
  const setModel = (id, model) => control(id, (s) => { s.model = model && model !== 'default' ? model : null; });
  const setEffort = (id, effort) => control(id, (s) => { if (effort !== null && !EFFORTS.has(effort)) return 'Esfuerzo inválido'; s.effort = effort; });
  function interrupt(id) {
    const s = sessions.get(id);
    if (!s) return { success: false, error: 'La sesión de Codex no está activa' };
    s.queue.length = 0;
    s.controller?.abort();
    return { success: true };
  }
  function stop(id) {
    const s = sessions.get(id);
    if (!s) return false;
    sessions.delete(id);
    s.closed = true;
    s.queue.length = 0;
    s.controller?.abort();
    return true;
  }
  function loginCommand() {
    const executable = findBundled(platform);
    if (!executable) throw new Error('No se encontró el ejecutable de Codex');
    return platform === 'win32' ? `& '${executable.replace(/'/g, "''")}' login` : `'${executable.replace(/'/g, "'\\''")}' login`;
  }
  return { start, sendMessage, interrupt, setPermissionMode, setModel, setEffort, stop, stopAll: () => { for (const id of [...sessions.keys()]) stop(id); }, has: (id) => sessions.has(id), readHistory: (id) => readHistory(id, env), loginCommand };
}

module.exports = { createCodexChatService, findBundledCodex, createTranslator, readHistory, readModels };
