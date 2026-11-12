const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const { getBaseDataDir, loadConfig, saveConfig, clampOpacity, migrateLegacyConfig } = require('./services/configService.cjs');
const fileService = require('./services/fileService.cjs');
const { createSpeechService } = require('./services/speechService.cjs');
const { createTerminalService } = require('./services/terminalService.cjs');
const { savePastedImage } = require('./services/clipboardImageService.cjs');
const { createClaudeChatService } = require('./services/claudeChatService.cjs');

const speechService = createSpeechService();
const terminalService = createTerminalService();
const claudeChatService = createClaudeChatService();

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

  mainWindow.on('closed', () => {
    speechService.stop();
    terminalService.killAll();
    claudeChatService.stopAll();
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
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
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
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

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window:setAlwaysOnTop', (_, flag) => {
  if (mainWindow) {
    isAlwaysOnTop = Boolean(flag);
    mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
    updateConfig({ alwaysOnTop: isAlwaysOnTop });
  }
  return isAlwaysOnTop;
});

ipcMain.handle('window:getAlwaysOnTop', () => {
  return isAlwaysOnTop;
});

// Window transparency: applied live while the slider moves, persisted once it settles
let opacitySaveTimer = null;
ipcMain.handle('window:setOpacity', (_, value) => {
  const opacity = clampOpacity(value);
  if (mainWindow) mainWindow.setOpacity(opacity);
  clearTimeout(opacitySaveTimer);
  opacitySaveTimer = setTimeout(() => updateConfig({ opacity }), 300);
  return opacity;
});

// IPC - File System
ipcMain.handle('fs:getNotesPath', () => {
  return appConfig.notesPath;
});

ipcMain.handle('fs:setNotesPath', async (_, newPath) => {
  if (newPath && fs.existsSync(newPath)) {
    updateConfig({ notesPath: newPath });
    fileService.ensureNotesDir(newPath);
    return { success: true, path: newPath };
  }
  return { success: false, error: 'La ruta no existe' };
});

ipcMain.handle('fs:selectFolder', async () => {
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

ipcMain.handle('fs:openMarkdownFile', async () => {
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

ipcMain.handle('fs:listNotes', () => {
  return fileService.listNotes(appConfig.notesPath);
});

ipcMain.handle('fs:readFile', (_, filePath) => {
  return fileService.readFile(filePath);
});

ipcMain.handle('fs:writeFile', (_, filePath, content) => {
  return fileService.writeFile(filePath, content);
});

ipcMain.handle('fs:deleteFile', (_, filePath) => {
  return fileService.deleteFile(filePath);
});

ipcMain.handle('fs:renameFile', (_, oldPath, newPath) => {
  return fileService.renameFile(oldPath, newPath);
});

ipcMain.handle('fs:getAppConfig', () => {
  return appConfig;
});

ipcMain.handle('fs:saveAppConfig', (_, config) => {
  return updateConfig(config);
});

// IPC - Shell & Explorer
ipcMain.handle('app:revealInExplorer', async (_, filePath) => {
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
ipcMain.handle('tts:speak', (event, request) => {
  const id = request && request.id;
  const sender = event.sender;
  return speechService.speak(request, (ttsEvent) => {
    if (!sender.isDestroyed()) sender.send('tts:event', { id, ...ttsEvent });
  });
});

ipcMain.handle('tts:stop', () => {
  return speechService.stop();
});

// Clipboard image -> temp PNG path, so Ctrl+V in a terminal can hand images to CLIs like Claude Code
ipcMain.handle('clipboard:saveImage', () => {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    return savePastedImage(image.toPNG());
  } catch {
    return null;
  }
});

// IPC - Integrated terminals (PowerShell / CMD)
ipcMain.handle('term:create', (event, options) => {
  const sender = event.sender;
  // No folder from the renderer (or it no longer exists) -> open in the notes folder
  return terminalService.create({ ...options, fallbackCwd: appConfig.notesPath }, (termEvent) => {
    if (!sender.isDestroyed()) sender.send('term:event', termEvent);
  });
});

ipcMain.on('term:write', (_, id, data) => {
  terminalService.write(id, data);
});

ipcMain.on('term:resize', (_, id, cols, rows) => {
  terminalService.resize(id, cols, rows);
});

ipcMain.handle('term:kill', (_, id) => {
  return terminalService.kill(id);
});

// IPC - Claude chat (structured Claude Code session through the Agent SDK)
ipcMain.handle('claude:start', (event, options) => {
  const sender = event.sender;
  return claudeChatService.start({ ...options, fallbackCwd: appConfig.notesPath }, (chatEvent) => {
    if (!sender.isDestroyed()) sender.send('claude:event', chatEvent);
  });
});

ipcMain.handle('claude:send', (_, id, payload) => claudeChatService.sendMessage(id, payload));
ipcMain.handle('claude:respondPermission', (_, id, requestId, decision) =>
  claudeChatService.respondPermission(id, requestId, decision)
);
ipcMain.handle('claude:interrupt', (_, id) => claudeChatService.interrupt(id));
ipcMain.handle('claude:setPermissionMode', (_, id, mode) => claudeChatService.setPermissionMode(id, mode));
ipcMain.handle('claude:setModel', (_, id, model) => claudeChatService.setModel(id, model));
ipcMain.handle('claude:setEffort', (_, id, level) => claudeChatService.setEffort(id, level));
ipcMain.handle('claude:stop', (_, id) => claudeChatService.stop(id));
