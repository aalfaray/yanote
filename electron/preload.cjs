const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setAlwaysOnTop: (alwaysOnTop) => ipcRenderer.invoke('window:setAlwaysOnTop', alwaysOnTop),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
  setOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),

  // File system
  getNotesPath: () => ipcRenderer.invoke('fs:getNotesPath'),
  setNotesPath: (newPath) => ipcRenderer.invoke('fs:setNotesPath', newPath),
  selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
  openMarkdownFile: () => ipcRenderer.invoke('fs:openMarkdownFile'),
  listNotes: () => ipcRenderer.invoke('fs:listNotes'),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  exportPdf: (options) => ipcRenderer.invoke('export:pdf', options),
  saveTextAs: (options) => ipcRenderer.invoke('export:saveText', options),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs:renameFile', oldPath, newPath),
  getAppConfig: () => ipcRenderer.invoke('fs:getAppConfig'),
  saveAppConfig: (config) => ipcRenderer.invoke('fs:saveAppConfig', config),
  revealInExplorer: (filePath) => ipcRenderer.invoke('app:revealInExplorer', filePath),


  // Text to speech (native fallback)
  ttsSpeak: (request) => ipcRenderer.invoke('tts:speak', request),
  ttsStop: () => ipcRenderer.invoke('tts:stop'),
  onTtsEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tts:event', listener);
    return () => ipcRenderer.removeListener('tts:event', listener);
  },

  // Integrated terminals
  termCreate: (options) => ipcRenderer.invoke('term:create', options),
  saveClipboardImage: () => ipcRenderer.invoke('clipboard:saveImage'),
  termWrite: (id, data) => ipcRenderer.send('term:write', id, data),
  termResize: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
  termKill: (id) => ipcRenderer.invoke('term:kill', id),
  onTermEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('term:event', listener);
    return () => ipcRenderer.removeListener('term:event', listener);
  },

  // App version & updates
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUpdateMode: () => ipcRenderer.invoke('update:getMode'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  acceptUpdate: () => ipcRenderer.invoke('update:accept'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  },

  // Claude chat sessions (Agent SDK)
  claudeStart: (options) => ipcRenderer.invoke('claude:start', options),
  claudeSend: (id, payload) => ipcRenderer.invoke('claude:send', id, payload),
  claudeRespondPermission: (id, requestId, decision) => ipcRenderer.invoke('claude:respondPermission', id, requestId, decision),
  claudeInterrupt: (id) => ipcRenderer.invoke('claude:interrupt', id),
  claudeSetPermissionMode: (id, mode) => ipcRenderer.invoke('claude:setPermissionMode', id, mode),
  claudeSetModel: (id, model) => ipcRenderer.invoke('claude:setModel', id, model),
  claudeSetEffort: (id, level) => ipcRenderer.invoke('claude:setEffort', id, level),
  claudeStop: (id) => ipcRenderer.invoke('claude:stop', id),
  claudeHistory: (sessionId) => ipcRenderer.invoke('claude:history', sessionId),
  onClaudeEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('claude:event', listener);
    return () => ipcRenderer.removeListener('claude:event', listener);
  },

  // Antigravity CLI (Gemini) chat over ACP
  agyStart: (options) => ipcRenderer.invoke('agy:start', options),
  agySend: (id, payload) => ipcRenderer.invoke('agy:send', id, payload),
  agyRespondPermission: (id, requestId, decision) => ipcRenderer.invoke('agy:respondPermission', id, requestId, decision),
  agyInterrupt: (id) => ipcRenderer.invoke('agy:interrupt', id),
  agySetPermissionMode: (id, mode) => ipcRenderer.invoke('agy:setPermissionMode', id, mode),
  agySetModel: (id, model) => ipcRenderer.invoke('agy:setModel', id, model),
  agySetEffort: (id, level) => ipcRenderer.invoke('agy:setEffort', id, level),
  agyStop: (id) => ipcRenderer.invoke('agy:stop', id),
  onAgyEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('agy:event', listener);
    return () => ipcRenderer.removeListener('agy:event', listener);
  },
});
