const fs = require('fs');
const path = require('path');
const { getLogger } = require('./logService.cjs');

const log = getLogger('configService');

const MIN_OPACITY = 0.3;
const MAX_OPACITY = 1;

/** Window opacity is kept in [0.3, 1] so the app can never become invisible. */
function clampOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MAX_OPACITY;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, Math.round(n * 100) / 100));
}

const LEGACY_KEYS = ['githubRepo', 'githubBranch', 'githubToken', 'autoSyncOnSave'];

function getBaseDataDir(env = process.env, execPath = process.execPath, defaultUserData = '') {
  if (env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(env.PORTABLE_EXECUTABLE_DIR, 'data');
  }
  const portableFlag = path.join(path.dirname(execPath), 'portable-data');
  if (fs.existsSync(portableFlag)) {
    return portableFlag;
  }
  return defaultUserData || path.join(process.cwd(), '.yanote-data');
}

const MAX_RECENT_FILES = 30;

/** History of opened files: keep only well-formed entries, newest first, capped. */
function sanitizeRecentFiles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f) => f && typeof f.path === 'string' && f.path && typeof f.name === 'string' && typeof f.openedAt === 'number')
    .slice(0, MAX_RECENT_FILES);
}

const MAX_OPEN_TABS = 50;

/** Notes left open last time (files only), so they reopen on the next start. */
const MAX_SCRATCH_CHARS = 500000;
const str = (v, max = 4096) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
const SHELLS = new Set(['powershell', 'cmd']);

/** Tabs left open last time: notes, unsaved notes, terminals and Claude chats. */
function sanitizeOpenTabs(list) {
  if (!Array.isArray(list)) return [];
  const seenPaths = new Set();
  const out = [];
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const title = str(t.title, 200);
    const kind = t.kind || 'note';
    if (kind === 'note') {
      if (typeof t.path !== 'string' || !t.path.trim() || seenPaths.has(t.path)) continue;
      seenPaths.add(t.path);
      out.push({ kind: 'note', path: t.path, title: title || path.basename(t.path), isPinned: Boolean(t.isPinned) });
    } else if (kind === 'scratch') {
      if (typeof t.content !== 'string') continue;
      out.push({ kind: 'scratch', title: title || 'scratch.md', content: t.content.slice(0, MAX_SCRATCH_CHARS), isPinned: Boolean(t.isPinned) });
    } else if (kind === 'terminal') {
      out.push({ kind: 'terminal', title: title || 'Terminal', shell: SHELLS.has(t.shell) ? t.shell : 'powershell', ...(str(t.cwd) ? { cwd: str(t.cwd) } : {}) });
    } else if (kind === 'claude') {
      const pins = Array.isArray(t.pins)
        ? t.pins.filter((p) => p && typeof p.id === 'string' && typeof p.text === 'string').slice(0, 50).map((p) => ({ id: p.id.slice(0, 80), text: p.text.slice(0, 20000) }))
        : [];
      out.push({
        kind: 'claude',
        title: title || 'Claude',
        ...(str(t.cwd) ? { cwd: str(t.cwd) } : {}),
        ...(typeof t.sessionId === 'string' && /^[\w-]{1,100}$/.test(t.sessionId) ? { sessionId: t.sessionId } : {}),
        ...(typeof t.accountId === 'string' && /^[\w-]{1,64}$/.test(t.accountId) ? { accountId: t.accountId } : {}),
        ...(pins.length ? { pins } : {}),
      });
    } else {
      continue;
    }
    if (out.length >= MAX_OPEN_TABS) break;
  }
  return out;
}

const MAX_IDEAS = 200;

/** Ideas saved from the right-click menu: text + where it came from. */
function sanitizeIdeas(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const i of list) {
    if (!i || typeof i.id !== 'string' || typeof i.text !== 'string' || !i.text.trim()) continue;
    out.push({
      id: i.id.slice(0, 80),
      text: i.text.slice(0, 20000),
      createdAt: Number.isFinite(i.createdAt) ? i.createdAt : 0,
      ...(typeof i.source === 'string' && i.source ? { source: i.source.slice(0, 200) } : {}),
      ...(typeof i.cwd === 'string' && i.cwd ? { cwd: i.cwd } : {}),
    });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

function loadConfig(configFilePath, defaultNotesPath) {
  try {
    if (fs.existsSync(configFilePath)) {
      const raw = fs.readFileSync(configFilePath, 'utf8');
      if (!raw || !raw.trim()) {
        throw new Error('El archivo de configuración está vacío');
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('El archivo de configuración no es un objeto');
      }
      return {
        notesPath: parsed.notesPath || defaultNotesPath,
        alwaysOnTop: Boolean(parsed.alwaysOnTop),
        notifyClaude: parsed.notifyClaude !== false,
        ideas: sanitizeIdeas(parsed.ideas),
        claudeAccounts: Array.isArray(parsed.claudeAccounts) ? parsed.claudeAccounts : [],
        activeClaudeAccount: typeof parsed.activeClaudeAccount === 'string' ? parsed.activeClaudeAccount : 'default',
        darkMode: Boolean(parsed.darkMode),
        opacity: parsed.opacity === undefined ? MAX_OPACITY : clampOpacity(parsed.opacity),
        openTabs: sanitizeOpenTabs(parsed.openTabs),
        activeTabPath: typeof parsed.activeTabPath === 'string' ? parsed.activeTabPath : null,
        activeTabIndex: Number.isInteger(parsed.activeTabIndex) && parsed.activeTabIndex >= 0 ? parsed.activeTabIndex : null,
        welcomeSeen: Boolean(parsed.welcomeSeen),
        recentFiles: sanitizeRecentFiles(parsed.recentFiles),
      };
    }
  } catch (err) {
    // If config file is corrupted, recovery gracefully with defaults
    log.warn('config unreadable, using defaults', err, { configFilePath });
  }

  return {
    notesPath: defaultNotesPath,
    alwaysOnTop: false,
    notifyClaude: true,
    ideas: [],
    claudeAccounts: [],
    activeClaudeAccount: 'default',
    darkMode: false,
    opacity: MAX_OPACITY,
    openTabs: [],
    activeTabPath: null,
    activeTabIndex: null,
    welcomeSeen: false,
    recentFiles: [],
  };
}

function saveConfig(configFilePath, currentConfig, newConfig) {
  try {
    if (!newConfig || typeof newConfig !== 'object') {
      throw new Error('Objeto de configuración no válido');
    }
    const merged = { ...currentConfig, ...newConfig };
    if (merged.opacity !== undefined) merged.opacity = clampOpacity(merged.opacity);
    if (merged.recentFiles !== undefined) merged.recentFiles = sanitizeRecentFiles(merged.recentFiles);
    if (merged.openTabs !== undefined) merged.openTabs = sanitizeOpenTabs(merged.openTabs);
    if (merged.ideas !== undefined) merged.ideas = sanitizeIdeas(merged.ideas);
    delete merged.activeTabId; // replaced by activeTabPath
    // Git/GitHub support was removed: never persist its legacy keys (incl. tokens)
    for (const key of LEGACY_KEYS) delete merged[key];
    const dir = path.dirname(configFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configFilePath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err) {
    log.error('saving config failed', err, { configFilePath });
    return currentConfig;
  }
}

/**
 * The app was renamed (BoldNotes -> yanote), which moves Electron's userData folder.
 * On the first run under the new name, copy the old app-config.json so the notes
 * folder, recent files and preferences carry over. Never overwrites an existing config.
 * Returns the folder it migrated from, or null.
 */
function migrateLegacyConfig(dataDir, legacyDirs) {
  try {
    const target = path.join(dataDir, 'app-config.json');
    if (fs.existsSync(target)) return null;
    for (const dir of legacyDirs) {
      if (!dir || path.resolve(dir) === path.resolve(dataDir)) continue;
      const source = path.join(dir, 'app-config.json');
      if (fs.existsSync(source)) {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.copyFileSync(source, target);
        return dir;
      }
    }
  } catch (err) {
    log.error('migrating legacy config failed', err, { dataDir });
  }
  return null;
}

module.exports = {
  getBaseDataDir,
  migrateLegacyConfig,
  loadConfig,
  saveConfig,
  clampOpacity,
  MIN_OPACITY,
};
