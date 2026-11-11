import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileText, Check } from 'lucide-react';
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

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

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
    <div className="h-9 w-full bg-[#EFECE6] border-b-2 border-black flex items-center px-1.5 overflow-x-auto select-none gap-1 scrollbar-thin">
      {/* Tab List */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto py-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={(e) => handleStartRename(tab, e)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold border-2 border-black rounded transition-all cursor-pointer max-w-[170px] min-w-[90px] shrink-0 ${
                isActive
                  ? 'bg-white shadow-[2px_2px_0px_#000] text-black border-black'
                  : 'bg-[#E3DFD5] hover:bg-[#D9D5CB] text-neutral-800 opacity-80 hover:opacity-100 shadow-[1px_1px_0px_#000]'
              }`}
            >
              <FileText size={12} strokeWidth={2.5} className="shrink-0 text-black/70" />

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
                    className="w-full text-xs font-bold bg-white border border-black px-1 py-0 rounded focus:outline-none"
                  />
                  <button
                    onClick={() => handleFinishRename(tab.id)}
                    className="p-0.5 hover:bg-neutral-200 rounded"
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
                  className="w-4 h-4 rounded flex items-center justify-center opacity-40 hover:opacity-100 hover:bg-[#FF6B6B] hover:text-white transition-all shrink-0 cursor-pointer"
                  title="Cerrar pestaña"
                >
                  <X size={10} strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* New Tab Button */}
      <button
        onClick={onNewTab}
        title="Nueva nota Markdown (Orca style)"
        className="h-7 px-2 flex items-center gap-1 bg-[#FFE500] hover:bg-[#FFD700] border-2 border-black rounded shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] text-xs font-black shrink-0 cursor-pointer transition-all"
      >
        <Plus size={14} strokeWidth={3} />
        <span className="hidden sm:inline">NUEVA</span>
      </button>
    </div>
  );
};
