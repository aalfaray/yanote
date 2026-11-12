import { describe, it, expect } from 'vitest';
import {
  chatReducer,
  initialChatState,
  pendingPermissions,
  topLevelItems,
  childItems,
  toolSummary,
  matchCommands,
  activeModelInfo,
  effortLevelsFor,
  modelLabel,
  type ChatState,
  type ChatAction,
} from '../../src/lib/claudeChat';
import type { ClaudeEvent } from '../../src/types/electron';

const msg = (message: Record<string, unknown>): ChatAction => ({ type: 'event', event: { id: 'c', type: 'message', message } });
const ev = (event: Record<string, unknown>): ChatAction => ({ type: 'event', event: { id: 'c', ...event } as ClaudeEvent });
const run = (actions: ChatAction[], state: ChatState = initialChatState()) => actions.reduce(chatReducer, state);
const stream = (event: Record<string, unknown>, parent: string | null = null) => msg({ type: 'stream_event', event, parent_tool_use_id: parent });

describe('Frontend: Claude chat transcript reducer', () => {
  it('reads session info from init', () => {
    const s = run([msg({ type: 'system', subtype: 'init', session_id: 's1', model: 'opus', cwd: 'C:\\x', permissionMode: 'default', slash_commands: ['compact'] })]);
    expect(s).toMatchObject({ sessionId: 's1', model: 'opus', cwd: 'C:\\x', permissionMode: 'default' });
    expect(s.commands).toEqual([{ name: 'compact', description: '' }]);
  });

  it('streams text deltas and finalizes with the full assistant message without duplicating', () => {
    let s = run([
      { type: 'send', text: 'hola', imageCount: 0 },
      stream({ type: 'message_start', message: { id: 'm1', usage: { input_tokens: 10, cache_read_input_tokens: 90 } } }),
      stream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola ' } }),
      stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'mundo' } }),
    ]);
    expect(s.running).toBe(true);
    expect(s.contextTokens).toBe(100);
    const text = s.items.find((i) => i.kind === 'text');
    expect(text).toMatchObject({ text: 'Hola mundo', streaming: true });

    s = run([
      stream({ type: 'content_block_stop', index: 0 }),
      msg({ type: 'assistant', message: { id: 'm1', model: 'opus', content: [{ type: 'text', text: 'Hola mundo' }] }, parent_tool_use_id: null }),
    ], s);
    expect(s.items.filter((i) => i.kind === 'text')).toHaveLength(1);
    expect(s.items.find((i) => i.kind === 'text')).toMatchObject({ streaming: false, final: true });
  });

  it('builds tool calls from streamed JSON and attaches their results', () => {
    const s = run([
      stream({ type: 'message_start', message: { id: 'm1' } }),
      stream({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'Bash' } }),
      stream({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":' } }),
      stream({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"ls"}' } }),
      msg({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } }),
      msg({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a.md' }] }] } }),
    ]);
    const tools = s.items.filter((i) => i.kind === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: 'Bash', input: { command: 'ls' }, result: { text: 'a.md', isError: false } });
  });

  it('nests subagent messages under their Task call', () => {
    const s = run([
      msg({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'task', name: 'Task', input: { description: 'Investigar' } }] } }),
      msg({ type: 'assistant', message: { id: 'm2', content: [{ type: 'tool_use', id: 'g', name: 'Grep', input: { pattern: 'x' } }] }, parent_tool_use_id: 'task' }),
    ]);
    expect(topLevelItems(s.items).map((i) => i.id)).toEqual(['task']);
    expect(childItems(s.items, 'task').map((i) => i.id)).toEqual(['g']);
  });

  it('tracks permission prompts through resolution and cancellation', () => {
    let s = run([
      ev({ type: 'permission', requestId: 'p1', toolName: 'Bash', input: { command: 'rm x' } }),
      ev({ type: 'permission', requestId: 'p2', toolName: 'Write', input: {} }),
    ]);
    expect(pendingPermissions(s.items).map((i) => i.id)).toEqual(['p1', 'p2']);
    s = run([{ type: 'permission_resolved', requestId: 'p1', allowed: true }, ev({ type: 'permission_cancelled', requestId: 'p2' })], s);
    expect(pendingPermissions(s.items)).toHaveLength(0);
    expect(s.items.map((i) => (i.kind === 'permission' ? i.status : ''))).toEqual(['allowed', 'cancelled']);
  });

  it('ends a turn on result and accumulates the session cost', () => {
    let s = run([{ type: 'send', text: 'a', imageCount: 0 }, msg({ type: 'result', subtype: 'success', duration_ms: 1500, total_cost_usd: 0.02, num_turns: 1 })]);
    expect(s.running).toBe(false);
    expect(s.totalCostUsd).toBeCloseTo(0.02);
    s = run([{ type: 'send', text: 'b', imageCount: 0 }, msg({ type: 'result', subtype: 'success', total_cost_usd: 0.05 })], s);
    expect(s.totalCostUsd).toBeCloseTo(0.05);
    const results = s.items.filter((i) => i.kind === 'result');
    expect(results.map((r) => (r.kind === 'result' ? Number(r.costUsd.toFixed(3)) : 0))).toEqual([0.02, 0.03]);
  });

  it('marks the session ended on error or exit', () => {
    expect(run([ev({ type: 'error', error: 'boom' })])).toMatchObject({ ended: true, running: false });
    expect(run([ev({ type: 'exit' })]).ended).toBe(true);
  });

  it('summarizes tools and matches slash commands', () => {
    expect(toolSummary('Bash', { command: 'npm test', description: 'Ejecutar tests' })).toBe('Ejecutar tests');
    expect(toolSummary('Edit', { file_path: 'C:\\a\\b\\nota.md' })).toBe('nota.md');
    const cmds = [{ name: 'compact', description: '' }, { name: 'config', description: '' }, { name: 'review', description: '' }];
    expect(matchCommands(cmds, '/co').map((c) => c.name)).toEqual(['compact', 'config']);
    expect(matchCommands(cmds, 'hola /co')).toEqual([]);
    expect(matchCommands(cmds, '/compact ')).toEqual([]);
  });
});

describe('Frontend: Claude model / effort helpers', () => {
  const models = [
    { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Predeterminado', supportsEffort: true, supportedEffortLevels: ['low', 'high', 'max'] as const },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', displayName: 'Sonnet', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'] as const },
    { value: 'claude-haiku-4-5', displayName: 'Haiku 4.5' },
  ].map((m) => ({ ...m, supportedEffortLevels: m.supportedEffortLevels ? [...m.supportedEffortLevels] : undefined }));

  it('picks the selected model, else the reported one, else default', () => {
    expect(activeModelInfo(models, 'sonnet', 'claude-opus-5-5')?.value).toBe('sonnet');
    expect(activeModelInfo(models, '', 'claude-sonnet-5-5')?.value).toBe('sonnet');
    expect(activeModelInfo(models, '', 'desconocido')?.value).toBe('default');
  });

  it('lists only the effort levels the model supports', () => {
    expect(effortLevelsFor(models[0])).toEqual(['low', 'high', 'max']);
    expect(effortLevelsFor(models[2])).toEqual([]);
    expect(effortLevelsFor({ ...models[0], supportsEffort: false })).toEqual([]);
    expect(effortLevelsFor(undefined)).toEqual([]);
  });

  it('formats model ids as readable names', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(modelLabel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 1M');
    expect(modelLabel('opus')).toBe('opus');
    expect(modelLabel(undefined)).toBe('');
  });

  it('rebuilds a resumed transcript from stored session messages', () => {
    const history = [
      { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: 'lista los archivos' } },
      { type: 'assistant', parent_tool_use_id: null, message: { id: 'a1', content: [{ type: 'text', text: 'Voy.' }, { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }] } },
      { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'a.md' }] } },
      { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: '<command-name>/clear</command-name>' } },
      { type: 'assistant', parent_tool_use_id: null, message: { id: 'a2', content: [{ type: 'text', text: 'Hay un archivo.' }] } },
    ];
    const s = run([{ type: 'history', messages: history }]);
    expect(s.items.map((i) => i.kind)).toEqual(['user', 'text', 'tool', 'text']);
    expect(s.items[0]).toMatchObject({ text: 'lista los archivos' });
    expect(s.items[2]).toMatchObject({ result: { text: 'a.md' } });
    expect(s.running).toBe(false);
    // A late history never duplicates a chat that already has content
    expect(run([{ type: 'history', messages: history }], s).items).toHaveLength(4);
  });

  it('stores the model and effort Claude resolved from its settings', () => {
    const s = run([ev({ type: 'applied_settings', model: 'claude-opus-5-5', effort: 'medium' })]);
    expect(s.appliedModel).toBe('claude-opus-5-5');
    expect(s.appliedEffort).toBe('medium');
    const cleared = run([ev({ type: 'applied_settings', model: null, effort: null })], s);
    expect(cleared.appliedModel).toBe('claude-opus-5-5');
    expect(cleared.appliedEffort).toBeNull();
  });
});

describe('Frontend: Claude sign-in detection', () => {
  const notLoggedIn = msg({
    type: 'assistant',
    error: 'authentication_failed',
    parent_tool_use_id: null,
    message: { id: 'a1', content: [{ type: 'text', text: 'Not logged in · Please run /login' }] },
  });

  it('flags "Not logged in" so the chat can offer the official sign-in', () => {
    const s = run([{ type: 'send', text: 'hola', imageCount: 0 }, notLoggedIn]);
    expect(s.authRequired).toBe(true);
    expect(s.items.some((i) => i.kind === 'notice')).toBe(false);
  });

  it('clears the flag on retry and after a normal reply', () => {
    expect(run([notLoggedIn, { type: 'auth_retry' }]).authRequired).toBe(false);
    const ok = msg({ type: 'assistant', parent_tool_use_id: null, message: { id: 'a2', content: [{ type: 'text', text: 'Hola' }] } });
    expect(run([notLoggedIn, ok]).authRequired).toBe(false);
  });
});
