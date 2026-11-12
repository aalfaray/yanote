import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translateEditor, EDITOR_TRANSLATION_KEYS } from '../../src/lib/editorTranslation';

function collectJsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

describe('MDXEditor Spanish translation', () => {
  it('covers every text key used by the installed @mdxeditor/editor', () => {
    const dist = path.resolve(__dirname, '../../node_modules/@mdxeditor/editor/dist');
    const used = new Set<string>();
    for (const file of collectJsFiles(dist)) {
      const code = fs.readFileSync(file, 'utf8');
      for (const match of code.matchAll(/\bt\(\s*"([a-zA-Z]+\.[a-zA-Z.]+)"/g)) used.add(match[1]);
    }

    expect(used.size).toBeGreaterThan(50);
    const missing = [...used].filter((key) => !EDITOR_TRANSLATION_KEYS.includes(key));
    expect(missing).toEqual([]);
  });

  it('translates known keys and interpolates placeholders', () => {
    expect(translateEditor('toolbar.bold', 'Bold')).toBe('Negrita');
    expect(translateEditor('toolbar.blockTypeSelect.placeholder', 'Block type')).toBe('Tipo de bloque');
    expect(translateEditor('toolbar.blockTypes.heading', 'Heading {{level}}', { level: 2 })).toBe('Título 2');
    expect(translateEditor('toolbar.undo', 'Undo {{shortcut}}', { shortcut: '(Ctrl+Z)' })).toBe('Deshacer (Ctrl+Z)');
  });

  it('falls back to the library default for unknown keys', () => {
    expect(translateEditor('future.key', 'Future text {{x}}', { x: 1 })).toBe('Future text 1');
  });
});
