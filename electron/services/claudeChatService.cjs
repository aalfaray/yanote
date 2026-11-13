const fs = require('fs');
const path = require('path');
const { withFreshPath, resolveCwd } = require('./terminalService.cjs');
const { getLogger } = require('./logService.cjs');

const log = getLogger('claudeChatService');

/**
 * Structured Claude Code sessions (same approach as Orca's "native chat"):
 * the Agent SDK drives the user's `claude` CLI over stream-json, so the renderer
 * gets typed messages (text deltas, tool calls, permission prompts) instead of a TUI.
 */

const PERMISSION_MODES = new Set(['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions']);
const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/** Finds the user's installed `claude` executable on PATH (the SDK's bundled one is the fallback). */
function findClaudeExecutable(env, platform = process.platform, exists = fs.existsSync) {
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const names = platform === 'win32' ? ['claude.exe'] : ['claude'];
  const sep = platform === 'win32' ? ';' : ':';
  for (const dir of String(env[pathKey] || '').split(sep)) {
    if (!dir.trim()) continue;
    for (const name of names) {
      const candidate = path.join(dir.trim(), name);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * The Claude Code binary shipped with the Agent SDK (unmodified, as published by Anthropic).
 * In a packaged app it lives in app.asar.unpacked, where it can actually be executed.
 */
function findBundledExecutable(platform = process.platform, arch = process.arch, exists = fs.existsSync, resolve = require.resolve) {
  try {
    const pkg = resolve(`@anthropic-ai/claude-agent-sdk-${platform}-${arch}/package.json`);
    const exe = path.join(path.dirname(pkg), platform === 'win32' ? 'claude.exe' : 'claude');
    const unpacked = exe.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    for (const candidate of [unpacked, exe]) if (exists(candidate)) return candidate;
  } catch (err) {
    // optional dependency not installed for this platform
    log.info('bundled Claude Code not available', { platform, arch, reason: err && err.message });
  }
  return undefined;
}

/** Async iterable the SDK reads user turns from; stays open so one process serves the whole chat. */
function createInbox() {
  const queue = [];
  let wake = null;
  let closed = false;
  const notify = () => {
    const fn = wake;
    wake = null;
    if (fn) fn();
  };
  async function* messages() {
    while (true) {
      while (queue.length) yield queue.shift();
      if (closed) return;
      await new Promise((resolve) => {
        wake = resolve;
      });
    }
  }
  return {
    messages: messages(),
    push(message) {
      if (closed) return false;
      queue.push(message);
      notify();
      return true;
    },
    close() {
      closed = true;
      notify();
    },
  };
}

/** Text + pasted images -> Anthropic user content blocks. */
function buildUserContent(text, images = []) {
  const blocks = [];
  for (const img of images) {
    if (img && typeof img.data === 'string' && typeof img.mediaType === 'string') {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    }
  }
  if (text) blocks.push({ type: 'text', text });
  return blocks.length === 1 && blocks[0].type === 'text' ? text : blocks;
}

/** Drops values that can't cross IPC (functions, cycles) so a single odd message never kills the stream. */
function toPlain(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    log.warn('message could not be serialized for IPC', err, { type: value && value.type });
    return { type: 'unserializable' };
  }
}

function usageWindow(win) {
  if (!win || typeof win !== 'object') return null;
  const pct = typeof win.utilization === 'number' && Number.isFinite(win.utilization) ? Math.max(0, Math.min(100, win.utilization)) : null;
  if (pct === null) return null;
  return { percent: pct, resetsAt: typeof win.resets_at === 'string' ? win.resets_at : null };
}

/** Keeps only what the status bar shows from the SDK's /usage answer. */
function summarizeUsage(res) {
  const limits = res && res.rate_limits_available && res.rate_limits ? res.rate_limits : null;
  return {
    available: Boolean(limits),
    plan: (res && typeof res.subscription_type === 'string' && res.subscription_type) || null,
    fiveHour: limits ? usageWindow(limits.five_hour) : null,
    weekly: limits ? usageWindow(limits.seven_day) : null,
  };
}

/**
 * `loadSdk` / `env` / `findExecutable` are injectable for tests.
 */
function createClaudeChatService({
  loadSdk = () => import('@anthropic-ai/claude-agent-sdk'),
  env = process.env,
  platform = process.platform,
  readPath,
  findExecutable = findClaudeExecutable,
  findBundled = findBundledExecutable,
  /** No usable `claude` at all is an error (instead of letting the SDK guess a path) */
  requireInstalledCli = false,
} = {}) {
  const sessions = new Map();
  let nextRequest = 1;

  async function start({ id, cwd, fallbackCwd, resume, permissionMode, model, effort, configDir } = {}, emit) {
    if (!id) return { success: false, error: 'Falta el identificador del chat' };
    if (sessions.has(id)) return { success: true, reused: true };

    const session = { inbox: createInbox(), query: null, pending: new Map(), closed: false, send: null };
    sessions.set(id, session);
    const isCurrent = () => sessions.get(id) === session;
    const send = (payload) => {
      if (isCurrent()) emit({ id, ...payload });
    };
    session.send = send;

    try {
      const sdk = await loadSdk();
      if (!isCurrent()) return { success: false, error: 'Chat cerrado' };

      const childEnv = withFreshPath({ ...env }, platform, readPath);
      // The renderer is the UI, not a terminal: keep the CLI from thinking it runs nested in Claude Code
      delete childEnv.CLAUDECODE;
      // Another Claude account = another Claude Code config folder (its own sign-in)
      if (typeof configDir === 'string' && configDir) childEnv.CLAUDE_CONFIG_DIR = configDir;
      // The user's own install wins (it keeps itself updated); the bundled copy is the fallback
      const userExecutable = findExecutable(childEnv, platform);
      const executable = userExecutable || findBundled(platform);
      const source = userExecutable ? 'user' : executable ? 'bundled' : 'sdk';
      if (!executable && requireInstalledCli) {
        sessions.delete(id);
        return {
          success: false,
          error: 'No encontré Claude Code. Instálalo desde https://claude.com/claude-code y vuelve a abrir el chat.',
        };
      }
      const mode = PERMISSION_MODES.has(permissionMode) ? permissionMode : 'default';

      const canUseTool = (toolName, input, { signal, suggestions, blockedPath, decisionReason, title, toolUseID } = {}) =>
        new Promise((resolve) => {
          const requestId = `perm-${nextRequest++}`;
          const finish = (result) => {
            if (!session.pending.has(requestId)) return;
            session.pending.delete(requestId);
            resolve(result);
          };
          session.pending.set(requestId, { finish, suggestions, input });
          signal?.addEventListener?.('abort', () => {
            finish({ behavior: 'deny', message: 'Solicitud cancelada' });
            send({ type: 'permission_cancelled', requestId });
          });
          send({
            type: 'permission',
            requestId,
            toolName,
            input: toPlain(input),
            toolUseId: toolUseID,
            title,
            blockedPath,
            decisionReason,
            canAlwaysAllow: Array.isArray(suggestions) && suggestions.length > 0,
          });
        });

      const q = sdk.query({
        prompt: session.inbox.messages,
        options: {
          cwd: resolveCwd([cwd, fallbackCwd]),
          env: childEnv,
          ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
          includePartialMessages: true,
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user', 'project', 'local'],
          permissionMode: mode,
          allowDangerouslySkipPermissions: true,
          ...(model ? { model } : {}),
          ...(EFFORT_LEVELS.has(effort) ? { effort } : {}),
          ...(resume ? { resume } : {}),
          canUseTool,
          stderr: (line) => send({ type: 'stderr', data: String(line) }),
        },
      });
      session.query = q;

      (async () => {
        try {
          for await (const message of q) {
            send({ type: 'message', message: toPlain(message) });
          }
          send({ type: 'exit' });
        } catch (err) {
          send({ type: 'error', error: err && err.message ? err.message : String(err) });
        } finally {
          if (isCurrent()) sessions.delete(id);
        }
      })();

      // Fills the "/" menu and model picker; failures are non-fatal
      Promise.allSettled([q.supportedCommands(), q.supportedModels()]).then(([commands, models]) => {
        send({
          type: 'capabilities',
          commands: commands.status === 'fulfilled' ? toPlain(commands.value) : [],
          models: models.status === 'fulfilled' ? toPlain(models.value) : [],
        });
      });
      // The model + effort the user's settings resolve to, so the UI shows them before the first turn
      void reportApplied(session);

      return { success: true, executable: executable || 'sdk-bundled', source };
    } catch (err) {
      if (isCurrent()) sessions.delete(id);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function sendMessage(id, { text = '', images = [] } = {}) {
    const session = sessions.get(id);
    if (!session) return { success: false, error: 'La sesión de Claude no está activa' };
    const content = buildUserContent(String(text), images);
    if (!content || (Array.isArray(content) && content.length === 0)) return { success: false, error: 'Mensaje vacío' };
    const ok = session.inbox.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: '',
    });
    return ok ? { success: true } : { success: false, error: 'La sesión está cerrada' };
  }

  function respondPermission(id, requestId, decision = {}) {
    const session = sessions.get(id);
    const pending = session && session.pending.get(requestId);
    if (!pending) return false;
    if (decision.behavior === 'allow') {
      pending.finish({
        behavior: 'allow',
        updatedInput: decision.updatedInput && typeof decision.updatedInput === 'object' ? decision.updatedInput : pending.input,
        ...(decision.always && pending.suggestions ? { updatedPermissions: pending.suggestions } : {}),
      });
    } else {
      pending.finish({ behavior: 'deny', message: decision.message || 'El usuario rechazó esta acción' });
    }
    return true;
  }

  /** Emits the model + effort Claude will actually use (settings, env, caps and downgrades applied). */
  async function reportApplied(session) {
    try {
      const settings = await session.query?.getSettings?.();
      const applied = settings && settings.applied;
      if (!applied) return;
      session.send?.({
        type: 'applied_settings',
        model: typeof applied.model === 'string' ? applied.model : null,
        effort: EFFORT_LEVELS.has(applied.effort) ? applied.effort : null,
      });
    } catch {
      // older CLIs without get_settings: the selectors just show their placeholders
    }
  }

  async function control(id, fn, { refreshApplied = false } = {}) {
    const session = sessions.get(id);
    if (!session || !session.query) return { success: false, error: 'La sesión de Claude no está activa' };
    try {
      await fn(session.query);
      if (refreshApplied) void reportApplied(session);
      return { success: true };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  const interrupt = (id) => control(id, (q) => q.interrupt());
  const setPermissionMode = (id, mode) =>
    PERMISSION_MODES.has(mode) ? control(id, (q) => q.setPermissionMode(mode)) : Promise.resolve({ success: false, error: 'Modo inválido' });
  const setModel = (id, model) => control(id, (q) => q.setModel(model || undefined), { refreshApplied: true });
  /** null/'' returns to the model's default effort */
  const setEffort = (id, level) =>
    level && !EFFORT_LEVELS.has(level)
      ? Promise.resolve({ success: false, error: 'Nivel de esfuerzo inválido' })
      : control(id, (q) => q.applyFlagSettings({ effortLevel: level || null }), { refreshApplied: true });

  /**
   * Plan usage behind `/usage` (5-hour and weekly windows) through any live chat session.
   * Uses the SDK's experimental usage call: if it's missing or changes shape we just report nothing.
   */
  async function usage(preferredId) {
    const live = [preferredId, ...sessions.keys()].map((key) => key && sessions.get(key)).find((s) => s && s.query);
    const fn = live && live.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
    if (typeof fn !== 'function') return { success: false, error: 'Sin sesión de Claude activa' };
    try {
      const res = await fn.call(live.query, { skipBehaviors: true });
      return { success: true, ...summarizeUsage(res) };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function stop(id) {
    const session = sessions.get(id);
    if (!session) return false;
    sessions.delete(id);
    for (const { finish } of session.pending.values()) finish({ behavior: 'deny', message: 'Chat cerrado' });
    session.pending.clear();
    session.inbox.close();
    try {
      session.query?.close?.();
    } catch (err) {
      // already gone
      log.warn('closing Claude query failed', err, { id });
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
    usage,
    stop,
    stopAll,
    has: (id) => sessions.has(id),
  };
}

module.exports = { createClaudeChatService, summarizeUsage, findClaudeExecutable, findBundledExecutable, buildUserContent, createInbox };
