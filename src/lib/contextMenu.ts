import { t } from './i18n';
import { logError } from './logger';

/** Where the right-click happened, as far as the menu cares. */

export interface MenuContext {
  /** a text field / editor, a terminal, or any other part of the page */

  kind: 'editable' | 'terminal' | 'page';
  /** selected text ('' when nothing is selected) */

  selection: string;
  /** Claude chat whose transcript was right-clicked (pins only make sense there) */

  chatTabId: string | null;
  spelling?: { requestId: number; word: string; suggestions: string[] };
}

export type MenuAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'readAloud' | 'sendToChat' | 'saveIdea' | 'pin' | 'correctSpelling' | `spell:${number}`;

/** Actions run by the browser on the focused field / page selection (through the main process). */

const EDIT_COMMANDS = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const;
export type EditCommand = (typeof EDIT_COMMANDS)[number];
export const isEditCommand = (action: MenuAction): action is EditCommand => (EDIT_COMMANDS as readonly string[]).includes(action);

export type MenuEntry = { action: MenuAction; label: string; shortcut?: string; disabled?: boolean; children?: MenuEntry[] } | 'separator';

/**
 * The app's right-click menu (replaces the native one): editing commands for the place clicked,
 * then what can be done with the selected text. Null when there's nothing to offer.
 */

export function buildMenu(ctx: MenuContext): MenuEntry[] | null {
  try {
    const has = ctx.selection.trim().length > 0;
    let entries: MenuEntry[];
    if (ctx.kind === 'editable') {
      entries = [
        { action: 'undo', label: t("Deshacer"), shortcut: 'Ctrl+Z' },
        { action: 'redo', label: t("Rehacer"), shortcut: 'Ctrl+Y' },
        'separator',
        { action: 'cut', label: t("Cortar"), shortcut: 'Ctrl+X', disabled: !has },
        { action: 'copy', label: t("Copiar"), shortcut: 'Ctrl+C', disabled: !has },
        { action: 'paste', label: t("Pegar"), shortcut: 'Ctrl+V' },
        'separator',
        { action: 'selectAll', label: t("Seleccionar todo"), shortcut: 'Ctrl+A' },
      ];
    } else if (ctx.kind === 'terminal') {
      entries = [
        { action: 'copy', label: t("Copiar"), shortcut: 'Ctrl+C', disabled: !has },
        { action: 'paste', label: t("Pegar"), shortcut: 'Ctrl+V' },
        'separator',
        { action: 'selectAll', label: t("Seleccionar todo") },
      ];
    } else {
      if (!has) return null;
      entries = [{ action: 'copy', label: t("Copiar"), shortcut: 'Ctrl+C' }, 'separator', { action: 'selectAll', label: t("Seleccionar todo"), shortcut: 'Ctrl+A' }];
    }
    if (has) {
      entries.push(
        'separator',
        { action: 'readAloud', label: t("Leer en voz alta") },
        { action: 'sendToChat', label: t("Enviar a un chat nuevo de Claude") },
        { action: 'saveIdea', label: t("Guardar idea") }
      );
      if (ctx.kind === 'page' && ctx.chatTabId) entries.push({ action: 'pin', label: t("Fijar en este chat") });
    }
    if (ctx.kind === 'editable' && ctx.spelling?.word) {
      entries.unshift({
        action: 'correctSpelling', label: t("Corregir «{0}»", [ctx.spelling.word]),
        children: ctx.spelling.suggestions.length
          ? ctx.spelling.suggestions.map((label, i) => ({ action: `spell:${i}` as const, label }))
          : [{ action: 'spell:0', label: t("Sin sugerencias disponibles"), disabled: true }],
      }, 'separator');
    }
    return entries;
  } catch (err) {
    logError('contextMenu.buildMenu', err, { kind: ctx?.kind });
    return null;
  }
}

/** Selected text of a text field (value + selection range), or of the page otherwise. */

function selectionIn(field: HTMLElement): string {
  try {
    const input = field as HTMLInputElement | HTMLTextAreaElement;
    if (typeof input.selectionStart === 'number' && 'value' in input) {
      return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
    }
    return window.getSelection()?.toString() ?? '';
  } catch (err) {
    logError('contextMenu.selectionIn', err);
    return '';
  }
}

/**
 * What was right-clicked, read from the DOM: a terminal (`[data-term-tab]`), a text field,
 * or the page (inside a Claude chat transcript when under `[data-chat-tab]`).
 * `terminalSelection` gives the selection of a terminal tab (xterm keeps its own).
 */

export function readMenuContext(
  target: EventTarget | null,
  terminalSelection: (tabId: string) => string
): { ctx: MenuContext; termTabId: string | null } {
  try {
    const el = target instanceof Element ? target : null;
    const termTabId = el?.closest<HTMLElement>('[data-term-tab]')?.dataset.termTab ?? null;
    if (termTabId) return { ctx: { kind: 'terminal', selection: terminalSelection(termTabId), chatTabId: null }, termTabId };
    const field = el?.closest<HTMLElement>('textarea, input, [contenteditable="true"]') ?? null;
    if (field) return { ctx: { kind: 'editable', selection: selectionIn(field), chatTabId: null }, termTabId: null };
    const chatTabId = el?.closest<HTMLElement>('[data-chat-tab]')?.dataset.chatTab ?? null;
    return { ctx: { kind: 'page', selection: window.getSelection()?.toString() ?? '', chatTabId }, termTabId: null };
  } catch (err) {
    logError('contextMenu.readMenuContext', err);
    return { ctx: { kind: 'page', selection: '', chatTabId: null }, termTabId: null };
  }
}
