import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { findTextRanges } from '../lib/domSearch';

interface FindBarProps {
  /** Element whose text is searched (the rich-text content) */
  getRoot: () => HTMLElement | null;
  initialQuery?: string;
  /** Bumped by the parent on every Ctrl+F so an open bar re-focuses and re-selects its input */
  focusRequest: number;
  /** Distance from the top of the editor (below the toolbar) */
  top: number;
  onClose: () => void;
  /** Lets the parent remember the term for the next Ctrl+F */
  onQueryChange?: (query: string) => void;
}

const ALL = 'bn-search';
const CURRENT = 'bn-search-current';

// CSS Custom Highlight API: paints matches without touching the editor's DOM
type HighlightRegistry = Map<string, unknown>;
const highlights = (): HighlightRegistry | null =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
    ? (CSS as unknown as { highlights: HighlightRegistry }).highlights
    : null;

function paint(ranges: Range[], current: number) {
  const registry = highlights();
  if (!registry) return;
  registry.set(ALL, new Highlight(...ranges));
  if (ranges[current]) registry.set(CURRENT, new Highlight(ranges[current]));
  else registry.delete(CURRENT);
}

function clearPaint() {
  const registry = highlights();
  registry?.delete(ALL);
  registry?.delete(CURRENT);
}

function scrollToRange(range: Range | undefined) {
  const el = range?.startContainer.parentElement;
  el?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
}

/** Ctrl+F bar for the rich-text editor: case/accent-insensitive, finds text in tables and code too. */
export const FindBar: React.FC<FindBarProps> = ({ getRoot, initialQuery = '', focusRequest, top, onClose, onQueryChange }) => {
  const [query, setQuery] = useState(initialQuery);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  // Every Ctrl+F: take the parent's term (selected text or the last search) and select it
  const [seenRequest, setSeenRequest] = useState(focusRequest);
  if (seenRequest !== focusRequest) {
    setSeenRequest(focusRequest);
    setQuery(initialQuery);
  }
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  // Search on every query change; keep results fresh while the note is edited
  const runSearch = useCallback(
    (keepPosition: boolean) => {
      const root = getRoot();
      const found = root ? findTextRanges(root, queryRef.current) : [];
      setRanges(found);
      setCurrent((c) => {
        const next = keepPosition ? Math.min(c, Math.max(0, found.length - 1)) : 0;
        if (!keepPosition) scrollToRange(found[next]);
        return next;
      });
    },
    [getRoot]
  );

  useEffect(() => {
    runSearch(false);
  }, [query, runSearch]);

  useEffect(() => {
    const root = getRoot();
    if (!root || typeof MutationObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => runSearch(true), 200);
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [getRoot, runSearch]);

  useEffect(() => {
    paint(ranges, current);
  }, [ranges, current]);

  useEffect(() => () => clearPaint(), []);

  // Latest position in a ref so fast repeated Enter presses each advance one match
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });
  const go = (delta: number) => {
    if (ranges.length === 0) return;
    const next = (currentRef.current + delta + ranges.length) % ranges.length;
    currentRef.current = next;
    setCurrent(next);
    scrollToRange(ranges[next]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const hasQuery = query.trim().length > 0;
  const iconButton =
    'h-6 w-6 shrink-0 inline-flex items-center justify-center rounded border-[1.5px] border-black dark:border-zinc-600 bg-white dark:bg-[#27272A] hover:bg-[#FFE500] hover:text-black disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-[#27272A] cursor-pointer';

  return (
    <div
      role="search"
      style={{ top }}
      className="find-bar absolute left-2 right-2 min-[480px]:left-auto min-[480px]:w-80 z-30 flex items-center gap-1 p-1 rounded border-2 border-black dark:border-zinc-600 bg-[#FAF8F5] dark:bg-[#1C1C20] text-black dark:text-zinc-100 shadow-[3px_3px_0px_#000]"
    >
      <Search size={14} strokeWidth={2.5} className="mx-1 shrink-0 opacity-70" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onQueryChange?.(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder="Buscar en la nota"
        aria-label="Buscar en la nota"
        className="flex-1 min-w-0 h-6 px-1.5 text-xs font-bold rounded border-[1.5px] border-black dark:border-zinc-600 bg-white dark:bg-[#121212] outline-none focus:border-[#FFE500]"
      />
      <span
        className={`shrink-0 px-1 text-[11px] font-black tabular-nums ${hasQuery && ranges.length === 0 ? 'text-[#FF6B6B]' : 'opacity-70'}`}
        aria-live="polite"
      >
        {hasQuery ? (ranges.length ? `${current + 1}/${ranges.length}` : '0/0') : ''}
      </span>
      <button type="button" className={iconButton} onClick={() => go(-1)} disabled={!ranges.length} title="Anterior (Shift+Enter)" aria-label="Coincidencia anterior">
        <ChevronUp size={14} strokeWidth={2.5} />
      </button>
      <button type="button" className={iconButton} onClick={() => go(1)} disabled={!ranges.length} title="Siguiente (Enter)" aria-label="Coincidencia siguiente">
        <ChevronDown size={14} strokeWidth={2.5} />
      </button>
      <button type="button" className={iconButton} onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar búsqueda">
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
};
