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
  /** Notes left open last time; they reopen on the next start */
  openTabs?: SavedTab[];
  activeTabPath?: string | null;
  /** Extra Claude accounts and the one new chats use */
  claudeAccounts?: { id: string; name: string; configDir: string }[];
  activeClaudeAccount?: string;
  /** Windows notification when a Claude chat finishes or waits for you (default on) */
  notifyClaude?: boolean;
  /** The welcome note is shown only on the very first start */
  welcomeSeen?: boolean;
  /** History of opened files, newest first */
  recentFiles?: RecentFile[];
}

export interface SavedTab {
  path: string;
  title: string;
  isPinned?: boolean;
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
  /** Claude account a chat tab uses (kind === 'claude') */
  accountId?: string;
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
  | { id: string; type: 'capabilities'; commands: ClaudeSlashCommand[]; models: ClaudeModelInfo[] }
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
  /** `skipIfFocused`: don't show it if the yanote window has focus (you're already looking at that chat) */
  notify?: (payload: { title: string; body?: string; tabId?: string; skipIfFocused?: boolean }) => Promise<boolean>;
  onFocusTab?: (callback: (tabId: string) => void) => () => void;
  /** Disk path of a dropped File, or null when it has none */
  getPathForFile?: (file: File) => string | null;
  // "Abrir con yanote" (Explorer context menu / command line)
  takeOpenTarget?: () => Promise<OpenTarget | null>;
  onOpenTarget?: (callback: (target: OpenTarget) => void) => () => void;

  // Claude chat sessions (Agent SDK)
  claudeStart?: (options: { id: string; cwd?: string; resume?: string; permissionMode?: ClaudePermissionMode; model?: string; accountId?: string }) => Promise<{ success: boolean; reused?: boolean; error?: string; executable?: string; source?: 'user' | 'bundled' | 'sdk' }>;
  claudeSend?: (id: string, payload: { text: string; images?: ClaudeImageInput[] }) => ClaudeResult;
  claudeRespondPermission?: (id: string, requestId: string, decision: ClaudePermissionDecision) => Promise<boolean>;
  claudeInterrupt?: (id: string) => ClaudeResult;
  claudeSetPermissionMode?: (id: string, mode: ClaudePermissionMode) => ClaudeResult;
  claudeSetModel?: (id: string, model: string | null) => ClaudeResult;
  /** null returns to the model's default effort */
  claudeSetEffort?: (id: string, level: ClaudeEffortLevel | null) => ClaudeResult;
  claudeStop?: (id: string) => Promise<boolean>;
  /** Plan usage (5-hour / weekly windows, like /usage) through a live chat session */
  claudeUsage?: (id?: string) => Promise<ClaudeUsage>;
  /** Model and effort from Claude Code's settings for that account/folder */
  claudeDefaults?: (accountId?: string, cwd?: string) => Promise<import('../lib/claudeChat').ClaudeDefaults>;
  /** Several Claude accounts (each one its own Claude Code sign-in) */
  claudeAccounts?: {
    list: () => Promise<{ accounts: ClaudeAccount[]; activeId: string }>;
    status: (id: string) => Promise<ClaudeAccountStatus>;
    add: (name?: string) => Promise<ClaudeAccount>;
    rename: (id: string, name: string) => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
    setActive: (id: string) => Promise<boolean>;
    /** PowerShell line running Claude Code's own `auth login` for that account */
    loginCommand: (id: string) => Promise<string | null>;
    /** Copies a conversation so another account can resume it */
    copySession: (sessionId: string, fromId: string, toId: string) => Promise<{ success: boolean; copied?: boolean; error?: string }>;
  };
  onClaudeEvent?: (callback: (event: ClaudeEvent) => void) => () => void;
  /** Saves the clipboard image as a temp PNG and returns its path; null when there is no image */
  saveClipboardImage?: () => Promise<string | null>;
}

/** One plan window from /usage: percent used (0-100) and when it resets (ISO) */
export interface ClaudeUsageWindow {
  percent: number;
  resetsAt: string | null;
}

export interface ClaudeUsage {
  success: boolean;
  error?: string;
  /** false for API keys / providers without plan limits */
  available?: boolean;
  plan?: string | null;
  fiveHour?: ClaudeUsageWindow | null;
  weekly?: ClaudeUsageWindow | null;
}

export interface ClaudeAccount {
  id: string;
  name: string;
  /** null = Claude Code's normal folder */
  configDir: string | null;
  isDefault: boolean;
}

export interface ClaudeAccountStatus {
  success: boolean;
  error?: string;
  loggedIn?: boolean;
  email?: string | null;
  plan?: string | null;
  method?: string | null;
}

export type UpdateMode = 'auto' | 'portable' | 'disabled';

/** What "Abrir con yanote" asked to open */
export interface OpenTarget {
  type: 'folder' | 'file';
  path: string;
}

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
