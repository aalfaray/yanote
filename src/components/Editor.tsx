import React, { useRef, useEffect } from 'react';
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

interface EditorProps {
  tabId: string;
  markdown: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  isDarkMode?: boolean;
  viewMode?: 'rich-text' | 'source';
}

export const Editor: React.FC<EditorProps> = ({
  tabId,
  markdown,
  onChange,
  onSave,
  isDarkMode = false,
  viewMode = 'rich-text',
}) => {
  const editorRef = useRef<MDXEditorMethods>(null);

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

  // Convert vertical mouse wheel into horizontal scroll on the toolbar for narrow windows
  useEffect(() => {
    const timer = setTimeout(() => {
      const toolbar = document.querySelector('.mdxeditor-toolbar');
      if (!toolbar) return;
      const handleWheel = (e: Event) => {
        const wheelEv = e as WheelEvent;
        if (toolbar.scrollWidth > toolbar.clientWidth) {
          toolbar.scrollLeft += wheelEv.deltaY || wheelEv.deltaX;
        }
      };
      toolbar.addEventListener('wheel', handleWheel, { passive: true });
      return () => toolbar.removeEventListener('wheel', handleWheel);
    }, 100);
    return () => clearTimeout(timer);
  }, [tabId, isDarkMode]);

  return (
    <div className={`flex-1 w-full h-full flex flex-col overflow-hidden relative ${isDarkMode ? 'bg-[#121212]' : 'bg-white'}`}>
      <MDXEditor
        key={`${tabId}-${isDarkMode ? 'dark' : 'light'}-${viewMode}`}
        ref={editorRef}
        markdown={markdown}
        onChange={onChange}
        className={`w-full h-full flex flex-col font-sans ${isDarkMode ? 'dark-theme' : ''}`}
        contentEditableClassName="mdxeditor-content outline-none min-h-full flex-1"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          tablePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
          codeMirrorPlugin({
            codeBlockLanguages: {
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
            },
          }),
          diffSourcePlugin({
            viewMode,
            diffMarkdown: '',
          }),
          toolbarPlugin({
            toolbarClassName: 'mdxeditor-toolbar border-b-2 border-black dark:border-zinc-700 bg-[#FAF8F5] dark:bg-[#1E1E24] px-1.5 py-1 flex items-center justify-between gap-1 shrink-0 overflow-x-auto no-scrollbar flex-nowrap transition-colors',
            toolbarContents: () => (
              <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                <div className="flex items-center gap-1 flex-nowrap shrink-0">
                  <UndoRedo />
                  <div className="h-4 w-[1px] bg-black/30 dark:bg-zinc-600 mx-1" />
                  <BlockTypeSelect />
                  <BoldItalicUnderlineToggles />
                  <CodeToggle />
                  <div className="h-4 w-[1px] bg-black/30 dark:bg-zinc-600 mx-1" />
                  <ListsToggle />
                  <InsertTable />
                  <InsertThematicBreak />
                  <CreateLink />
                </div>
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    </div>
  );
};
