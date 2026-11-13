import { logError } from './logger';

/** What the app's context menu can do in an open terminal (xterm keeps its own selection). */
export interface TerminalActions {
  getSelection: () => string;
  paste: () => void;
  selectAll: () => void;
}

const terminals = new Map<string, TerminalActions>();

/** Makes a terminal tab reachable from the context menu; returns the function that removes it. */
export function registerTerminal(tabId: string, actions: TerminalActions): () => void {
  try {
    terminals.set(tabId, actions);
  } catch (err) {
    logError('terminalRegistry.registerTerminal', err, { tabId });
  }
  return () => {
    try {
      if (terminals.get(tabId) === actions) terminals.delete(tabId);
    } catch (err) {
      logError('terminalRegistry.unregister', err, { tabId });
    }
  };
}

export function terminalActions(tabId: string | null | undefined): TerminalActions | undefined {
  try {
    return tabId ? terminals.get(tabId) : undefined;
  } catch (err) {
    logError('terminalRegistry.terminalActions', err, { tabId });
    return undefined;
  }
}

/** Selected text in a terminal tab ('' when none, unknown tab or the terminal failed). */
export function terminalSelection(tabId: string): string {
  try {
    return terminals.get(tabId)?.getSelection() ?? '';
  } catch (err) {
    logError('terminalRegistry.terminalSelection', err, { tabId });
    return '';
  }
}
