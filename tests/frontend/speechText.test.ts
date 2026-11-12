import { describe, it, expect } from 'vitest';
import {
  cleanSpeechText,
  collectDomSegments,
  findSegmentIndex,
  markdownToSegments,
  plainTextToSegments,
} from '../../src/lib/speechText';

describe('speechText', () => {
  it('removes emojis and collapses whitespace', () => {
    expect(cleanSpeechText('Hola ⚡   mundo ✨\n')).toBe('Hola mundo');
  });

  it('splits markdown into headings, paragraphs, list items and table rows', () => {
    const md = [
      '# Título **grande** ⚡',
      '',
      'Primera línea con [enlace](https://x.com)',
      'y `código` en línea.',
      '',
      '- **Uno:** item',
      '- [x] Tarea hecha',
      '1. Numerado',
      '',
      '> Cita _importante_',
      '',
      '```js',
      'const no = "se lee";',
      '```',
      '',
      '---',
      '| Col A | Col B |',
      '|---|:---:|',
      '| 1 | 2 |',
    ].join('\n');

    expect(markdownToSegments(md)).toEqual([
      'Título grande',
      'Primera línea con enlace y código en línea.',
      'Uno: item',
      'Tarea hecha',
      'Numerado',
      'Cita importante',
      'Col A, Col B',
      '1, 2',
    ]);
  });

  it('splits selected text by lines and drops empty ones', () => {
    expect(plainTextToSegments('Uno\n\n  \nDos  tres\n')).toEqual(['Uno', 'Dos tres']);
  });

  it('collects DOM blocks from the rich editor, flattening lists and tables and skipping code', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <h1>Hola ✨</h1>
      <p>Párrafo <strong>uno</strong></p>
      <ul><li>A</li><li><ul><li>A.1</li></ul></li><li>B</li></ul>
      <hr>
      <div><table><tr><th>X</th><th>Y</th></tr><tr><td>1</td><td>2</td></tr></table></div>
      <div><div class="cm-editor">const x = 1;</div></div>
      <p>   </p>
      <blockquote>Fin</blockquote>`;

    const segments = collectDomSegments(root);
    expect(segments.map((s) => s.text)).toEqual(['Hola', 'Párrafo uno', 'A', 'A.1', 'B', 'X, Y', '1, 2', 'Fin']);
    expect(segments[0].el?.tagName).toBe('H1');
    expect(segments[5].el?.tagName).toBe('TR');

    const strong = root.querySelector('strong')!.firstChild;
    expect(findSegmentIndex(segments, strong)).toBe(1);
    expect(findSegmentIndex(segments, null)).toBe(-1);
  });
});
