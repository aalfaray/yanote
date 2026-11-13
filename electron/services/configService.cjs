const fs = require('fs');
const path = require('path');

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
function sanitizeOpenTabs(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    if (!t || typeof t.path !== 'string' || !t.path.trim() || seen.has(t.path)) continue;
    seen.add(t.path);
    out.push({ path: t.path, title: typeof t.title === 'string' && t.title ? t.title : path.basename(t.path), isPinned: Boolean(t.isPinned) });
    if (out.length >= MAX_OPEN_TABS) break;
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
        claudeAccounts: Array.isArray(parsed.claudeAccounts) ? parsed.claudeAccounts : [],
        activeClaudeAccount: typeof parsed.activeClaudeAccount === 'string' ? parsed.activeClaudeAccount : 'default',
        darkMode: Boolean(parsed.darkMode),
        opacity: parsed.opacity === undefined ? MAX_OPACITY : clampOpacity(parsed.opacity),
        openTabs: sanitizeOpenTabs(parsed.openTabs),
        activeTabPath: typeof parsed.activeTabPath === 'string' ? parsed.activeTabPath : null,
        welcomeSeen: Boolean(parsed.welcomeSeen),
        recentFiles: sanitizeRecentFiles(parsed.recentFiles),
      };
    }
  } catch (err) {
    // If config file is corrupted, recovery gracefully with defaults
    console.warn('Warning loading config, using defaults:', err.message);
  }

  return {
    notesPath: defaultNotesPath,
    alwaysOnTop: false,
    notifyClaude: true,
    claudeAccounts: [],
    activeClaudeAccount: 'default',
    darkMode: false,
    opacity: MAX_OPACITY,
    openTabs: [],
    activeTabPath: null,
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
    console.error('Error saving config:', err.message);
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
    console.error('Error migrating legacy config:', err.message);
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
