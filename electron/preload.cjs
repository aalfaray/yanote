const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  getLocaleInfo: () => ipcRenderer.invoke('app:getLocaleInfo'),
  saveAppConfig: (config) => ipcRenderer.invoke('fs:saveAppConfig', config),
  revealInExplorer: (filePath) => ipcRenderer.invoke('app:revealInExplorer', filePath),

  // Real disk path of a file dropped on the window (File.path no longer exists in Electron 32+)
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null;
    } catch (err) {
      // preload can't load the log service: send it to the system log through IPC
      ipcRenderer
        .invoke('log:write', { level: 'warn', scope: 'preload.getPathForFile', message: `no disk path for dropped file: ${err && err.message}`, stack: err && err.stack })
        .catch((logErr) => console.error('[preload] could not log', logErr));
      return null;
    }
  },

  // Windows notification; clicking it focuses the window and asks to show `tabId`
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  onFocusTab: (callback) => {
    const listener = (_event, tabId) => callback(tabId);
    ipcRenderer.on('app:focusTab', listener);
    return () => ipcRenderer.removeListener('app:focusTab', listener);
  },

  // Undo/redo/cut/copy/paste/select all for the app's right-click menu
  editCommand: (command) => ipcRenderer.invoke('app:editCommand', command),
  replaceMisspelling: (requestId, suggestion) => ipcRenderer.invoke('spelling:replace', requestId, suggestion),
  onSpellingContext: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('spelling:context', listener);
    return () => ipcRenderer.removeListener('spelling:context', listener);
  },

  // System log: renderer failures land in the same file as the main process ones
  log: (entry) => ipcRenderer.invoke('log:write', entry),
  revealLog: () => ipcRenderer.invoke('log:reveal'),

  // "Abrir con yanote" from Explorer: the launch target, then any later ones
  takeOpenTarget: () => ipcRenderer.invoke('app:takeOpenTarget'),
  onOpenTarget: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:openTarget', listener);
    return () => ipcRenderer.removeListener('app:openTarget', listener);
  },


  // File explorer side panel
  treeSelectFolder: (currentFolder) => ipcRenderer.invoke('tree:selectFolder', currentFolder),
  treeList: (dir) => ipcRenderer.invoke('tree:list', dir),
  treeGitStatus: (dir) => ipcRenderer.invoke('tree:gitStatus', dir),
  treeWatch: (root) => ipcRenderer.invoke('tree:watch', root),
  treeUnwatch: () => ipcRenderer.invoke('tree:unwatch'),
  onTreeChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('tree:changed', listener);
    return () => ipcRenderer.removeListener('tree:changed', listener);
  },
  claudeInstallInfo: () => ipcRenderer.invoke('claude:installInfo'),

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
  claudeUsage: (id) => ipcRenderer.invoke('claude:usage', id),
  claudeHistory: (sessionId, accountId) => ipcRenderer.invoke('claude:history', sessionId, accountId),
  claudeDefaults: (accountId, cwd) => ipcRenderer.invoke('claude:defaults', accountId, cwd),
  claudeAccounts: {
    list: () => ipcRenderer.invoke('claudeAccounts:list'),
    status: (id) => ipcRenderer.invoke('claudeAccounts:status', id),
    usage: (id, force) => ipcRenderer.invoke('claudeAccounts:usage', id, force),
    logout: (id) => ipcRenderer.invoke('claudeAccounts:logout', id),
    add: (name) => ipcRenderer.invoke('claudeAccounts:add', name),
    rename: (id, name) => ipcRenderer.invoke('claudeAccounts:rename', id, name),
    remove: (id) => ipcRenderer.invoke('claudeAccounts:remove', id),
    setActive: (id) => ipcRenderer.invoke('claudeAccounts:setActive', id),
    loginCommand: (id) => ipcRenderer.invoke('claudeAccounts:loginCommand', id),
    copySession: (sessionId, fromId, toId) => ipcRenderer.invoke('claudeAccounts:copySession', sessionId, fromId, toId),
  },
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
  agyUsage: (id, force) => ipcRenderer.invoke('agy:usage', id, force),
  onAgyEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('agy:event', listener);
    return () => ipcRenderer.removeListener('agy:event', listener);
  },
});
