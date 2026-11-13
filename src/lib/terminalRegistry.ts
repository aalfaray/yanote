/** What the app's context menu can do in an open terminal (xterm keeps its own selection). */
export interface TerminalActions {
  getSelection: () => string;
  paste: () => void;
  selectAll: () => void;
}

const terminals = new Map<string, TerminalActions>();

export function registerTerminal(tabId: string, actions: TerminalActions): () => void {
  terminals.set(tabId, actions);
  return () => {
    if (terminals.get(tabId) === actions) terminals.delete(tabId);
  };
}

export function terminalActions(tabId: string | null | undefined): TerminalActions | undefined {
  return tabId ? terminals.get(tabId) : undefined;
}
