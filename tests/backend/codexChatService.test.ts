import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chatReducer, initialChatState } from '../../src/lib/claudeChat';

const { createCodexChatService, createTranslator, readHistory, readModels, findBundledCodex } = require('../../electron/services/codexChatService.cjs');
const sessionId = '12345678-1234-1234-1234-123456789abc';
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function setup(run?: (input: any, options: any) => AsyncGenerator<any>) {
  const events: any[] = [];
  const runStreamed = vi.fn(async (input, options) => ({ events: run ? run(input, options) : (async function* () {
    yield { type: 'thread.started', thread_id: sessionId };
    yield { type: 'turn.started' };
    yield { type: 'item.completed', item: { type: 'agent_message', id: 'item_0', text: `eco: ${input}` } };
    yield { type: 'turn.completed', usage: { input_tokens: 42, cached_input_tokens: 20 } };
  })() }));
  const client = { startThread: vi.fn(() => ({ runStreamed })), resumeThread: vi.fn(() => ({ runStreamed })) };
  const Codex = vi.fn(function () { return client; });
  const service = createCodexChatService({ loadSdk: async () => ({ Codex }), findBundled: () => 'C:\\Codex\\bin\\codex.exe', env: { Path: 'C:\\tools' }, platform: 'win32', readPath: () => '', getModels: async () => [{ value: 'default', displayName: 'Predeterminado' }] });
  const start = (options = {}) => service.start({ id: 'c', cwd: process.cwd(), ...options }, (event: any) => events.push(event));
  const results = () => events.filter((e) => e.message?.type === 'result');
  return { service, events, start, client, Codex, runStreamed, results };
}

describe('Codex SDK lifecycle', () => {
  it('uses the official SDK, streams turns and retains the same conversation', async () => {
    const { service, events, start, Codex, client, results } = setup();
    expect(await start()).toMatchObject({ success: true, source: 'bundled' });
    expect(Codex).toHaveBeenCalledWith(expect.objectContaining({ codexPathOverride: 'C:\\Codex\\bin\\codex.exe' }));
    expect(service.sendMessage('c', { text: 'uno' }).success).toBe(true);
    service.sendMessage('c', { text: 'dos' });
    await vi.waitFor(() => expect(results()).toHaveLength(2));
    expect(client.startThread).toHaveBeenCalledTimes(1);
    expect(client.startThread).toHaveBeenCalledWith(expect.objectContaining({ sandboxMode: 'read-only', approvalPolicy: 'never', skipGitRepoCheck: true, workingDirectory: process.cwd() }));
    expect(events.filter((e) => e.type === 'turn_started')).toHaveLength(2);
    const state = events.reduce((s, event) => chatReducer(s, { type: 'event', event }), initialChatState());
    expect(state.items.filter((i: any) => i.kind === 'text').map((i: any) => i.text)).toEqual(['eco: uno', 'eco: dos']);
    expect(state.sessionId).toBe(sessionId);
    expect(state.contextTokens).toBe(42);
    expect(state.running).toBe(false);
    service.stopAll();
  });

  it('resumes the saved session and applies changed model, effort and sandbox on the next turn', async () => {
    const { service, start, client, results } = setup();
    await start({ resume: sessionId });
    expect(service.setPermissionMode('c', 'workspace-write').success).toBe(true);
    expect(service.setModel('c', 'test-model').success).toBe(true);
    expect(service.setEffort('c', 'xhigh').success).toBe(true);
    service.sendMessage('c', { text: 'continúa' });
    await vi.waitFor(() => expect(results()).toHaveLength(1));
    expect(client.resumeThread).toHaveBeenLastCalledWith(sessionId, expect.objectContaining({ sandboxMode: 'workspace-write', model: 'test-model', modelReasoningEffort: 'xhigh' }));
    service.setModel('c', null);
    service.setEffort('c', null);
    service.sendMessage('c', { text: 'otra' });
    await vi.waitFor(() => expect(results()).toHaveLength(2));
    expect(client.resumeThread.mock.lastCall![1]).not.toHaveProperty('model');
    expect(client.resumeThread.mock.lastCall![1]).not.toHaveProperty('modelReasoningEffort');
    expect(service.setPermissionMode('c', 'bypassPermissions').success).toBe(false);
    expect(service.setEffort('c', 'invalid').success).toBe(false);
    service.stopAll();
  });

  it('aborts the active turn, clears queued prompts and can send again', async () => {
    let signal!: AbortSignal;
    const { service, start, runStreamed, results } = setup(async function* (_, options) {
      signal = options.signal;
      yield { type: 'thread.started', thread_id: sessionId };
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      throw new Error('aborted');
    });
    await start();
    service.sendMessage('c', { text: 'activo' });
    service.sendMessage('c', { text: 'en cola' });
    await vi.waitFor(() => expect(signal).toBeDefined());
    service.interrupt('c');
    await vi.waitFor(() => expect(results()).toHaveLength(1));
    expect(signal.aborted).toBe(true);
    expect(runStreamed).toHaveBeenCalledTimes(1);
    expect(results()[0].message.is_error).toBe(false);
    expect(service.sendMessage('c', { text: 'nuevo' }).success).toBe(true);
    service.stopAll();
    await tick();
    expect(service.has('c')).toBe(false);
  });

  it('cleans temporary image files after the SDK has consumed them', async () => {
    let imagePath = '';
    const { service, start, results } = setup(async function* (input) {
      imagePath = input[1].path;
      expect(input[0]).toEqual({ type: 'text', text: 'mira' });
      expect(fs.readFileSync(imagePath).toString()).toBe('image bytes');
      yield { type: 'turn.completed', usage: {} };
    });
    await start();
    service.sendMessage('c', { text: 'mira', images: [{ mediaType: 'image/png', data: Buffer.from('image bytes').toString('base64') }] });
    await vi.waitFor(() => expect(results()).toHaveLength(1));
    expect(fs.existsSync(imagePath)).toBe(false);
    expect(service.sendMessage('c', { text: 'bad', images: [{ mediaType: '../../exe', data: 'abc' }] }).success).toBe(false);
    service.stopAll();
  });

  it('reports authentication failure and permits retrying a failed turn', async () => {
    const { service, start, events, results } = setup(async function* () {
      yield { type: 'turn.failed', error: { message: '401 Unauthorized' } };
    });
    await start();
    service.sendMessage('c', { text: 'hola' });
    await vi.waitFor(() => expect(results()).toHaveLength(1));
    expect(results()[0].message).toMatchObject({ is_error: true, errors: ['401 Unauthorized'] });
    expect(events.some((e) => e.message?.error === 'authentication_failed')).toBe(true);
    expect(service.has('c')).toBe(true);
    service.stopAll();
  });

  it('handles missing binaries, invalid sessions and closure during SDK loading', async () => {
    const missing = createCodexChatService({ loadSdk: async () => ({}), findBundled: () => undefined });
    expect((await missing.start({ id: 'x' }, () => {})).success).toBe(false);
    expect(missing.has('x')).toBe(false);
    expect((await missing.start({ id: 'x', resume: '../bad' }, () => {})).success).toBe(false);
    let resolve!: (sdk: any) => void;
    const closed = createCodexChatService({ loadSdk: () => new Promise((r) => { resolve = r; }), findBundled: () => 'codex', readPath: () => '', getModels: async () => [] });
    const emit = vi.fn();
    const started = closed.start({ id: 'x' }, emit);
    closed.stop('x');
    resolve({ Codex: class {} });
    expect((await started).success).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('Codex events rendered through the shared chat', () => {
  it('handles interleaved text snapshots, commands, file edits, MCP, search and plans without duplicates', () => {
    let state = initialChatState();
    const translate = createTranslator((event: any) => { state = chatReducer(state, { type: 'event', event: { id: 'c', ...event } }); }, 't1');
    const update = (type: string, item: any) => translate({ type, item });
    update('item.started', { id: 'reason', type: 'reasoning', text: 'Pienso' });
    update('item.started', { id: 'text', type: 'agent_message', text: 'Ho' });
    update('item.completed', { id: 'reason', type: 'reasoning', text: 'Pienso más' });
    update('item.updated', { id: 'text', type: 'agent_message', text: 'Hola' });
    update('item.completed', { id: 'text', type: 'agent_message', text: 'Hola mundo' });
    update('item.completed', { id: 'text', type: 'agent_message', text: 'Hola mundo' });
    update('item.started', { id: 'cmd', type: 'command_execution', command: 'pwd', status: 'in_progress' });
    update('item.completed', { id: 'cmd', type: 'command_execution', command: 'pwd', aggregated_output: '/notes', exit_code: 0 });
    update('item.completed', { id: 'files', type: 'file_change', changes: [{ kind: 'update', path: '/notes/a.md' }, { kind: 'add', path: '/notes/b.md' }] });
    update('item.completed', { id: 'mcp', type: 'mcp_tool_call', server: 'docs', tool: 'search', arguments: { query: 'SDK' }, result: { content: [{ text: 'encontrado' }] } });
    update('item.completed', { id: 'web', type: 'web_search', query: 'SDK oficial' });
    update('item.completed', { id: 'plan', type: 'todo_list', items: [{ text: 'Verificar', completed: true }] });
    expect(state.items.filter((i) => i.kind === 'text').map((i: any) => i.text)).toEqual(['Hola mundo']);
    expect(state.items.find((i) => i.kind === 'thinking')).toMatchObject({ text: 'Pienso más', streaming: false });
    const tools = state.items.filter((i) => i.kind === 'tool');
    expect(tools).toHaveLength(6);
    expect(tools[0]).toMatchObject({ name: 'Bash', input: { command: 'pwd' }, result: { text: '/notes', isError: false } });
    expect(tools[1]).toMatchObject({ name: 'Edit', input: { file_path: '/notes/a.md' } });
    expect(tools[3]).toMatchObject({ name: 'mcp__docs__search', result: { text: 'encontrado' } });
  });
});

describe('Codex local metadata', () => {
  it('restores user messages and assistant replies, ignoring instructions and broken JSON', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-codex-history-'));
    try {
      const sessions = path.join(dir, 'sessions', '2026', '11', '21');
      fs.mkdirSync(sessions, { recursive: true });
      fs.writeFileSync(path.join(sessions, `rollout-date-${sessionId}.jsonl`), [
        JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'AGENTS instructions' }] } }),
        JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'Hola', images: [] } }),
        'broken json',
        JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hola de vuelta' }] } }),
      ].join('\n'));
      const history = await readHistory(sessionId, { CODEX_HOME: dir });
      expect(history).toHaveLength(2);
      expect(history[0].message.content[0].text).toBe('Hola');
      expect(history[1].message.content[0].text).toBe('Hola de vuelta');
      expect(await readHistory('../auth.json', { CODEX_HOME: dir })).toEqual([]);
      fs.writeFileSync(path.join(dir, 'models_cache.json'), JSON.stringify({ models: [
        { slug: 'test', display_name: 'Test', supported_reasoning_levels: [{ effort: 'xhigh' }, { effort: 'ultra' }] },
        { slug: 'hidden', visibility: 'hide' },
      ] }));
      expect(await readModels({ CODEX_HOME: dir })).toEqual([
        expect.objectContaining({ value: 'default' }),
        expect.objectContaining({ value: 'test', supportedEffortLevels: ['xhigh', 'ultra'] }),
      ]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('locates the installed native SDK binary and uses it for official login', () => {
    const executable = findBundledCodex();
    expect(executable).toBeTruthy();
    expect(fs.existsSync(executable)).toBe(true);
    const service = createCodexChatService({ findBundled: () => "C:\\User's App\\codex.exe", platform: 'win32' });
    expect(service.loginCommand()).toBe("& 'C:\\User''s App\\codex.exe' login");
  });
});
