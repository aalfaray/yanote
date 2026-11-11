export interface NoteFile {
  name: string;
  path: string;
  updatedAt: string;
  size: number;
}

export interface GitStatus {
  success: boolean;
  currentBranch?: string;
  modified?: string[];
  not_added?: string[];
  staged?: string[];
  ahead?: number;
  behind?: number;
  tracking?: string;
  hasChanges?: boolean;
  remotes?: Array<{ name: string; refs: { fetch: string; push: string } }>;
  error?: string;
}

export interface GitCommitItem {
  hash: string;
  date: string;
  message: string;
  author_name: string;
}

export interface AppConfig {
  notesPath: string;
  alwaysOnTop: boolean;
  githubRepo: string;
  githubBranch: string;
  githubToken: string;
  autoSyncOnSave: boolean;
  openTabs?: TabItem[];
  activeTabId?: string | null;
}

export interface TabItem {
  id: string;
  title: string;
  path: string | null; // null if scratchpad
  content: string;
  isDirty?: boolean;
}

export interface ElectronAPI {
  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<boolean>;
  getAlwaysOnTop: () => Promise<boolean>;

  // File system
  getNotesPath: () => Promise<string>;
  setNotesPath: (newPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  selectFolder: () => Promise<string | null>;
  listNotes: () => Promise<{ success: boolean; notes: NoteFile[]; error?: string }>;
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  renameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>;
  getAppConfig: () => Promise<AppConfig>;
  saveAppConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;

  // Git & GitHub
  gitStatus: () => Promise<GitStatus>;
  gitCommit: (message: string) => Promise<{ success: boolean; error?: string }>;
  gitPush: () => Promise<{ success: boolean; error?: string }>;
  gitPull: () => Promise<{ success: boolean; error?: string }>;
  gitSync: (commitMessage?: string) => Promise<{ success: boolean; synced?: boolean; message?: string; error?: string }>;
  gitHistory: (filePath?: string) => Promise<{ success: boolean; all: GitCommitItem[]; error?: string }>;
  gitFileAtCommit: (filePath: string, commitHash: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  gitSetRemote: (remoteUrl: string, branch?: string) => Promise<{ success: boolean; error?: string }>;
  gitInit: () => Promise<{ success: boolean; isRepo?: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
