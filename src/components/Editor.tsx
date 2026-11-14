import { t, useLanguage } from '../lib/i18n';
import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  linkPlugin,
  linkDialogPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  BlockTypeSelect,
  DiffSourceToggleWrapper,
} from '@mdxeditor/editor';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import { useReadAloudRequests } from '../hooks/useReadAloudRequests';
import { useSpeech } from '../hooks/useSpeech';
import { translateEditor } from '../lib/editorTranslation';
import {
  collectDomSegments,
  findSegmentIndex,
  markdownToSegments,
  plainTextToSegments,
} from '../lib/speechText';
import { SpeechPlayerBar, SpeechToolbarButton } from './SpeechControls';
import { SpeechContext, type SelectionSnapshot, type SpeechActions } from './speechContext';
import { isHeavyMarkdown } from '../lib/heavyMarkdown';
import { PlainMarkdownEditor } from './PlainMarkdownEditor';
import { FindBar } from './FindBar';
import { parseErrorPosition, type TextRange } from '../lib/parseErrorPosition';
import { lazyCodeBlockDescriptor } from './LazyCodeBlock';

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'React TSX',
  jsx: 'React JSX',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  json: 'JSON',
  markdown: 'Markdown',
  sh: 'Bash',
  sql: 'SQL',
};

interface EditorProps {
  tabId: string;
  markdown: string;
  /**
   * `isNormalization` is true when the rich editor rewrote the markdown it was given on load
   * (spacing, bullet symbols…): not a user edit, so the note must not be marked unsaved.
   */

  onChange: (content: string, isNormalization?: boolean) => void;
  onSave?: () => void;
  isDarkMode?: boolean;
  viewMode?: 'rich-text' | 'source';
  /** Focus the editor (caret at the end) right after this tab mounts, e.g. a freshly created tab */

  autoFocus?: boolean;
  /** Called once the autoFocus request has been consumed */

  onAutoFocused?: () => void;
}

export const Editor: React.FC<EditorProps> = ({
  tabId,
  markdown,
  onChange,
  onSave,
  isDarkMode = false,
  viewMode: requestedViewMode = 'rich-text',
  autoFocus = false,
  onAutoFocused,
}) => {
  const language = useLanguage();
  const editorTranslator = useCallback<typeof translateEditor>((...args) => translateEditor(...args), [language]);
  // Huge / table-heavy documents would freeze MDXEditor (it mounts a nested editor per table cell
  // even while showing source mode), so they get a plain CodeMirror editor instead.
  // Decided once per tab (from the content it opened with) so typing doesn't flip the mode.
  // Markdown MDXEditor can't parse (e.g. a stray `<la cosa>` read as an unclosed HTML tag) also falls back
  // to the plain editor instead of showing an error screen, until the user retries rich-text mode.
  const [plainCheck, setPlainCheck] = useState(() => ({
    tabId,
    heavy: isHeavyMarkdown(markdown),
    parseError: null as string | null,
  }));
  if (plainCheck.tabId !== tabId) setPlainCheck({ tabId, heavy: isHeavyMarkdown(markdown), parseError: null });
  const current = plainCheck.tabId === tabId ? plainCheck : { heavy: isHeavyMarkdown(markdown), parseError: null };
  const isHeavy = current.heavy;
  const parseError = current.parseError;
  const usePlainEditor = isHeavy || parseError !== null;

  // Range the plain editor should select/scroll to (the parse error position)
  const [reveal, setReveal] = useState<{ range: TextRange; request: number } | null>(null);
  const handleParseError = useCallback(
    ({ error }: { error: string }) => {
      // Deferred: MDXEditor reports this while rendering
      setTimeout(() => {
        setPlainCheck((prev) => (prev.tabId === tabId ? { ...prev, parseError: error } : prev));
        // Take the user straight to the broken spot
        const range = parseErrorPosition(error);
        if (range) setReveal({ range, request: Date.now() });
      }, 0);
    },
    [tabId]
  );
  const retryRichText = () => setPlainCheck((prev) => ({ ...prev, parseError: null }));
  const errorRange = parseErrorPosition(parseError);
  const goToError = () => errorRange && setReveal({ range: errorRange, request: Date.now() });
  const viewMode = isHeavy ? 'source' : requestedViewMode;

  const editorRef = useRef<MDXEditorMethods>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech();
  const { play, stop: stopSpeech, pause: pauseSpeech, resume: resumeSpeech } = speech;
  const speechStatus = speech.state.status;
  // Right-click > "Leer en voz alta" on a selection of this note
  useReadAloudRequests(tabId, play);

  // Move the caret into a freshly created tab so the user can type immediately
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => {
      editorRef.current?.focus(undefined, { defaultSelection: 'rootEnd' });
      onAutoFocused?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [autoFocus, tabId, onAutoFocused]);

  // --- Text to speech: build segments from the editor content ---
  const getRichRoot = useCallback(
    () => (viewMode === 'rich-text' ? containerRef.current?.querySelector<HTMLElement>('.mdxeditor-content') ?? null : null),
    [viewMode]
  );

  const captureSelection = useCallback((): SelectionSnapshot => {
    const selection = window.getSelection();
    const container = containerRef.current;
    if (!selection || selection.rangeCount === 0 || !container || !container.contains(selection.anchorNode)) {
      return { text: '', node: null };
    }
    return { text: selection.toString(), node: selection.anchorNode };
  }, []);

  const readAll = useCallback(() => {
    const root = getRichRoot();
    if (root) {
      play(collectDomSegments(root));
    } else {
      const md = editorRef.current?.getMarkdown() ?? markdown;
      play(markdownToSegments(md).map((text) => ({ text })));
    }
  }, [getRichRoot, play, markdown]);

  const readSelection = useCallback(
    (snapshot: SelectionSnapshot) => play(plainTextToSegments(snapshot.text).map((text) => ({ text }))),
    [play]
  );

  const readParagraph = useCallback(
    (snapshot: SelectionSnapshot, toEnd: boolean) => {
      const root = getRichRoot();
      if (!root) return readAll();
      const segments = collectDomSegments(root);
      const index = Math.max(0, findSegmentIndex(segments, snapshot.node));
      if (toEnd) play(segments, index);
      else play(segments.slice(index, index + 1));
    },
    [getRichRoot, play, readAll]
  );

  const speechActions = useMemo<SpeechActions>(
    () => ({
      speech,
      captureSelection,
      readAll,
      readSelection,
      readParagraph,
      paragraphsAvailable: viewMode === 'rich-text',
    }),
    [speech, captureSelection, readAll, readSelection, readParagraph, viewMode]
  );

  // Ctrl+Shift+Space: play/pause (selection > from caret > whole note). Esc: stop.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        if (speechStatus === 'speaking') return pauseSpeech();
        if (speechStatus === 'paused') return resumeSpeech();
        const snapshot = captureSelection();
        if (snapshot.text.trim()) readSelection(snapshot);
        else if (snapshot.node && viewMode === 'rich-text') readParagraph(snapshot, true);
        else readAll();
      } else if (e.key === 'Escape' && speechStatus !== 'idle') {
        stopSpeech();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [speechStatus, pauseSpeech, resumeSpeech, stopSpeech, captureSelection, readSelection, readParagraph, readAll, viewMode]);

  // Stop reading when switching tab, theme or view mode (the editor DOM is rebuilt)
  useEffect(() => () => stopSpeech(), [tabId, isDarkMode, viewMode, stopSpeech]);

  // Ctrl+F: find in the note (rich-text). CodeMirror editors (source mode, code blocks) handle their own
  // Ctrl+F and mark the event as handled, so those are left alone.
  const [find, setFind] = useState<{ open: boolean; query: string; request: number; top: number }>({
    open: false,
    query: '',
    request: 0,
    top: 44,
  });
  const getSearchRoot = useCallback(
    () => containerRef.current?.querySelector<HTMLElement>('.mdxeditor-content') ?? null,
    []
  );
  const setFindQuery = useCallback((query: string) => setFind((f) => ({ ...f, query })), []);
  const closeFind = useCallback(() => {
    setFind((f) => ({ ...f, open: false }));
    containerRef.current?.querySelector<HTMLElement>('.mdxeditor-content')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f') return;
      if (e.defaultPrevented || viewMode !== 'rich-text' || !containerRef.current) return;
      e.preventDefault();
      const selected = window.getSelection()?.toString().trim() ?? '';
      const toolbar = containerRef.current.querySelector<HTMLElement>('.mdxeditor-toolbar');
      setFind((f) => ({
        open: true,
        // Like browsers: a short single-line selection becomes the search term
        query: selected && selected.length <= 100 && !selected.includes('\n') ? selected : f.query,
        request: f.request + 1,
        top: (toolbar?.offsetHeight ?? 38) + 6,
      }));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);
  // The note DOM is rebuilt on tab / view changes: start with the bar closed
  const [findScope, setFindScope] = useState(`${tabId}-${viewMode}`);
  if (findScope !== `${tabId}-${viewMode}`) {
    setFindScope(`${tabId}-${viewMode}`);
    if (find.open) setFind((f) => ({ ...f, open: false }));
  }

  // Keyboard shortcut listener for Ctrl+S inside editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  if (usePlainEditor) {
    return (
      <div className={`flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden ${isDarkMode ? 'bg-[#121212]' : 'bg-white'}`}>
        {isHeavy ? (
          <div
            className="heavy-doc-banner shrink-0 flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold border-b-2 border-black dark:border-zinc-700 bg-[#FFE500] text-black"
            title={t("El modo enriquecido se desactiva en archivos de este tamaño porque congelaría la app.")}
          >
            {t("Archivo muy grande (más de 3 MB): se edita como código Markdown")}</div>
        ) : (
          <div className="parse-error-banner shrink-0 flex items-start gap-2 px-2 py-1 text-[11px] font-bold border-b-2 border-black dark:border-zinc-700 bg-[#FFE500] text-black">
            <span className="flex-1 min-w-0 break-words" title={parseError ?? ''}>
              {t("El modo enriquecido no pudo leer este archivo, se edita como código.")}{' '}
              {errorRange && (
                <span className="font-black">
                  {t("Error en la línea")}{' '}{errorRange.from.line}{t(", columna")}{' '}{errorRange.from.column}.{' '}
                </span>
              )}
              <span className="font-normal">{parseError}</span>
            </span>
            {errorRange && (
              <button
                onClick={goToError}
                className="shrink-0 px-1.5 py-0.5 border-2 border-black rounded bg-black text-[#FFE500] hover:bg-white hover:text-black cursor-pointer"
                title={t("Seleccionar en el editor el texto que causa el error")}
              >
                {t("Ir al error")}</button>
            )}
            <button
              onClick={retryRichText}
              className="shrink-0 px-1.5 py-0.5 border-2 border-black rounded bg-white hover:bg-black hover:text-white cursor-pointer"
              title={t("Volver a intentar el modo enriquecido (por ejemplo, después de corregir el texto)")}
            >
              {t("Reintentar")}</button>
          </div>
        )}
        <PlainMarkdownEditor
          tabId={tabId}
          value={markdown}
          onChange={onChange}
          isDarkMode={isDarkMode}
          autoFocus={autoFocus}
          onAutoFocused={onAutoFocused}
          reveal={parseError ? reveal : null}
        />
      </div>
    );
  }

  return (
    <SpeechContext.Provider value={speechActions}>
    <div ref={containerRef} className={`flex-1 w-full h-full flex flex-col overflow-hidden relative ${isDarkMode ? 'bg-[#121212]' : 'bg-white'}`}>
      <MDXEditor
        key={`${tabId}-${isDarkMode ? 'dark' : 'light'}-${viewMode}`}
        ref={editorRef}
        translation={editorTranslator}
        markdown={markdown}
        onChange={onChange}
        onError={handleParseError}
        className={`mdxeditor-full-height w-full h-full flex flex-col font-sans ${isDarkMode ? 'dark-theme' : ''}`}
        contentEditableClassName="mdxeditor-content outline-none"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          tablePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          codeBlockPlugin({
            defaultCodeBlockLanguage: 'js',
            codeBlockEditorDescriptors: [lazyCodeBlockDescriptor(CODE_BLOCK_LANGUAGES)],
          }),
          codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
          diffSourcePlugin({
            viewMode,
            diffMarkdown: '',
          }),
          toolbarPlugin({
            toolbarClassName: 'mdxeditor-toolbar border-b-2 border-black dark:border-zinc-700 bg-[#FAF8F5] dark:bg-[#1E1E24] flex items-center gap-1 shrink-0 transition-colors',
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                <div className="contents">
                  <UndoRedo />
                  <div className="toolbar-separator h-4 w-[1px] bg-black/30 dark:bg-zinc-600 mx-1" />
                  <BlockTypeSelect />
                  <BoldItalicUnderlineToggles />
                  <CodeToggle />
                  <div className="toolbar-separator h-4 w-[1px] bg-black/30 dark:bg-zinc-600 mx-1" />
                  <ListsToggle />
                  <InsertTable />
                  <InsertThematicBreak />
                  <CreateLink />
                  <div className="toolbar-separator h-4 w-[1px] bg-black/30 dark:bg-zinc-600 mx-1" />
                  <SpeechToolbarButton />
                </div>
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
      <SpeechPlayerBar speech={speech} />
      {find.open && (
        <FindBar
          getRoot={getSearchRoot}
          initialQuery={find.query}
          focusRequest={find.request}
          top={find.top}
          onClose={closeFind}
          onQueryChange={setFindQuery}
        />
      )}
    </div>
    </SpeechContext.Provider>
  );
};
