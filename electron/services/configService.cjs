const fs = require('fs');
const path = require('path');

function getBaseDataDir(env = process.env, execPath = process.execPath, defaultUserData = '') {
  if (env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(env.PORTABLE_EXECUTABLE_DIR, 'data');
  }
  const portableFlag = path.join(path.dirname(execPath), 'portable-data');
  if (fs.existsSync(portableFlag)) {
    return portableFlag;
  }
  return defaultUserData || path.join(process.cwd(), '.boldnotes-data');
}

function loadConfig(configFilePath, defaultNotesPath) {
  try {
    if (fs.existsSync(configFilePath)) {
      const raw = fs.readFileSync(configFilePath, 'utf8');
      if (!raw || !raw.trim()) {
        throw new Error('Config file is empty');
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Config file is not an object');
      }
      return {
        notesPath: parsed.notesPath || defaultNotesPath,
        alwaysOnTop: Boolean(parsed.alwaysOnTop),
        darkMode: Boolean(parsed.darkMode),
        githubRepo: parsed.githubRepo || '',
        githubBranch: parsed.githubBranch || 'main',
        githubToken: parsed.githubToken || '',
        autoSyncOnSave: Boolean(parsed.autoSyncOnSave),
        openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [],
        activeTabId: parsed.activeTabId || null,
      };
    }
  } catch (err) {
    // If config file is corrupted, recovery gracefully with defaults
    console.warn('Warning loading config, using defaults:', err.message);
  }

  return {
    notesPath: defaultNotesPath,
    alwaysOnTop: false,
    darkMode: false,
    githubRepo: '',
    githubBranch: 'main',
    githubToken: '',
    autoSyncOnSave: false,
    openTabs: [],
    activeTabId: null,
  };
}

function saveConfig(configFilePath, currentConfig, newConfig) {
  try {
    if (!newConfig || typeof newConfig !== 'object') {
      throw new Error('Invalid config object provided');
    }
    const merged = { ...currentConfig, ...newConfig };
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

module.exports = {
  getBaseDataDir,
  loadConfig,
  saveConfig,
};
