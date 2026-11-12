import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { TabBar } from './components/TabBar';
import { Editor } from './components/Editor';
import { TerminalView } from './components/TerminalView';
import { ClaudeChatView } from './components/ClaudeChatView';
import { UpdateNotice } from './components/UpdateNotice';
import { SettingsModal } from './components/SettingsModal';
import { RecentFilesDrawer } from './components/RecentFilesDrawer';
import { addRecentFile, removeRecentFile } from './lib/recentFiles';
import { ConfirmModal } from './components/ui/ConfirmModal';
import type { TabItem, TerminalShell, RecentFile } from './types/electron';
import { Save, Check, AlertCircle } from 'lucide-react';
import { parentDir } from './lib/paths';

const DEFAULT_WELCOME_MARKDOWN = `# Bienvenido a tu Editor Markdown Neubrutalista ⚡

Este es un editor **portable y flotante** diseñado con la estética **Boldkit**.

### ✨ Características destacadas:
- **Superposición (Always on Top):** Haz clic en el botón de pin 📌 en la barra superior para mantener la ventana siempre visible encima de otras aplicaciones.
- **Pestañas tipo Orca:** Abre múltiples notas simultáneamente con el botón \`+\`. Cada pestaña es un archivo markdown independiente.
- **Editor Rico con @mdxeditor/editor:** Formato enriquecido, tablas, bloques de código, listas, enlaces y alternancia rápida a código fuente Markdown.
- **Lectura en voz alta:** Escucha la nota completa, la selección o el párrafo actual con el botón 🔊 de la barra de herramientas.
- **Resolución Compacta y Redimensionable:** Diseñado inicialmente en tamaño pequeño/compacto tipo bloc de notas flotante, con libertad total para agrandarlo o maximizarlo.

---
> *Tip: Presiona Ctrl + S para guardar tu nota.*
`;

export const App: React.FC = () => {
  // Tabs State
  const [tabs, setTabs] = useState<TabItem[]>([
    {
      id: 'tab-welcome',
      title: 'Bienvenido.md',
      path: null,
      content: DEFAULT_WELCOME_MARKDOWN,
      isDirty: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-welcome');

  // App & Window State
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notesDir, setNotesDir] = useState<string>('');
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilesDrawerOpen, setIsFilesDrawerOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const recentFilesRef = useRef<RecentFile[]>([]);
  const [closingTab, setClosingTab] = useState<TabItem | null>(null);
  const [isQuitConfirmOpen, setIsQuitConfirmOpen] = useState(false);
  const [windowOpacity, setWindowOpacity] = useState(1);
  // Tab that should receive keyboard focus as soon as it renders (newly created tabs)
  const [focusTabId, setFocusTabId] = useState<string | null>(null);
  const clearFocusRequest = useCallback(() => setFocusTabId(null), []);
  const [editorViewMode, setEditorViewMode] = useState<'rich-text' | 'source'>('rich-text');

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  // Latest "open file" handler, so the Ctrl+O shortcut never uses a stale tabs list
  const openFileRef = useRef<(() => void) | null>(null);
  activeTabIdRef.current = activeTabId;

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Notes folder (used for new notes) & app config
  const refreshNotes = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const dir = await window.electronAPI.getNotesPath();
      setNotesDir(dir);
    } catch (err) {
      console.error('Error refreshing notes:', err);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      if (window.electronAPI) {
        try {
          const config = await window.electronAPI.getAppConfig();
          if (Array.isArray(config.recentFiles)) {
            recentFilesRef.current = config.recentFiles;
            setRecentFiles(config.recentFiles);
          }
          setIsAlwaysOnTop(config.alwaysOnTop || false);
          if (typeof config.opacity === 'number') setWindowOpacity(config.opacity);
          const dark = Boolean(config.darkMode);
          setIsDarkMode(dark);
          if (dark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }

          const res = await window.electronAPI.listNotes();
          if (res.success && res.notes.length > 0) {
            const firstNote = res.notes[0];
            const contentRes = await window.electronAPI.readFile(firstNote.path);
            if (contentRes.success && contentRes.content !== undefined) {
              setTabs((prev) => {
                // If user has already opened or edited other tabs, don't wipe them out
                if (prev.length > 1 || (prev.length === 1 && prev[0].isDirty)) {
                  return prev;
                }
                return [
                  {
                    id: `note-${firstNote.name}`,
                    title: firstNote.name,
                    path: firstNote.path,
                    content: contentRes.content || '',
                    isDirty: false,
                  },
                ];
              });
              setActiveTabId(`note-${firstNote.name}`);
            }
          }
        } catch (err) {
          console.error('Init error:', err);
        }
      }
    };
    initApp();
  }, []);

  // Dark Mode Toggle
  const handleToggleDarkMode = useCallback(async () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      if (window.electronAPI) {
        window.electronAPI.saveAppConfig({ darkMode: next }).catch((err) => {
          console.error('Error saving darkMode setting:', err);
        });
      }
      setNotification({
        type: 'info',
        text: next ? '🌙 Modo Oscuro Activado' : '☀️ Modo Claro Activado',
      });
      return next;
    });
  }, []);

  // Window transparency: update the UI immediately, the main process applies & persists it
  const handleChangeOpacity = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0.3, value));
    setWindowOpacity(next);
    window.electronAPI?.setOpacity?.(next).catch((err) => {
      console.error('Error setting window opacity:', err);
    });
  }, []);

  // Superposición / Always on Top Toggle
  const handleToggleAlwaysOnTop = async () => {
    if (window.electronAPI) {
      const nextState = !isAlwaysOnTop;
      const res = await window.electronAPI.setAlwaysOnTop(nextState);
      setIsAlwaysOnTop(res);
      setNotification({
        type: 'info',
        text: res ? '📌 Superposición activada (Siempre visible)' : '📌 Superposición desactivada',
      });
    } else {
      setIsAlwaysOnTop(!isAlwaysOnTop);
    }
  };

  // Tab Management (Orca Style)
  // Ids are generated and activated OUTSIDE the state updaters: StrictMode runs updaters
  // twice, which would otherwise activate an id that never made it into the tab list.
  const handleNewTab = () => {
    const newId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    setTabs((prev) => {
      const scratchCount = prev.filter((t) => t.title.startsWith('scratch-')).length + 1;
      const newTitle = `scratch-${scratchCount}.md`;
      const newTab: TabItem = {
        id: newId,
        title: newTitle,
        path: null,
        content: '',
        isDirty: true,
      };
      return [...prev, newTab];
    });
    setActiveTabId(newId);
    setFocusTabId(newId);
  };

  const handleNewTerminal = (shell: TerminalShell) => {
    const newId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // Open where the user is: the folder of the active note, else (main process) the notes folder
    const current = tabs.find((t) => t.id === activeTabId);
    const cwd = current?.kind === 'terminal' || current?.kind === 'claude' ? current.cwd : parentDir(current?.path ?? null) ?? undefined;
    setTabs((prev) => {
      const baseName = shell === 'powershell' ? 'PowerShell' : 'CMD';
      const count = prev.filter((t) => t.kind === 'terminal' && t.shell === shell).length + 1;
      const newTab: TabItem = {
        id: newId,
        title: count > 1 ? `${baseName} ${count}` : baseName,
        path: null,
        content: '',
        isDirty: false,
        kind: 'terminal',
        shell,
        cwd,
      };
      return [...prev, newTab];
    });
    setActiveTabId(newId);
  };

  const handleNewClaude = () => {
    const newId = `claude-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // Same folder rule as terminals: where the active note lives, else the notes folder
    const current = tabs.find((t) => t.id === activeTabId);
    const cwd = current?.kind === 'terminal' || current?.kind === 'claude' ? current.cwd : parentDir(current?.path ?? null) ?? undefined;
    setTabs((prev) => {
      const count = prev.filter((t) => t.kind === 'claude').length + 1;
      return [
        ...prev,
        { id: newId, title: count > 1 ? `Claude ${count}` : 'Claude', path: null, content: '', isDirty: false, kind: 'claude', cwd },
      ];
    });
    setActiveTabId(newId);
  };

  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
  };

  const executeCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== id);
      if (activeTabIdRef.current === id && nextTabs.length > 0) {
        setActiveTabId(nextTabs[nextTabs.length - 1].id);
      }
      return nextTabs;
    });
    setClosingTab(null);
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    const currentTabs = tabsRef.current;
    const tabToClose = currentTabs.find((t) => t.id === id);
    if (!tabToClose) return;
    if (tabToClose.isPinned) return; // Pinned tabs cannot be closed without unpinning
    if (currentTabs.length <= 1) return;
    if (tabToClose.isDirty) {
      setClosingTab(tabToClose);
      return;
    }
    executeCloseTab(id);
  }, [executeCloseTab]);

  const handleTogglePinTab = useCallback((id: string) => {
    setTabs((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;
      const isNowPinned = !target.isPinned;
      const updated = prev.map((t) => (t.id === id ? { ...t, isPinned: isNowPinned } : t));
      setNotification({
        type: 'info',
        text: isNowPinned ? `📌 Pestaña fijada: ${target.title}` : `Pestaña desfijada: ${target.title}`,
      });
      return [...updated.filter((t) => t.isPinned), ...updated.filter((t) => !t.isPinned)];
    });
  }, []);

  const handleCloseOthers = useCallback((id: string) => {
    const currentTabs = tabsRef.current;
    const unpinnedOthers = currentTabs.filter((t) => t.id !== id && !t.isPinned);
    if (unpinnedOthers.length === 0) return;

    const dirtyOther = unpinnedOthers.find((t) => t.isDirty);
    if (dirtyOther) {
      setClosingTab(dirtyOther);
      return;
    }

    setTabs((prev) => prev.filter((t) => t.id === id || t.isPinned));
    setActiveTabId(id);
    setNotification({
      type: 'info',
      text: 'Otras pestañas cerradas',
    });
  }, []);

  const handleCloseAll = useCallback(() => {
    const currentTabs = tabsRef.current;
    const unpinned = currentTabs.filter((t) => !t.isPinned);
    const dirtyTab = unpinned.find((t) => t.isDirty);
    if (dirtyTab) {
      setClosingTab(dirtyTab);
      return;
    }

    const pinned = currentTabs.filter((t) => t.isPinned);
    if (pinned.length > 0) {
      setTabs(pinned);
      setActiveTabId(pinned[0].id);
    } else {
      const freshId = `tab-${Date.now()}`;
      const freshTab: TabItem = {
        id: freshId,
        title: 'scratch-1.md',
        path: null,
        content: '',
        isDirty: false,
      };
      setTabs([freshTab]);
      setActiveTabId(freshId);
    }
    setNotification({
      type: 'info',
      text: 'Pestañas cerradas',
    });
  }, []);

  const handleTogglePreview = useCallback(() => {
    setEditorViewMode((prev) => {
      const next = prev === 'rich-text' ? 'source' : 'rich-text';
      setNotification({
        type: 'info',
        text: next === 'source' ? '📝 Modo Código Fuente Markdown' : '👁️ Modo Vista Previa Enriquecida',
      });
      return next;
    });
  }, []);

  const handleCopyId = useCallback((tab: TabItem) => {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tab.id).catch(() => {});
    }
    setNotification({
      type: 'success',
      text: `✓ ID copiado: ${tab.id}`,
    });
  }, []);

  const handleCopyPath = useCallback((tab: TabItem) => {
    let pathToCopy = tab.path;
    if (!pathToCopy) {
      const baseDir = notesDir || '';
      const sep = baseDir.includes('\\') ? '\\' : '/';
      pathToCopy = baseDir ? `${baseDir}${sep}${tab.title}` : tab.title;
    }
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(pathToCopy).catch(() => {});
    }
    setNotification({
      type: 'success',
      text: `✓ Ruta copiada: ${pathToCopy}`,
    });
  }, [notesDir]);

  const handleCopyRelativePath = useCallback((tab: TabItem) => {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tab.title).catch(() => {});
    }
    setNotification({
      type: 'success',
      text: `✓ Ruta relativa copiada: ${tab.title}`,
    });
  }, []);

  const handleRevealInExplorer = useCallback(async (tab: TabItem) => {
    if (window.electronAPI?.revealInExplorer) {
      const res = await window.electronAPI.revealInExplorer(tab.path || undefined);
      if (res.success) {
        setNotification({
          type: 'success',
          text: '✓ Abriendo en el Explorador de archivos',
        });
      } else {
        setNotification({
          type: 'info',
          text: `Explorador: ${res.error || 'Abierto'}`,
        });
      }
    } else {
      setNotification({
        type: 'info',
        text: `Explorador (navegador): ${tab.path || tab.title}`,
      });
    }
  }, []);

  // Global keyboard shortcuts (Ctrl+Shift+D to toggle dark mode, Ctrl+W, Ctrl+Alt+W, Ctrl+O)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openFileRef.current?.();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleToggleDarkMode();
      } else if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseAll();
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabIdRef.current) {
          handleCloseTab(activeTabIdRef.current);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleToggleDarkMode, handleCloseAll, handleCloseTab]);

  const handleRenameTab = async (id: string, newTitle: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    if (tab.path && window.electronAPI) {
      // Rename file on disk
      const newPath = tab.path.replace(/[^\\/]+$/, newTitle);
      const res = await window.electronAPI.renameFile(tab.path, newPath);
      if (res.success) {
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title: newTitle, path: newPath } : t))
        );
        refreshNotes();
        return;
      }
    }
    // Scratchpad / terminal tab rename in memory (terminals have nothing to save)
    const isTerminal = tab.kind === 'terminal' || tab.kind === 'claude';
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle, isDirty: !isTerminal } : t))
    );
  };

  const handleContentChange = (content: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content, isDirty: true } : t))
    );
  };

  // Save current active tab to disk
  const handleSaveActiveTab = async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || activeTab.kind === 'terminal' || activeTab.kind === 'claude') return;

    if (!window.electronAPI) {
      // Browser preview fallback
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isDirty: false } : t))
      );
      setNotification({ type: 'success', text: `Nota guardada (modo navegador): ${activeTab.title}` });
      return;
    }

    try {
      let targetPath = activeTab.path;
      if (!targetPath) {
        // Generate path inside notes directory
        const baseDir = notesDir || (await window.electronAPI.getNotesPath());
        const sep = baseDir.includes('\\') ? '\\' : '/';
        targetPath = `${baseDir}${sep}${activeTab.title}`;
      }

      const res = await window.electronAPI.writeFile(targetPath, activeTab.content);
      if (res.success) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId ? { ...t, path: targetPath, isDirty: false } : t
          )
        );
        setNotification({
          type: 'success',
          text: `✓ Guardado: ${activeTab.title}`,
        });
        // A note saved for the first time joins the history
        if (!activeTab.path) recordRecentFiles([{ path: targetPath, name: activeTab.title }]);
        await refreshNotes();
      } else {
        setNotification({
          type: 'error',
          text: `Error al guardar: ${res.error}`,
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  // Opens a file in a tab, or focuses the tab if that file is already open
  const openFileInTab = (filePath: string, name: string, content: string) => {
    const existing = tabs.find((t) => t.path === filePath);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newTab: TabItem = {
      id: `tab-${name}-${Date.now()}`,
      title: name,
      path: filePath,
      content,
      isDirty: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // --- Recent files history (title bar "Archivos recientes") ---
  const updateRecentFiles = (next: RecentFile[]) => {
    recentFilesRef.current = next;
    setRecentFiles(next);
    void window.electronAPI?.saveAppConfig({ recentFiles: next });
  };
  const recordRecentFiles = (files: { path: string; name: string }[]) => {
    if (!files.length) return;
    const now = Date.now();
    // Last one ends up first, matching the order they were opened in
    updateRecentFiles(files.reduce((list, f, i) => addRecentFile(list, f, now + i), recentFilesRef.current));
  };

  const handleOpenRecent = async (file: RecentFile) => {
    const existing = tabs.find((t) => t.path === file.path);
    if (existing) {
      setActiveTabId(existing.id);
      recordRecentFiles([file]);
      return;
    }
    if (!window.electronAPI) return;
    const res = await window.electronAPI.readFile(file.path);
    if (res.success && res.content !== undefined) {
      openFileInTab(file.path, file.name, res.content);
      recordRecentFiles([file]);
    } else {
      // Moved or deleted: drop it from the history
      updateRecentFiles(removeRecentFile(recentFilesRef.current, file.path));
      setNotification({ type: 'error', text: `No se pudo abrir ${file.name}: ${res.error || 'ya no existe'}` });
    }
  };

  // Browse the disk for one or more .md files (new-tab menu / Ctrl+O); each opens in its own tab
  const handleOpenFile = async () => {
    if (!window.electronAPI?.openMarkdownFile) return;
    const res = await window.electronAPI.openMarkdownFile();
    if (!res) return; // cancelled

    const now = Date.now();
    const newTabs: TabItem[] = [];
    let lastId: string | null = null;
    res.files.forEach((file, i) => {
      const existing = tabs.find((t) => t.path === file.path);
      if (existing) {
        lastId = existing.id;
        return;
      }
      const tab: TabItem = {
        id: `tab-${file.name}-${now}-${i}`,
        title: file.name,
        path: file.path,
        content: file.content,
        isDirty: false,
      };
      newTabs.push(tab);
      lastId = tab.id;
    });
    if (newTabs.length) setTabs((prev) => [...prev, ...newTabs]);
    if (lastId) setActiveTabId(lastId);
    recordRecentFiles(res.files);

    if (res.errors.length) {
      setNotification({ type: 'error', text: `No se pudo abrir: ${res.errors.join(' · ')}` });
    }
  };
  useEffect(() => {
    openFileRef.current = handleOpenFile;
  });

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const isClaudeActive = activeTab?.kind === 'claude';
  const isTerminalActive = activeTab?.kind === 'terminal' || isClaudeActive;

  return (
    <div className="w-screen h-screen flex flex-col bg-[#FAF8F5] dark:bg-[#121212] overflow-hidden border-2 border-black dark:border-zinc-700 transition-colors">
      {/* 1. Custom Frameless Titlebar with Superposición Toggle */}
      <TitleBar
        isAlwaysOnTop={isAlwaysOnTop}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenFiles={() => setIsFilesDrawerOpen(true)}
        onRequestClose={() => setIsQuitConfirmOpen(true)}
        opacity={windowOpacity}
        onChangeOpacity={handleChangeOpacity}
      />

      {/* 2. Orca-style Tab Bar for Multiple Markdown Documents */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onNewTerminal={handleNewTerminal}
        onNewClaude={handleNewClaude}
        onOpenFile={handleOpenFile}
        onRenameTab={handleRenameTab}
        onTogglePinTab={handleTogglePinTab}
        onCloseOthers={handleCloseOthers}
        onCloseAll={handleCloseAll}
        onTogglePreview={handleTogglePreview}
        onCopyPath={handleCopyPath}
        onCopyRelativePath={handleCopyRelativePath}
        onCopyId={handleCopyId}
        onRevealInExplorer={handleRevealInExplorer}
      />

      {/* 3. Main Editor (@mdxeditor/editor with Boldkit Neubrutalism) */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
        {/* Terminal tabs stay mounted (hidden when inactive) so their sessions survive tab switches */}
        {tabs
          .filter((t) => t.kind === 'terminal')
          .map((t) => (
            <TerminalView
              key={t.id}
              tabId={t.id}
              shell={t.shell || 'powershell'}
              cwd={t.cwd}
              isActive={t.id === activeTab?.id}
              isDarkMode={isDarkMode}
            />
          ))}

        {/* Claude chats also stay mounted so the Claude Code process and transcript survive tab switches */}
        {tabs
          .filter((t) => t.kind === 'claude')
          .map((t) => (
            <ClaudeChatView key={t.id} tabId={t.id} cwd={t.cwd} isActive={t.id === activeTab?.id} />
          ))}

        {isTerminalActive ? null : activeTab ? (
          <Editor
            tabId={activeTab.id}
            markdown={activeTab.content}
            onChange={handleContentChange}
            onSave={handleSaveActiveTab}
            isDarkMode={isDarkMode}
            viewMode={editorViewMode}
            autoFocus={focusTabId === activeTab.id}
            onAutoFocused={clearFocusRequest}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-neutral-500">
            Ninguna nota abierta. Haz clic en "+" para crear una nueva pestaña.
          </div>
        )}

        {/* Floating Notification Pill */}
        {notification && (
          <div
            className={`absolute bottom-14 right-2 min-[640px]:bottom-8 min-[640px]:right-3 max-w-[calc(100%-16px)] z-30 px-3 py-1.5 rounded border-2 border-black font-black text-xs shadow-[3px_3px_0px_#000] flex items-center gap-1.5 animate-in slide-in-from-bottom-2 duration-150 ${
              notification.type === 'success'
                ? 'bg-[#78E08F] text-black'
                : notification.type === 'error'
                ? 'bg-[#FF6B6B] text-white'
                : 'bg-[#FFE500] text-black'
            }`}
          >
            {notification.type === 'success' ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <AlertCircle size={14} strokeWidth={3} />
            )}
            <span>{notification.text}</span>
          </div>
        )}
      </div>

      {/* 4. Bottom Neubrutalist Status Bar */}
      <div className="h-7 w-full bg-[#FAF8F5] dark:bg-[#18181B] border-t-2 border-black dark:border-zinc-700 flex items-center justify-between px-2 text-[10px] select-none shrink-0 font-bold z-20 text-black dark:text-zinc-200 transition-colors whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          {/* Active Tab filename & dirty state */}
          <span className="h-5 truncate max-w-[130px] min-[420px]:max-w-[180px] flex items-center gap-1 shrink min-w-0 leading-none">
            <span className="text-black/60 dark:text-zinc-400 hidden min-[360px]:inline">{isClaudeActive ? 'Chat:' : isTerminalActive ? 'Terminal:' : 'Nota:'}</span>
            <span className="text-black dark:text-white font-black truncate">{activeTab?.title}</span>
            {activeTab?.isDirty && (
              <span className="text-[#FF6B6B] font-black shrink-0" title="Cambios sin guardar">
                <span aria-hidden="true" className="min-[480px]:hidden">●</span>
                <span className="hidden min-[480px]:inline">*sin guardar</span>
              </span>
            )}
          </span>

          {!isTerminalActive && (
          <>
          <div className="h-5 w-[2px] bg-black/30 dark:bg-zinc-600 shrink-0" />

          {/* Quick Save Button */}
          <button
            onClick={handleSaveActiveTab}
            className="h-5 flex items-center gap-1 px-1.5 leading-none bg-[#FFE500] hover:bg-[#FFD700] text-black border-2 border-black rounded shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer font-black whitespace-nowrap shrink-0"
            title="Guardar nota (Ctrl + S)"
          >
            <Save size={10} strokeWidth={2.8} className="shrink-0" />
            <span className="whitespace-nowrap">
              Guardar<span className="hidden min-[480px]:inline"> (Ctrl+S)</span>
            </span>
          </button>
          </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {/* Superposición Status Badge */}
          <span
            className={`h-5 px-1.5 items-center leading-none rounded border-2 border-black dark:border-zinc-600 shadow-[1.5px_1.5px_0px_#000] font-black text-[10px] shrink-0 hidden min-[440px]:inline-flex ${
              isAlwaysOnTop ? 'bg-[#78E08F] text-black' : 'bg-neutral-200 dark:bg-zinc-700 text-neutral-600 dark:text-zinc-300'
            }`}
          >
            {isAlwaysOnTop ? 'FIJADO' : 'NORMAL'}
          </span>
        </div>
      </div>

      {/* Modals & Drawers */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigChanged={refreshNotes}
        onSaved={() => setNotification({ type: 'success', text: '¡Ajustes guardados correctamente!' })}
      />

      <RecentFilesDrawer
        isOpen={isFilesDrawerOpen}
        onClose={() => setIsFilesDrawerOpen(false)}
        recentFiles={recentFiles}
        openPaths={tabs.filter((t) => t.path).map((t) => t.path as string)}
        onOpenRecent={handleOpenRecent}
        onRemoveRecent={(filePath) => updateRecentFiles(removeRecentFile(recentFilesRef.current, filePath))}
        onClearRecent={() => updateRecentFiles([])}
        onBrowse={handleOpenFile}
      />

      {/* Neubrutalist Confirmation Modal for Closing Unsaved Tab */}
      <ConfirmModal
        isOpen={Boolean(closingTab)}
        title="Cambios sin guardar"
        message={`La nota "${closingTab?.title}" tiene cambios sin guardar.`}
        subMessage="¿Deseas descartar los cambios y cerrar esta pestaña de todos modos?"
        confirmText="Descartar y Cerrar"
        cancelText="Cancelar"
        saveAndCloseText="Guardar y Cerrar"
        onConfirm={() => {
          if (closingTab) executeCloseTab(closingTab.id);
        }}
        onCancel={() => setClosingTab(null)}
        onSaveAndConfirm={async () => {
          if (closingTab) {
            await handleSaveActiveTab();
            executeCloseTab(closingTab.id);
          }
        }}
      />

      {/* New version available -> ask, download, restart */}
      <UpdateNotice unsavedCount={tabs.filter((t) => t.isDirty).length} />

      {/* Confirmation before quitting the whole app from the titlebar close button */}
      <ConfirmModal
        isOpen={isQuitConfirmOpen}
        title="Cerrar yanote"
        message="¿Estás seguro de que deseas cerrar el programa?"
        subMessage={(() => {
          const unsaved = tabs.filter((t) => t.isDirty).length;
          const terminals = tabs.filter((t) => t.kind === 'terminal').length;
          const chats = tabs.filter((t) => t.kind === 'claude').length;
          const warnings = [
            unsaved > 0 ? `${unsaved} ${unsaved === 1 ? 'nota tiene' : 'notas tienen'} cambios sin guardar que se perderán.` : '',
            terminals > 0 ? `${terminals} ${terminals === 1 ? 'terminal abierta se cerrará' : 'terminales abiertas se cerrarán'}.` : '',
            chats > 0 ? `${chats} ${chats === 1 ? 'chat con Claude se cerrará' : 'chats con Claude se cerrarán'}.` : '',
          ].filter(Boolean);
          return warnings.length > 0 ? warnings.join(' ') : 'Todas tus notas están guardadas.';
        })()}
        confirmText="Sí, cerrar"
        cancelText="Cancelar"
        onConfirm={() => {
          setIsQuitConfirmOpen(false);
          window.electronAPI?.close();
        }}
        onCancel={() => setIsQuitConfirmOpen(false)}
      />
    </div>
  );
};

export default App;
