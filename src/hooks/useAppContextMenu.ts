import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMenu, readMenuContext, isEditCommand, type EditCommand, type MenuAction, type MenuContext, type MenuEntry } from '../lib/contextMenu';
import { terminalActions, terminalSelection } from '../lib/terminalRegistry';
import { logError, logWarn } from '../lib/logger';
import { copyText } from '../lib/clipboard';
import { DRAFT_HISTORY_EVENT } from './useDraftHistory';

export interface OpenContextMenu {
  x: number;
  y: number;
  ctx: MenuContext;
  termTabId: string | null;
  entries: MenuEntry[];
}

/** What the app does with the selected text (the editing commands are handled here). */
export interface ContextMenuHandlers {
  sendToChat: (text: string) => void;
  saveIdea: (text: string, chatTabId: string | null) => void;
  pin: (text: string, chatTabId: string) => void;
  /** Read the selection aloud in the chat/terminal it came from (null: the tab on screen) */
  readAloud: (text: string, from: { chatTabId: string | null; termTabId: string | null }) => void;
}

/** Copy / paste / select all inside a terminal tab (xterm keeps its own selection). */
async function runInTerminal(action: MenuAction, termTabId: string, text: string): Promise<boolean> {
  try {
    const term = terminalActions(termTabId);
    if (!term) return false;
    if (action === 'copy') await copyText(text, 'useAppContextMenu.terminalCopy');
    else if (action === 'paste') term.paste();
    else if (action === 'selectAll') term.selectAll();
    return true;
  } catch (err) {
    logError('useAppContextMenu.runInTerminal', err, { action, termTabId });
    // handled (and logged): don't fall through to the page's edit command
    return true;
  }
}

/** undo / redo / cut / copy / paste / selectAll on the focused field or page selection (main process). */
async function runEditCommand(action: EditCommand, field: HTMLElement | null): Promise<void> {
  try {
    if ((action === 'undo' || action === 'redo') && field &&
      !field.dispatchEvent(new CustomEvent(DRAFT_HISTORY_EVENT, { detail: action, cancelable: true }))) return;
    const ok = await window.electronAPI?.editCommand?.(action);
    if (ok === false) logWarn('useAppContextMenu.runEditCommand', 'main process did not run the edit command', { action });
  } catch (err) {
    logError('useAppContextMenu.runEditCommand', err, { action });
  }
}

/**
 * yanote's own right-click menu (replaces the native one everywhere): listens for `contextmenu`,
 * works out what was clicked and runs the chosen action.
 */
export function useAppContextMenu(handlers: ContextMenuHandlers) {
  const [menu, setMenu] = useState<OpenContextMenu | null>(null);
  const pendingSpelling = useRef<{ field: HTMLElement; x: number; y: number; at: number } | null>(null);
  const editTarget = useRef<HTMLElement | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      try {
        // Menus of their own (e.g. a tab's) already handled it
        if (e.defaultPrevented) return;
        pendingSpelling.current = null;
        editTarget.current = e.target instanceof Element ? e.target.closest<HTMLElement>('textarea, input, [contenteditable="true"]') : null;
        const field = e.target instanceof Element ? e.target.closest<HTMLElement>('textarea[data-chat-composer]') : null;
        if (field && window.electronAPI?.onSpellingContext) {
          // Let Chromium inspect the clicked word before it forwards its spelling context.
          pendingSpelling.current = { field, x: e.clientX, y: e.clientY, at: Date.now() };
          setMenu(null);
          return;
        }
        const { ctx, termTabId } = readMenuContext(e.target, terminalSelection);
        const entries = buildMenu(ctx);
        e.preventDefault();
        setMenu(entries ? { x: e.clientX, y: e.clientY, ctx, termTabId, entries } : null);
      } catch (err) {
        logError('useAppContextMenu.onContextMenu', err);
        setMenu(null);
      }
    };
    const offSpelling = window.electronAPI?.onSpellingContext?.((spelling) => {
      const pending = pendingSpelling.current;
      if (!pending || !pending.field.isConnected || Date.now() - pending.at > 2000) return;
      if ((pending.x || pending.y) && (Math.abs(pending.x - spelling.x) > 2 || Math.abs(pending.y - spelling.y) > 2)) return;
      pendingSpelling.current = null;
      const { ctx, termTabId } = readMenuContext(pending.field, terminalSelection);
      if (spelling.word) ctx.spelling = { requestId: spelling.requestId, word: spelling.word, suggestions: spelling.suggestions };
      const entries = buildMenu(ctx);
      setMenu(entries ? { x: spelling.x, y: spelling.y, ctx, termTabId, entries } : null);
    });
    const onInput = () => { pendingSpelling.current = null; setMenu(null); };
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('input', onInput);
    return () => {
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('input', onInput);
      offSpelling?.();
      pendingSpelling.current = null;
    };
  }, []);

  const close = useCallback(() => { pendingSpelling.current = null; setMenu(null); }, []);

  const runAction = useCallback(
    (action: MenuAction) => {
      const current = menu;
      setMenu(null);
      if (!current) return;
      const { ctx, termTabId } = current;
      const text = ctx.selection;
      if (action.startsWith('spell:') && ctx.spelling) {
        const index = Number(action.slice(6));
        const suggestion = ctx.spelling.suggestions[index];
        if (Number.isInteger(index) && suggestion) void window.electronAPI?.replaceMisspelling?.(ctx.spelling.requestId, suggestion)
          .catch((err) => logError('useAppContextMenu.correctSpelling', err));
        return;
      }
      try {
        const h = handlersRef.current;
        switch (action) {
          case 'sendToChat':
            h.sendToChat(text.trim());
            return;
          case 'saveIdea':
            h.saveIdea(text, ctx.chatTabId);
            return;
          case 'pin':
            if (ctx.chatTabId) h.pin(text, ctx.chatTabId);
            return;
          case 'readAloud':
            h.readAloud(text, { chatTabId: ctx.chatTabId, termTabId });
            return;
        }
        void (async () => {
          try {
            if (termTabId && (await runInTerminal(action, termTabId, text))) return;
            if (isEditCommand(action)) await runEditCommand(action, editTarget.current);
          } catch (err) {
            logError('useAppContextMenu.runAction', err, { action, kind: ctx.kind });
          }
        })();
      } catch (err) {
        logError('useAppContextMenu.runAction', err, { action, kind: ctx.kind });
      }
    },
    [menu]
  );

  return { menu, close, runAction };
}
