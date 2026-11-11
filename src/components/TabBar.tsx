import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, FileText, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TabItem } from '../types/electron';

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab: (id: string, newTitle: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onRenameTab,
}) => {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  const handleStartRename = (tab: TabItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const handleFinishRename = (id: string) => {
    if (editTitle.trim()) {
      let finalName = editTitle.trim();
      if (!finalName.endsWith('.md')) {
        finalName += '.md';
      }
      onRenameTab(id, finalName);
    }
    setEditingTabId(null);
  };

  return (
    <div className="h-10 w-full bg-[#EFECE6] dark:bg-[#1C1C20] border-b-2 border-black dark:border-zinc-700 flex items-center px-1 select-none gap-0.5 overflow-hidden shrink-0 transition-colors">
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
              className={`group flex items-center gap-1.5 px-2.5 h-7 text-xs font-bold border-2 rounded transition-all cursor-pointer max-w-[170px] min-w-[90px] shrink-0 select-none ${
                isActive
                  ? 'bg-white dark:bg-[#121212] shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#FFE500] text-black dark:text-white border-black dark:border-[#FFE500]'
                  : 'bg-[#E3DFD5] dark:bg-[#27272A] hover:bg-[#D9D5CB] dark:hover:bg-[#323238] text-neutral-800 dark:text-zinc-300 opacity-80 hover:opacity-100 shadow-[1px_1px_0px_#000] border-black dark:border-zinc-700'
              }`}
            >
              <FileText size={12} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400" />

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
                  title={`${tab.title} (Doble clic para renombrar)`}
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

              {/* Close Button */}
              {tabs.length > 1 && !isEditing && (
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

      {/* New Tab Button (Sticky on right) */}
      <button
        onClick={onNewTab}
        title="Nueva nota Markdown (Orca style)"
        className="h-7 px-2 flex items-center gap-1 bg-[#FFE500] hover:bg-[#FFD700] border-2 border-black rounded shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] text-xs font-black shrink-0 cursor-pointer transition-all ml-1 z-10"
      >
        <Plus size={14} strokeWidth={3} />
        <span className="hidden sm:inline">NUEVA</span>
      </button>
    </div>
  );
};
