import { t, useLanguage } from '../lib/i18n';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, FileText, Check, ChevronLeft, ChevronRight, ChevronDown, Pin, SquareTerminal, Terminal, FolderOpen, Sparkles, Orbit } from 'lucide-react';
import type { ChatProvider, TabItem, TerminalShell } from '../types/electron';
import { TabContextMenu } from './ui/TabContextMenu';

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onNewTerminal?: (shell: TerminalShell) => void;
  /** Opens a chat with Claude Code, or Antigravity CLI (Gemini), as a structured session instead of the TUI */

  onNewClaude?: (provider?: ChatProvider) => void;
  /** Browse the disk and open an existing .md file */

  onOpenFile?: () => void;
  onRenameTab: (id: string, newTitle: string) => void;
  onTogglePinTab?: (id: string) => void;
  onCloseOthers?: (id: string) => void;
  onCloseAll?: () => void;
  onTogglePreview?: () => void;
  onCopyPath?: (tab: TabItem) => void;
  onCopyRelativePath?: (tab: TabItem) => void;
  onCopyId?: (tab: TabItem) => void;
  onRevealInExplorer?: (tab: TabItem) => void;
  /** Export a note tab to PDF */

  onExportPdf?: (tab: TabItem) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewTerminal,
  onNewClaude,
  onOpenFile,
  onRenameTab,
  onTogglePinTab,
  onCloseOthers,
  onCloseAll,
  onTogglePreview,
  onCopyPath,
  onCopyRelativePath,
  onCopyId,
  onRevealInExplorer,
  onExportPdf,
}) => {
  useLanguage();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState({ top: 0, right: 0 });
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Close the "new" menu on outside click or Escape
  useEffect(() => {
    if (!isNewMenuOpen) return;
    const handlePointer = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNewMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isNewMenuOpen]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    tab: TabItem | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    tab: null,
  });

  // Check overflow state to show scroll buttons if needed
  const checkScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [tabs, checkScroll]);

  // Scroll active tab into view smoothly
  useEffect(() => {
    if (activeTabId && scrollContainerRef.current) {
      const activeEl = scrollContainerRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
    checkScroll();
  }, [activeTabId, checkScroll]);

  // Focus and select rename input
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  // Convert vertical mouse wheel into horizontal scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY || e.deltaX;
      checkScroll();
    }
  };

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      if (typeof scrollContainerRef.current.scrollBy === 'function') {
        scrollContainerRef.current.scrollBy({ left: -140, behavior: 'smooth' });
      } else {
        scrollContainerRef.current.scrollLeft -= 140;
      }
      setTimeout(checkScroll, 200);
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      if (typeof scrollContainerRef.current.scrollBy === 'function') {
        scrollContainerRef.current.scrollBy({ left: 140, behavior: 'smooth' });
      } else {
        scrollContainerRef.current.scrollLeft += 140;
      }
      setTimeout(checkScroll, 200);
    }
  };

  const handleStartRename = (tab: TabItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const handleFinishRename = (id: string) => {
    if (editTitle.trim()) {
      let finalName = editTitle.trim();
      const kind = tabs.find((t) => t.id === id)?.kind;
      const isTerminal = kind === 'terminal' || kind === 'claude';
      if (!isTerminal && !finalName.endsWith('.md')) {
        finalName += '.md';
      }
      onRenameTab(id, finalName);
    }
    setEditingTabId(null);
  };

  // Copying (and telling the user) is App's job: the tab bar only reports which tab
  const handleCopyId = (targetTab: TabItem) => onCopyId?.(targetTab);
  const handleCopyPath = (targetTab: TabItem) => onCopyPath?.(targetTab);
  const handleCopyRelativePath = (targetTab: TabItem) => onCopyRelativePath?.(targetTab);

  const canCloseOthers = contextMenu.tab
    ? tabs.filter((t) => t.id !== contextMenu.tab?.id && !t.isPinned).length > 0
    : false;

  return (
    <div className="h-10 w-full bg-muted border-b border-border flex items-center px-1 select-none gap-0.5 overflow-hidden shrink-0 transition-colors relative">
      {/* Scroll Left Button (appears when overflowing) */}
      {canScrollLeft && (
        <button
          onClick={handleScrollLeft}
          title={t("Desplazar pestañas a la izquierda")}
          className="h-6 w-5 flex items-center justify-center bg-card dark:text-foreground border border-border rounded-md shadow-sm hover:bg-accent dark:hover:text-foreground shrink-0 cursor-pointer z-10 mr-0.5"
        >
          <ChevronLeft size={13} strokeWidth={1.75} />
        </button>
      )}

      {/* Tab List with horizontal mousewheel and hidden native scrollbars */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        onScroll={checkScroll}
        className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar h-full py-1 px-0.5 scroll-smooth"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={(e) => handleStartRename(tab, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  isOpen: true,
                  x: e.clientX,
                  y: e.clientY,
                  tab,
                });
              }}
              className={`group flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium border rounded-md transition-all cursor-pointer max-w-[170px] min-w-[90px] shrink-0 select-none ${
                isActive
                  ? 'bg-background shadow-xs text-foreground border-border'
                  : 'bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {tab.isPinned ? (
                <span title={t("Pestaña fijada")} className="shrink-0 flex items-center">
                  <Pin
                    size={11}
                    strokeWidth={1.75}
                    className="text-warning dark:text-foreground"
                  />
                </span>
              ) : tab.kind === 'claude' && tab.provider === 'antigravity' ? (
                <Orbit size={12} strokeWidth={1.75} className="shrink-0 text-[#4285F4]" />
              ) : tab.kind === 'claude' ? (
                <Sparkles size={12} strokeWidth={1.75} className="shrink-0 text-[#D97757]" />
              ) : tab.kind === 'terminal' ? (
                <SquareTerminal size={12} strokeWidth={1.75} className="shrink-0 text-foreground/70 dark:text-muted-foreground" />
              ) : (
                <FileText size={12} strokeWidth={1.75} className="shrink-0 text-foreground/70 dark:text-muted-foreground" />
              )}

              {/* Title or Edit Input */}
              {isEditing ? (
                <div
                  className="flex items-center gap-1 flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename(tab.id);
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    onBlur={() => handleFinishRename(tab.id)}
                    className="w-full text-xs font-medium bg-card dark:text-foreground border border-border px-1 py-0 rounded-md focus:outline-none"
                  />
                  <button
                    onClick={() => handleFinishRename(tab.id)}
                    className="p-0.5 hover:bg-muted rounded-md"
                  >
                    <Check size={11} strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                <span
                  className="truncate flex-1 min-w-0"
                  title={t("{0}{1} (Doble clic para renombrar, clic derecho para opciones)", [tab.title, tab.isPinned ? t(" (Fijada)") : ''])}
                >
                  {tab.title}
                </span>
              )}

              {/* Dirty indicator */}
              {tab.isDirty && !isEditing && (
                <span
                  title={t("Cambios sin guardar")}
                  className="w-2 h-2 rounded-full bg-destructive border border-border shrink-0"
                />
              )}

              {/* Close Button: Hidden if tab is pinned or only 1 tab */}
              {tabs.length > 1 && !tab.isPinned && !isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="w-4 h-4 rounded-md flex items-center justify-center opacity-40 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all shrink-0 cursor-pointer dark:text-foreground"
                  title={t("Cerrar pestaña")}
                >
                  <X size={10} strokeWidth={1.75} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Scroll Right Button (appears when overflowing) */}
      {canScrollRight && (
        <button
          onClick={handleScrollRight}
          title={t("Desplazar pestañas a la derecha")}
          className="h-6 w-5 flex items-center justify-center bg-card dark:text-foreground border border-border rounded-md shadow-sm hover:bg-accent dark:hover:text-foreground shrink-0 cursor-pointer z-10 ml-0.5"
        >
          <ChevronRight size={13} strokeWidth={1.75} />
        </button>
      )}

      {/* New Tab split button: main part = Markdown, caret = choose type */}
      <div ref={newMenuRef} className="relative flex items-stretch h-7 ml-1 shrink-0 z-10">
        <button
          onClick={onNewTab}
          title={t("Nueva nota Markdown (estilo Orca)")}
          className="px-2 flex items-center gap-1 bg-accent hover:bg-accent border border-border rounded-l shadow-sm text-xs font-semibold cursor-pointer transition-all"
        >
          <Plus size={14} strokeWidth={1.75} />
          <span className="hidden sm:inline">{t("NUEVA")}</span>
        </button>
        <button
          onClick={() => {
            const rect = newMenuRef.current?.getBoundingClientRect();
            if (rect) {
              setNewMenuPos({ top: rect.bottom + 6, right: Math.max(4, window.innerWidth - rect.right) });
            }
            setIsNewMenuOpen((v) => !v);
          }}
          title={t("Elegir tipo de pestaña nueva")}
          aria-haspopup="menu"
          aria-expanded={isNewMenuOpen}
          className={`px-0.5 flex items-center border border-l-0 border-border rounded-r shadow-sm cursor-pointer transition-all ${
            isNewMenuOpen ? 'bg-accent' : 'bg-accent hover:bg-accent'
          }`}
        >
          <ChevronDown size={13} strokeWidth={1.75} />
        </button>

        {isNewMenuOpen && (
          <div
            role="menu"
            style={{ top: newMenuPos.top, right: newMenuPos.right }}
            className="fixed w-52 bg-popover text-popover-foreground border border-border rounded-md shadow-md py-1 z-50"
          >
            {[
              { key: 'md', label: t("Nota Markdown"), hint: '.md', icon: <FileText size={14} strokeWidth={1.75} />, action: () => onNewTab() },
              ...(onOpenFile
                ? [{ key: 'open', label: t("Abrir archivo…"), hint: 'Ctrl+O', icon: <FolderOpen size={14} strokeWidth={1.75} />, action: () => onOpenFile() }]
                : []),
              ...(onNewClaude
                ? [
                    { key: 'claude', label: t("Chat con Claude"), hint: 'AI', icon: <Sparkles size={14} strokeWidth={1.75} className="text-[#D97757]" />, action: () => onNewClaude('claude') },
                    {
                      key: 'antigravity',
                      label: t("Chat con Antigravity"),
                      hint: 'Gemini',
                      icon: <Orbit size={14} strokeWidth={1.75} className="text-[#4285F4]" />,
                      action: () => onNewClaude('antigravity'),
                    },
                  ]
                : []),
              { key: 'ps', label: 'PowerShell', hint: 'PS', icon: <Terminal size={14} strokeWidth={1.75} />, action: () => onNewTerminal?.('powershell') },
              { key: 'cmd', label: t("Terminal (CMD)"), hint: 'cmd', icon: <SquareTerminal size={14} strokeWidth={1.75} />, action: () => onNewTerminal?.('cmd') },
            ].map((item) => (
              <button
                key={item.key}
                role="menuitem"
                onClick={() => {
                  setIsNewMenuOpen(false);
                  item.action();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-left hover:bg-accent hover:text-foreground cursor-pointer"
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] font-semibold opacity-50">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Context Menu */}
      <TabContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        tab={contextMenu.tab}
        tabsCount={tabs.length}
        canCloseOthers={canCloseOthers}
        onCloseMenu={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onRename={(targetTab) => handleStartRename(targetTab)}
        onTogglePin={(targetTab) => onTogglePinTab?.(targetTab.id)}
        onCopyId={(targetTab) => handleCopyId(targetTab)}
        onCloseTab={(targetTab) => onCloseTab(targetTab.id)}
        onCloseOthers={(targetTab) => onCloseOthers?.(targetTab.id)}
        onCloseAll={() => onCloseAll?.()}
        onTogglePreview={() => onTogglePreview?.()}
        onCopyPath={(targetTab) => handleCopyPath(targetTab)}
        onCopyRelativePath={(targetTab) => handleCopyRelativePath(targetTab)}
        onRevealInExplorer={(targetTab) => onRevealInExplorer?.(targetTab)}
        onExportPdf={onExportPdf}
      />
    </div>
  );
};
