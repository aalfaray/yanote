const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { getBaseDataDir, loadConfig, saveConfig } = require('./services/configService.cjs');
const fileService = require('./services/fileService.cjs');
const gitService = require('./services/gitService.cjs');

let mainWindow = null;
let isAlwaysOnTop = false;

const dataDir = getBaseDataDir(process.env, process.execPath, app ? app.getPath('userData') : '');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
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
    minWidth: 420,
    minHeight: 480,
    frame: false, // Custom Boldkit Neubrutalist window frame
    alwaysOnTop: appConfig.alwaysOnTop || false,
    backgroundColor: '#FAF8F5',
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
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  fileService.ensureNotesDir(appConfig.notesPath);
  await gitService.initGit(appConfig.notesPath);
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

// IPC - File System
ipcMain.handle('fs:getNotesPath', () => {
  return appConfig.notesPath;
});

ipcMain.handle('fs:setNotesPath', async (_, newPath) => {
  if (newPath && fs.existsSync(newPath)) {
    updateConfig({ notesPath: newPath });
    fileService.ensureNotesDir(newPath);
    await gitService.initGit(newPath);
    return { success: true, path: newPath };
  }
  return { success: false, error: 'Path does not exist' };
});

ipcMain.handle('fs:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta para notas y repositorio Git',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    updateConfig({ notesPath: selected });
    fileService.ensureNotesDir(selected);
    await gitService.initGit(selected);
    return selected;
  }
  return null;
});

ipcMain.handle('fs:listNotes', () => {
  return fileService.listNotes(appConfig.notesPath);
});

ipcMain.handle('fs:readFile', (_, filePath) => {
  return fileService.readFile(filePath);
});

ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  const writeRes = fileService.writeFile(filePath, content);
  if (!writeRes.success) return writeRes;

  if (appConfig.autoSyncOnSave) {
    try {
      const filename = path.basename(filePath);
      await gitService.commitChanges(appConfig.notesPath, `Auto-save: ${filename} at ${new Date().toLocaleTimeString()}`);
      if (appConfig.githubRepo) {
        await gitService.pushChanges(appConfig.notesPath, appConfig.githubBranch || 'main');
      }
    } catch (gitErr) {
      console.warn('Auto-sync warning:', gitErr.message);
    }
  }
  return writeRes;
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

// IPC - Git & GitHub
ipcMain.handle('git:init', () => {
  return gitService.initGit(appConfig.notesPath);
});

ipcMain.handle('git:status', () => {
  return gitService.getGitStatus(appConfig.notesPath);
});

ipcMain.handle('git:commit', (_, message) => {
  return gitService.commitChanges(appConfig.notesPath, message);
});

ipcMain.handle('git:setRemote', async (_, remoteUrl, branch = 'main') => {
  const res = await gitService.setRemote(appConfig.notesPath, remoteUrl, branch, appConfig.githubToken);
  if (res.success) {
    updateConfig({ githubRepo: remoteUrl, githubBranch: branch });
  }
  return res;
});

ipcMain.handle('git:push', () => {
  return gitService.pushChanges(appConfig.notesPath, appConfig.githubBranch || 'main');
});

ipcMain.handle('git:pull', () => {
  return gitService.pullChanges(appConfig.notesPath, appConfig.githubBranch || 'main');
});

ipcMain.handle('git:sync', (_, commitMessage) => {
  return gitService.syncAll(appConfig.notesPath, commitMessage, appConfig.githubBranch || 'main');
});

ipcMain.handle('git:history', (_, filePath) => {
  return gitService.getHistory(appConfig.notesPath, filePath);
});

ipcMain.handle('git:fileAtCommit', (_, filePath, commitHash) => {
  return gitService.getFileAtCommit(appConfig.notesPath, filePath, commitHash);
});
