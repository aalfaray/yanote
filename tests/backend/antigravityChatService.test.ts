import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const {
  createAntigravityChatService,
  findAgyExecutable,
  createTranslator,
  normalizeTool,
  readConfig,
} = require('../../electron/services/antigravityChatService.cjs');

const CONFIG = [
  {
    id: 'model',
    category: 'model',
    currentValue: 'gemini-3.8-flash',
    options: [
      { value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { value: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
    ],
  },
  { id: 'thought_level', category: 'thought_level', currentValue: 'high', options: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }] },
  {
    id: 'mode',
    category: 'mode',
    currentValue: 'default',
    options: [
      { value: 'default', name: 'Default' },
      { value: 'plan', name: 'Plan' },
    ],
  },
];

/** Fake `agy acp`: answers JSON-RPC on stdin, scripted per method. */
function fakeAgent(handlers: Record<string, (params: any, agent: any) => any>) {
  const child: any = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => child.emit('close', 0));
  const received: any[] = [];
  const agent = {
    received,
    notify: (method: string, params: any) => child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`),
    update: (sessionId: string, update: any) => agent.notify('session/update', { sessionId, update }),
    request: (id: number, method: string, params: any) => child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`),
  };
  let buf = '';
  child.stdin.on('data', async (d: Buffer) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      received.push(msg);
      if (!msg.method) continue; // a response to the agent's own request
      const handler = handlers[msg.method];
      if (msg.id === undefined) {
        handler?.(msg.params, agent);
        continue;
      }
      try {
        const result = handler ? await handler(msg.params, agent) : {};
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n`);
      } catch (err: any) {
        child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: err.message } })}\n`);
      }
    }
  });
  return { child, agent };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

function setup(handlers: Record<string, (params: any, agent: any) => any>) {
  const { child, agent } = fakeAgent({
    initialize: () => ({ protocolVersion: 1, agentCapabilities: { loadSession: true } }),
    'session/new': () => ({ sessionId: 'S1', configOptions: CONFIG }),
    ...handlers,
  });
  const spawn = vi.fn(() => child);
  const service = createAntigravityChatService({ spawn, env: { Path: 'C:\\bin' }, platform: 'win32', readPath: () => '', findExecutable: () => 'C:\\agy\\agy.exe' });
  const events: any[] = [];
  return { service, events, emit: (e: any) => events.push(e), spawn, child, agent };
}

describe('Backend: Antigravity chat (ACP)', () => {
  it('does not let a cancelled startup stop its replacement for the same tab', async () => {
    let finishInit!: (value: any) => void;
    const first = fakeAgent({ initialize: () => new Promise((resolve) => { finishInit = resolve; }) });
    const second = fakeAgent({
      initialize: () => ({ agentCapabilities: {} }),
      'session/new': () => ({ sessionId: 'replacement', configOptions: CONFIG }),
    });
    const spawn = vi.fn().mockReturnValueOnce(first.child).mockReturnValueOnce(second.child);
    const service = createAntigravityChatService({ spawn, findExecutable: () => 'agy' });
    const oldStart = service.start({ id: 'same-tab' }, () => {});
    await vi.waitFor(() => expect(finishInit).toBeTypeOf('function'));
    service.stop('same-tab');
    const newStart = service.start({ id: 'same-tab' }, () => {});
    finishInit({ agentCapabilities: {} });
    await oldStart;
    expect(await newStart).toMatchObject({ success: true });
    expect(service.has('same-tab')).toBe(true);
    expect(second.child.kill).not.toHaveBeenCalled();
    expect(service.sendMessage('same-tab', { text: 'hello' }).success).toBe(true);
    service.stopAll();
  });

  it.each(['close', 'error'])('notifies the chat when the process emits %s', async (event) => {
    const { service, emit, events, child } = setup({});
    await service.start({ id: 't1' }, emit);
    child.emit(event, event === 'error' ? new Error('process failed') : 1);
    expect(events).toContainEqual(event === 'error'
      ? { id: 't1', type: 'error', error: 'process failed' }
      : { id: 't1', type: 'exit', code: 1 });
    expect(service.has('t1')).toBe(false);
  });

  it('finds agy on PATH or in its default install folder', () => {
    const exists = (p: string) => p === 'C:\\Users\\u\\AppData\\Local\\agy\\bin\\agy.exe';
    expect(findAgyExecutable({ Path: 'C:\\x', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32', exists)).toBe('C:\\Users\\u\\AppData\\Local\\agy\\bin\\agy.exe');
    expect(findAgyExecutable({ Path: 'C:\\x' }, 'win32', () => false)).toBeUndefined();
  });

  it('maps ACP tool calls onto the names and arguments the chat renders', () => {
    expect(normalizeTool({ kind: 'execute', title: 'agy update', rawInput: { CommandLine: 'agy update', toolSummary: 'Actualizar' } })).toEqual({
      name: 'Bash',
      input: { CommandLine: 'agy update', toolSummary: 'Actualizar', command: 'agy update', description: 'Actualizar' },
    });
    expect(normalizeTool({ kind: 'read', title: 'Leer', locations: [{ path: 'C:\\a.md' }] }).input).toMatchObject({ file_path: 'C:\\a.md' });
    expect(normalizeTool({ name: 'browser_open', title: 'Abrir web' })).toEqual({ name: 'browser_open', input: { description: 'Abrir web' } });
  });

  it('reads models, thinking levels and modes from the config options', () => {
    const cfg = readConfig({ configOptions: CONFIG });
    expect(cfg.model).toBe('gemini-3.8-flash');
    expect(cfg.effort).toBe('high');
    expect(cfg.mode).toBe('default');
    expect(cfg.models[0]).toMatchObject({ value: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'] });
    expect(cfg.modes).toEqual([{ id: 'default', name: 'Default', description: '' }, { id: 'plan', name: 'Plan', description: '' }]);
    // Older agents: models / modes fields
    const old = readConfig({ models: { currentModelId: 'm1', availableModels: [{ modelId: 'm1', name: 'M1' }] }, modes: { currentModeId: 'a', availableModes: [{ id: 'a', name: 'A' }] } });
    expect(old).toMatchObject({ model: 'm1', mode: 'a', effort: null, hasConfigOptions: false });
  });

  it('streams text and thinking, then tools and results, as Claude-SDK messages', () => {
    const out: any[] = [];
    let n = 0;
    const t = createTranslator({ emitMessage: (m: any) => out.push(m), emit: (e: any) => out.push({ event: e }), newId: () => `id${++n}` });
    t.update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'pienso' } });
    t.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Ho' } });
    t.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'la' } });
    t.update({ sessionUpdate: 'tool_call', toolCallId: 'tc1', kind: 'execute', title: 'ls', rawInput: { CommandLine: 'ls' }, status: 'pending' });
    t.update({ sessionUpdate: 'tool_call_update', toolCallId: 'tc1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'a.md' } }] });
    t.update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'ignorado en vivo' } });
    t.endTurn();

    const kinds = out.map((m) => m.event?.type ?? (m.type === 'stream_event' ? m.event.type : m.type));
    expect(kinds).toEqual([
      'message_start',
      'content_block_start', // thinking
      'content_block_delta',
      'content_block_stop',
      'content_block_start', // text
      'content_block_delta',
      'content_block_delta',
      'content_block_stop',
      'assistant', // tool_use
      'user', // tool_result
    ]);
    expect(out[8].message.content[0]).toEqual({ type: 'tool_use', id: 'tc1', name: 'Bash', input: { CommandLine: 'ls', command: 'ls' } });
    expect(out[9].message.content[0]).toEqual({ type: 'tool_result', tool_use_id: 'tc1', content: 'a.md', is_error: false });
  });

  it('turns a plan into a todo list and replays user messages only while loading', () => {
    const out: any[] = [];
    const t = createTranslator({ emitMessage: (m: any) => out.push(m), emit: (e: any) => out.push({ event: e }), newId: () => 'p1' });
    t.update({ sessionUpdate: 'plan', entries: [{ content: 'Paso 1', status: 'in_progress' }, { content: 'Paso 2', status: 'pending' }] });
    expect(out.at(-1).message.content[0]).toMatchObject({ name: 'TodoWrite', input: { todos: [{ content: 'Paso 1', status: 'in_progress' }, { content: 'Paso 2', status: 'pending' }] } });
    t.setReplaying(true);
    t.update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hola' } });
    expect(out.at(-1)).toEqual({ event: { type: 'user_message', text: 'hola' } });
  });

  it('starts a session, reports models / effort / modes and runs prompts one at a time', async () => {
    const { service, events, emit, spawn, agent } = setup({
      'session/prompt': async (p: any, a: any) => {
        a.update('S1', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `eco: ${p.prompt.at(-1).text}` } });
        await tick();
        return { stopReason: 'end_turn' };
      },
    });
    const res = await service.start({ id: 't1', cwd: 'C:\\no-existe' }, emit);
    expect(res).toMatchObject({ success: true, executable: 'C:\\agy\\agy.exe' });
    expect(spawn.mock.calls[0][1]).toEqual(['acp']);
    expect(events.find((e) => e.type === 'message' && e.message.type === 'system')?.message).toMatchObject({ subtype: 'init', session_id: 'S1', model: 'gemini-3.8-flash', permissionMode: 'default' });
    expect(events.find((e) => e.type === 'capabilities')?.modes).toHaveLength(2);
    expect(events.find((e) => e.type === 'applied_settings')).toMatchObject({ model: 'gemini-3.8-flash', effort: 'high' });
    expect(service.modelOf('t1')).toBe('gemini-3.8-flash');

    expect(service.sendMessage('t1', { text: 'uno', images: [{ data: 'AAA', mediaType: 'image/png' }] })).toEqual({ success: true });
    expect(service.sendMessage('t1', { text: 'dos' })).toEqual({ success: true });
    await vi.waitFor(() => expect(events.filter((e) => e.message?.type === 'result')).toHaveLength(2));
    const prompts = agent.received.filter((m: any) => m.method === 'session/prompt');
    expect(prompts[0].params.prompt).toEqual([{ type: 'image', mimeType: 'image/png', data: 'AAA' }, { type: 'text', text: 'uno' }]);
    expect(prompts[1].params.prompt).toEqual([{ type: 'text', text: 'dos' }]);
    const texts = events.filter((e) => e.message?.event?.type === 'content_block_delta').map((e) => e.message.event.delta.text);
    expect(texts).toEqual(['eco: uno', 'eco: dos']);
  });

  it('changes model, thinking level and mode through config options', async () => {
    const set = vi.fn((p: any) => ({ configOptions: CONFIG.map((o) => (o.id === p.configId ? { ...o, currentValue: p.value } : o)) }));
    const { service, events, emit } = setup({ 'session/set_config_option': set });
    await service.start({ id: 't1' }, emit);
    expect(await service.setModel('t1', 'claude-sonnet-4-6')).toEqual({ success: true });
    expect(await service.setEffort('t1', 'low')).toEqual({ success: true });
    expect(await service.setEffort('t1', null)).toEqual({ success: true });
    expect(await service.setPermissionMode('t1', 'plan')).toEqual({ success: true });
    expect(set.mock.calls.map((c) => [c[0].configId, c[0].value])).toEqual([
      ['model', 'claude-sonnet-4-6'],
      ['thought_level', 'low'],
      ['thought_level', 'high'],
      ['mode', 'plan'],
    ]);
    expect(events.filter((e) => e.type === 'applied_settings').at(-1)).toMatchObject({ effort: 'high' });
  });

  it('ignores an effort reset on models without thinking levels', async () => {
    const noLevels = CONFIG.filter((o) => o.id !== 'thought_level');
    const set = vi.fn(() => ({ configOptions: noLevels }));
    const { service, emit } = setup({ 'session/new': () => ({ sessionId: 'S1', configOptions: noLevels }), 'session/set_config_option': set });
    await service.start({ id: 't1' }, emit);
    expect(await service.setEffort('t1', null)).toEqual({ success: true });
    expect((await service.setEffort('t1', 'low')).success).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('routes permission prompts to the UI and answers with the matching option', async () => {
    const { service, events, emit, agent } = setup({});
    await service.start({ id: 't1' }, emit);
    const options = [
      { optionId: 'o1', kind: 'allow_once', name: 'Permitir' },
      { optionId: 'o2', kind: 'allow_always', name: 'Siempre' },
      { optionId: 'o3', kind: 'reject_once', name: 'Rechazar' },
    ];
    agent.request(900, 'session/request_permission', { sessionId: 'S1', toolCall: { toolCallId: 'tc', kind: 'execute', title: 'rm x', rawInput: { CommandLine: 'rm x' } }, options });
    await vi.waitFor(() => expect(events.some((e) => e.type === 'permission')).toBe(true));
    const prompt = events.find((e) => e.type === 'permission');
    expect(prompt).toMatchObject({ toolName: 'Bash', input: { command: 'rm x' }, canAlwaysAllow: true, toolUseId: 'tc' });
    expect(service.respondPermission('t1', prompt.requestId, { behavior: 'allow', always: true })).toBe(true);
    await vi.waitFor(() => expect(agent.received.find((m: any) => m.id === 900)?.result).toEqual({ outcome: { outcome: 'selected', optionId: 'o2' } }));

    agent.request(901, 'session/request_permission', { sessionId: 'S1', toolCall: { toolCallId: 'tc2' }, options });
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'permission')).toHaveLength(2));
    service.respondPermission('t1', events.filter((e) => e.type === 'permission')[1].requestId, { behavior: 'deny' });
    await vi.waitFor(() => expect(agent.received.find((m: any) => m.id === 901)?.result).toEqual({ outcome: { outcome: 'selected', optionId: 'o3' } }));
  });

  it('resumes a saved session by loading (and replaying) it', async () => {
    const { service, events, emit, agent } = setup({
      'session/load': (p: any, a: any) => {
        a.update(p.sessionId, { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'pregunta vieja' } });
        a.update(p.sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'respuesta vieja' } });
        return new Promise((r) => setTimeout(() => r({ configOptions: CONFIG }), 10));
      },
    });
    expect((await service.start({ id: 't1', resume: 'OLD' }, emit)).success).toBe(true);
    expect(agent.received.some((m: any) => m.method === 'session/new')).toBe(false);
    expect(events.find((e) => e.type === 'user_message')).toMatchObject({ text: 'pregunta vieja' });
    expect(events.find((e) => e.message?.subtype === 'init')?.message.session_id).toBe('OLD');
  });

  it('cancels, reports failed prompts as errors and stops the process', async () => {
    const { service, events, emit, agent, child } = setup({
      'session/prompt': () => {
        throw new Error('Individual quota reached');
      },
    });
    await service.start({ id: 't1' }, emit);
    service.sendMessage('t1', { text: 'hola' });
    await vi.waitFor(() => expect(events.find((e) => e.message?.type === 'result')?.message).toMatchObject({ is_error: true, errors: ['Individual quota reached'] }));
    expect(await service.interrupt('t1')).toEqual({ success: true });
    await vi.waitFor(() => expect(agent.received.some((m: any) => m.method === 'session/cancel')).toBe(true));
    expect(service.stop('t1')).toBe(true);
    expect(child.kill).toHaveBeenCalled();
    expect(service.has('t1')).toBe(false);
  });

  it('fails clearly when agy is not installed or the session cannot start', async () => {
    const none = createAntigravityChatService({ env: {}, platform: 'win32', readPath: () => '', findExecutable: () => undefined });
    expect((await none.start({ id: 'x' }, () => {})).error).toMatch(/No encontré Antigravity/);

    const { service, emit } = setup({
      'session/new': () => {
        throw new Error('Authentication required');
      },
    });
    const res = await service.start({ id: 't1' }, emit);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Inicia sesión ejecutando "agy"/);
    expect(service.has('t1')).toBe(false);
  });
});
