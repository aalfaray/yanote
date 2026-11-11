const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke('window:setAlwaysOnTop', alwaysOnTop),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),

  // File system
  getNotesPath: () => ipcRenderer.invoke('fs:getNotesPath'),
  setNotesPath: (newPath) => ipcRenderer.invoke('fs:setNotesPath', newPath),
  selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
  listNotes: () => ipcRenderer.invoke('fs:listNotes'),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs:renameFile', oldPath, newPath),
  getAppConfig: () => ipcRenderer.invoke('fs:getAppConfig'),
  saveAppConfig: (config) => ipcRenderer.invoke('fs:saveAppConfig', config),

  // Git & GitHub
  gitStatus: () => ipcRenderer.invoke('git:status'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitPush: () => ipcRenderer.invoke('git:push'),
  gitPull: () => ipcRenderer.invoke('git:pull'),
  gitSync: (commitMessage) => ipcRenderer.invoke('git:sync', commitMessage),
  gitHistory: (filePath) => ipcRenderer.invoke('git:history', filePath),
  gitFileAtCommit: (filePath, commitHash) => ipcRenderer.invoke('git:fileAtCommit', filePath, commitHash),
  gitSetRemote: (remoteUrl, branch) => ipcRenderer.invoke('git:setRemote', remoteUrl, branch),
  gitInit: () => ipcRenderer.invoke('git:init'),
});
