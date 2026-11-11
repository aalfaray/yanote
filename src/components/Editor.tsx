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
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  BlockTypeSelect,
} from '@mdxeditor/editor';
import type { MDXEditorMethods } from '@mdxeditor/editor';

interface EditorProps {
  tabId: string;
  markdown: string;
  onChange: (content: string) => void;
  onSave?: () => void;
}

export const Editor: React.FC<EditorProps> = ({
  tabId,
  markdown,
  onChange,
  onSave,
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

  return (
    <div className="flex-1 w-full h-full flex flex-col bg-white overflow-hidden relative">
      <MDXEditor
        key={tabId}
        ref={editorRef}
        markdown={markdown}
        onChange={onChange}
        className="w-full h-full flex flex-col font-sans"
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
          toolbarPlugin({
            toolbarClassName: 'mdxeditor-toolbar border-b-2 border-black bg-[#FAF8F5] px-2 py-1.5 flex items-center gap-1 shrink-0 overflow-x-auto',
            toolbarContents: () => (
              <div className="flex items-center gap-1 flex-wrap">
                <UndoRedo />
                <div className="h-4 w-[1px] bg-black/30 mx-1" />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <CodeToggle />
                <div className="h-4 w-[1px] bg-black/30 mx-1" />
                <ListsToggle />
                <InsertTable />
                <InsertThematicBreak />
                <CreateLink />
              </div>
            ),
          }),
        ]}
      />
    </div>
  );
};
