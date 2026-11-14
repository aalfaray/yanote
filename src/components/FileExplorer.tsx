import { t, useLanguage } from '../lib/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  File as FileIcon,
  RefreshCw,
  ChevronsDownUp,
  X,
  Sparkles,
  Copy,
  TerminalSquare,
  ExternalLink,
  FolderSearch,
  GitBranch,
  Loader2,
  ArrowUp,
  LocateFixed,
  CornerDownRight,
} from 'lucide-react';
import type { ClaudeInstallInfo, GitFileCode, GitTreeStatus, TreeEntry } from '../types/electron';
import { useAgentActivity, isWithin, normPath, type AgentActivity } from '../lib/agentActivity';
import { isMarkdownFile, baseName, parentFolder, parentDir, pathCrumbs } from '../lib/paths';
import { copyText } from '../lib/clipboard';
import { logError } from '../lib/logger';
import { PROVIDER_LABELS } from '../lib/chatBackends';

interface FileExplorerProps {
  /** Folder shown as the tree's root */
  root?: string;
  followsActiveTab: boolean;
  /** null returns to following the active tab's folder */
  onNavigateFolder: (folder: string | null) => void;
  /** Tab titles by id, to name the agents */
  tabTitles: Record<string, string>;
  activeTabId?: string;
  /** Paths open in a tab (shown in bold) */
  openPaths: string[];
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
  onOpenNote: (path: string, name: string) => void;
  onFocusTab: (tabId: string) => void;
  onNewChat: (folder: string) => void;
  onNewTerminal: (folder: string) => void;
  onNotify: (text: string, type: 'success' | 'info' | 'error') => void;
}

type DirState = { entries: TreeEntry[]; error?: string; loading?: boolean };
type Row = { entry: TreeEntry; depth: number };
type MenuState = { x: number; y: number; entry: TreeEntry } | null;

const GIT_COLORS: Record<GitFileCode, string> = {
  M: 'text-[#B7791F] dark:text-[#F6C344]',
  A: 'text-[#2F855A] dark:text-[#78E08F]',
  '?': 'text-[#2F855A] dark:text-[#78E08F]',
  R: 'text-[#2B6CB0] dark:text-[#7CC4FA]',
  D: 'text-[#C53030] dark:text-[#FF8A8A] line-through',
  U: 'text-[#C53030] dark:text-[#FF8A8A]',
};
const GIT_LABELS: Record<GitFileCode, string> = { M: 'M', A: 'A', '?': 'U', R: 'R', D: 'D', U: '!' };

export const MIN_EXPLORER_WIDTH = 180;
export const MAX_EXPLORER_WIDTH = 520;

function agentState(a: AgentActivity): { label: string; dot: string } {
  if (a.starting) return { label: t("Iniciando…"), dot: 'bg-[#7CC4FA] animate-pulse' };
  if (a.waiting) return { label: t("Esperando tu respuesta"), dot: 'bg-[#FF6B6B] animate-pulse' };
  if (a.running) return { label: a.currentTool ? `${a.currentTool.name}${a.currentTool.target ? ` · ${baseName(a.currentTool.target)}` : ''}` : t("Pensando…"), dot: 'bg-[#FFE500] animate-pulse' };
  if (a.ended) return { label: t("Sesión cerrada"), dot: 'bg-neutral-400' };
  return { label: t("Listo"), dot: 'bg-[#78E08F]' };
}

function sourceLabel(source?: string | null) {
  return source === 'user' ? t("tu instalación") : source === 'bundled' ? t("incluido en yanote") : source === 'sdk' ? t("del SDK") : '';
}

/**
 * Orca-style file explorer: the working folder as a live tree (folders first, natural order,
 * git colors) with the chats that run in it, the files they are reading or editing right now and
 * the files they changed.
 */
export const FileExplorer: React.FC<FileExplorerProps> = ({
  root,
  followsActiveTab,
  onNavigateFolder,
  tabTitles,
  activeTabId,
  openPaths,
  width,
  onResize,
  onClose,
  onOpenNote,
  onFocusTab,
  onNewChat,
  onNewTerminal,
  onNotify,
}) => {
  useLanguage();
  const api = window.electronAPI;
  const agents = useAgentActivity();
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [git, setGit] = useState<GitTreeStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [install, setInstall] = useState<ClaudeInstallInfo | null>(null);
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const rootRef = useRef(root);
  rootRef.current = root;
  const crumbsRef = useRef<HTMLElement>(null);

  // Keep the current folder (end of the breadcrumb) in view
  useEffect(() => {
    try {
      const el = crumbsRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
    } catch (err) {
      logError('FileExplorer.scrollCrumbs', err);
    }
  }, [root, width]);

  const loadDir = useCallback(
    async (dir: string) => {
      if (!api?.treeList) return;
      const requestRoot = rootRef.current;
      setDirs((prev) => ({ ...prev, [dir]: { entries: prev[dir]?.entries ?? [], loading: !prev[dir] } }));
      try {
        const res = await api.treeList(dir);
        if (rootRef.current !== requestRoot) return;
        setDirs((prev) => ({ ...prev, [dir]: { entries: res.entries || [], error: res.success ? undefined : res.error } }));
      } catch (err) {
        logError('FileExplorer.loadDir', err, { dir });
        if (rootRef.current !== requestRoot) return;
        setDirs((prev) => ({ ...prev, [dir]: { entries: [], error: String(err) } }));
      }
    },
    [api]
  );

  const loadGit = useCallback(async () => {
    const r = rootRef.current;
    if (!api?.treeGitStatus || !r) return;
    try {
      const res = await api.treeGitStatus(r);
      if (rootRef.current === r) setGit(res);
    } catch (err) {
      logError('FileExplorer.gitStatus', err);
    }
  }, [api]);

  // New root: fresh tree, watch it, read its git status
  useEffect(() => {
    setDirs({});
    setExpanded(new Set());
    setGit(null);
    setSelected(null);
    setMenu(null);
    if (!root || !api) return;
    void loadDir(root);
    void loadGit();
    void api.treeWatch?.(root).catch((err) => logError('FileExplorer.watch', err));
  }, [root, api, loadDir, loadGit]);

  useEffect(() => () => void api?.treeUnwatch?.().catch((err) => logError('FileExplorer.unwatch', err)), [api]);

  // Live updates: reload the folders that changed (only the ones already listed) and the git colors
  useEffect(() => {
    if (!api?.onTreeChanged) return;
    let gitTimer: ReturnType<typeof setTimeout> | undefined;
    const off = api.onTreeChanged((change) => {
      if (!rootRef.current || normPath(change.root) !== normPath(rootRef.current)) return;
      const loaded = Object.keys(dirsRef.current);
      for (const dir of change.dirs) {
        const match = loaded.find((d) => normPath(d) === normPath(dir));
        if (match) void loadDir(match);
      }
      if (change.git) {
        clearTimeout(gitTimer);
        gitTimer = setTimeout(() => void loadGit(), 400);
      }
    });
    return () => {
      clearTimeout(gitTimer);
      off?.();
    };
  }, [api, loadDir, loadGit]);

  useEffect(() => {
    void api?.claudeInstallInfo?.().then(setInstall).catch((err) => logError('FileExplorer.installInfo', err));
  }, [api]);

  const toggle = (dir: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        if (!dirsRef.current[dir]) void loadDir(dir);
      }
      return next;
    });
  };

  // Visible rows, depth-first through the expanded folders
  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (dir: string, depth: number) => {
      for (const entry of dirs[dir]?.entries ?? []) {
        out.push({ entry, depth });
        if (entry.isDir && expanded.has(entry.path)) walk(entry.path, depth + 1);
      }
    };
    if (root) walk(root, 0);
    return out;
  }, [dirs, expanded, root]);

  // Git status by normalized path, plus the folders that contain changes
  const gitInfo = useMemo(() => {
    const files = new Map<string, GitFileCode>();
    const dirty = new Set<string>();
    for (const [p, code] of Object.entries(git?.status ?? {})) {
      const key = normPath(p);
      files.set(key, code);
      let i = key.lastIndexOf('\\');
      while (i > 0) {
        const parent = key.slice(0, i);
        if (dirty.has(parent)) break;
        dirty.add(parent);
        i = parent.lastIndexOf('\\');
      }
    }
    return { files, dirty };
  }, [git]);

  // Agents on each path: working on it now, changed it, or running in that folder
  const marks = useMemo(() => {
    const active = new Map<string, AgentActivity[]>();
    const touched = new Set<string>();
    const add = (map: Map<string, AgentActivity[]>, key: string, a: AgentActivity) => {
      const list = map.get(key);
      if (!list) map.set(key, [a]);
      else if (!list.includes(a)) list.push(a);
    };
    const withAncestors = (p: string, fn: (key: string) => void) => {
      let key = normPath(p);
      fn(key);
      let i = key.lastIndexOf('\\');
      while (i > 0) {
        key = key.slice(0, i);
        fn(key);
        i = key.lastIndexOf('\\');
      }
    };
    const homes = new Map<string, AgentActivity[]>();
    for (const a of agents) {
      for (const p of a.activePaths) withAncestors(p, (k) => add(active, k, a));
      for (const p of a.touchedPaths) withAncestors(p, (k) => touched.add(k));
      if (a.cwd) add(homes, normPath(a.cwd), a);
    }
    return { active, touched, homes };
  }, [agents]);

  const openSet = useMemo(() => new Set(openPaths.map(normPath)), [openPaths]);
  const selectedEntry = rows.find(({ entry }) => entry.path === selected)?.entry;
  const chatFolder = selectedEntry ? (selectedEntry.isDir ? selectedEntry.path : parentDir(selectedEntry.path) || root) : root;
  const parent = root ? parentFolder(root) : null;
  const crumbs = useMemo(() => pathCrumbs(root), [root]);
  const rootAgents = root ? agents.filter((a) => a.cwd && (isWithin(a.cwd, root) || isWithin(root, a.cwd))) : [];
  const otherAgents = agents.filter((a) => !rootAgents.includes(a));

  const relativePath = (p: string) => {
    if (!root || !isWithin(p, root)) return p;
    return p.slice(root.replace(/[\\/]+$/, '').length + 1) || '.';
  };

  const copy = async (text: string, done: string) => {
    const ok = await copyText(text, 'FileExplorer.copy');
    onNotify(ok ? `✓ ${done}: ${text}` : t("No se pudo copiar al portapapeles"), ok ? 'success' : 'error');
  };

  const openEntry = (entry: TreeEntry) => {
    setSelected(entry.path);
    if (entry.isDir) toggle(entry.path);
    else if (isMarkdownFile(entry.name)) onOpenNote(entry.path, entry.name);
    else void api?.openPath?.(entry.path).then((err) => err && onNotify(t("No se pudo abrir {0}: {1}", [entry.name, err]), 'error'));
  };

  const folderOf = (entry: TreeEntry) => (entry.isDir ? entry.path : parentDir(entry.path) || root || entry.path);

  const chooseFolder = async () => {
    try {
      const folder = await api?.treeSelectFolder?.(root);
      if (folder) onNavigateFolder(folder);
    } catch (err) {
      logError('FileExplorer.selectFolder', err);
      onNotify(t("No se pudo abrir la carpeta"), 'error');
    }
  };

  // Resize from the right edge
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => onResize(Math.max(MIN_EXPLORER_WIDTH, Math.min(MAX_EXPLORER_WIDTH, startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const agentRow = (a: AgentActivity) => {
    const st = agentState(a);
    const title = tabTitles[a.tabId] || PROVIDER_LABELS[a.provider];
    return (
      <button
        key={a.tabId}
        type="button"
        onClick={() => onFocusTab(a.tabId)}
        data-testid={`explorer-agent-${a.tabId}`}
        title={[a.cwd && t("Carpeta: {0}", [a.cwd]), a.executable && t("Ejecutable: {0}", [a.executable])].filter(Boolean).join('\n')}
        className={`w-full text-left px-1.5 py-1 rounded border-2 flex flex-col gap-0.5 cursor-pointer transition-colors ${
          a.tabId === activeTabId ? 'border-black dark:border-zinc-400 bg-[#FFE500]/40 dark:bg-[#FFE500]/10' : 'border-transparent hover:border-black/40 dark:hover:border-zinc-600'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full border border-black shrink-0 ${st.dot}`} aria-hidden="true" />
          <Sparkles size={11} strokeWidth={2.5} className="shrink-0 text-[#D97757]" />
          <span className="font-black truncate">{title}</span>
          <span className="opacity-60 truncate min-w-0">· {st.label}</span>
        </span>
        {a.cwd && <span className="font-mono text-[9.5px] opacity-60 truncate pl-3.5">{a.cwd}</span>}
      </button>
    );
  };

  return (
    <aside
      data-testid="file-explorer"
      aria-label={t("Explorador de archivos")}
      style={{ width }}
      className="absolute min-[640px]:relative inset-y-0 left-0 z-30 shrink-0 h-full flex flex-col bg-[#FAF8F5] dark:bg-[#18181B] text-black dark:text-zinc-100 border-r-2 border-black dark:border-zinc-700 text-[11px] font-bold select-none shadow-[3px_0px_0px_#000] min-[640px]:shadow-none"
      onContextMenu={(e) => {
        // The tree has its own menu; keep the app's text menu out of here
        e.preventDefault();
      }}
    >
      {/* Header */}
      <div className="h-8 shrink-0 flex items-center gap-1 px-1.5 border-b-2 border-black dark:border-zinc-700">
        <FolderOpen size={13} strokeWidth={2.5} className="shrink-0" />
        <span className="font-black truncate min-w-0 flex-1" title={root}>
          {root ? baseName(root) : t("Sin carpeta")}
        </span>
        {git?.repo && git.branch && (
          <span className="flex items-center gap-0.5 opacity-60 truncate max-w-[6rem]" title={t("Rama de git: {0}", [git.branch])}>
            <GitBranch size={10} strokeWidth={2.5} className="shrink-0" />
            <span className="truncate">{git.branch}</span>
          </span>
        )}
        <button type="button" onClick={() => root && void Promise.all([...Object.keys(dirs).map(loadDir), loadGit()])} title={t("Actualizar")} aria-label={t("Actualizar")} className="w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-[#FFE500] hover:text-black cursor-pointer">
          <RefreshCw size={12} strokeWidth={2.5} />
        </button>
        <button type="button" onClick={() => setExpanded(new Set())} title={t("Contraer todo")} aria-label={t("Contraer todo")} className="w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-[#FFE500] hover:text-black cursor-pointer">
          <ChevronsDownUp size={12} strokeWidth={2.5} />
        </button>
        <button type="button" onClick={onClose} title={t("Cerrar explorador (Ctrl+Shift+E)")} aria-label={t("Cerrar explorador")} className="w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-[#FF6B6B] hover:text-white cursor-pointer">
          <X size={12} strokeWidth={3} />
        </button>
      </div>

      <div className="shrink-0 border-b-2 border-black dark:border-zinc-700 px-1.5 py-1.5 flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <button type="button" disabled={!parent} onClick={() => parent && onNavigateFolder(parent)} title={t("Subir a la carpeta superior")} aria-label={t("Subir a la carpeta superior")} className="w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-[#FFE500] hover:text-black cursor-pointer disabled:opacity-30 disabled:cursor-default">
            <ArrowUp size={13} strokeWidth={2.5} />
          </button>
          {/* Breadcrumb: every folder of the path is a jump target; scrolled so the current one shows */}
          <nav ref={crumbsRef} aria-label={t("Ruta actual")} data-testid="explorer-location" title={root} className="min-w-0 flex-1 flex items-center overflow-x-auto font-mono text-[9.5px] [scrollbar-width:none]">
            {crumbs.length === 0 && <span className="px-1 opacity-60">{t("Sin carpeta")}</span>}
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={c.path}>
                  {i > 0 && <ChevronRight size={9} strokeWidth={3} className="shrink-0 opacity-40" aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => !last && onNavigateFolder(c.path)}
                    aria-current={last ? 'location' : undefined}
                    title={c.path}
                    className={`shrink-0 px-1 py-1 rounded whitespace-nowrap ${last ? 'font-black cursor-default' : 'opacity-70 hover:opacity-100 hover:bg-[#FFE500] hover:text-black cursor-pointer'}`}
                  >
                    {c.name}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
          <button type="button" onClick={() => void chooseFolder()} title={t("Elegir carpeta")} aria-label={t("Elegir carpeta")} className="w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-[#FFE500] hover:text-black cursor-pointer">
            <FolderSearch size={13} strokeWidth={2.5} />
          </button>
          <button type="button" onClick={() => onNavigateFolder(null)} aria-pressed={followsActiveTab} title={t("Seguir la carpeta de la pestaña activa")} aria-label={t("Seguir la carpeta de la pestaña activa")} className={`w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-[#FFE500] hover:text-black cursor-pointer ${followsActiveTab ? 'bg-[#FFE500]/40 dark:bg-[#FFE500]/20' : ''}`}>
            <LocateFixed size={13} strokeWidth={2.5} />
          </button>
        </div>
        <button type="button" disabled={!chatFolder} onClick={() => chatFolder && onNewChat(chatFolder)} title={chatFolder ? t("Nuevo chat de Claude en {0}", [chatFolder]) : undefined} className="flex items-center justify-center gap-1 px-1.5 py-1 border border-black dark:border-zinc-600 rounded bg-[#FFE500] text-black cursor-pointer disabled:opacity-40 disabled:cursor-default">
          <Sparkles size={12} strokeWidth={2.5} /> {t("Abrir Claude aquí")}
        </button>
        {chatFolder && <div data-testid="explorer-chat-folder" title={chatFolder} className="truncate font-mono text-[9.5px] opacity-60">{chatFolder}</div>}
      </div>

      {/* Agents running here, and where Claude Code is installed */}
      <div className="shrink-0 border-b-2 border-black dark:border-zinc-700 px-1.5 py-1.5 flex flex-col gap-1 max-h-[45%] overflow-y-auto">
        <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider opacity-60">
          <span>{t("Agentes en esta carpeta")}</span>
        </div>
        {rootAgents.length === 0 && <div className="opacity-50 font-medium px-1">{t("Ningún chat abierto en esta carpeta.")}</div>}
        {rootAgents.map(agentRow)}
        {otherAgents.length > 0 && (
          <>
            <div className="text-[9.5px] uppercase tracking-wider opacity-60 mt-1">{t("Otros chats")}</div>
            {otherAgents.map(agentRow)}
          </>
        )}
        {install && (
          <div className="mt-1 pt-1 border-t border-dashed border-black/30 dark:border-zinc-600 flex items-start gap-1" data-testid="claude-install-info">
            <div className="min-w-0 flex-1">
              <div className="text-[9.5px] uppercase tracking-wider opacity-60">
                Claude Code{install.version ? ` · ${install.version}` : ''}
                {install.source ? ` · ${sourceLabel(install.source)}` : ''}
              </div>
              <div className="font-mono text-[9.5px] break-all" title={install.used || ''}>
                {install.used || t("No encontrado: instálalo desde claude.com/claude-code")}
              </div>
            </div>
            {install.used && (
              <button type="button" onClick={() => void copy(install.used!, t("Ruta copiada"))} title={t("Copiar la ruta de Claude Code")} aria-label={t("Copiar la ruta de Claude Code")} className="w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-[#FFE500] hover:text-black cursor-pointer">
                <Copy size={11} strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tree */}
      <div role="tree" aria-label={t("Archivos")} className="flex-1 min-h-0 overflow-auto py-1">
        {!root && <div className="px-2 py-2 opacity-60 font-medium">{t("Elige una carpeta para explorar y abrir Claude.")}</div>}
        {root && dirs[root]?.loading && (
          <div className="px-2 py-2 flex items-center gap-1.5 opacity-60">
            <Loader2 size={12} className="animate-spin" /> {t("Cargando…")}
          </div>
        )}
        {root && dirs[root]?.error && <div className="px-2 py-2 text-[#C53030] dark:text-[#FF8A8A]">{t("No se pudo leer la carpeta: {0}", [dirs[root].error])}</div>}
        {root && !dirs[root]?.loading && !dirs[root]?.error && rows.length === 0 && dirs[root] && <div className="px-2 py-2 opacity-50 font-medium">{t("Carpeta vacía")}</div>}
        {rows.map(({ entry, depth }) => {
          const key = normPath(entry.path);
          const isOpen = entry.isDir && expanded.has(entry.path);
          const code = gitInfo.files.get(key);
          const dirty = entry.isDir && gitInfo.dirty.has(key);
          const working = marks.active.get(key);
          const changed = marks.touched.has(key);
          const home = entry.isDir ? marks.homes.get(key) : undefined;
          const loadingChildren = isOpen && dirs[entry.path]?.loading;
          return (
            <div
              key={entry.path}
              role="treeitem"
              aria-expanded={entry.isDir ? isOpen : undefined}
              aria-selected={selected === entry.path}
              tabIndex={0}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', entry.path)}
              data-path={entry.path}
              onClick={() => openEntry(entry)}
              onDoubleClick={() => entry.isDir && onNavigateFolder(entry.path)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return; // keys on the row's own buttons
                if (e.key === 'Enter' && entry.isDir) onNavigateFolder(entry.path);
                else if (e.key === 'Enter') openEntry(entry);
                else if (entry.isDir && e.key === 'ArrowRight' && !isOpen) toggle(entry.path);
                else if (entry.isDir && e.key === 'ArrowLeft' && isOpen) toggle(entry.path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelected(entry.path);
                setMenu({ x: e.clientX, y: e.clientY, entry });
              }}
              title={entry.path}
              style={{ paddingLeft: 4 + depth * 12 }}
              className={`group h-[22px] pr-1.5 flex items-center gap-1 cursor-pointer whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-[#FFE500] ${
                selected === entry.path ? 'bg-[#FFE500]/60 dark:bg-[#FFE500]/20' : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <span className="w-3 shrink-0 flex items-center justify-center opacity-70">
                {entry.isDir ? loadingChildren ? <Loader2 size={10} className="animate-spin" /> : isOpen ? <ChevronDown size={11} strokeWidth={3} /> : <ChevronRight size={11} strokeWidth={3} /> : null}
              </span>
              {entry.isDir ? (
                isOpen ? <FolderOpen size={13} strokeWidth={2.2} className="shrink-0 text-[#B7791F] dark:text-[#F6C344]" /> : <Folder size={13} strokeWidth={2.2} className="shrink-0 text-[#B7791F] dark:text-[#F6C344]" />
              ) : isMarkdownFile(entry.name) ? (
                <FileText size={13} strokeWidth={2.2} className="shrink-0 text-[#2B6CB0] dark:text-[#7CC4FA]" />
              ) : (
                <FileIcon size={13} strokeWidth={2.2} className="shrink-0 opacity-70" />
              )}
              <span className={`truncate min-w-0 ${code ? GIT_COLORS[code] : dirty ? GIT_COLORS.M : ''} ${openSet.has(key) ? 'font-black underline decoration-2 decoration-[#FFE500]' : 'font-semibold'}`}>{entry.name}</span>
              {home && home.length > 0 && (
                <span className="shrink-0 flex items-center gap-0.5 px-1 h-[15px] rounded border border-black bg-[#D97757] text-white text-[8.5px] font-black" title={t("{0} trabaja en esta carpeta", [home.map((a) => tabTitles[a.tabId] || PROVIDER_LABELS[a.provider]).join(', ')])}>
                  <Sparkles size={8} strokeWidth={3} />
                  {home.length > 1 ? home.length : ''}
                </span>
              )}
              <span className="flex-1" />
              {working && working.length > 0 && (
                <span
                  data-testid="explorer-working"
                  className="shrink-0 flex items-center text-[#D97757]"
                  title={t("{0} está trabajando aquí", [working.map((a) => tabTitles[a.tabId] || PROVIDER_LABELS[a.provider]).join(', ')])}
                >
                  <Sparkles size={11} strokeWidth={2.8} className="animate-pulse" />
                </span>
              )}
              {/* Quick actions on folders: show on hover/focus, always on the selected row (touch) */}
              {entry.isDir && (
                <span className={`shrink-0 items-center gap-0.5 ${selected === entry.path ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}>
                  <button
                    type="button"
                    data-testid="explorer-row-chat"
                    onClick={(e) => { e.stopPropagation(); setSelected(entry.path); onNewChat(entry.path); }}
                    title={t("Abrir Claude en {0}", [entry.name])}
                    aria-label={t("Abrir Claude en {0}", [entry.name])}
                    className="w-[18px] h-[18px] flex items-center justify-center rounded border border-black bg-[#FFE500] text-black cursor-pointer"
                  >
                    <Sparkles size={10} strokeWidth={2.8} />
                  </button>
                  <button
                    type="button"
                    data-testid="explorer-row-enter"
                    onClick={(e) => { e.stopPropagation(); onNavigateFolder(entry.path); }}
                    title={t("Entrar en {0}", [entry.name])}
                    aria-label={t("Entrar en {0}", [entry.name])}
                    className="w-[18px] h-[18px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <CornerDownRight size={11} strokeWidth={2.8} />
                  </button>
                </span>
              )}
              {!working && changed && <span className="w-1.5 h-1.5 rounded-full bg-[#D97757] shrink-0" title={t("Cambiado por Claude en este chat")} />}
              {code && !entry.isDir && <span className={`shrink-0 w-3 text-center text-[9.5px] font-black ${GIT_COLORS[code]}`}>{GIT_LABELS[code]}</span>}
              {dirty && !code && <span className={`shrink-0 w-3 text-center text-[11px] leading-none ${GIT_COLORS.M}`}>•</span>}
            </div>
          );
        })}
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Cambiar el ancho del explorador")}
        onPointerDown={startResize}
        className="absolute top-0 -right-[3px] w-[6px] h-full cursor-col-resize hover:bg-[#FFE500]/60 z-10"
      />

      {menu && (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(menu.entry.isDir ? [{ label: t("Explorar esta carpeta"), icon: FolderOpen, run: () => onNavigateFolder(menu.entry.path) }] : []),
            { label: menu.entry.isDir ? (expanded.has(menu.entry.path) ? t("Contraer") : t("Expandir")) : t("Abrir"), icon: menu.entry.isDir ? FolderOpen : FileText, run: () => openEntry(menu.entry) },
            ...(!menu.entry.isDir ? [{ label: t("Abrir con la app del sistema"), icon: ExternalLink, run: () => void api?.openPath?.(menu.entry.path) }] : []),
            { label: t("Mostrar en el Explorador"), icon: FolderSearch, run: () => void api?.revealInExplorer(menu.entry.path) },
            'separator',
            { label: t("Copiar ruta"), icon: Copy, run: () => void copy(menu.entry.path, t("Ruta copiada")) },
            { label: t("Copiar ruta relativa"), icon: Copy, run: () => void copy(relativePath(menu.entry.path), t("Ruta relativa copiada")) },
            'separator',
            { label: t("Nuevo chat de Claude aquí"), icon: Sparkles, run: () => onNewChat(folderOf(menu.entry)) },
            { label: t("Nueva terminal aquí"), icon: TerminalSquare, run: () => onNewTerminal(folderOf(menu.entry)) },
          ]}
        />
      )}
    </aside>
  );
};

type MenuItem = { label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; run: () => void } | 'separator';

const ExplorerMenu: React.FC<{ x: number; y: number; items: MenuItem[]; onClose: () => void }> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  const left = Math.max(4, Math.min(x, window.innerWidth - 230));
  const top = Math.max(4, Math.min(y, window.innerHeight - items.length * 28 - 8));
  return (
    <div
      ref={ref}
      role="menu"
      data-testid="explorer-menu"
      style={{ left, top }}
      className="fixed z-[999999] w-56 bg-[#FAF8F5] dark:bg-[#1C1C20] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-700 rounded shadow-[4px_4px_0px_#000] py-1 text-xs font-bold"
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={`sep-${i}`} className="my-1 h-[2px] bg-black/15 dark:bg-zinc-700" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.run();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left hover:bg-[#FFE500] hover:text-black cursor-pointer"
          >
            <item.icon size={13} strokeWidth={2.5} className="shrink-0" />
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
};
