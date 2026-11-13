import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, FileText, Check, ChevronLeft, ChevronRight, ChevronDown, Pin, SquareTerminal, Terminal, FolderOpen, Sparkles } from 'lucide-react';
import type { TabItem, TerminalShell } from '../types/electron';
import { TabContextMenu } from './ui/TabContextMenu';

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onNewTerminal?: (shell: TerminalShell) => void;
  /** Opens a chat with Claude Code (structured session instead of the TUI) */
  onNewClaude?: () => void;
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
}) => {
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
    <div className="h-10 w-full bg-[#EFECE6] dark:bg-[#1C1C20] border-b-2 border-black dark:border-zinc-700 flex items-center px-1 select-none gap-0.5 overflow-hidden shrink-0 transition-colors relative">
      {/* Scroll Left Button (appears when overflowing) */}
      {canScrollLeft && (
        <button
          onClick={handleScrollLeft}
          title="Desplazar pestañas a la izquierda"
          className="h-6 w-5 flex items-center justify-center bg-white dark:bg-zinc-800 dark:text-zinc-200 border border-black dark:border-zinc-600 rounded shadow-[1px_1px_0px_#000] hover:bg-[#FFE500] dark:hover:bg-[#FFE500] dark:hover:text-black shrink-0 cursor-pointer z-10 mr-0.5"
        >
          <ChevronLeft size={13} strokeWidth={3} />
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
              className={`group flex items-center gap-1.5 px-2.5 h-7 text-xs font-bold border-2 rounded transition-all cursor-pointer max-w-[170px] min-w-[90px] shrink-0 select-none ${
                isActive
                  ? 'bg-white dark:bg-[#121212] shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#FFE500] text-black dark:text-white border-black dark:border-[#FFE500]'
                  : 'bg-[#E3DFD5] dark:bg-[#27272A] hover:bg-[#D9D5CB] dark:hover:bg-[#323238] text-neutral-800 dark:text-zinc-300 opacity-80 hover:opacity-100 shadow-[1px_1px_0px_#000] border-black dark:border-zinc-700'
              }`}
            >
              {tab.isPinned ? (
                <span title="Pestaña fijada" className="shrink-0 flex items-center">
                  <Pin
                    size={11}
                    strokeWidth={2.8}
                    className="text-[#FFB800] dark:text-[#FFE500]"
                  />
                </span>
              ) : tab.kind === 'claude' ? (
                <Sparkles size={12} strokeWidth={2.5} className="shrink-0 text-[#D97757]" />
              ) : tab.kind === 'terminal' ? (
                <SquareTerminal size={12} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400" />
              ) : (
                <FileText size={12} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400" />
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
                    className="w-full text-xs font-bold bg-white dark:bg-zinc-800 dark:text-white border border-black dark:border-zinc-500 px-1 py-0 rounded focus:outline-none"
                  />
                  <button
                    onClick={() => handleFinishRename(tab.id)}
                    className="p-0.5 hover:bg-neutral-200 dark:hover:bg-zinc-700 rounded"
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <span
                  className="truncate flex-1 min-w-0"
                  title={`${tab.title}${tab.isPinned ? ' (Fijada)' : ''} (Doble clic para renombrar, clic derecho para opciones)`}
                >
                  {tab.title}
                </span>
              )}

              {/* Dirty indicator */}
              {tab.isDirty && !isEditing && (
                <span
                  title="Cambios sin guardar"
                  className="w-2 h-2 rounded-full bg-[#FF6B6B] border border-black shrink-0"
                />
              )}

              {/* Close Button: Hidden if tab is pinned or only 1 tab */}
              {tabs.length > 1 && !tab.isPinned && !isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="w-4 h-4 rounded flex items-center justify-center opacity-40 group-hover:opacity-100 hover:bg-[#FF6B6B] hover:text-white transition-all shrink-0 cursor-pointer dark:text-zinc-300"
                  title="Cerrar pestaña"
                >
                  <X size={10} strokeWidth={3} />
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
          title="Desplazar pestañas a la derecha"
          className="h-6 w-5 flex items-center justify-center bg-white dark:bg-zinc-800 dark:text-zinc-200 border border-black dark:border-zinc-600 rounded shadow-[1px_1px_0px_#000] hover:bg-[#FFE500] dark:hover:bg-[#FFE500] dark:hover:text-black shrink-0 cursor-pointer z-10 ml-0.5"
        >
          <ChevronRight size={13} strokeWidth={3} />
        </button>
      )}

      {/* New Tab split button: main part = Markdown, caret = choose type */}
      <div ref={newMenuRef} className="relative flex items-stretch h-7 ml-1 shrink-0 z-10">
        <button
          onClick={onNewTab}
          title="Nueva nota Markdown (estilo Orca)"
          className="px-2 flex items-center gap-1 bg-[#FFE500] hover:bg-[#FFD700] border-2 border-black rounded-l shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] text-xs font-black cursor-pointer transition-all"
        >
          <Plus size={14} strokeWidth={3} />
          <span className="hidden sm:inline">NUEVA</span>
        </button>
        <button
          onClick={() => {
            const rect = newMenuRef.current?.getBoundingClientRect();
            if (rect) {
              setNewMenuPos({ top: rect.bottom + 6, right: Math.max(4, window.innerWidth - rect.right) });
            }
            setIsNewMenuOpen((v) => !v);
          }}
          title="Elegir tipo de pestaña nueva"
          aria-haspopup="menu"
          aria-expanded={isNewMenuOpen}
          className={`px-0.5 flex items-center border-2 border-l-0 border-black rounded-r shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer transition-all ${
            isNewMenuOpen ? 'bg-[#FFD700]' : 'bg-[#FFE500] hover:bg-[#FFD700]'
          }`}
        >
          <ChevronDown size={13} strokeWidth={3} />
        </button>

        {isNewMenuOpen && (
          <div
            role="menu"
            style={{ top: newMenuPos.top, right: newMenuPos.right }}
            className="fixed w-52 bg-white dark:bg-[#1C1C20] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-600 rounded shadow-[3px_3px_0px_#000] py-1 z-50"
          >
            {[
              { key: 'md', label: 'Nota Markdown', hint: '.md', icon: <FileText size={14} strokeWidth={2.5} />, action: () => onNewTab() },
              ...(onOpenFile
                ? [{ key: 'open', label: 'Abrir archivo…', hint: 'Ctrl+O', icon: <FolderOpen size={14} strokeWidth={2.5} />, action: () => onOpenFile() }]
                : []),
              ...(onNewClaude
                ? [{ key: 'claude', label: 'Chat con Claude', hint: 'AI', icon: <Sparkles size={14} strokeWidth={2.5} className="text-[#D97757]" />, action: () => onNewClaude() }]
                : []),
              { key: 'ps', label: 'PowerShell', hint: 'PS', icon: <Terminal size={14} strokeWidth={2.5} />, action: () => onNewTerminal?.('powershell') },
              { key: 'cmd', label: 'Terminal (CMD)', hint: 'cmd', icon: <SquareTerminal size={14} strokeWidth={2.5} />, action: () => onNewTerminal?.('cmd') },
            ].map((item) => (
              <button
                key={item.key}
                role="menuitem"
                onClick={() => {
                  setIsNewMenuOpen(false);
                  item.action();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-left hover:bg-[#FFE500] hover:text-black cursor-pointer"
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] font-black opacity-50">{item.hint}</span>
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
      />
    </div>
  );
};
