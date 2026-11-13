const os = require('os');
const { withFreshPath } = require('./terminalService.cjs');
const { createInbox, summarizeUsage } = require('./claudeChatService.cjs');

/** Quota-only SDK connections: each account uses its own auth environment; no user turns. */
function createClaudeAccountUsageService({
  accounts, getExecutable, loadSdk = () => import('@anthropic-ai/claude-agent-sdk'),
  env = process.env, platform = process.platform, readPath, now = Date.now, timeoutMs = 20_000,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  const generations = new Map();
  const active = new Set();

  async function read(id) {
    const controller = new AbortController();
    active.add(controller);
    const inbox = createInbox();
    let query;
    let timer;
    let ended = false;
    const work = (async () => {
      const sdk = await loadSdk();
      if (ended || controller.signal.aborted) throw new Error('Consulta cancelada');
      const childEnv = accounts.envFor(id, withFreshPath({ ...env }, platform, readPath));
      delete childEnv.CLAUDECODE;
      const executable = getExecutable();
      query = sdk.query({
        prompt: inbox.messages,
        options: {
          env: childEnv, cwd: os.homedir(),
          ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
          abortController: controller, persistSession: false,
          settingSources: [], tools: [], mcpServers: {}, strictMcpConfig: true,
          permissionMode: 'default', canUseTool: async () => ({ behavior: 'deny', message: 'Consulta de uso' }),
        },
      });
      // Start the control channel, but never enqueue a prompt or persist a chat.
      void (async () => { for await (const _message of query) { /* quota connection */ } })().catch(() => {});
      const usage = query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
      if (typeof usage !== 'function') throw new Error('La consulta de uso de Claude no está disponible');
      return { success: true, ...summarizeUsage(await usage.call(query, { skipBehaviors: true })) };
    })();
    try {
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('La consulta de uso tardó demasiado')), timeoutMs);
        controller.signal.addEventListener('abort', () => reject(new Error('Consulta cancelada')), { once: true });
      })]);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      ended = true;
      clearTimeout(timer);
      inbox.close();
      controller.abort();
      try { query?.close(); } catch { /* already closed */ }
      active.delete(controller);
    }
  }

  function usage(id, force = false) {
    if (!accounts.list().accounts.some((account) => account.id === id)) return Promise.resolve({ success: false, error: 'Cuenta no encontrada' });
    if (pending.has(id)) return pending.get(id);
    const cached = cache.get(id);
    if (!force && cached && now() - cached.at < 30_000) return Promise.resolve(cached.value);
    const generation = generations.get(id) || 0;
    const request = read(id).then((result) => {
      if (result.success && generation === (generations.get(id) || 0)) cache.set(id, { value: result, at: now() });
      return result;
    }).finally(() => { if (pending.get(id) === request) pending.delete(id); });
    pending.set(id, request);
    return request;
  }
  function invalidate(id) {
    cache.delete(id);
    pending.delete(id);
    generations.set(id, (generations.get(id) || 0) + 1);
  }
  function stopAll() { for (const controller of active) controller.abort(); }
  return { usage, invalidate, stopAll };
}

module.exports = { createClaudeAccountUsageService };
