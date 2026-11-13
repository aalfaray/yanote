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
import type { TabItem, TerminalShell, RecentFile, OpenTarget, SavedIdea } from './types/electron';
import { Save, Check, AlertCircle, FileText } from 'lucide-react';
import { parentDir, isMarkdownFile, baseName, notePathOf } from './lib/paths';
import { copyText } from './lib/clipboard';
import { ClaudeUsageMeter, useClaudeUsage } from './components/ClaudeUsageMeter';
import { chatNotificationFor } from './lib/claudeNotify';
import { DismissButton } from './components/ui/DismissButton';
import { IdeasDrawer } from './components/IdeasDrawer';
import { addIdea, removeIdea } from './lib/ideas';
import { toSavedTabs, restoreTab } from './lib/session';
import { useAppContextMenu } from './hooks/useAppContextMenu';
import { readAloudTarget, requestReadAloud } from './lib/readAloud';
import { logError } from './lib/logger';
import { AppContextMenu } from './components/ui/AppContextMenu';

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

const WELCOME_TAB_ID = 'tab-welcome';

export const App: React.FC = () => {
  // Tabs State
  const [tabs, setTabs] = useState<TabItem[]>([
    {
      id: WELCOME_TAB_ID,
      title: 'Bienvenido.md',
      path: null,
      content: DEFAULT_WELCOME_MARKDOWN,
      isDirty: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(WELCOME_TAB_ID);
  // Set once the previous session is restored: saving before that would wipe it
  const sessionReadyRef = useRef(false);
  // Settings > "Avisarme cuando Claude termine" (on by default)
  const notifyClaudeRef = useRef(true);
  // Claude account new chats start with (Settings > accounts / the chat's account menu)
  const activeAccountRef = useRef('default');

  // App & Window State
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notesDir, setNotesDir] = useState<string>('');
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilesDrawerOpen, setIsFilesDrawerOpen] = useState(false);
  const [isIdeasOpen, setIsIdeasOpen] = useState(false);
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const ideasRef = useRef<SavedIdea[]>([]);
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
      const config = await window.electronAPI.getAppConfig();
      notifyClaudeRef.current = config?.notifyClaude !== false;
    } catch (err) {
      logError('App.refreshNotes', err);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      if (window.electronAPI) {
        try {
          const config = await window.electronAPI.getAppConfig();
          if (Array.isArray(config.ideas)) {
            ideasRef.current = config.ideas;
            setIdeas(config.ideas);
          }
          if (Array.isArray(config.recentFiles)) {
            recentFilesRef.current = config.recentFiles;
            setRecentFiles(config.recentFiles);
          }
          setIsAlwaysOnTop(config.alwaysOnTop || false);
          notifyClaudeRef.current = config.notifyClaude !== false;
          if (typeof config.activeClaudeAccount === 'string') activeAccountRef.current = config.activeClaudeAccount;
          if (typeof config.opacity === 'number') setWindowOpacity(config.opacity);
          const dark = Boolean(config.darkMode);
          setIsDarkMode(dark);
          if (dark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }

          // Reopen the tabs left open last time: notes (that still exist), unsaved notes,
          // terminals and Claude chats (resumed), in the same order
          const saved = Array.isArray(config.openTabs) ? config.openTabs : [];
          const restored: TabItem[] = [];
          let activeRestored: TabItem | undefined;
          const stamp = Date.now();
          for (const [i, t] of saved.entries()) {
            const id = `${t.kind === 'claude' ? 'claude' : t.kind === 'terminal' ? 'term' : 'tab'}-restored-${i}-${stamp}`;
            let tab: TabItem | null = null;
            if (!t.kind || t.kind === 'note') {
              const contentRes = await window.electronAPI.readFile(t.path);
              if (contentRes.success && contentRes.content !== undefined) {
                tab = { id, title: t.title, path: t.path, content: contentRes.content, isDirty: false, isPinned: t.isPinned };
              }
              if (tab && !Number.isInteger(config.activeTabIndex) && t.path === config.activeTabPath) activeRestored = tab;
            } else {
              tab = restoreTab(t, id);
            }
            if (!tab) continue;
            restored.push(tab);
            if (i === config.activeTabIndex) activeRestored = tab;
          }

          // Only replace the startup placeholder, never tabs the user already opened
          const untouched = (prev: TabItem[]) => prev.length === 1 && prev[0].id === WELCOME_TAB_ID;
          if (restored.length) {
            const active = activeRestored || restored[restored.length - 1];
            setTabs((prev) => (untouched(prev) ? restored : prev));
            setActiveTabId((prevId) => (prevId === WELCOME_TAB_ID ? active.id : prevId));
          } else if (config.welcomeSeen) {
            // Welcome was already shown once: start with an empty note instead
            const blank: TabItem = { id: `tab-${Date.now()}-blank`, title: 'scratch-1.md', path: null, content: '', isDirty: false };
            setTabs((prev) => (untouched(prev) ? [blank] : prev));
            setActiveTabId((prevId) => (prevId === WELCOME_TAB_ID ? blank.id : prevId));
          } else {
            void window.electronAPI.saveAppConfig({ welcomeSeen: true });
          }
        } catch (err) {
          logError('App.init', err);
        }
        sessionReadyRef.current = true;
        // Launched with a folder/file ("Abrir con yanote"): open it once the notes are in place
        try {
          const target = await window.electronAPI.takeOpenTarget?.();
          if (target) await openTargetRef.current(target);
        } catch (err) {
          logError('App.openTarget', err);
        }
      }
    };
    initApp();
  }, []);

  // Remember the open tabs (and the active one) for the next start. The welcome note isn't kept.
  // Saved notes are kept by path, so typing in them doesn't rewrite the config; unsaved ones keep their text.
  const savedTabs = toSavedTabs(tabs, [WELCOME_TAB_ID]);
  const keptTabs = tabs.filter((t) => t.id !== WELCOME_TAB_ID);
  const sessionKey = JSON.stringify([savedTabs, Math.max(0, keptTabs.findIndex((t) => t.id === activeTabId))]);
  useEffect(() => {
    if (!sessionReadyRef.current || !window.electronAPI) return;
    const timer = setTimeout(() => {
      const [openTabs, activeTabIndex] = JSON.parse(sessionKey);
      void window.electronAPI?.saveAppConfig({ openTabs, activeTabIndex });
    }, 800);
    return () => clearTimeout(timer);
  }, [sessionKey]);

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
          logError('App.saveDarkMode', err);
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
      logError('App.setOpacity', err);
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

  const handleNewTerminal = (shell: TerminalShell, options: { title?: string; initialCommand?: string } = {}) => {
    const newId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // Open where the user is: the folder of the active note, else (main process) the notes folder
    const current = tabs.find((t) => t.id === activeTabId);
    const cwd = current?.kind === 'terminal' || current?.kind === 'claude' ? current.cwd : parentDir(current?.path ?? null) ?? undefined;
    setTabs((prev) => {
      const baseName = shell === 'powershell' ? 'PowerShell' : 'CMD';
      const count = prev.filter((t) => t.kind === 'terminal' && t.shell === shell).length + 1;
      const newTab: TabItem = {
        id: newId,
        title: options.title || (count > 1 ? `${baseName} ${count}` : baseName),
        path: null,
        content: '',
        isDirty: false,
        kind: 'terminal',
        shell,
        cwd,
        initialCommand: options.initialCommand,
      };
      return [...prev, newTab];
    });
    setActiveTabId(newId);
  };

  const handleNewClaude = (folder?: string, initialDraft?: string) => {
    const newId = `claude-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // Same folder rule as terminals: where the active note lives, else the notes folder
    const current = tabs.find((t) => t.id === activeTabId);
    const cwd =
      folder ??
      (current?.kind === 'terminal' || current?.kind === 'claude' ? current.cwd : parentDir(current?.path ?? null) ?? undefined);
    setTabs((prev) => {
      const count = prev.filter((t) => t.kind === 'claude').length + 1;
      return [
        ...prev,
        {
          id: newId,
          title: count > 1 ? `Claude ${count}` : 'Claude',
          path: null,
          content: '',
          isDirty: false,
          kind: 'claude',
          cwd,
          // From a chat: same account; otherwise the account picked last
          accountId: current?.kind === 'claude' && current.accountId ? current.accountId : activeAccountRef.current,
          ...(initialDraft ? { initialDraft } : {}),
        },
      ];
    });
    setActiveTabId(newId);
  };

  /** Sign-in runs Claude Code's own `auth login` in a terminal tab: yanote never sees the credentials */
  const handleClaudeLogin = async (account: { id: string; name: string }) => {
    const command = (await window.electronAPI?.claudeAccounts?.loginCommand(account.id)) || 'claude auth login';
    const title = account.id === 'default' ? 'Iniciar sesión en Claude' : `Iniciar sesión: ${account.name}`;
    handleNewTerminal('powershell', { title, initialCommand: command });
  };

  // A chat moved to another account: remember it on the tab and for the next chats
  const handleChatAccountChange = (tabId: string, accountId: string) => {
    activeAccountRef.current = accountId;
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, accountId } : t)));
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

  // Tab menu > copy id / path / relative path (TabBar only forwards the click)
  const copyAndNotify = useCallback(async (text: string, done: string, scope: string) => {
    const ok = await copyText(text, scope);
    setNotification(ok ? { type: 'success', text: `✓ ${done}: ${text}` } : { type: 'error', text: 'No se pudo copiar al portapapeles' });
  }, []);
  const handleCopyId = useCallback((tab: TabItem) => void copyAndNotify(tab.id, 'ID copiado', 'App.copyId'), [copyAndNotify]);
  const handleCopyPath = useCallback(
    (tab: TabItem) => void copyAndNotify(notePathOf(tab, notesDir), 'Ruta copiada', 'App.copyPath'),
    [copyAndNotify, notesDir]
  );
  const handleCopyRelativePath = useCallback(
    (tab: TabItem) => void copyAndNotify(tab.title, 'Ruta relativa copiada', 'App.copyRelativePath'),
    [copyAndNotify]
  );

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

  const handleContentChange = (content: string, isNormalization = false) => {
    // Opening a note makes the rich editor reformat it: keep that text, but it isn't an unsaved edit
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content, isDirty: isNormalization ? t.isDirty : true } : t))
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
    // The empty start-up note is just a placeholder: the file takes its place
    const isBlankPlaceholder = (prev: TabItem[]) =>
      prev.length === 1 && !prev[0].path && !prev[0].kind && !prev[0].content && !prev[0].isDirty && prev[0].id !== WELCOME_TAB_ID;
    setTabs((prev) => (isBlankPlaceholder(prev) ? [newTab] : [...prev, newTab]));
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

  // "Abrir con yanote" from Explorer: a folder becomes the working folder and gets a Claude chat
  // there; a markdown file opens in a tab. The main process already saved the folder in the config.
  const handleOpenTarget = async (target: OpenTarget) => {
    const name = target.path.split(/[\\/]/).filter(Boolean).pop() || target.path;
    if (target.type === 'folder') {
      setNotesDir(target.path);
      handleNewClaude(target.path);
      setNotification({ type: 'success', text: `📂 Carpeta abierta: ${name}` });
      return;
    }
    const res = await window.electronAPI?.readFile(target.path);
    if (res?.success && res.content !== undefined) {
      openFileInTab(target.path, name, res.content);
      recordRecentFiles([{ path: target.path, name }]);
    } else {
      setNotification({ type: 'error', text: `No se pudo abrir ${name}: ${res?.error || 'error desconocido'}` });
    }
  };
  const openTargetRef = useRef(handleOpenTarget);
  useEffect(() => {
    openTargetRef.current = handleOpenTarget;
  });
  useEffect(() => window.electronAPI?.onOpenTarget?.((target) => void openTargetRef.current(target)), []);

  // --- Windows notification when a Claude chat finishes or waits for you, unless you're looking at it ---
  useEffect(
    () =>
      window.electronAPI?.onClaudeEvent?.((evt) => {
        if (!notifyClaudeRef.current) return;
        const tab = tabsRef.current.find((t) => t.id === evt.id);
        const note = chatNotificationFor(evt, tab?.title ?? 'Claude');
        // Skipped by the main process when this chat is the active tab of the focused window
        if (note) void window.electronAPI?.notify?.({ ...note, tabId: evt.id, skipIfFocused: activeTabIdRef.current === evt.id });
      }),
    []
  );
  // --- Ideas & pins from the right-click menu ---
  const updateIdeas = (next: SavedIdea[]) => {
    ideasRef.current = next;
    setIdeas(next);
    window.electronAPI?.saveAppConfig({ ideas: next })?.catch((err) => logError('App.updateIdeas', err, { count: next.length }));
  };
  const saveIdeaRef = useRef<(p: { text: string; chatTabId: string | null }) => void>(() => {});
  saveIdeaRef.current = ({ text, chatTabId }) => {
    try {
      // Where it came from: the chat it was selected in, else the tab on screen
      const from = tabs.find((t) => t.id === chatTabId) || tabs.find((t) => t.id === activeTabId);
      const cwd = from?.kind === 'claude' || from?.kind === 'terminal' ? from.cwd || notesDir : parentDir(from?.path ?? null) ?? undefined;
      updateIdeas(addIdea(ideasRef.current, { text, source: from?.title, cwd: cwd || undefined }));
      setNotification({ type: 'success', text: '💡 Idea guardada' });
    } catch (err) {
      logError('App.saveIdea', err, { chatTabId });
      setNotification({ type: 'error', text: 'No se pudo guardar la idea' });
    }
  };
  const pinInChat = (text: string, tabId: string) => {
    try {
      const clean = text.trim();
      if (!clean) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId && !(t.chatPins || []).some((p) => p.text === clean)
            ? { ...t, chatPins: [...(t.chatPins || []), { id: `pin-${Date.now().toString(36)}`, text: clean }] }
            : t
        )
      );
    } catch (err) {
      logError('App.pinInChat', err, { tabId });
    }
  };
  // A chat's Claude Code session, kept so the chat comes back after a restart
  const handleChatSessionId = useCallback((tabId: string, sessionId: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId && t.sessionId !== sessionId ? { ...t, sessionId } : t)));
  }, []);
  const handleUnpin = (tabId: string, pinId: string) =>
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, chatPins: (t.chatPins || []).filter((p) => p.id !== pinId) } : t)));
  // --- Right-click menu in yanote's own style (replaces the native one everywhere) ---
  const contextMenu = useAppContextMenu({
    sendToChat: (text) => handleNewClaude(undefined, text),
    saveIdea: (text, chatTabId) => saveIdeaRef.current({ text, chatTabId }),
    pin: pinInChat,
    readAloud: (text, from) => {
      const target = readAloudTarget(from.chatTabId, from.termTabId, activeTabIdRef.current);
      if (target) requestReadAloud(target, text);
    },
  });

  // Clicking the notification brings that chat to the front
  useEffect(
    () =>
      window.electronAPI?.onFocusTab?.((id) => {
        if (tabsRef.current.some((t) => t.id === id)) setActiveTabId(id);
      }),
    []
  );

  // --- Drag & drop .md files from Explorer onto the window: each opens in a tab ---
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const openDroppedFiles = async (files: File[]) => {
    const opened: { path: string; name: string }[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const filePath = window.electronAPI?.getPathForFile?.(file);
      if (!filePath) {
        errors.push(file.name);
        continue;
      }
      const res = await window.electronAPI!.readFile(filePath);
      if (res.success && res.content !== undefined) {
        openFileInTab(filePath, baseName(filePath), res.content);
        opened.push({ path: filePath, name: baseName(filePath) });
      } else {
        errors.push(`${file.name}: ${res.error || 'no se pudo leer'}`);
      }
    }
    recordRecentFiles(opened);
    if (errors.length) setNotification({ type: 'error', text: `No se pudo abrir: ${errors.join(' · ')}` });
    else if (opened.length > 1) setNotification({ type: 'success', text: `✓ ${opened.length} notas abiertas` });
  };
  const openDroppedRef = useRef(openDroppedFiles);
  useEffect(() => {
    openDroppedRef.current = openDroppedFiles;
  });
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    let depth = 0; // dragenter/leave fire for every child element
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setIsDraggingFiles(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFiles(false);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // allows dropping anywhere
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    // Capture phase: markdown files are ours even when dropped on the editor or a terminal
    const onDropCapture = (e: DragEvent) => {
      depth = 0;
      setIsDraggingFiles(false);
      const files = Array.from(e.dataTransfer?.files || []);
      const markdown = files.filter((f) => isMarkdownFile(f.name));
      if (!markdown.length) return; // e.g. images for the Claude chat keep their own handler
      e.preventDefault();
      e.stopPropagation();
      void openDroppedRef.current(markdown);
    };
    // Bubble phase: any other file nobody handled must not navigate away from the app
    const onDropBubble = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDropCapture, true);
    window.addEventListener('drop', onDropBubble);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDropCapture, true);
      window.removeEventListener('drop', onDropBubble);
    };
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const claudeTabIds = tabs.filter((t) => t.kind === 'claude').map((t) => t.id);
  const claudeUsage = useClaudeUsage(claudeTabIds, activeTab?.kind === 'claude' ? activeTab.id : undefined);
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
        onOpenIdeas={() => setIsIdeasOpen(true)}
        ideasCount={ideas.length}
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
        onNewClaude={() => handleNewClaude()}
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
              initialCommand={t.initialCommand}
              isActive={t.id === activeTab?.id}
              isDarkMode={isDarkMode}
            />
          ))}

        {/* Claude chats also stay mounted so the Claude Code process and transcript survive tab switches */}
        {tabs
          .filter((t) => t.kind === 'claude')
          .map((t) => (
            <ClaudeChatView
              key={t.id}
              tabId={t.id}
              cwd={t.cwd}
              isActive={t.id === activeTab?.id}
              onLogin={(a) => void handleClaudeLogin(a)}
              accountId={t.accountId}
              initialDraft={t.initialDraft}
              pins={t.chatPins}
              resumeSessionId={t.sessionId}
              onSessionId={(sessionId) => handleChatSessionId(t.id, sessionId)}
              onUnpin={(pinId) => handleUnpin(t.id, pinId)}
              onAccountChange={(accountId) => handleChatAccountChange(t.id, accountId)}
            />
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

        {/* Drop hint while dragging files over the window (doesn't block the drop target below) */}
        {isDraggingFiles && (
          <div
            data-testid="drop-overlay"
            className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded border-[3px] border-dashed border-black dark:border-[#FFE500] bg-[#FFE500]/25 dark:bg-[#FFE500]/10"
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-[#FFE500] text-black border-2 border-black rounded shadow-[3px_3px_0px_#000] font-black text-xs text-center">
              <FileText size={16} strokeWidth={3} className="shrink-0" />
              <span>Suelta tus .md para abrirlos</span>
            </div>
          </div>
        )}

        {/* Floating Notification Pill */}
        {notification && (
          <div
            role={notification.type === 'error' ? 'alert' : 'status'}
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
            <span className="min-w-0">{notification.text}</span>
            <DismissButton onClick={() => setNotification(null)} />
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
          {/* Claude plan usage (5-hour / weekly), while a Claude chat is open */}
          <ClaudeUsageMeter usage={claudeUsage} />

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

      {contextMenu.menu && (
        <AppContextMenu
          x={contextMenu.menu.x}
          y={contextMenu.menu.y}
          entries={contextMenu.menu.entries}
          onAction={contextMenu.runAction}
          onClose={contextMenu.close}
        />
      )}

      <IdeasDrawer
        isOpen={isIdeasOpen}
        onClose={() => setIsIdeasOpen(false)}
        ideas={ideas}
        onRemove={(id) => updateIdeas(removeIdea(ideasRef.current, id))}
        onSendToNewChat={(idea) => {
          setIsIdeasOpen(false);
          handleNewClaude(idea.cwd, idea.text);
        }}
        onInsertInChat={
          activeTab?.kind === 'claude'
            ? (idea) => {
                setIsIdeasOpen(false);
                window.dispatchEvent(new CustomEvent('yanote:append-draft', { detail: { tabId: activeTab.id, text: idea.text } }));
              }
            : undefined
        }
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
