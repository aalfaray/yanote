import type { ClaudeEvent, ClaudePermissionRequest, ClaudeSlashCommand, ClaudeModelInfo, ClaudeEffortLevel } from '../types/electron';

/**
 * Turns the Agent SDK's message stream into a chat transcript.
 * Pure (state in, state out) so it can be unit-tested without Electron.
 */

export interface ToolResult {
  text: string;
  isError: boolean;
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string; imageCount: number }
  | { kind: 'text'; id: string; msgId: string; text: string; streaming: boolean; final: boolean; parentToolUseId: string | null }
  | { kind: 'thinking'; id: string; msgId: string; text: string; streaming: boolean; final: boolean; parentToolUseId: string | null }
  | {
      kind: 'tool';
      id: string;
      name: string;
      input: Record<string, unknown>;
      /** Raw JSON while the input is still streaming */
      partialInput: string;
      result?: ToolResult;
      parentToolUseId: string | null;
    }
  | { kind: 'permission'; id: string; request: ClaudePermissionRequest; status: 'pending' | 'allowed' | 'denied' | 'cancelled' }
  | { kind: 'result'; id: string; isError: boolean; durationMs: number; costUsd: number; turns: number; errors: string[] }
  | { kind: 'notice'; id: string; text: string; tone: 'info' | 'error' };

export interface ChatState {
  items: ChatItem[];
  /** A turn is in flight (from send until `result`) */
  running: boolean;
  /** Session ended (process exited or failed) */
  ended: boolean;
  sessionId?: string;
  model?: string;
  cwd?: string;
  permissionMode?: string;
  version?: string;
  status?: string | null;
  commands: ClaudeSlashCommand[];
  models: ClaudeModelInfo[];
  totalCostUsd: number;
  /** Context tokens of the last API call (input + cache) */
  contextTokens: number;
  /** stream message id -> block index -> item id */
  stream: Record<string, Record<number, string>>;
  /** Id of the top-level message currently streaming */
  currentMsg?: string;
  /** Claude Code answered "Not logged in": the user has to sign in (Anthropic's own flow) */
  authRequired: boolean;
  /** The account hit its usage limit: offer another account */
  rateLimited: boolean;
}

export const initialChatState = (): ChatState => ({
  items: [],
  running: false,
  ended: false,
  commands: [],
  models: [],
  totalCostUsd: 0,
  contextTokens: 0,
  stream: {},
  authRequired: false,
  rateLimited: false,
});

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

let localSeq = 0;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(localSeq++).toString(36)}`;

/** tool_result content (string or blocks) -> plain text */
export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (isObj(b) ? (b.type === 'text' ? str(b.text) : b.type === 'image' ? '[imagen]' : '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parsePartial(json: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(json);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

function updateItem(state: ChatState, id: string, fn: (item: ChatItem) => ChatItem): ChatState {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx === -1) return state;
  const items = state.items.slice();
  items[idx] = fn(items[idx]);
  return { ...state, items };
}

const push = (state: ChatState, item: ChatItem): ChatState => ({ ...state, items: [...state.items, item] });

function upsertTool(state: ChatState, block: Json, parent: string | null): ChatState {
  const id = str(block.id);
  if (!id) return state;
  const input = isObj(block.input) ? block.input : {};
  if (state.items.some((i) => i.id === id)) {
    return updateItem(state, id, (i) =>
      i.kind === 'tool' ? { ...i, name: str(block.name) || i.name, input: Object.keys(input).length ? input : i.input } : i
    );
  }
  return push(state, { kind: 'tool', id, name: str(block.name), input, partialInput: '', parentToolUseId: parent });
}

function onStreamEvent(state: ChatState, msg: Json): ChatState {
  const ev = isObj(msg.event) ? msg.event : null;
  if (!ev) return state;
  const parent = (msg.parent_tool_use_id as string | null) ?? null;
  // Subagent streams are noisy; their final messages are enough
  if (parent) return state;

  if (ev.type === 'message_start') {
    const m = isObj(ev.message) ? ev.message : {};
    const msgId = str(m.id);
    const usage = isObj(m.usage) ? m.usage : null;
    const context = usage
      ? Number(usage.input_tokens || 0) + Number(usage.cache_read_input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0)
      : 0;
    return {
      ...state,
      stream: { ...state.stream, [msgId]: {} },
      currentMsg: msgId,
      contextTokens: context || state.contextTokens,
    };
  }

  const current = state.currentMsg;
  if (!current) return state;
  const index = Number(ev.index ?? -1);

  if (ev.type === 'content_block_start' && isObj(ev.content_block)) {
    const block = ev.content_block;
    let next = state;
    let itemId: string;
    if (block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
      itemId = str(block.id);
      next = upsertTool(state, { ...block, input: {} }, null);
    } else if (block.type === 'text' || block.type === 'thinking') {
      itemId = `${current}:${index}`;
      next = push(state, {
        kind: block.type,
        id: itemId,
        msgId: current,
        text: block.type === 'text' ? str(block.text) : str(block.thinking),
        streaming: true,
        final: false,
        parentToolUseId: null,
      });
    } else {
      return state;
    }
    return { ...next, stream: { ...next.stream, [current]: { ...(next.stream[current] || {}), [index]: itemId } } };
  }

  const itemId = state.stream[current]?.[index];
  if (!itemId) return state;

  if (ev.type === 'content_block_delta' && isObj(ev.delta)) {
    const d = ev.delta;
    return updateItem(state, itemId, (i) => {
      if (i.kind === 'text' && d.type === 'text_delta') return { ...i, text: i.text + str(d.text) };
      if (i.kind === 'thinking' && d.type === 'thinking_delta') return { ...i, text: i.text + str(d.thinking) };
      if (i.kind === 'tool' && d.type === 'input_json_delta') {
        const partialInput = i.partialInput + str(d.partial_json);
        return { ...i, partialInput, input: parsePartial(partialInput) ?? i.input };
      }
      return i;
    });
  }

  if (ev.type === 'content_block_stop') {
    return updateItem(state, itemId, (i) => (i.kind === 'text' || i.kind === 'thinking' ? { ...i, streaming: false } : i));
  }
  return state;
}

function onAssistant(state: ChatState, msg: Json): ChatState {
  const m = isObj(msg.message) ? msg.message : {};
  const msgId = str(m.id);
  const parent = (msg.parent_tool_use_id as string | null) ?? null;
  const content = Array.isArray(m.content) ? m.content : [];
  let next = state;
  if (str(m.model) && !parent) next = { ...next, model: str(m.model) };

  for (const block of content) {
    if (!isObj(block)) continue;
    if (block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
      next = upsertTool(next, block, parent);
      continue;
    }
    if (block.type !== 'text' && block.type !== 'thinking') continue;
    const kind = block.type;
    const text = kind === 'text' ? str(block.text) : str(block.thinking);
    // The streamed item for this block: first unfinalized one of the same message and kind
    const existing = next.items.find((i) => (i.kind === 'text' || i.kind === 'thinking') && i.kind === kind && i.msgId === msgId && !i.final);
    if (existing) {
      next = updateItem(next, existing.id, (i) => ({ ...i, text: text || (i as { text: string }).text, streaming: false, final: true }) as ChatItem);
    } else if (text.trim()) {
      next = push(next, { kind, id: localId(kind), msgId, text, streaming: false, final: true, parentToolUseId: parent });
    }
  }

  const err = msg.error;
  if (!parent) {
    if (err === 'authentication_failed') return { ...next, authRequired: true };
    if (err === 'rate_limit') next = { ...next, rateLimited: true };
    if (err) {
      next = push(next, { kind: 'notice', id: localId('err'), text: `Error de la API: ${typeof err === 'string' ? err : JSON.stringify(err)}`, tone: 'error' });
    } else if ((next.authRequired || next.rateLimited) && content.length > 0) {
      next = { ...next, authRequired: false, rateLimited: false };
    }
  }
  return next;
}

function onUser(state: ChatState, msg: Json): ChatState {
  const m = isObj(msg.message) ? msg.message : {};
  const content = m.content;
  let next = state;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isObj(block) && block.type === 'tool_result') {
        const id = str(block.tool_use_id);
        next = updateItem(next, id, (i) =>
          i.kind === 'tool' ? { ...i, result: { text: toolResultText(block.content), isError: Boolean(block.is_error) } } : i
        );
      }
    }
  }
  return next;
}

function onSystem(state: ChatState, msg: Json): ChatState {
  switch (msg.subtype) {
    case 'init':
      return {
        ...state,
        sessionId: str(msg.session_id) || state.sessionId,
        model: str(msg.model) || state.model,
        cwd: str(msg.cwd) || state.cwd,
        permissionMode: str(msg.permissionMode) || state.permissionMode,
        version: str(msg.claude_code_version) || state.version,
        commands: state.commands.length
          ? state.commands
          : (Array.isArray(msg.slash_commands) ? msg.slash_commands : []).map((name) => ({ name: String(name), description: '' })),
      };
    case 'status':
      return { ...state, status: (msg.status as string | null) ?? null, permissionMode: str(msg.permissionMode) || state.permissionMode };
    case 'local_command_output':
      return push(state, { kind: 'text', id: localId('cmd'), msgId: '', text: str(msg.content), streaming: false, final: true, parentToolUseId: null });
    case 'compact_boundary':
      return push(state, { kind: 'notice', id: localId('compact'), text: 'Conversación compactada', tone: 'info' });
    case 'api_retry':
      return push(state, {
        kind: 'notice',
        id: localId('retry'),
        text: `Reintentando la API (${msg.attempt}/${msg.max_retries})…`,
        tone: 'info',
      });
    case 'informational':
    case 'notification': {
      const text = str(msg.content) || str(msg.text);
      return text ? push(state, { kind: 'notice', id: localId('info'), text, tone: msg.level === 'warning' ? 'error' : 'info' }) : state;
    }
    default:
      return state;
  }
}

function onResult(state: ChatState, msg: Json): ChatState {
  // The CLI reports the session's running total; tolerate per-turn values from older CLIs
  const reported = Number(msg.total_cost_usd || 0);
  const total = reported >= state.totalCostUsd ? reported : state.totalCostUsd + reported;
  const cost = total - state.totalCostUsd;
  const errors = Array.isArray(msg.errors) ? msg.errors.map(String) : [];
  const isError = Boolean(msg.is_error) || msg.subtype !== 'success';
  const items = state.items.map((i) => ((i.kind === 'text' || i.kind === 'thinking') && i.streaming ? { ...i, streaming: false } : i));
  return {
    ...state,
    items: [
      ...items,
      {
        kind: 'result',
        id: localId('result'),
        isError,
        durationMs: Number(msg.duration_ms || 0),
        costUsd: cost,
        turns: Number(msg.num_turns || 0),
        errors: isError && msg.subtype === 'success' && str(msg.result) ? [str(msg.result)] : errors,
      },
    ],
    running: false,
    status: null,
    sessionId: str(msg.session_id) || state.sessionId,
    totalCostUsd: total,
    stream: {},
    currentMsg: undefined,
  };
}

function onMessage(state: ChatState, msg: Json): ChatState {
  switch (msg.type) {
    case 'stream_event':
      return onStreamEvent(state, msg);
    case 'assistant':
      return onAssistant(state, msg);
    case 'user':
      return onUser(state, msg);
    case 'system':
      return onSystem(state, msg);
    case 'result':
      return onResult(state, msg);
    default:
      return state;
  }
}

export type ChatAction =
  | { type: 'event'; event: ClaudeEvent }
  | { type: 'send'; text: string; imageCount: number }
  | { type: 'permission_resolved'; requestId: string; allowed: boolean }
  | { type: 'notice'; text: string; tone: 'info' | 'error' }
  | { type: 'local_permission_mode'; mode: string }
  | { type: 'auth_retry' }
  | { type: 'dismiss'; id: string }
  /** Earlier messages of a resumed conversation (read from its transcript), shown above the new ones */
  | { type: 'history'; messages: Record<string, unknown>[] }
  | { type: 'reset' };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'reset':
      return initialChatState();
    case 'send':
      return {
        ...push(state, { kind: 'user', id: localId('user'), text: action.text, imageCount: action.imageCount }),
        running: true,
        ended: false,
      };
    case 'notice':
      return push(state, { kind: 'notice', id: localId('notice'), text: action.text, tone: action.tone });
    case 'history':
      return { ...state, items: [...historyItems(action.messages), ...state.items] };
    case 'dismiss':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'local_permission_mode':
      return { ...state, permissionMode: action.mode };
    case 'auth_retry':
      return { ...state, authRequired: false, rateLimited: false, running: false, ended: false };
    case 'permission_resolved':
      return updateItem(state, action.requestId, (i) => (i.kind === 'permission' ? { ...i, status: action.allowed ? 'allowed' : 'denied' } : i));
    case 'event': {
      const ev = action.event;
      switch (ev.type) {
        case 'message':
          return onMessage(state, ev.message);
        case 'permission': {
          const { id: _chat, type: _t, ...request } = ev;
          return push(state, { kind: 'permission', id: request.requestId, request, status: 'pending' });
        }
        case 'permission_cancelled':
          return updateItem(state, ev.requestId, (i) => (i.kind === 'permission' && i.status === 'pending' ? { ...i, status: 'cancelled' } : i));
        case 'capabilities':
          return {
            ...state,
            commands: ev.commands.length ? ev.commands : state.commands,
            models: ev.models.length ? ev.models : state.models,
          };
        case 'error':
          return { ...push(state, { kind: 'notice', id: localId('error'), text: ev.error, tone: 'error' }), running: false, ended: true };
        case 'exit':
          return { ...state, running: false, ended: true };
        default:
          return state;
      }
    }
    default:
      return state;
  }
}

/** Items shown at the top level; subagent (Task/Agent) items are folded into their parent tool card. */
/** Text the user typed in a stored user turn; null for tool results and app-injected turns. */
function typedUserText(content: unknown): { text: string; imageCount: number } | null {
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
  if (blocks.some((b) => isObj(b) && b.type === 'tool_result')) return null;
  const text = blocks
    .filter((b) => isObj(b) && b.type === 'text')
    .map((b) => str((b as Json).text))
    .join('\n')
    .trim();
  // <task-notification>, <command-name>, <system-reminder>…: written by the app, not by the user
  if (!text || /^<[a-z][\w-]*[\s>]/i.test(text)) return null;
  return { text, imageCount: blocks.filter((b) => isObj(b) && b.type === 'image').length };
}

/** Transcript items for stored messages, built with the same rules as live ones. */
export function historyItems(messages: Record<string, unknown>[]): ChatItem[] {
  let h = initialChatState();
  for (const msg of messages) {
    if (!isObj(msg)) continue;
    if (msg.type === 'user') {
      const typed = typedUserText(isObj(msg.message) ? msg.message.content : undefined);
      if (typed) {
        h = push(h, { kind: 'user', id: localId('user'), text: typed.text, imageCount: typed.imageCount });
        continue;
      }
    }
    if (msg.type === 'user' || msg.type === 'assistant') {
      h = chatReducer(h, { type: 'event', event: { id: '', type: 'message', message: msg } });
    }
  }
  return h.items;
}

export function topLevelItems(items: ChatItem[]): ChatItem[] {
  return items.filter((i) => !('parentToolUseId' in i) || !i.parentToolUseId);
}

export function childItems(items: ChatItem[], parentId: string): ChatItem[] {
  return items.filter((i) => 'parentToolUseId' in i && i.parentToolUseId === parentId);
}

/** Pending permission prompts (oldest first). */
export function pendingPermissions(items: ChatItem[]) {
  return items.filter((i): i is Extract<ChatItem, { kind: 'permission' }> => i.kind === 'permission' && i.status === 'pending');
}

/** Short one-line summary of a tool call, like Claude Code's "● Bash(npm test)". */
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  const base = (p: string) => p.split(/[\\/]/).pop() || p;
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      return s('description') || s('command');
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return base(s('file_path') || s('notebook_path'));
    case 'Glob':
    case 'Grep':
      return s('pattern');
    case 'WebFetch':
      return s('url');
    case 'WebSearch':
      return s('query');
    case 'Task':
    case 'Agent':
      return s('description') || s('subagent_type');
    case 'TodoWrite':
      return 'Lista de tareas';
    case 'Skill':
      return s('skill');
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string') as string | undefined;
      return first ? first.slice(0, 80) : '';
    }
  }
}

/** Slash-command suggestions for what the user is typing ("/co" -> compact, config, …). */
export function matchCommands(commands: ClaudeSlashCommand[], draft: string): ClaudeSlashCommand[] {
  const m = /^\/(\S*)$/.exec(draft);
  if (!m) return [];
  const q = m[1].toLowerCase();
  return commands
    .filter((c) => c.name.toLowerCase().replace(/^\//, '').startsWith(q))
    .slice(0, 8);
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export const EFFORT_LABELS: Record<ClaudeEffortLevel, string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  xhigh: 'Muy alto',
  max: 'Máximo',
};

/**
 * The model the chat is running: the one picked in the selector, else the one Claude
 * reported (matched by alias or wire id), else the "default" row.
 */
export function activeModelInfo(models: ClaudeModelInfo[], selected: string, reported?: string): ClaudeModelInfo | undefined {
  if (selected) {
    const picked = models.find((m) => m.value === selected);
    if (picked) return picked;
  }
  if (reported) {
    // An alias ("opus") or the real id ("claude-opus-5-5"); prefer the named row over "default"
    const match =
      models.find((m) => m.value === reported) ||
      models.find((m) => m.value !== 'default' && m.resolvedModel === reported) ||
      models.find((m) => m.resolvedModel === reported);
    if (match) return match;
  }
  return models.find((m) => m.value === 'default');
}

/** Model and effort from Claude Code's own settings (read before the chat's first reply). */
export interface ClaudeDefaults {
  model: string | null;
  effortLevel: ClaudeEffortLevel | null;
  /** Per-model effort, keyed by real model id (settings.json "modelSettings") */
  modelEfforts: Record<string, ClaudeEffortLevel>;
  /** CLAUDE_CODE_EFFORT_LEVEL, which wins over everything */
  effortFromEnv: ClaudeEffortLevel | null;
}

/** The effort Claude Code uses for `model` when yanote doesn't set one ('' = the model's own default). */
export function inheritedEffort(defaults: ClaudeDefaults | null | undefined, model: ClaudeModelInfo | undefined): ClaudeEffortLevel | '' {
  if (!defaults || !model) return '';
  const levels = effortLevelsFor(model);
  const key = model.resolvedModel ?? model.value;
  const level = defaults.effortFromEnv || defaults.modelEfforts?.[key] || defaults.effortLevel;
  return level && levels.includes(level) ? level : '';
}

/** Option text for a model row: the "default" row says which model it is. */
export function modelOptionLabel(model: ClaudeModelInfo): string {
  if (model.value !== 'default') return model.displayName;
  const which = (model.description || '').split('·')[0].trim();
  return which ? `Predeterminado · ${which}` : 'Predeterminado';
}

/** Effort levels the model accepts ([] when it has no effort control). */
export function effortLevelsFor(model: ClaudeModelInfo | undefined): ClaudeEffortLevel[] {
  if (!model || model.supportsEffort === false) return [];
  return model.supportedEffortLevels ?? [];
}
