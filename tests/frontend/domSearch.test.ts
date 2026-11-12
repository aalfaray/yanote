import { describe, it, expect } from 'vitest';
import { findTextRanges, foldChar } from '../../src/lib/domSearch';

function mount(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('domSearch', () => {
  it('folds case and accents', () => {
    expect(['Ó', 'é', 'Ñ', 'a'].map(foldChar)).toEqual(['o', 'e', 'n', 'a']);
  });

  it('finds every match, ignoring case and accents', () => {
    const root = mount('<p>El código y el CODIGO del Código</p>');
    expect(findTextRanges(root, 'codigo').map((r) => r.toString())).toEqual(['código', 'CODIGO', 'Código']);
  });

  it('finds text across formatting (bold) and inside tables / code', () => {
    const root = mount(
      '<p>Agrega <strong>Cómo se</strong> hizo</p><table><tr><td><p>Kardex movimiento</p></td></tr></table><pre><code>const x = 1</code></pre>'
    );
    expect(findTextRanges(root, 'como se hizo').map((r) => r.toString())).toEqual(['Cómo se hizo']);
    expect(findTextRanges(root, 'kardex')).toHaveLength(1);
    expect(findTextRanges(root, 'const x')).toHaveLength(1);
  });

  it('treats the query literally (no regex) and ignores blank queries', () => {
    const root = mount('<p>api.delete(id) y (base, id)</p>');
    expect(findTextRanges(root, '(base')).toHaveLength(1);
    expect(findTextRanges(root, '.')).toHaveLength(1);
    expect(findTextRanges(root, '   ')).toEqual([]);
  });
});
