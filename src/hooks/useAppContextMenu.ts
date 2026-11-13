import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMenu, readMenuContext, isEditCommand, type EditCommand, type MenuAction, type MenuContext, type MenuEntry } from '../lib/contextMenu';
import { terminalActions, terminalSelection } from '../lib/terminalRegistry';
import { logError, logWarn } from '../lib/logger';
import { copyText } from '../lib/clipboard';

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
async function runEditCommand(action: EditCommand): Promise<void> {
  try {
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
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      try {
        // Menus of their own (e.g. a tab's) already handled it
        if (e.defaultPrevented) return;
        const { ctx, termTabId } = readMenuContext(e.target, terminalSelection);
        const entries = buildMenu(ctx);
        e.preventDefault();
        setMenu(entries ? { x: e.clientX, y: e.clientY, ctx, termTabId, entries } : null);
      } catch (err) {
        logError('useAppContextMenu.onContextMenu', err);
        setMenu(null);
      }
    };
    window.addEventListener('contextmenu', onContext);
    return () => window.removeEventListener('contextmenu', onContext);
  }, []);

  const close = useCallback(() => setMenu(null), []);

  const runAction = useCallback(
    (action: MenuAction) => {
      const current = menu;
      setMenu(null);
      if (!current) return;
      const { ctx, termTabId } = current;
      const text = ctx.selection;
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
            if (isEditCommand(action)) await runEditCommand(action);
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
