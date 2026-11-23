import { t, useLanguage } from '../lib/i18n';
import React, { useState } from 'react';
import { Search, FileText, FolderOpen, X, Clock } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { parentDir } from '../lib/paths';
import { formatOpenedAgo } from '../lib/recentFiles';
import { foldChar } from '../lib/domSearch';
import type { RecentFile } from '../types/electron';
import { LoadingSkeleton } from './ui/Skeleton';

interface RecentFilesDrawerProps {
  loading?: boolean;
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
  loading = false,
}) => {
  useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const term = fold(searchTerm.trim());
  // Search by file name or folder, ignoring case and accents
  const filtered = term ? recentFiles.filter((f) => fold(f.name).includes(term) || fold(f.path).includes(term)) : recentFiles;
  if (loading) return <Modal isOpen={isOpen} onClose={onClose} title={t("Archivos recientes")}><LoadingSkeleton label={t("Cargando archivos recientes")} className="py-3" /></Modal>;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Archivos recientes")} badge={`${recentFiles.length}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("Buscar por nombre o carpeta...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-medium bg-card dark:text-foreground border border-border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onBrowse();
            }}
            title={t("Buscar un archivo en el disco (Ctrl+O)")}
          >
            <FolderOpen size={14} strokeWidth={1.75} />
            <span className="hidden min-[400px]:inline">{t("Abrir…")}</span>
          </Button>
        </div>

        <div className="flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="p-6 bg-card border border-border rounded-md text-center text-xs font-medium text-muted-foreground">
              {recentFiles.length === 0
                ? t("Todavía no abriste archivos. Los que abras aparecerán aquí.")
                : t("Ningún archivo reciente coincide con la búsqueda.")}
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
                  className="group flex items-center justify-between gap-2 p-2.5 bg-card border border-border rounded-md shadow-sm hover:bg-accent dark:hover:bg-muted hover:hover:cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="p-1.5 bg-accent border border-border rounded-md shadow-sm shrink-0 text-foreground">
                      <FileText size={14} strokeWidth={1.75} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-xs text-foreground truncate">{file.name}</span>
                        {isOpenNow && (
                          <span className="shrink-0 px-1 text-[9px] font-semibold uppercase rounded-md border border-border bg-success/15 text-foreground">
                            {t("abierto")}</span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium truncate" dir="rtl">
                        {/* rtl keeps the end of long folders visible (the most specific part) */}
                        <bdi>{folder}</bdi>
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium">
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
                    className="shrink-0 opacity-60 group-hover:opacity-100 p-1 hover:bg-destructive hover:text-destructive-foreground rounded-md border border-transparent hover:border-border transition-all text-muted-foreground dark:text-foreground"
                    title={t("Quitar del historial (no borra el archivo)")}
                    aria-label={t("Quitar {0} del historial", [file.name])}
                  >
                    <X size={13} strokeWidth={1.75} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {recentFiles.length > 0 && (
          <button
            onClick={onClearRecent}
            className="self-end text-[10px] font-medium underline text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t("Limpiar historial")}</button>
        )}
      </div>
    </Modal>
  );
};
