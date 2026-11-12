import type { ChatProvider, ClaudeEffortLevel, ClaudeEvent, ClaudeImageInput, ClaudePermissionDecision, ElectronAPI } from '../types/electron';

type Result = Promise<{ success: boolean; error?: string }>;

/**
 * What a chat tab needs from its agent. Claude (Agent SDK) and Antigravity (ACP) both speak
 * the same event shapes, so one chat view serves both.
 */
export interface ChatBackend {
  provider: ChatProvider;
  /** Name shown to the user */
  label: string;
  /** Product it runs on (for the exported transcript) */
  source: string;
  /** Command that signs in, typed into a terminal tab */
  loginCommand: string;
  start: (options: { id: string; cwd?: string; resume?: string; permissionMode?: string; model?: string }) => Promise<{ success: boolean; error?: string; executable?: string }>;
  send: (id: string, payload: { text: string; images?: ClaudeImageInput[] }) => Result;
  respondPermission: (id: string, requestId: string, decision: ClaudePermissionDecision) => Promise<boolean> | undefined;
  interrupt: (id: string) => Result | undefined;
  setPermissionMode: (id: string, mode: string) => Result | undefined;
  setModel: (id: string, model: string | null) => Result | undefined;
  setEffort: (id: string, level: ClaudeEffortLevel | null) => Result | undefined;
  stop: (id: string) => Promise<boolean> | undefined;
  onEvent: (callback: (event: ClaudeEvent) => void) => (() => void) | undefined;
  /** Past transcript to show when reopening (Antigravity replays it itself on load) */
  history?: (sessionId: string) => Promise<{ success: boolean; messages?: Record<string, unknown>[]; error?: string }>;
}

export const PROVIDER_LABELS: Record<ChatProvider, string> = { claude: 'Claude', antigravity: 'Antigravity' };

/** The backend for a provider, or null outside Electron / when the build lacks it. */
export function getChatBackend(api: ElectronAPI | undefined, provider: ChatProvider = 'claude'): ChatBackend | null {
  if (!api) return null;
  if (provider === 'antigravity') {
    if (!api.agyStart || !api.agySend) return null;
    return {
      provider,
      label: 'Antigravity',
      source: 'Antigravity CLI',
      loginCommand: 'agy',
      start: (o) => api.agyStart!(o),
      send: (id, p) => api.agySend!(id, p),
      respondPermission: (id, r, d) => api.agyRespondPermission?.(id, r, d),
      interrupt: (id) => api.agyInterrupt?.(id),
      setPermissionMode: (id, m) => api.agySetPermissionMode?.(id, m),
      setModel: (id, m) => api.agySetModel?.(id, m),
      setEffort: (id, l) => api.agySetEffort?.(id, l),
      stop: (id) => api.agyStop?.(id),
      onEvent: (cb) => api.onAgyEvent?.(cb),
    };
  }
  if (!api.claudeStart || !api.claudeSend) return null;
  return {
    provider: 'claude',
    label: 'Claude',
    source: 'Claude Code',
    loginCommand: 'claude auth login',
    start: (o) => api.claudeStart!(o as Parameters<NonNullable<ElectronAPI['claudeStart']>>[0]),
    send: (id, p) => api.claudeSend!(id, p),
    respondPermission: (id, r, d) => api.claudeRespondPermission?.(id, r, d),
    interrupt: (id) => api.claudeInterrupt?.(id),
    setPermissionMode: (id, m) => api.claudeSetPermissionMode?.(id, m as never),
    setModel: (id, m) => api.claudeSetModel?.(id, m),
    setEffort: (id, l) => api.claudeSetEffort?.(id, l),
    stop: (id) => api.claudeStop?.(id),
    onEvent: (cb) => api.onClaudeEvent?.(cb),
    history: api.claudeHistory ? (s) => api.claudeHistory!(s) : undefined,
  };
}
