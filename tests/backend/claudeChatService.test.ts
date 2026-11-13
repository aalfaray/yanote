import { describe, it, expect, vi } from 'vitest';

const { createClaudeChatService, summarizeUsage, findClaudeExecutable, findBundledExecutable, buildUserContent } = require('../../electron/services/claudeChatService.cjs');

/** Fake Agent SDK: echoes each user turn as an assistant reply + result, and exposes canUseTool. */
function fakeSdk() {
  const calls: any[] = [];
  const control = {
    interrupt: vi.fn(async () => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    applyFlagSettings: vi.fn(async () => undefined),
    close: vi.fn(),
    supportedCommands: vi.fn(async () => [{ name: 'compact', description: 'Compacta', argumentHint: '' }]),
    supportedModels: vi.fn(async () => [{ value: 'sonnet', displayName: 'Sonnet' }]),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi.fn(async () => ({
      subscription_type: 'pro',
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 16, resets_at: '2026-11-13T10:00:00Z', limit_dollars: null },
        seven_day: { utilization: 141, resets_at: '2026-11-17T19:00:00Z' },
        model_scoped: [{ display_name: 'Fable', utilization: 0, resets_at: null }],
      },
      behaviors: null,
    })),
  };
  const query = vi.fn(({ prompt, options }: any) => {
    calls.push(options);
    async function* run() {
      yield { type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-test', cwd: options.cwd };
      for await (const user of prompt) {
        yield { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: `eco: ${JSON.stringify(user.message.content)}` }] } };
        yield { type: 'result', subtype: 'success', total_cost_usd: 0.01 };
      }
    }
    return Object.assign(run(), control);
  });
  return { sdk: { query }, calls, control };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const { sdk, calls, control } = fakeSdk();
  const events: any[] = [];
  const service = createClaudeChatService({
    loadSdk: async () => sdk,
    env: { Path: 'C:\\bin', CLAUDECODE: '1' },
    platform: 'win32',
    readPath: () => '',
    findExecutable: () => 'C:\\bin\\claude.exe',
  });
  return { service, events, emit: (e: any) => events.push(e), calls, control, sdk };
}

describe('Backend: ClaudeChatService (Agent SDK sessions)', () => {
  it('finds the claude executable on PATH', () => {
    const exists = (p: string) => p === 'C:\\tools\\claude.exe';
    expect(findClaudeExecutable({ Path: 'C:\\a;C:\\tools' }, 'win32', exists)).toBe('C:\\tools\\claude.exe');
    expect(findClaudeExecutable({ Path: 'C:\\a' }, 'win32', exists)).toBeUndefined();
  });

  it('finds the Claude Code binary bundled with the SDK, preferring app.asar.unpacked', () => {
    const pkg = 'C:/App/resources/app.asar/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/package.json';
    const resolve = () => pkg;
    const unpacked = 'C:/App/resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'.replace(/\//g, '\\');
    expect(findBundledExecutable('win32', 'x64', (p: string) => p === unpacked, resolve)).toBe(unpacked);
    expect(findBundledExecutable('win32', 'x64', () => false, resolve)).toBeUndefined();
    expect(findBundledExecutable('win32', 'x64', () => true, () => { throw new Error('not installed'); })).toBeUndefined();
  });

  it('uses the user install first, then the bundled binary, else fails when required', async () => {
    const { sdk, calls } = fakeSdk();
    const base = { loadSdk: async () => sdk, env: {}, platform: 'win32', readPath: () => '' };
    const bundled = createClaudeChatService({ ...base, findExecutable: () => undefined, findBundled: () => 'C:\\b\\claude.exe', requireInstalledCli: true });
    expect(await bundled.start({ id: 'a' }, () => {})).toEqual({ success: true, executable: 'C:\\b\\claude.exe', source: 'bundled' });
    expect(calls[0].pathToClaudeCodeExecutable).toBe('C:\\b\\claude.exe');

    const none = createClaudeChatService({ ...base, findExecutable: () => undefined, findBundled: () => undefined, requireInstalledCli: true });
    expect((await none.start({ id: 'b' }, () => {})).success).toBe(false);
    expect(none.has('b')).toBe(false);
  });

  it('builds plain text or image+text content', () => {
    expect(buildUserContent('hola')).toBe('hola');
    expect(buildUserContent('mira', [{ data: 'AAA', mediaType: 'image/png' }])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'text', text: 'mira' },
    ]);
  });

  it('starts a streaming session with Claude Code options and forwards messages', async () => {
    const { service, events, emit, calls } = setup();
    const res = await service.start({ id: 'c1', cwd: 'C:\\no-existe', permissionMode: 'plan' }, emit);
    expect(res).toEqual({ success: true, executable: 'C:\\bin\\claude.exe', source: 'user' });

    const opts = calls[0];
    expect(opts.includePartialMessages).toBe(true);
    expect(opts.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(opts.permissionMode).toBe('plan');
    expect(opts.pathToClaudeCodeExecutable).toBe('C:\\bin\\claude.exe');
    expect(opts.env.CLAUDECODE).toBeUndefined();
    expect(typeof opts.canUseTool).toBe('function');

    expect(service.sendMessage('c1', { text: 'hola' })).toEqual({ success: true });
    await flush();
    await flush();
    const messages = events.filter((e) => e.type === 'message').map((e) => e.message.type);
    expect(messages).toEqual(['system', 'assistant', 'result']);
    expect(events.find((e) => e.type === 'capabilities')).toMatchObject({ commands: [{ name: 'compact' }], models: [{ value: 'sonnet' }] });
  });

  it('resumes a previous session and ignores unknown permission modes', async () => {
    const { service, emit, calls } = setup();
    await service.start({ id: 'c1', resume: 'sess-old', permissionMode: 'hack', effort: 'max' }, emit);
    expect(calls[0].resume).toBe('sess-old');
    expect(calls[0].effort).toBe('max');
    expect(calls[0].permissionMode).toBe('default');
  });

  it('routes permission prompts to the UI and resolves them with the user decision', async () => {
    const { service, events, emit, calls } = setup();
    await service.start({ id: 'c1' }, emit);
    const canUseTool = calls[0].canUseTool;
    const suggestions = [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }];

    const allowed = canUseTool('Bash', { command: 'ls' }, { signal: new AbortController().signal, suggestions, toolUseID: 't1' });
    const prompt = events.find((e) => e.type === 'permission');
    expect(prompt).toMatchObject({ id: 'c1', toolName: 'Bash', input: { command: 'ls' }, canAlwaysAllow: true, toolUseId: 't1' });
    expect(service.respondPermission('c1', prompt.requestId, { behavior: 'allow', always: true })).toBe(true);
    await expect(allowed).resolves.toEqual({ behavior: 'allow', updatedInput: { command: 'ls' }, updatedPermissions: suggestions });

    const denied = canUseTool('Write', { file_path: 'a' }, { signal: new AbortController().signal, toolUseID: 't2' });
    const second = events.filter((e) => e.type === 'permission')[1];
    service.respondPermission('c1', second.requestId, { behavior: 'deny', message: 'no' });
    await expect(denied).resolves.toEqual({ behavior: 'deny', message: 'no' });
  });

  it('passes AskUserQuestion answers back as updated input', async () => {
    const { service, events, emit, calls } = setup();
    await service.start({ id: 'c1' }, emit);
    const input = { questions: [{ question: '¿Color?', header: 'Color', options: [] }] };
    const p = calls[0].canUseTool('AskUserQuestion', input, { signal: new AbortController().signal, toolUseID: 'q' });
    const prompt = events.find((e) => e.type === 'permission');
    service.respondPermission('c1', prompt.requestId, { behavior: 'allow', updatedInput: { ...input, answers: { '¿Color?': 'Rojo' } } });
    await expect(p).resolves.toMatchObject({ behavior: 'allow', updatedInput: { answers: { '¿Color?': 'Rojo' } } });
  });

  it('cancels a pending prompt when the SDK aborts it', async () => {
    const { service, events, emit, calls } = setup();
    await service.start({ id: 'c1' }, emit);
    const ac = new AbortController();
    const p = calls[0].canUseTool('Bash', {}, { signal: ac.signal, toolUseID: 'x' });
    ac.abort();
    await expect(p).resolves.toMatchObject({ behavior: 'deny' });
    expect(events.some((e) => e.type === 'permission_cancelled')).toBe(true);
  });

  it('forwards interrupt / mode / model controls and stops the session', async () => {
    const { service, emit, control } = setup();
    await service.start({ id: 'c1' }, emit);
    expect(await service.interrupt('c1')).toEqual({ success: true });
    expect(await service.setPermissionMode('c1', 'acceptEdits')).toEqual({ success: true });
    expect(control.setPermissionMode).toHaveBeenCalledWith('acceptEdits');
    expect((await service.setPermissionMode('c1', 'nope')).success).toBe(false);
    await service.setModel('c1', 'opus');
    expect(control.setModel).toHaveBeenCalledWith('opus');
    expect(await service.setEffort('c1', 'xhigh')).toEqual({ success: true });
    expect(control.applyFlagSettings).toHaveBeenLastCalledWith({ effortLevel: 'xhigh' });
    await service.setEffort('c1', null);
    expect(control.applyFlagSettings).toHaveBeenLastCalledWith({ effortLevel: null });
    expect((await service.setEffort('c1', 'turbo')).success).toBe(false);

    expect(service.stop('c1')).toBe(true);
    expect(control.close).toHaveBeenCalled();
    expect(service.has('c1')).toBe(false);
    expect(service.sendMessage('c1', { text: 'x' }).success).toBe(false);
  });

  it('reports the model + effort Claude resolved, at start and after changing them', async () => {
    const { service, events, emit, control } = setup();
    let applied: any = { model: 'claude-opus-5-5', effort: 'medium' };
    (control as any).getSettings = vi.fn(async () => ({ effective: {}, sources: [], applied }));
    await service.start({ id: 'c1' }, emit);
    await flush();
    expect(events.filter((e) => e.type === 'applied_settings').pop()).toEqual({ id: 'c1', type: 'applied_settings', model: 'claude-opus-5-5', effort: 'medium' });

    applied = { model: 'claude-opus-5-5', effort: 'max' };
    await service.setEffort('c1', 'max');
    await flush();
    expect(events.filter((e) => e.type === 'applied_settings').pop()).toMatchObject({ effort: 'max' });

    applied = { model: 'claude-haiku-4-5', effort: null };
    await service.setModel('c1', 'haiku');
    await flush();
    expect(events.filter((e) => e.type === 'applied_settings').pop()).toMatchObject({ model: 'claude-haiku-4-5', effort: null });
  });

  it('skips the applied settings on CLIs without get_settings', async () => {
    const { service, events, emit } = setup();
    await service.start({ id: 'c1' }, emit);
    await flush();
    expect(events.some((e) => e.type === 'applied_settings')).toBe(false);
  });

  it('reports a failure when the SDK cannot load', async () => {
    const service = createClaudeChatService({ loadSdk: async () => { throw new Error('sin sdk'); }, env: {}, readPath: () => '' });
    const res = await service.start({ id: 'c1' }, () => {});
    expect(res).toEqual({ success: false, error: 'sin sdk' });
    expect(service.has('c1')).toBe(false);
  });

  it('reads plan usage (/usage) through a live session, without the transcript scan', async () => {
    const { service, emit, control } = setup();
    expect(await service.usage('nadie')).toEqual({ success: false, error: 'Sin sesión de Claude activa' });
    await service.start({ id: 'c1' }, emit);
    const res = await service.usage('otro-id'); // falls back to any live chat
    expect(control.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET).toHaveBeenCalledWith({ skipBehaviors: true });
    expect(res).toEqual({
      success: true,
      available: true,
      plan: 'pro',
      fiveHour: { percent: 16, resetsAt: '2026-11-13T10:00:00Z' },
      weekly: { percent: 100, resetsAt: '2026-11-17T19:00:00Z' }, // clamped
    });

    control.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET.mockRejectedValueOnce(new Error('timeout'));
    expect(await service.usage('c1')).toEqual({ success: false, error: 'timeout' });
    service.stop('c1');
  });

  it('reports usage as unavailable for API keys and tolerates a changed answer shape', () => {
    expect(summarizeUsage({ subscription_type: null, rate_limits_available: false, rate_limits: null })).toEqual({
      available: false, plan: null, fiveHour: null, weekly: null,
    });
    expect(summarizeUsage(undefined).available).toBe(false);
    expect(summarizeUsage({ rate_limits_available: true, rate_limits: { five_hour: { utilization: null }, seven_day: 'raro' } })).toEqual({
      available: true, plan: null, fiveHour: null, weekly: null,
    });
  });

  it('reports usage as unsupported when the SDK lacks the experimental call', async () => {
    const { service, emit, control } = setup();
    delete (control as any).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
    await service.start({ id: 'c2' }, emit);
    expect((await service.usage('c2')).success).toBe(false);
    service.stop('c2');
  });

  it('runs the chat as another account through its config folder', async () => {
    const { service, emit, calls } = setup();
    await service.start({ id: 'acc', configDir: 'C:\\datos\\claude-accounts\\b' }, emit);
    expect(calls[0].env.CLAUDE_CONFIG_DIR).toBe('C:\\datos\\claude-accounts\\b');
    service.stop('acc');
    await service.start({ id: 'main' }, emit);
    expect(calls[1].env.CLAUDE_CONFIG_DIR).toBeUndefined();
    service.stop('main');
  });
});
