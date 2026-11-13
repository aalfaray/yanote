import { describe, it, expect } from 'vitest';
import { markdownToPrintHtml, folderToFileUrl } from '../../src/lib/exportPdf';
import { chatToMarkdown, type ChatItem } from '../../src/lib/claudeChat';

describe('Frontend: note to PDF (print HTML)', () => {
  it('renders Markdown with GFM tables into a standalone document', () => {
    const html = markdownToPrintHtml('# Título\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] hecho', 'Mi <nota>', 'C:\\notas\\proj');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<title>Mi &lt;nota&gt;</title>');
    expect(html).toContain('<base href="file:///C:/notas/proj/">');
  });

  it('escapes raw HTML in the note instead of running it', () => {
    const html = markdownToPrintHtml('<script>alert(1)</script>\n\nhola', 'x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<base');
  });

  it('turns folders into file URLs', () => {
    expect(folderToFileUrl('C:\\Mis notas\\')).toBe('file:///C:/Mis%20notas/');
    expect(folderToFileUrl('/home/u/notas')).toBe('file:///home/u/notas/');
  });
});

describe('Frontend: chat to Markdown (to hand to another AI)', () => {
  const items: ChatItem[] = [
    { kind: 'user', id: 'u1', text: 'lista los archivos', imageCount: 1 },
    { kind: 'thinking', id: 'th', msgId: 'm1', text: 'pensando…', streaming: false, final: true, parentToolUseId: null },
    { kind: 'text', id: 't1', msgId: 'm1', text: 'Voy a revisar.', streaming: false, final: true, parentToolUseId: null },
    { kind: 'tool', id: 'tool1', name: 'Bash', input: { command: 'ls', description: 'Lista' }, partialInput: '', result: { text: 'a.md\n```b```', isError: false }, parentToolUseId: null },
    { kind: 'tool', id: 'sub', name: 'Read', input: { file_path: 'x' }, partialInput: '', parentToolUseId: 'tool1' },
    { kind: 'text', id: 't2', msgId: 'm2', text: 'Hay un archivo.', streaming: false, final: true, parentToolUseId: null },
    { kind: 'notice', id: 'n', text: 'Modelo cambiado', tone: 'info' },
    { kind: 'result', id: 'r', isError: false, durationMs: 1, costUsd: 0.01, turns: 1, errors: [] },
  ];

  it('keeps the conversation and summarises tools, without thinking or notices', () => {
    const md = chatToMarkdown(items, { model: 'Opus 5.5', cwd: 'C:\\proj', date: new Date(2026, 10, 12) });
    expect(md).toContain('# Conversación con Claude');
    expect(md).toContain('Modelo: Opus 5.5');
    expect(md).toContain('Carpeta de trabajo: `C:\\proj`');
    expect(md).toContain('## 🧑 Usuario\n\nlista los archivos\n\n_(1 imagen adjunta)_');
    expect(md).toContain('**🔧 Bash**: `ls`');
    expect(md).toContain('````\na.md\n```b```\n````');
    expect(md).toContain('Hay un archivo.');
    // One "Claude" heading for the whole answer (text + tool + text)
    expect(md.match(/## 🤖 Claude/g)).toHaveLength(1);
    expect(md).not.toContain('pensando');
    expect(md).not.toContain('Modelo cambiado');
    expect(md).not.toContain('Read');
  });

  it('can leave tools out and truncates long outputs', () => {
    expect(chatToMarkdown(items, { includeTools: false })).not.toContain('Bash');
    const long: ChatItem[] = [
      { kind: 'user', id: 'u', text: 'hola', imageCount: 0 },
      { kind: 'tool', id: 't', name: 'Bash', input: { command: 'cat big' }, partialInput: '', result: { text: 'x'.repeat(50), isError: false }, parentToolUseId: null },
    ];
    expect(chatToMarkdown(long, { maxToolOutput: 10 })).toContain('… (40 caracteres omitidos)');
  });
});
