import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Scissors, Copy, ClipboardPaste, TextSelect, Send, Lightbulb, Pin, Volume2 } from 'lucide-react';
import type { MenuAction, MenuEntry } from '../../lib/contextMenu';

const ICONS: Record<MenuAction, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  undo: Undo2,
  redo: Redo2,
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  selectAll: TextSelect,
  sendToChat: Send,
  saveIdea: Lightbulb,
  pin: Pin,
  readAloud: Volume2,
};

interface AppContextMenuProps {
  x: number;
  y: number;
  entries: MenuEntry[];
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}

/**
 * yanote's right-click menu, in the app's own look (same as the tab menu). Items keep the
 * focus/selection where it was (mousedown is cancelled), so copy/cut/paste act on it.
 */
export const AppContextMenu: React.FC<AppContextMenuProps> = ({ x, y, entries, onAction, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
  const actionable = entries.map((e, i) => (e !== 'separator' && !e.disabled ? i : -1)).filter((i) => i >= 0);

  // Keep it inside the window (open upwards/leftwards near the edges)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, y + height > window.innerHeight - 4 ? y - height : y),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((cur) => {
          const at = actionable.indexOf(cur);
          const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
          return actionable[(next + actionable.length) % actionable.length] ?? -1;
        });
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        const entry = entries[active];
        if (entry !== 'separator') onAction(entry.action);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('wheel', onClose);
    };
  }, [actionable, active, entries, onAction, onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Menú contextual"
      data-testid="app-context-menu"
      style={{ left: pos.left, top: pos.top }}
      // Don't take the focus/selection away from what was right-clicked
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[999999] w-60 max-w-[calc(100vw-8px)] bg-[#FAF8F5] dark:bg-[#1C1C20] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-700 rounded shadow-[4px_4px_0px_#000] py-1 select-none text-xs font-bold animate-in fade-in zoom-in-95 duration-100"
    >
      {entries.map((entry, i) => {
        if (entry === 'separator') return <div key={`sep-${i}`} className="my-1 border-t border-black/15 dark:border-zinc-700" />;
        const Icon = ICONS[entry.action];
        return (
          <button
            key={entry.action}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => onAction(entry.action)}
            onMouseEnter={() => setActive(entry.disabled ? -1 : i)}
            className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer group disabled:opacity-40 disabled:cursor-default ${
              active === i ? 'bg-[#FFE500] text-black' : 'hover:bg-[#FFE500] hover:text-black disabled:hover:bg-transparent disabled:hover:text-inherit'
            }`}
          >
            <Icon size={13} strokeWidth={2.5} className={`shrink-0 ${active === i ? 'text-black' : 'text-black/70 dark:text-zinc-400 group-hover:text-black'}`} />
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.shortcut && <span className={`text-[10px] font-bold ${active === i ? 'text-black/60' : 'opacity-50'}`}>{entry.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
};
