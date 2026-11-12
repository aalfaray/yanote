export interface NoteFile {
  name: string;
  path: string;
  updatedAt: string;
  size: number;
}

export interface AppConfig {
  notesPath: string;
  alwaysOnTop: boolean;
  darkMode?: boolean;
  /** Window opacity 0.3–1 */
  opacity?: number;
  openTabs?: TabItem[];
  activeTabId?: string | null;
  /** History of opened files, newest first */
  recentFiles?: RecentFile[];
}

export interface ExportResult {
  success: boolean;
  path?: string;
  /** The user closed the "Save as" dialog */
  canceled?: boolean;
  error?: string;
}

export interface RecentFile {
  path: string;
  name: string;
  /** epoch ms of the last time it was opened */
  openedAt: number;
}

export interface TabItem {
  id: string;
  title: string;
  path: string | null; // null if scratchpad
  content: string;
  isDirty?: boolean;
  isPinned?: boolean;
  /** 'markdown' (default), 'terminal' or 'claude' (chat with Claude Code) */
  kind?: TabKind;
  /** Shell used when kind === 'terminal' */
  shell?: TerminalShell;
  /** Starting folder of a terminal tab (folder of the note that was active when it was opened) */
  cwd?: string;
  /** Command typed into a new terminal right after it starts (e.g. Claude sign-in) */
  initialCommand?: string;
  /** Claude Code session of a chat tab, resumed when the app reopens */
  sessionId?: string;
  /** Agent behind a chat tab (kind === 'claude'); Claude when absent */
  provider?: ChatProvider;
}

export type TabKind = 'markdown' | 'terminal' | 'claude';

export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions';

export interface ClaudeImageInput {
  /** base64 without the data: prefix */
  data: string;
  mediaType: string;
}

export interface ClaudeSlashCommand {
  name: string;
  description: string;
  argumentHint?: string;
}

/** A permission mode the agent offers (Antigravity reports its own list) */
export interface ChatModeInfo {
  id: string;
  name: string;
  description?: string;
}

/** Which agent a chat tab talks to */
export type ChatProvider = 'claude' | 'antigravity';

export type ClaudeEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeModelInfo {
  value: string;
  /** Wire id an alias resolves to (e.g. 'opus' -> 'claude-opus-5-5') */
  resolvedModel?: string;
  displayName: string;
  description?: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ClaudeEffortLevel[];
}

export interface ClaudePermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
  title?: string;
  blockedPath?: string;
  decisionReason?: string;
  canAlwaysAllow?: boolean;
}

export type ClaudeEvent =
  | { id: string; type: 'message'; message: Record<string, unknown> }
  | ({ id: string; type: 'permission' } & ClaudePermissionRequest)
  | { id: string; type: 'permission_cancelled'; requestId: string }
  | { id: string; type: 'capabilities'; commands: ClaudeSlashCommand[]; models: ClaudeModelInfo[]; modes?: ChatModeInfo[] }
  /** A user message replayed while a resumed session loads (Antigravity) */
  | { id: string; type: 'user_message'; text: string }
  | { id: string; type: 'applied_settings'; model: string | null; effort: ClaudeEffortLevel | null }
  | { id: string; type: 'stderr'; data: string }
  | { id: string; type: 'error'; error: string }
  | { id: string; type: 'exit' };

export interface ClaudePermissionDecision {
  behavior: 'allow' | 'deny';
  /** Also remember the CLI's suggested rule for the rest of the session */
  always?: boolean;
  updatedInput?: Record<string, unknown>;
  message?: string;
}

type ClaudeResult = Promise<{ success: boolean; error?: string }>;
export type TerminalShell = 'powershell' | 'cmd';

export type TermEvent =
  | { id: string; type: 'data'; data: string }
  | { id: string; type: 'exit'; exitCode: number };

export interface ElectronAPI {
  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<boolean>;
  getAlwaysOnTop: () => Promise<boolean>;
  /** Window opacity 0.3–1 (clamped by the main process); returns the applied value */
  setOpacity?: (opacity: number) => Promise<number>;

  // File system
  getNotesPath: () => Promise<string>;
  setNotesPath: (newPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  selectFolder: () => Promise<string | null>;
  /** Native file picker (multi-select) for .md files; null when the user cancels */
  openMarkdownFile?: () => Promise<{
    files: { path: string; name: string; content: string }[];
    /** One "name: reason" entry per file that couldn't be read */
    errors: string[];
  } | null>;
  listNotes: () => Promise<{ success: boolean; notes: NoteFile[]; error?: string }>;
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  /** Renders a full HTML document to a PDF chosen through "Save as" */
  exportPdf?: (options: { html: string; defaultName: string; defaultDir?: string }) => Promise<ExportResult>;
  /** Saves text through "Save as" (Markdown unless ext says otherwise) */
  saveTextAs?: (options: { content: string; defaultName: string; ext?: string; filterName?: string; defaultDir?: string }) => Promise<ExportResult>;
  /** Opens a file with the system's default app */
  openPath?: (filePath: string) => Promise<string>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>;
  getAppConfig: () => Promise<AppConfig>;
  saveAppConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
  revealInExplorer: (filePath?: string) => Promise<{ success: boolean; error?: string }>;


  // Text to speech (native fallback)
  ttsSpeak?: (request: TtsSpeakRequest) => Promise<{ success: boolean; error?: string }>;
  ttsStop?: () => Promise<boolean>;
  onTtsEvent?: (callback: (event: TtsEvent) => void) => () => void;

  // Integrated terminals
  termCreate?: (options: { id: string; shell: TerminalShell; cols: number; rows: number; cwd?: string; initialCommand?: string }) => Promise<{ success: boolean; reused?: boolean; error?: string }>;
  termWrite?: (id: string, data: string) => void;
  termResize?: (id: string, cols: number, rows: number) => void;
  termKill?: (id: string) => Promise<boolean>;
  onTermEvent?: (callback: (event: TermEvent) => void) => () => void;
  // App version & updates
  getAppVersion?: () => Promise<string>;
  getUpdateMode?: () => Promise<UpdateMode>;
  /** Manual check; the result arrives as update events */
  checkForUpdates?: () => Promise<{ success: boolean; mode?: UpdateMode; error?: string }>;
  /** Installed: start the download. Portable: open the download page. */
  acceptUpdate?: () => Promise<{ success: boolean; opened?: boolean; error?: string }>;
  /** Restart into the downloaded version */
  installUpdate?: () => Promise<boolean>;
  onUpdateEvent?: (callback: (event: UpdateEvent) => void) => () => void;

  // Claude chat sessions (Agent SDK)
  claudeStart?: (options: { id: string; cwd?: string; resume?: string; permissionMode?: ClaudePermissionMode; model?: string }) => Promise<{ success: boolean; reused?: boolean; error?: string; executable?: string; source?: 'user' | 'bundled' | 'sdk' }>;
  claudeSend?: (id: string, payload: { text: string; images?: ClaudeImageInput[] }) => ClaudeResult;
  claudeRespondPermission?: (id: string, requestId: string, decision: ClaudePermissionDecision) => Promise<boolean>;
  claudeInterrupt?: (id: string) => ClaudeResult;
  claudeSetPermissionMode?: (id: string, mode: ClaudePermissionMode) => ClaudeResult;
  claudeSetModel?: (id: string, model: string | null) => ClaudeResult;
  /** null returns to the model's default effort */
  claudeSetEffort?: (id: string, level: ClaudeEffortLevel | null) => ClaudeResult;
  claudeStop?: (id: string) => Promise<boolean>;
  /** Messages of a past Claude Code session (user/assistant, chronological) */
  claudeHistory?: (sessionId: string) => Promise<{ success: boolean; messages?: Record<string, unknown>[]; error?: string }>;
  onClaudeEvent?: (callback: (event: ClaudeEvent) => void) => () => void;

  // Antigravity CLI (Gemini) chat over ACP — same events as Claude
  agyStart?: (options: { id: string; cwd?: string; resume?: string; permissionMode?: string; model?: string }) => Promise<{ success: boolean; reused?: boolean; error?: string; executable?: string; source?: 'user' | 'bundled' | 'sdk' }>;
  agySend?: (id: string, payload: { text: string; images?: ClaudeImageInput[] }) => ClaudeResult;
  agyRespondPermission?: (id: string, requestId: string, decision: ClaudePermissionDecision) => Promise<boolean>;
  agyInterrupt?: (id: string) => ClaudeResult;
  agySetPermissionMode?: (id: string, mode: string) => ClaudeResult;
  agySetModel?: (id: string, model: string | null) => ClaudeResult;
  agySetEffort?: (id: string, level: ClaudeEffortLevel | null) => ClaudeResult;
  agyStop?: (id: string) => Promise<boolean>;
  onAgyEvent?: (callback: (event: ClaudeEvent) => void) => () => void;
  /** Saves the clipboard image as a temp PNG and returns its path; null when there is no image */
  saveClipboardImage?: () => Promise<string | null>;
}

export type UpdateMode = 'auto' | 'portable' | 'disabled';

export type UpdateEvent =
  | { type: 'available'; mode: UpdateMode; version: string; currentVersion: string; notes: string; url: string }
  | { type: 'none'; currentVersion: string }
  | { type: 'progress'; percent: number; transferred?: number; total?: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; error: string };

export interface TtsSpeakRequest {
  id: number;
  segments: string[];
  /** Absolute index of the first segment, echoed back in progress events. */
  start: number;
  rate: number;
}

export type TtsEvent =
  | { id: number; type: 'segment'; index: number }
  | { id: number; type: 'end' }
  | { id: number; type: 'error'; message: string };

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
