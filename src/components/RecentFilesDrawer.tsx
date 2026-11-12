import React, { useState } from 'react';
import { Search, FileText, FolderOpen, X, Clock } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { parentDir } from '../lib/paths';
import { formatOpenedAgo } from '../lib/recentFiles';
import { foldChar } from '../lib/domSearch';
import type { RecentFile } from '../types/electron';

interface RecentFilesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recentFiles: RecentFile[];
  /** Paths currently open in a tab (shown with an "abierto" chip) */
  openPaths: string[];
  onOpenRecent: (file: RecentFile) => void;
  onRemoveRecent: (filePath: string) => void;
  onClearRecent: () => void;
  /** Native picker to open any file */
  onBrowse: () => void;
}

const fold = (s: string) => Array.from(s).map(foldChar).join('');
const samePath = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();

/** History of opened files (newest first), replaces the old notes-folder explorer. */
export const RecentFilesDrawer: React.FC<RecentFilesDrawerProps> = ({
  isOpen,
  onClose,
  recentFiles,
  openPaths,
  onOpenRecent,
  onRemoveRecent,
  onClearRecent,
  onBrowse,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const term = fold(searchTerm.trim());
  // Search by file name or folder, ignoring case and accents
  const filtered = term ? recentFiles.filter((f) => fold(f.name).includes(term) || fold(f.path).includes(term)) : recentFiles;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Archivos recientes" badge={`${recentFiles.length}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-2.5 text-neutral-400 dark:text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o carpeta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-white dark:bg-zinc-800 dark:text-zinc-100 border-2 border-black dark:border-zinc-600 rounded shadow-[2px_2px_0px_#000] focus:outline-none focus:ring-1 focus:ring-[#FFE500]"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onBrowse();
            }}
            title="Buscar un archivo en el disco (Ctrl+O)"
          >
            <FolderOpen size={14} strokeWidth={2.5} />
            <span className="hidden min-[400px]:inline">Abrir…</span>
          </Button>
        </div>

        <div className="flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="p-6 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-700 rounded text-center text-xs font-medium text-neutral-500 dark:text-zinc-400">
              {recentFiles.length === 0
                ? 'Todavía no abriste archivos. Los que abras aparecerán aquí.'
                : 'Ningún archivo reciente coincide con la búsqueda.'}
            </div>
          ) : (
            filtered.map((file) => {
              const isOpenNow = openPaths.some((p) => samePath(p, file.path));
              const folder = parentDir(file.path) ?? '';
              return (
                <div
                  key={file.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onOpenRecent(file);
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onOpenRecent(file);
                      onClose();
                    }
                  }}
                  title={file.path}
                  className="group flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-700 rounded shadow-[2px_2px_0px_#000] hover:bg-[#FFFDF0] dark:hover:bg-zinc-700 hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="p-1.5 bg-[#FFE500] border border-black rounded shadow-[1px_1px_0px_#000] shrink-0 text-black">
                      <FileText size={14} strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-xs text-black dark:text-zinc-100 truncate">{file.name}</span>
                        {isOpenNow && (
                          <span className="shrink-0 px-1 text-[9px] font-black uppercase rounded border border-black bg-[#78E08F] text-black">
                            abierto
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-neutral-500 dark:text-zinc-400 font-medium truncate" dir="rtl">
                        {/* rtl keeps the end of long folders visible (the most specific part) */}
                        <bdi>{folder}</bdi>
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] text-neutral-500 dark:text-zinc-400 font-medium">
                        <Clock size={10} />
                        {formatOpenedAgo(file.openedAt)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRecent(file.path);
                    }}
                    className="shrink-0 opacity-60 group-hover:opacity-100 p-1 hover:bg-[#FF6B6B] hover:text-white rounded border border-transparent hover:border-black transition-all text-neutral-600 dark:text-zinc-300"
                    title="Quitar del historial (no borra el archivo)"
                    aria-label={`Quitar ${file.name} del historial`}
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {recentFiles.length > 0 && (
          <button
            onClick={onClearRecent}
            className="self-end text-[10px] font-bold underline text-neutral-500 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
          >
            Limpiar historial
          </button>
        )}
      </div>
    </Modal>
  );
};
