import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { getLanguage, useLanguage } from '../lib/i18n';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import type { TextRange } from '../lib/parseErrorPosition';

interface PlainMarkdownEditorProps {
  tabId: string;
  value: string;
  onChange: (content: string) => void;
  isDarkMode?: boolean;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  /** Select, scroll to and focus this range; `request` changes on every new jump (e.g. a counter) */
  reveal?: { range: TextRange; request: number } | null;
}

/** Document offsets for a 1-based line/column range, clamped to the document. */
function rangeToOffsets(state: EditorState, range: TextRange): { from: number; to: number } {
  const toOffset = (p: TextRange['from']) => {
    const line = state.doc.line(Math.min(Math.max(1, p.line), state.doc.lines));
    return Math.min(line.from + Math.max(0, p.column - 1), line.to);
  };
  const from = toOffset(range.from);
  return { from, to: Math.max(from, toOffset(range.to)) };
}

/** Spanish labels for CodeMirror's Ctrl+F panel and related UI */
const SPANISH_PHRASES = EditorState.phrases.of({
  Find: 'Buscar',
  Replace: 'Reemplazar',
  next: 'siguiente',
  previous: 'anterior',
  all: 'todos',
  'match case': 'mayúsculas',
  regexp: 'regex',
  'by word': 'palabra completa',
  replace: 'reemplazar',
  'replace all': 'reemplazar todo',
  close: 'cerrar',
  'Go to line': 'Ir a la línea',
  go: 'ir',
  'current match': 'coincidencia actual',
  'on line': 'en la línea',
  'replaced match on line $': 'reemplazada en la línea $',
  'replaced $ matches': '$ reemplazos',
  'Folded lines': 'Líneas plegadas',
  'Unfolded lines': 'Líneas desplegadas',
  'Fold line': 'Plegar línea',
  'Unfold line': 'Desplegar línea',
});

const lightTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#ffffff', color: '#111111', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, Consolas, monospace', overflow: 'auto' },
  '.cm-gutters': { backgroundColor: '#faf8f5', color: '#888', borderRight: '2px solid #000' },
  '.cm-activeLine': { backgroundColor: 'rgba(255, 229, 0, 0.15)' },
  '.cm-activeLineGutter': { backgroundColor: '#ffe500', color: '#000' },
  '&.cm-focused': { outline: 'none' },
});

const darkTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#121212', color: '#e4e4e7', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'ui-monospace, Consolas, monospace', overflow: 'auto' },
    '.cm-gutters': { backgroundColor: '#18181b', color: '#71717a', borderRight: '2px solid #3f3f46' },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 229, 0, 0.08)' },
    '.cm-activeLineGutter': { backgroundColor: '#27272a', color: '#ffe500' },
    '.cm-cursor': { borderLeftColor: '#ffe500' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true }
);

/**
 * Lightweight source editor for documents too big for MDXEditor's rich-text mode
 * (see lib/heavyMarkdown). CodeMirror virtualises rendering, so 500 KB files stay smooth.
 */
export const PlainMarkdownEditor: React.FC<PlainMarkdownEditorProps> = ({
  tabId,
  value,
  onChange,
  isDarkMode = false,
  autoFocus = false,
  onAutoFocused,
  reveal = null,
}) => {
  const language = useLanguage();
  const languageCompartment = useRef(new Compartment());
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  // (Re)create the view per tab / theme, like MDXEditor's keyed remount
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          languageCompartment.current.of(getLanguage() === 'es' ? SPANISH_PHRASES : []),
          markdownLang(),
          EditorView.lineWrapping,
          isDarkMode ? darkTheme : lightTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [tabId, isDarkMode]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: languageCompartment.current.reconfigure(language === 'es' ? SPANISH_PHRASES : []) });
  }, [language]);

  useEffect(() => {
    if (!autoFocus || !viewRef.current) return;
    viewRef.current.focus();
    onAutoFocused?.();
  }, [autoFocus, tabId, onAutoFocused]);

  // Jump to a range (e.g. the parse error): select it, center it on screen and focus the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reveal) return;
    const { from, to } = rangeToOffsets(view.state, reveal.range);
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
  }, [reveal]);

  return <div ref={hostRef} className="plain-md-editor flex-1 min-h-0 w-full" />;
};
