import { t, useLanguage } from '../lib/i18n';
import React from 'react';
import { TransparencyControl } from './TransparencyControl';
import { Minus, Square, X, Settings, History, Moon, Sun, Lightbulb, FolderTree, NotebookPen } from 'lucide-react';

interface TitleBarProps {
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onOpenSettings: () => void;
  onOpenFiles: () => void;
  /** File explorer side panel; the button shows when provided */
  onToggleExplorer?: () => void;
  isExplorerOpen?: boolean;
  /** Saved ideas (right-click > "Guardar idea"); the button shows when provided */

  onOpenIdeas?: () => void;
  ideasCount?: number;
  /** When provided, the close button asks the app first (confirmation modal) instead of closing directly */

  onRequestClose?: () => void;
  /** Window opacity 0.3–1; the transparency button is shown when onChangeOpacity is provided */

  opacity?: number;
  onChangeOpacity?: (opacity: number) => void;
}

// Compact ghost controls keep the desktop titlebar usable in narrow windows.
const BASE =
  'h-7 shrink-0 flex items-center justify-center gap-1 rounded-md text-[10px] font-medium leading-none cursor-pointer transition-colors';
const ICON = `${BASE} w-7`;
// Square (28x28) while the label is hidden; widens when the label shows
const LABELED = `${BASE} min-w-7 px-[5px]`;
const NEUTRAL =
  'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground';
const ACTIVE = 'bg-secondary text-secondary-foreground hover:bg-accent';
const DANGER = 'bg-transparent text-muted-foreground hover:bg-destructive hover:text-destructive-foreground';
const ICON_PROPS = { size: 14, strokeWidth: 1.75 } as const;

export const TitleBar: React.FC<TitleBarProps> = ({
  isDarkMode = false,
  onToggleDarkMode,
  onOpenSettings,
  onOpenFiles,
  onToggleExplorer,
  isExplorerOpen = false,
  onOpenIdeas,
  ideasCount = 0,
  onRequestClose,
  opacity = 1,
  onChangeOpacity,
}) => {
  useLanguage();
  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    window.electronAPI?.close();
  };

  return (
    <div className="titlebar-drag-region h-10 w-full bg-background border-b border-border flex items-center justify-between px-1 min-[420px]:px-1.5 select-none z-40 transition-colors overflow-hidden">
      {/* Left: App Title & Status */}
      <div className="flex items-center gap-1 min-[420px]:gap-1.5 no-drag min-w-0 shrink">
        <div className="h-7 flex items-center gap-1.5 font-semibold text-xs text-foreground px-1.5 min-[480px]:px-2 shrink-0">
          <NotebookPen size={15} strokeWidth={1.75} />
          <span className="hidden min-[480px]:inline">yanote</span>
        </div>

        {/* File explorer (left panel) */}
        {onToggleExplorer && (
          <button
            onClick={onToggleExplorer}
            title={isExplorerOpen ? t("Ocultar explorador de archivos (Ctrl+Shift+E)") : t("Explorador de archivos (Ctrl+Shift+E)")}
            aria-label={t("Explorador de archivos")}
            aria-pressed={isExplorerOpen}
            className={`${ICON} ${isExplorerOpen ? ACTIVE : NEUTRAL}`}
          >
            <FolderTree {...ICON_PROPS} />
          </button>
        )}

      </div>

      {/* Right: Actions & Window Controls */}
      <div className="flex items-center gap-1 no-drag shrink-0 ml-1">
        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleDarkMode}
          title={isDarkMode ? t("Cambiar a modo claro (Ctrl+Shift+D)") : t("Cambiar a modo oscuro (Ctrl+Shift+D)")}
          aria-pressed={isDarkMode}
          className={`${LABELED} min-[560px]:px-2 ${isDarkMode ? ACTIVE : NEUTRAL}`}
        >
          {isDarkMode ? <Sun {...ICON_PROPS} /> : <Moon {...ICON_PROPS} />}
          <span className="hidden min-[560px]:inline">{isDarkMode ? t("CLARO") : t("OSCURO")}</span>
        </button>

        {/* Window transparency */}
        {onChangeOpacity && (
          <TransparencyControl
            opacity={opacity}
            onChange={onChangeOpacity}
            buttonClassName={ICON}
            activeClassName={ACTIVE}
            idleClassName={NEUTRAL}
            iconProps={ICON_PROPS}
          />
        )}

        {/* Saved ideas */}
        {onOpenIdeas && (
          <button onClick={onOpenIdeas} title={t("Ideas guardadas ({0})", [ideasCount])} aria-label={t("Ideas guardadas")} className={`${ICON} ${NEUTRAL} relative`}>
            <Lightbulb {...ICON_PROPS} />
            {ideasCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-destructive text-destructive-foreground text-[8.5px] leading-[14px] font-semibold border border-border">
                {ideasCount > 99 ? '99+' : ideasCount}
              </span>
            )}
          </button>
        )}

        {/* History of opened files */}
        <button onClick={onOpenFiles} title={t("Archivos recientes")} className={`${ICON} ${NEUTRAL}`}>
          <History {...ICON_PROPS} />
        </button>

        {/* Settings Button */}
        <button onClick={onOpenSettings} title={t("Configuración")} className={`${ICON} ${NEUTRAL}`}>
          <Settings {...ICON_PROPS} />
        </button>

        <div className="h-4 w-px bg-border shrink-0 mx-0.5" />

        {/* Window controls - ALWAYS visible and never pushed off */}
        <button onClick={handleMinimize} title={t("Minimizar")} className={`${ICON} ${NEUTRAL}`}>
          <Minus {...ICON_PROPS} />
        </button>
        <button onClick={handleMaximize} title={t("Maximizar / Restaurar")} className={`${ICON} ${NEUTRAL}`}>
          <Square size={12} strokeWidth={1.75} />
        </button>
        <button onClick={handleClose} title={t("Cerrar")} className={`${ICON} ${DANGER}`}>
          <X {...ICON_PROPS} />
        </button>
      </div>
    </div>
  );
};
