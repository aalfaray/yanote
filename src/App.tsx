import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { TabBar } from './components/TabBar';
import { Editor } from './components/Editor';
import { GitModal } from './components/GitModal';
import { SettingsModal } from './components/SettingsModal';
import { NotesDrawer } from './components/NotesDrawer';
import { ConfirmModal } from './components/ui/ConfirmModal';
import type { TabItem, NoteFile, GitStatus } from './types/electron';
import { Save, GitBranch, RefreshCw, Check, AlertCircle } from 'lucide-react';

const DEFAULT_WELCOME_MARKDOWN = `# Bienvenido a tu Editor Markdown Neubrutalista ⚡

Este es un editor **portable, flotante y sincronizado con GitHub** diseñado con la estética **Boldkit**.

### ✨ Características destacadas:
- **Superposición (Always on Top):** Haz clic en el botón de pin 📌 en la barra superior para mantener la ventana siempre visible encima de otras aplicaciones.
- **Pestañas tipo Orca:** Abre múltiples notas simultáneamente con el botón \`+\`. Cada pestaña es un archivo markdown independiente.
- **Editor Rico con @mdxeditor/editor:** Formato enriquecido, tablas, bloques de código, listas, enlaces y alternancia rápida a código fuente Markdown.
- **Control de Versiones & GitHub:** Tus notas se guardan localmente en un repositorio Git y se sincronizan con tu repositorio de GitHub con 1 solo clic.
- **Resolución Compacta y Redimensionable:** Diseñado inicialmente en tamaño pequeño/compacto tipo bloc de notas flotante, con libertad total para agrandarlo o maximizarlo.

---
> *Tip: Presiona Ctrl + S para guardar tu nota o usa la barra de herramientas para sincronizar con Git.*
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
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [notesDir, setNotesDir] = useState<string>('');
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modals
  const [isGitModalOpen, setIsGitModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilesDrawerOpen, setIsFilesDrawerOpen] = useState(false);
  const [closingTab, setClosingTab] = useState<TabItem | null>(null);
  const [editorViewMode, setEditorViewMode] = useState<'rich-text' | 'source'>('rich-text');

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load initial notes & app config
  const refreshNotes = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.listNotes();
      if (res.success) {
        setNotes(res.notes);
      }
      const dir = await window.electronAPI.getNotesPath();
      setNotesDir(dir);
      const git = await window.electronAPI.gitStatus();
      if (git.success) {
        setGitStatus(git);
      }
    } catch (err) {
      console.error('Error refreshing notes:', err);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      if (window.electronAPI) {
        try {
          const config = await window.electronAPI.getAppConfig();
          setIsAlwaysOnTop(config.alwaysOnTop || false);
          const dark = Boolean(config.darkMode);
          setIsDarkMode(dark);
          if (dark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }

          const res = await window.electronAPI.listNotes();
          if (res.success && res.notes.length > 0) {
            setNotes(res.notes);
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

          const git = await window.electronAPI.gitStatus();
          if (git.success) {
            setGitStatus(git);
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
  const handleNewTab = () => {
    setTabs((prev) => {
      const scratchCount = prev.filter((t) => t.title.startsWith('scratch-')).length + 1;
      const newTitle = `scratch-${scratchCount}.md`;
      const newId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const newTab: TabItem = {
        id: newId,
        title: newTitle,
        path: null,
        content: `# ${newTitle.replace('.md', '')}\n\nEscribe tus notas aquí...\n`,
        isDirty: true,
      };
      setActiveTabId(newId);
      return [...prev, newTab];
    });
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
        content: '# scratch-1\n\nEscribe tus notas aquí...\n',
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

  // Global keyboard shortcuts (Ctrl+Shift+D to toggle dark mode, Ctrl+W, Ctrl+Alt+W)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
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
    // Scratchpad tab rename in memory
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle, isDirty: true } : t))
    );
  };

  const handleContentChange = (content: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content, isDirty: true } : t))
    );
  };

  // Save current active tab & commit to Git
  const handleSaveActiveTab = async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

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
          text: `✓ Guardado & Versionado: ${activeTab.title}`,
        });
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

  // Open note from Drawer
  const handleOpenNote = async (note: NoteFile) => {
    // Check if already open in tabs
    const existing = tabs.find((t) => t.path === note.path || t.title === note.name);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    if (window.electronAPI) {
      const res = await window.electronAPI.readFile(note.path);
      if (res.success && res.content !== undefined) {
        const newTab: TabItem = {
          id: `tab-${note.name}-${Date.now()}`,
          title: note.name,
          path: note.path,
          content: res.content,
          isDirty: false,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
    }
  };

  // Delete note
  const handleDeleteNote = async (filePath: string) => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.deleteFile(filePath);
    if (res.success) {
      // If deleted note is open in a tab, remove it
      setTabs((prev) => prev.filter((t) => t.path !== filePath));
      refreshNotes();
      setNotification({ type: 'info', text: 'Nota eliminada del repositorio' });
    }
  };

  // Quick 1-Click Git Sync
  const handleQuickSync = async () => {
    if (!window.electronAPI) return;
    setIsSyncing(true);
    try {
      const res = await window.electronAPI.gitSync();
      if (res.success) {
        setNotification({
          type: res.synced ? 'success' : 'info',
          text: res.message || 'Git sincronizado',
        });
        await refreshNotes();
      } else {
        setNotification({
          type: 'error',
          text: `Error en sincronización: ${res.error}`,
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const hasChanges = (gitStatus?.modified?.length || 0) + (gitStatus?.not_added?.length || 0) > 0;

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
        onOpenGit={() => setIsGitModalOpen(true)}
        gitBranch={gitStatus?.currentBranch || 'main'}
        hasGitChanges={hasChanges}
        isSyncing={isSyncing}
      />

      {/* 2. Orca-style Tab Bar for Multiple Markdown Documents */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
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
        {activeTab ? (
          <Editor
            tabId={activeTab.id}
            markdown={activeTab.content}
            onChange={handleContentChange}
            onSave={handleSaveActiveTab}
            isDarkMode={isDarkMode}
            viewMode={editorViewMode}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-neutral-500">
            Ninguna nota abierta. Haz clic en "+" para crear una nueva pestaña.
          </div>
        )}

        {/* Floating Notification Pill */}
        {notification && (
          <div
            className={`absolute bottom-8 right-3 z-30 px-3 py-1.5 rounded border-2 border-black font-black text-xs shadow-[3px_3px_0px_#000] flex items-center gap-1.5 animate-in slide-in-from-bottom-2 duration-150 ${
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
      <div className="h-6 w-full bg-[#FAF8F5] dark:bg-[#18181B] border-t-2 border-black dark:border-zinc-700 flex items-center justify-between px-2 text-[10px] select-none shrink-0 font-bold z-20 text-black dark:text-zinc-200 transition-colors whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          {/* Active Tab filename & dirty state */}
          <span className="truncate max-w-[80px] min-[420px]:max-w-[140px] flex items-center gap-1 shrink">
            <span className="text-black/60 dark:text-zinc-400 hidden min-[360px]:inline">Nota:</span>
            <span className="text-black dark:text-white font-black truncate">{activeTab?.title}</span>
            {activeTab?.isDirty && (
              <span className="text-[#FF6B6B] font-black shrink-0">*sin guardar</span>
            )}
          </span>

          <div className="h-3 w-[1px] bg-black/30 dark:bg-zinc-600 shrink-0" />

          {/* Quick Save Button */}
          <button
            onClick={handleSaveActiveTab}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-[#FFE500] hover:bg-[#FFD700] text-black border border-black rounded shadow-[1px_1px_0px_#000] active:translate-x-[0.5px] active:translate-y-[0.5px] cursor-pointer font-black whitespace-nowrap shrink-0"
            title="Guardar nota y confirmar en Git (Ctrl + S)"
          >
            <Save size={10} strokeWidth={2.8} className="shrink-0" />
            <span className="whitespace-nowrap">Guardar (Ctrl+S)</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {/* Git Branch & Quick Sync */}
          <button
            onClick={handleQuickSync}
            disabled={isSyncing}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-zinc-800 hover:bg-neutral-100 dark:hover:bg-zinc-700 border border-black dark:border-zinc-600 rounded shadow-[1px_1px_0px_#000] active:translate-x-[0.5px] active:translate-y-[0.5px] cursor-pointer shrink-0 whitespace-nowrap"
            title="Sincronizar cambios con GitHub"
          >
            <GitBranch size={10} strokeWidth={2.5} className="shrink-0" />
            <span className="max-w-[40px] min-[400px]:max-w-[80px] truncate">{gitStatus?.currentBranch || 'main'}</span>
            <RefreshCw size={9} strokeWidth={2.5} className={`shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

          {/* Superposición Status Badge */}
          <span
            className={`px-1.5 py-0.2 rounded border border-black dark:border-zinc-600 font-black text-[9px] shrink-0 hidden min-[440px]:inline-block ${
              isAlwaysOnTop ? 'bg-[#78E08F] text-black' : 'bg-neutral-200 dark:bg-zinc-700 text-neutral-600 dark:text-zinc-300'
            }`}
          >
            {isAlwaysOnTop ? 'PINNED' : 'NORMAL'}
          </span>
        </div>
      </div>

      {/* Modals & Drawers */}
      <GitModal
        isOpen={isGitModalOpen}
        onClose={() => setIsGitModalOpen(false)}
        currentFilePath={activeTab?.path}
        onRefreshNotes={refreshNotes}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigChanged={refreshNotes}
      />

      <NotesDrawer
        isOpen={isFilesDrawerOpen}
        onClose={() => setIsFilesDrawerOpen(false)}
        notes={notes}
        onOpenNote={handleOpenNote}
        onNewNote={handleNewTab}
        onDeleteNote={handleDeleteNote}
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
    </div>
  );
};

export default App;
