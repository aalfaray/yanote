import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { patchTableEditorSource } from '../../vite-plugins/mdxeditorLazyTableCells';

const tableEditorPath = path.resolve(
  __dirname,
  '../../node_modules/@mdxeditor/editor/dist/plugins/table/TableEditor.js'
);

describe('Vite plugin: lazy MDXEditor table cells', () => {
  it('patches the installed MDXEditor TableEditor (fails if MDXEditor changed this code)', () => {
    const source = fs.readFileSync(tableEditorPath, 'utf8');
    const out = patchTableEditorSource(source, tableEditorPath);
    expect(out).not.toBeNull();
    expect(out).toContain('"data-static-cell": true');
    expect(out).toContain('__bnSetMounted(true)');
  });

  it('leaves every other module untouched', () => {
    expect(patchTableEditorSource('const x = 1;', '/node_modules/react/index.js')).toBeNull();
  });

  it('throws loudly when the expected code is missing', () => {
    expect(() => patchTableEditorSource('// changed upstream', tableEditorPath)).toThrow(/TableEditor\.js changed/);
  });
});
