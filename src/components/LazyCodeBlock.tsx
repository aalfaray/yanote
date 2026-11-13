import { t, useLanguage } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { CodeMirrorEditor } from '@mdxeditor/editor';
import type { CodeBlockEditorDescriptor, CodeBlockEditorProps } from '@mdxeditor/editor';

/**
 * Code block shown as plain <pre> until the user clicks it, then swapped for MDXEditor's CodeMirror
 * editor. Each CodeMirror view forces a full-document layout when created, which made long notes
 * with several code blocks take seconds to open.
 */

const LazyCodeBlock: React.FC<CodeBlockEditorProps> = (props) => {
  useLanguage();
  const { code, language, focusEmitter } = props;
  // Fresh (empty) blocks, e.g. inserted from the toolbar, go straight to the real editor
  const [active, setActive] = useState(() => code.trim() === '');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const focusAfterMount = useRef(false);

  // MDXEditor asks the block to focus (e.g. arrow-key navigation into it): activate first
  useEffect(() => {
    if (active) return;
    focusEmitter.subscribe(() => {
      focusAfterMount.current = true;
      setActive(true);
    });
  }, [active, focusEmitter]);

  useEffect(() => {
    if (!active || !focusAfterMount.current) return;
    focusAfterMount.current = false;
    // CodeMirror builds its view asynchronously; focus once its content element exists
    const timer = setTimeout(() => wrapperRef.current?.querySelector<HTMLElement>('.cm-content')?.focus(), 50);
    return () => clearTimeout(timer);
  }, [active]);

  if (active) {
    return (
      <div ref={wrapperRef}>
        <CodeMirrorEditor {...props} />
      </div>
    );
  }

  return (
    <pre
      className="mdxeditor-static-code"
      data-language={language || undefined}
      title={t("Clic para editar el bloque de código")}
      onClick={() => {
        focusAfterMount.current = true;
        setActive(true);
      }}
    >
      <code>{code}</code>
    </pre>
  );
};

/** Same matching rule as MDXEditor's codeMirrorPlugin, but higher priority so it wins. */

export function lazyCodeBlockDescriptor(languages: Record<string, string>): CodeBlockEditorDescriptor {
  return {
    priority: 10,
    match: (language, meta) => !meta || Object.hasOwn(languages, language ?? ''),
    Editor: LazyCodeBlock,
  };
}
