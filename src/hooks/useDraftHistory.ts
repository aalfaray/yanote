import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type SetStateAction } from 'react';

export const DRAFT_HISTORY_EVENT = 'yanote:draft-history';
type Snapshot = { text: string; start: number; end: number };
type Group = { type: string; at: number; caret: number };
const MAX_UNDO_STEPS = 200;

/** Per-composer history, including programmatic insertions that Chromium cannot undo. */
export function useDraftHistory(initialText = '') {
  const [draft, setValue] = useState(initialText);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const history = useRef({
    present: { text: initialText, start: initialText.length, end: initialText.length } as Snapshot,
    past: [] as Snapshot[], future: [] as Snapshot[], group: null as Group | null,
  });
  const beforeInput = useRef<{ snapshot: Snapshot; type: string } | null>(null);
  const selectionToRestore = useRef<Snapshot | null>(null);

  const currentSnapshot = useCallback((): Snapshot => {
    const current = history.current.present;
    const el = inputRef.current;
    return el && el.value === current.text ? { text: current.text, start: el.selectionStart, end: el.selectionEnd } : current;
  }, []);

  const record = useCallback((next: Snapshot, before: Snapshot, type: string) => {
    const h = history.current;
    if (next.text === h.present.text) return;
    const now = Date.now();
    const groupable = ['insertText', 'deleteContentBackward', 'deleteContentForward', 'insertCompositionText'].includes(type);
    const continues = groupable && h.group?.type === type && now - h.group.at < 1000 && h.future.length === 0 &&
      (type === 'insertCompositionText' || (before.start === before.end && before.start === h.group.caret));
    if (!continues) {
      h.past.push(before);
      if (h.past.length > MAX_UNDO_STEPS) h.past.shift();
    }
    h.future = [];
    h.present = next;
    // Spaces and newlines close a typing group, so undo walks back through words.
    h.group = groupable && !(type === 'insertText' && /\s/.test(next.text.slice(before.start, next.start)))
      ? { type, at: now, caret: next.start } : null;
    setValue(next.text);
  }, []);

  const setDraft = useCallback((value: SetStateAction<string>) => {
    const before = currentSnapshot();
    const text = typeof value === 'function' ? value(before.text) : value;
    if (text === before.text) return;
    const next = { text, start: text.length, end: text.length };
    beforeInput.current = null;
    record(next, before, 'programmatic');
    selectionToRestore.current = next;
  }, [currentSnapshot, record]);

  const resetDraft = useCallback((text: string) => {
    const next = { text, start: text.length, end: text.length };
    history.current = { present: next, past: [], future: [], group: null };
    beforeInput.current = null;
    selectionToRestore.current = next;
    setValue(text);
  }, []);

  const move = useCallback((action: 'undo' | 'redo') => {
    const h = history.current;
    const from = action === 'undo' ? h.past : h.future;
    const to = action === 'undo' ? h.future : h.past;
    const next = from.pop();
    h.group = null;
    beforeInput.current = null;
    if (!next) return;
    to.push(currentSnapshot());
    h.present = next;
    selectionToRestore.current = next;
    setValue(next.text);
  }, [currentSnapshot]);

  const onDraftChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const before = beforeInput.current;
    beforeInput.current = null;
    record({ text: el.value, start: el.selectionStart, end: el.selectionEnd }, before?.snapshot ?? history.current.present,
      before?.type ?? (e.nativeEvent as InputEvent).inputType ?? 'change');
  }, [record]);

  useLayoutEffect(() => {
    const selection = selectionToRestore.current;
    if (!selection || !inputRef.current) return;
    inputRef.current.setSelectionRange(selection.start, selection.end);
    selectionToRestore.current = null;
  }, [draft]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.altKey || (!e.ctrlKey && !e.metaKey)) return;
      const key = e.key.toLowerCase();
      const action = key === 'z' ? (e.shiftKey ? 'redo' : 'undo') : key === 'y' && !e.shiftKey ? 'redo' : null;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      move(action);
    };
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
        e.preventDefault();
        move(e.inputType === 'historyUndo' ? 'undo' : 'redo');
      } else beforeInput.current = { snapshot: currentSnapshot(), type: e.inputType };
    };
    const onRequest = (e: Event) => {
      const action = (e as CustomEvent).detail;
      if (action !== 'undo' && action !== 'redo') return;
      e.preventDefault();
      move(action);
    };
    const onSelect = () => {
      const snapshot = currentSnapshot();
      const h = history.current;
      if (snapshot.start !== h.present.start || snapshot.end !== h.present.end) h.group = null;
      h.present = snapshot;
    };
    const breakGroup = () => { history.current.group = null; };
    el.addEventListener('keydown', onKey);
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener(DRAFT_HISTORY_EVENT, onRequest);
    el.addEventListener('select', onSelect);
    el.addEventListener('blur', breakGroup);
    el.addEventListener('compositionend', breakGroup);
    return () => {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener(DRAFT_HISTORY_EVENT, onRequest);
      el.removeEventListener('select', onSelect);
      el.removeEventListener('blur', breakGroup);
      el.removeEventListener('compositionend', breakGroup);
    };
  }, [currentSnapshot, move]);

  return { draft, setDraft, resetDraft, inputRef, onDraftChange };
}
