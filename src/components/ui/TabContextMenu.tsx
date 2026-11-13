import { t, useLanguage } from '../../lib/i18n';
import React, { useEffect, useRef } from 'react';
import {
  Pencil,
  FileDown,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import type { TabItem } from '../../types/electron';

export interface TabContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  tab: TabItem | null;
  tabsCount: number;
  canCloseOthers: boolean;
  onCloseMenu: () => void;
  onRename: (tab: TabItem) => void;
  onTogglePin: (tab: TabItem) => void;
  onCopyId: (tab: TabItem) => void;
  onCloseTab: (tab: TabItem) => void;
  onCloseOthers: (tab: TabItem) => void;
  onCloseAll: () => void;
  onTogglePreview: () => void;
  onCopyPath: (tab: TabItem) => void;
  onCopyRelativePath: (tab: TabItem) => void;
  onRevealInExplorer: (tab: TabItem) => void;
  /** Only offered for note tabs */

  onExportPdf?: (tab: TabItem) => void;
}

export const TabContextMenu: React.FC<TabContextMenuProps> = ({
  isOpen,
  x,
  y,
  tab,
  canCloseOthers,
  onCloseMenu,
  onRename,
  onTogglePin,
  onCopyId,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onTogglePreview,
  onCopyPath,
  onCopyRelativePath,
  onRevealInExplorer,
  onExportPdf,
}) => {
  useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMenu();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', onCloseMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', onCloseMenu);
    };
  }, [isOpen, onCloseMenu]);

  if (!isOpen || !tab) return null;

  // Viewport collision clamping so menu never overflows the window
  const menuWidth = 260;
  const menuHeight = 380;
  const clampedX = typeof window !== 'undefined'
    ? Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
    : x;
  const clampedY = typeof window !== 'undefined'
    ? Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    : y;

  const handleAction = (action: () => void) => {
    onCloseMenu();
    action();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("Menú contextual de pestaña")}
      data-testid="tab-context-menu"
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-[999999] w-64 bg-[#FAF8F5] dark:bg-[#1C1C20] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-700 rounded shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#000] py-1 select-none text-xs font-bold animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Renombrar */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onRename(tab))}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <Pencil size={13} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400 group-hover:text-black" />
        <span>{t("Renombrar")}</span>
      </button>

      <div className="my-1 border-t border-black/15 dark:border-zinc-700" />

      {/* 2. Fijar / Desfijar pestaña */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onTogglePin(tab))}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        {tab.isPinned ? (
          <>
            <PinOff size={13} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400 group-hover:text-black" />
            <span>{t("Desfijar pestaña")}</span>
          </>
        ) : (
          <>
            <Pin size={13} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400 group-hover:text-black" />
            <span>{t("Fijar pestaña")}</span>
          </>
        )}
      </button>

      {/* 3. Copiar ID de pestaña */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onCopyId(tab))}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group pl-[31px]"
      >
        <span>{t("Copiar ID de pestaña")}</span>
      </button>

      <div className="my-1 border-t border-black/15 dark:border-zinc-700" />

      {/* 4. Cerrar (Ctrl+W) */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onCloseTab(tab))}
        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <X size={13} strokeWidth={3} className="shrink-0 text-black/70 dark:text-zinc-400 group-hover:text-black" />
          <span>{t("Cerrar")}</span>
        </div>
        <span className="text-[10px] font-mono opacity-60 text-neutral-500 dark:text-zinc-400 group-hover:text-black">
          Ctrl+W
        </span>
      </button>

      {/* 5. Cerrar otras */}
      <button
        type="button"
        role="menuitem"
        disabled={!canCloseOthers}
        onClick={() => {
          if (canCloseOthers) {
            handleAction(() => onCloseOthers(tab));
          }
        }}
        className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-left pl-[31px] transition-colors ${
          canCloseOthers
            ? 'hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black cursor-pointer'
            : 'opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent'
        }`}
      >
        <span>{t("Cerrar otras")}</span>
      </button>

      {/* 6. Cerrar todas las pestañas del editor (Ctrl+Alt+W) */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(onCloseAll)}
        className="w-full px-3 py-1.5 flex items-center justify-between pl-[31px] hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <span>{t("Cerrar todas las pestañas del editor")}</span>
        <span className="text-[10px] font-mono opacity-60 text-neutral-500 dark:text-zinc-400 group-hover:text-black ml-2">
          Ctrl+Alt+W
        </span>
      </button>

      <div className="my-1 border-t border-black/15 dark:border-zinc-700" />

      {/* 7. Abrir vista previa de Markdown */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(onTogglePreview)}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left pl-[31px] hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <span>{t("Abrir vista previa de Markdown")}</span>
      </button>

      {/* Exportar a PDF (solo notas) */}
      {onExportPdf && tab.kind !== 'terminal' && tab.kind !== 'claude' && (
        <button
          type="button"
          role="menuitem"
          onClick={() => handleAction(() => onExportPdf(tab))}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
        >
          <FileDown size={13} strokeWidth={2.5} className="shrink-0 text-black/70 dark:text-zinc-400 group-hover:text-black" />
          <span>{t("Exportar a PDF")}</span>
        </button>
      )}

      <div className="my-1 border-t border-black/15 dark:border-zinc-700" />

      {/* 8. Copiar ruta */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onCopyPath(tab))}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left pl-[31px] hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <span>{t("Copiar ruta")}</span>
      </button>

      {/* 9. Copiar ruta relativa */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onCopyRelativePath(tab))}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left pl-[31px] hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <span>{t("Copiar ruta relativa")}</span>
      </button>

      <div className="my-1 border-t border-black/15 dark:border-zinc-700" />

      {/* 10. Revelar en el Explorador de archivos */}
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onRevealInExplorer(tab))}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left pl-[31px] hover:bg-[#FFE500] hover:text-black dark:hover:bg-[#FFE500] dark:hover:text-black transition-colors cursor-pointer group"
      >
        <span>{t("Revelar en el Explorador de archivos")}</span>
      </button>
    </div>
  );
};
