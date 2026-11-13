/** Where the right-click happened, as far as the menu cares. */
export interface MenuContext {
  /** a text field / editor, a terminal, or any other part of the page */
  kind: 'editable' | 'terminal' | 'page';
  /** selected text ('' when nothing is selected) */
  selection: string;
  /** Claude chat whose transcript was right-clicked (pins only make sense there) */
  chatTabId: string | null;
}

export type MenuAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'sendToChat' | 'saveIdea' | 'pin';

export type MenuEntry = { action: MenuAction; label: string; shortcut?: string; disabled?: boolean } | 'separator';

/**
 * The app's right-click menu (replaces the native one): editing commands for the place clicked,
 * then what can be done with the selected text. Null when there's nothing to offer.
 */
export function buildMenu(ctx: MenuContext): MenuEntry[] | null {
  const has = ctx.selection.trim().length > 0;
  let entries: MenuEntry[];
  if (ctx.kind === 'editable') {
    entries = [
      { action: 'undo', label: 'Deshacer', shortcut: 'Ctrl+Z' },
      { action: 'redo', label: 'Rehacer', shortcut: 'Ctrl+Y' },
      'separator',
      { action: 'cut', label: 'Cortar', shortcut: 'Ctrl+X', disabled: !has },
      { action: 'copy', label: 'Copiar', shortcut: 'Ctrl+C', disabled: !has },
      { action: 'paste', label: 'Pegar', shortcut: 'Ctrl+V' },
      'separator',
      { action: 'selectAll', label: 'Seleccionar todo', shortcut: 'Ctrl+A' },
    ];
  } else if (ctx.kind === 'terminal') {
    entries = [
      { action: 'copy', label: 'Copiar', shortcut: 'Ctrl+C', disabled: !has },
      { action: 'paste', label: 'Pegar', shortcut: 'Ctrl+V' },
      'separator',
      { action: 'selectAll', label: 'Seleccionar todo' },
    ];
  } else {
    if (!has) return null;
    entries = [{ action: 'copy', label: 'Copiar', shortcut: 'Ctrl+C' }, 'separator', { action: 'selectAll', label: 'Seleccionar todo', shortcut: 'Ctrl+A' }];
  }
  if (has) {
    entries.push('separator', { action: 'sendToChat', label: 'Enviar a un chat nuevo de Claude' }, { action: 'saveIdea', label: 'Guardar idea' });
    if (ctx.kind === 'page' && ctx.chatTabId) entries.push({ action: 'pin', label: 'Fijar en este chat' });
  }
  return entries;
}
