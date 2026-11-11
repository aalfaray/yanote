import React from 'react';
import { Pin, Minus, Square, X, Settings, FolderOpen, RefreshCw, GitBranch } from 'lucide-react';
import { Button } from './ui/Button';

interface TitleBarProps {
  isAlwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onOpenSettings: () => void;
  onOpenFiles: () => void;
  onOpenGit: () => void;
  gitBranch?: string;
  hasGitChanges?: boolean;
  isSyncing?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
  onOpenSettings,
  onOpenFiles,
  onOpenGit,
  gitBranch = 'main',
  hasGitChanges = false,
  isSyncing = false,
}) => {
  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <div className="titlebar-drag-region h-10 w-full bg-[#FAF8F5] border-b-2 border-black flex items-center justify-between px-2 select-none z-40">
      {/* Left: App Title & Status */}
      <div className="flex items-center gap-2 no-drag">
        <div className="flex items-center gap-1 font-black text-xs tracking-wider bg-black text-[#FFE500] px-2 py-0.5 rounded shadow-[1.5px_1.5px_0px_#FFE500]">
          <span>⚡ BOLDNOTES</span>
        </div>

        {/* Superposición (Always on Top) Toggle */}
        <Button
          variant={isAlwaysOnTop ? 'primary' : 'secondary'}
          size="xs"
          onClick={onToggleAlwaysOnTop}
          title={isAlwaysOnTop ? 'Superposición activa (Siempre encima)' : 'Activar superposición (Siempre encima)'}
          className={`flex items-center gap-1 px-1.5 py-0.5 ${
            isAlwaysOnTop ? 'bg-[#FFE500] border-black font-black' : 'opacity-85'
          }`}
        >
          <Pin size={12} strokeWidth={2.8} className={isAlwaysOnTop ? 'fill-black rotate-45 text-black' : ''} />
          <span className="text-[10px] hidden sm:inline">
            {isAlwaysOnTop ? 'ENCIMA' : 'FLOTANTE'}
          </span>
        </Button>

        {/* Git Quick Pill */}
        <Button
          variant="secondary"
          size="xs"
          onClick={onOpenGit}
          title="Ver estado de Git y Sincronizar"
          className="flex items-center gap-1 px-1.5 py-0.5 bg-white"
        >
          <GitBranch size={12} strokeWidth={2.5} />
          <span className="text-[10px] max-w-[65px] truncate">{gitBranch}</span>
          {hasGitChanges && (
            <span className="w-2 h-2 rounded-full bg-[#FF6B6B] border border-black inline-block animate-pulse" />
          )}
        </Button>
      </div>

      {/* Right: Actions & Window Controls */}
      <div className="flex items-center gap-1 no-drag">
        {/* Open Notes Explorer */}
        <Button
          variant="secondary"
          size="xs"
          onClick={onOpenFiles}
          title="Explorador de Notas Markdown"
          className="p-1"
        >
          <FolderOpen size={13} strokeWidth={2.5} />
        </Button>

        {/* Sync Button */}
        <Button
          variant="cyan"
          size="xs"
          onClick={onOpenGit}
          title="Sincronizar con GitHub"
          className="p-1"
        >
          <RefreshCw size={13} strokeWidth={2.5} className={isSyncing ? 'animate-spin' : ''} />
        </Button>

        {/* Settings Button */}
        <Button
          variant="secondary"
          size="xs"
          onClick={onOpenSettings}
          title="Configuración y Repositorio GitHub"
          className="p-1"
        >
          <Settings size={13} strokeWidth={2.5} />
        </Button>

        <div className="h-4 w-[1px] bg-black/40 mx-0.5" />

        {/* Window controls */}
        <button
          onClick={handleMinimize}
          className="w-6 h-6 flex items-center justify-center border-1.5 border-black rounded bg-white hover:bg-neutral-200 shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          title="Minimizar"
        >
          <Minus size={11} strokeWidth={3} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-6 h-6 flex items-center justify-center border-1.5 border-black rounded bg-white hover:bg-neutral-200 shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          title="Maximizar / Restaurar"
        >
          <Square size={10} strokeWidth={2.8} />
        </button>
        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center border-1.5 border-black rounded bg-[#FF6B6B] text-white hover:bg-[#FF5252] shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          title="Cerrar"
        >
          <X size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};
