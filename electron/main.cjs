const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const { getBaseDataDir, loadConfig, saveConfig, clampOpacity, migrateLegacyConfig } = require('./services/configService.cjs');
const fileService = require('./services/fileService.cjs');
const { createSpeechService } = require('./services/speechService.cjs');
const { createTerminalService } = require('./services/terminalService.cjs');
const { savePastedImage } = require('./services/clipboardImageService.cjs');
const { createClaudeChatService, findClaudeExecutable, findBundledExecutable } = require('./services/claudeChatService.cjs');
const { createClaudeAccountService } = require('./services/claudeAccountService.cjs');
const { withFreshPath } = require('./services/terminalService.cjs');
const { readClaudeDefaults } = require('./services/claudeSettings.cjs');
const { createUpdateService } = require('./services/updateService.cjs');
const { parseOpenTarget } = require('./services/openTargetService.cjs');
const { configureSharedLog } = require('./services/logService.cjs');
const { createSafeIpc } = require('./services/safeIpc.cjs');
const { createEditCommandService } = require('./services/editCommandService.cjs');

// System log (%APPDATA%/yanote/logs/yanote.log): every layer reports its failures here
const logService = configureSharedLog({ dir: app.getPath('logs') });
const mainLog = logService.scoped('main');
process.on('uncaughtException', (err) => mainLog.error('uncaught exception', err));
process.on('unhandledRejection', (reason) => mainLog.error('unhandled promise rejection', reason));
const ipc = createSafeIpc(ipcMain, logService.scoped('main:ipc'));
const editCommandService = createEditCommandService(logService.scoped('editCommandService'));

// Unpackaged runs are `electron . <args>`: the app path is not something to open
const ARG_SKIP = app.isPackaged ? 1 : 2;

// One yanote at a time (they share app-config.json and the updater needs to close them all):
// launching it again — e.g. "Abrir con yanote" in Explorer — hands the folder/file to the open window.
const hasInstanceLock = !app.isPackaged || app.requestSingleInstanceLock();

// Windows shows notifications under this id (the installer registers the same one)
if (process.platform === 'win32') app.setAppUserModelId('com.yanote.app');
if (!hasInstanceLock) app.quit();

const speechService = createSpeechService();
const terminalService = createTerminalService();
// Bundled Claude Code is the fallback when the user has none installed
const claudeChatService = createClaudeChatService({ requireInstalledCli: app.isPackaged });
let updateService = null;

let mainWindow = null;
let isAlwaysOnTop = false;

const dataDir = getBaseDataDir(process.env, process.execPath, app ? app.getPath('userData') : '');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Renamed from BoldNotes: bring the old settings along (only for the default userData location)
if (app && dataDir === app.getPath('userData')) {
  migrateLegacyConfig(dataDir, ['boldnotes', 'BoldNotes'].map((name) => path.join(app.getPath('appData'), name)));
}

const configFilePath = path.join(dataDir, 'app-config.json');
const defaultNotesPath = path.join(dataDir, 'notes');
let appConfig = loadConfig(configFilePath, defaultNotesPath);

function updateConfig(newConfig) {
  appConfig = saveConfig(configFilePath, appConfig, newConfig);
  return appConfig;
}

// Several Claude accounts, each one a Claude Code config folder under the app's data
const claudeAccountService = createClaudeAccountService({
  getConfig: () => appConfig,
  saveConfig: (partial) => updateConfig(partial),
  accountsRoot: path.join(dataDir, 'claude-accounts'),
  getExecutable: () => findClaudeExecutable(withFreshPath({ ...process.env })) || findBundledExecutable(),
});

function createWindow() {
  fileService.ensureNotesDir(appConfig.notesPath);

  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    minWidth: 340,
    minHeight: 400,
    frame: false, // Custom Boldkit Neubrutalist window frame
    alwaysOnTop: appConfig.alwaysOnTop || false,
    opacity: clampOpacity(appConfig.opacity ?? 1),
    backgroundColor: '#FAF8F5',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  isAlwaysOnTop = appConfig.alwaysOnTop || false;

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (process.env.OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => setupUpdates());

  // A file dropped where nothing handles it would replace the app with that file: stay on the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    speechService.stop();
    terminalService.killAll();
    claudeChatService.stopAll();
    mainWindow = null;
  });
}

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let updateTimer = null;

function sendUpdateEvent(evt) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:event', evt);
}

/** Checks GitHub releases shortly after start and every 6 hours. */
function setupUpdates() {
  if (updateService) return;
  const mode = !app.isPackaged ? 'disabled' : process.env.PORTABLE_EXECUTABLE_DIR ? 'portable' : 'auto';
  let autoUpdater = null;
  if (mode === 'auto') {
    try {
      ({ autoUpdater } = require('electron-updater'));
    } catch (err) {
      mainLog.error('electron-updater no disponible', err);
    }
  }
  updateService = createUpdateService({
    mode: mode === 'auto' && !autoUpdater ? 'portable' : mode,
    autoUpdater,
    currentVersion: app.getVersion(),
    openExternal: (url) => shell.openExternal(url),
    emit: sendUpdateEvent,
  });
  if (updateService.mode === 'disabled') return;
  setTimeout(() => updateService.check(), 8000);
  updateTimer = setInterval(() => updateService.check(), UPDATE_CHECK_INTERVAL_MS);
}

app.on('before-quit', () => clearInterval(updateTimer));

// Folder/file yanote was launched with, waiting for the renderer to ask for it
let pendingOpenTarget = parseOpenTarget(process.argv, { skip: ARG_SKIP });

/** A folder becomes the working folder (new notes, terminals and chats start there). */
function applyOpenTarget(target) {
  if (target && target.type === 'folder') {
    updateConfig({ notesPath: target.path });
  }
  return target;
}

app.on('second-instance', (_event, argv, workingDirectory) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  const target = applyOpenTarget(parseOpenTarget(argv, { skip: ARG_SKIP, cwd: workingDirectory }));
  if (target) mainWindow.webContents.send('app:openTarget', target);
});

// Editing commands for the app's own right-click menu (the page has no native menu)
ipc.handle('app:editCommand', (event, command) => editCommandService.run(event.sender, command));

// Renderer failures go to the same system log
ipc.handle('log:write', (_, entry) => logService.writeFromRenderer(entry));
ipc.handle('log:reveal', () => shell.showItemInFolder(logService.filePath));

ipc.handle('app:takeOpenTarget', () => {
  const target = applyOpenTarget(pendingOpenTarget);
  pendingOpenTarget = null;
  return target;
});

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  fileService.ensureNotesDir(appConfig.notesPath);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC - Window controls
ipc.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipc.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  }
  return false;
});

ipc.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipc.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipc.handle('window:setAlwaysOnTop', (_, flag) => {
  if (mainWindow) {
    isAlwaysOnTop = Boolean(flag);
    mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
    updateConfig({ alwaysOnTop: isAlwaysOnTop });
  }
  return isAlwaysOnTop;
});

ipc.handle('window:getAlwaysOnTop', () => {
  return isAlwaysOnTop;
});

// Window transparency: applied live while the slider moves, persisted once it settles
let opacitySaveTimer = null;
ipc.handle('window:setOpacity', (_, value) => {
  const opacity = clampOpacity(value);
  if (mainWindow) mainWindow.setOpacity(opacity);
  clearTimeout(opacitySaveTimer);
  opacitySaveTimer = setTimeout(() => updateConfig({ opacity }), 300);
  return opacity;
});

// IPC - File System
ipc.handle('fs:getNotesPath', () => {
  return appConfig.notesPath;
});

ipc.handle('fs:setNotesPath', async (_, newPath) => {
  if (newPath && fs.existsSync(newPath)) {
    updateConfig({ notesPath: newPath });
    fileService.ensureNotesDir(newPath);
    return { success: true, path: newPath };
  }
  return { success: false, error: 'La ruta no existe' };
});

ipc.handle('fs:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta para notas',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    updateConfig({ notesPath: selected });
    fileService.ensureNotesDir(selected);
    return selected;
  }
  return null;
});

ipc.handle('fs:openMarkdownFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir archivo Markdown',
    defaultPath: appConfig.notesPath,
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const files = [];
  const errors = [];
  for (const filePath of result.filePaths) {
    const name = path.basename(filePath);
    const res = fileService.readFile(filePath);
    if (res.success) files.push({ path: filePath, name, content: res.content });
    else errors.push(`${name}: ${res.error}`);
  }
  return { files, errors };
});

ipc.handle('fs:listNotes', () => {
  return fileService.listNotes(appConfig.notesPath);
});

ipc.handle('fs:readFile', (_, filePath) => {
  return fileService.readFile(filePath);
});

ipc.handle('fs:writeFile', (_, filePath, content) => {
  return fileService.writeFile(filePath, content);
});

ipc.handle('fs:deleteFile', (_, filePath) => {
  return fileService.deleteFile(filePath);
});

ipc.handle('fs:renameFile', (_, oldPath, newPath) => {
  return fileService.renameFile(oldPath, newPath);
});

ipc.handle('fs:getAppConfig', () => {
  return appConfig;
});

ipc.handle('fs:saveAppConfig', (_, config) => {
  return updateConfig(config);
});

// IPC - Shell & Explorer
ipc.handle('app:revealInExplorer', async (_, filePath) => {
  try {
    if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    } else if (appConfig.notesPath && fs.existsSync(appConfig.notesPath)) {
      await shell.openPath(appConfig.notesPath);
      return { success: true };
    }
    return { success: false, error: 'No se encontró la ruta' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC - Text to speech (native System.Speech fallback)
ipc.handle('tts:speak', (event, request) => {
  const id = request && request.id;
  const sender = event.sender;
  return speechService.speak(request, (ttsEvent) => {
    if (!sender.isDestroyed()) sender.send('tts:event', { id, ...ttsEvent });
  });
});

ipc.handle('tts:stop', () => {
  return speechService.stop();
});

// Clipboard image -> temp PNG path, so Ctrl+V in a terminal can hand images to CLIs like Claude Code
ipc.handle('clipboard:saveImage', () => {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    return savePastedImage(image.toPNG());
  } catch (err) {
    mainLog.error('could not save the clipboard image', err);
    return null;
  }
});

// IPC - Integrated terminals (PowerShell / CMD)
ipc.handle('term:create', (event, options) => {
  const sender = event.sender;
  // No folder from the renderer (or it no longer exists) -> open in the notes folder
  return terminalService.create({ ...options, fallbackCwd: appConfig.notesPath }, (termEvent) => {
    if (!sender.isDestroyed()) sender.send('term:event', termEvent);
  });
});

ipc.on('term:write', (_, id, data) => {
  terminalService.write(id, data);
});

ipc.on('term:resize', (_, id, cols, rows) => {
  terminalService.resize(id, cols, rows);
});

ipc.handle('term:kill', (_, id) => {
  return terminalService.kill(id);
});

// IPC - Claude chat (structured Claude Code session through the Agent SDK)
ipc.handle('claude:start', (event, options) => {
  const sender = event.sender;
  const configDir = claudeAccountService.configDirFor(options && options.accountId);
  return claudeChatService.start({ ...options, configDir, fallbackCwd: appConfig.notesPath }, (chatEvent) => {
    if (!sender.isDestroyed()) sender.send('claude:event', chatEvent);
  });
});

ipc.handle('claude:send', (_, id, payload) => claudeChatService.sendMessage(id, payload));
ipc.handle('claude:respondPermission', (_, id, requestId, decision) =>
  claudeChatService.respondPermission(id, requestId, decision)
);
ipc.handle('claude:interrupt', (_, id) => claudeChatService.interrupt(id));
ipc.handle('claude:setPermissionMode', (_, id, mode) => claudeChatService.setPermissionMode(id, mode));
ipc.handle('claude:setModel', (_, id, model) => claudeChatService.setModel(id, model));
ipc.handle('claude:setEffort', (_, id, level) => claudeChatService.setEffort(id, level));
ipc.handle('claude:stop', (_, id) => claudeChatService.stop(id));
ipc.handle('claude:usage', (_, id) => claudeChatService.usage(id));
ipc.handle('claude:history', (_, sessionId, accountId) => claudeAccountService.readHistory(sessionId, accountId));
// Model / effort Claude Code will use, so the chat can show them before the first reply
ipc.handle('claude:defaults', (_, accountId, cwd) =>
  readClaudeDefaults({ configDir: claudeAccountService.configDirFor(accountId), cwd: cwd || appConfig.notesPath })
);

// IPC - Claude accounts
ipc.handle('claudeAccounts:list', () => claudeAccountService.list());
ipc.handle('claudeAccounts:status', (_, id) => claudeAccountService.status(id));
ipc.handle('claudeAccounts:logout', (_, id) => claudeAccountService.logout(id));
ipc.handle('claudeAccounts:add', (_, name) => claudeAccountService.add(name));
ipc.handle('claudeAccounts:rename', (_, id, name) => claudeAccountService.rename(id, name));
ipc.handle('claudeAccounts:remove', (_, id) => claudeAccountService.remove(id));
ipc.handle('claudeAccounts:setActive', (_, id) => claudeAccountService.setActive(id));
ipc.handle('claudeAccounts:loginCommand', (_, id) => claudeAccountService.loginCommand(id));
ipc.handle('claudeAccounts:copySession', (_, sessionId, fromId, toId) => claudeAccountService.copySession(sessionId, fromId, toId));

// IPC - Windows notifications (e.g. a Claude chat finished); clicking one brings that tab back
const liveNotifications = new Set(); // keep references: a collected notification loses its click handler
ipc.handle('app:notify', (_, { title, body, tabId, skipIfFocused } = {}) => {
  if (!Notification.isSupported() || typeof title !== 'string') return false;
  // The renderer can't tell reliably (a minimized window may still report focus): ask the window
  const looking = mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused();
  if (skipIfFocused && looking) return false;
  const note = new Notification({
    title: title.slice(0, 120),
    body: typeof body === 'string' ? body.slice(0, 300) : '',
    icon: path.join(__dirname, '../build/icon.png'),
  });
  liveNotifications.add(note);
  const forget = () => liveNotifications.delete(note);
  note.on('click', () => {
    forget();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (tabId) mainWindow.webContents.send('app:focusTab', tabId);
  });
  note.on('close', forget);
  note.on('failed', forget);
  note.show();
  return true;
});

// IPC - App version & updates
ipc.handle('app:getVersion', () => app.getVersion());
ipc.handle('update:getMode', () => (updateService ? updateService.mode : app.isPackaged ? 'auto' : 'disabled'));
ipc.handle('update:check', () => (updateService ? updateService.check({ manual: true }) : { success: false }));
ipc.handle('update:accept', () => (updateService ? updateService.accept() : { success: false }));
ipc.handle('update:install', () => (updateService ? updateService.install() : false));
