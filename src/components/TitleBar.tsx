import { t, useLanguage } from '../lib/i18n';
import React from 'react';
import { TransparencyControl } from './TransparencyControl';
import { Pin, Minus, Square, X, Settings, History, Moon, Sun, Lightbulb, FolderTree } from 'lucide-react';

interface TitleBarProps {
  isAlwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
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

// One shared look for every titlebar control: 28px tall, 2px border, hard shadow, same press effect
const BASE =
  'h-7 shrink-0 flex items-center justify-center gap-1 border-2 rounded text-[10px] font-black leading-none cursor-pointer transition-all shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000]';
const ICON = `${BASE} w-7`;
// Square (28x28) while the label is hidden; widens when the label shows
const LABELED = `${BASE} min-w-7 px-[5px]`;
const NEUTRAL =
  'bg-white text-black border-black hover:bg-[#FFE500] dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600 dark:hover:bg-[#FFE500] dark:hover:text-black dark:hover:border-black';
const ACTIVE = 'bg-[#FFE500] text-black border-black hover:bg-[#FFD700]';
const DANGER = 'bg-[#FF6B6B] text-white border-black hover:bg-[#FF5252]';
const ICON_PROPS = { size: 14, strokeWidth: 2.5 } as const;

export const TitleBar: React.FC<TitleBarProps> = ({
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
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
    <div className="titlebar-drag-region h-10 w-full bg-[#FAF8F5] dark:bg-[#18181B] border-b-2 border-black dark:border-zinc-700 flex items-center justify-between px-1 min-[420px]:px-1.5 select-none z-40 transition-colors overflow-hidden">
      {/* Left: App Title & Status */}
      <div className="flex items-center gap-1 min-[420px]:gap-1.5 no-drag min-w-0 shrink">
        <div className="h-7 flex items-center gap-1 font-black text-xs tracking-wider bg-black text-[#FFE500] dark:bg-[#FFE500] dark:text-black px-1.5 min-[480px]:px-2 border-2 border-black rounded shadow-[2px_2px_0px_#FFE500] dark:shadow-[2px_2px_0px_#000] shrink-0">
          <span>⚡</span>
          <span className="hidden min-[480px]:inline"> YANOTE</span>
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

        {/* Superposición (Always on Top) Toggle */}
        <button
          onClick={onToggleAlwaysOnTop}
          title={isAlwaysOnTop ? t("Superposición activa (Siempre encima)") : t("Activar superposición (Siempre encima)")}
          aria-pressed={isAlwaysOnTop}
          className={`${LABELED} min-[540px]:px-2 ${isAlwaysOnTop ? ACTIVE : NEUTRAL}`}
        >
          <Pin {...ICON_PROPS} className={isAlwaysOnTop ? 'fill-black rotate-45' : ''} />
          <span className="hidden min-[540px]:inline">{isAlwaysOnTop ? t('ENCIMA') : t("FLOTANTE")}</span>
        </button>
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
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#FF6B6B] text-white text-[8.5px] leading-[14px] font-black border border-black">
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

        <div className="h-5 w-[2px] bg-black/40 dark:bg-zinc-600 shrink-0" />

        {/* Window controls - ALWAYS visible and never pushed off */}
        <button onClick={handleMinimize} title={t("Minimizar")} className={`${ICON} ${NEUTRAL}`}>
          <Minus {...ICON_PROPS} />
        </button>
        <button onClick={handleMaximize} title={t("Maximizar / Restaurar")} className={`${ICON} ${NEUTRAL}`}>
          <Square size={12} strokeWidth={2.5} />
        </button>
        <button onClick={handleClose} title={t("Cerrar")} className={`${ICON} ${DANGER}`}>
          <X {...ICON_PROPS} />
        </button>
      </div>
    </div>
  );
};
