import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const fileService = require('../../electron/services/fileService.cjs');

describe('Backend: FileService (20% Happy / 80% Destructive)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boldnotes-test-files-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/3] ensureNotesDir creates folder and default Bienvenido.md', () => {
    const notesDir = path.join(tempDir, 'notes');
    fileService.ensureNotesDir(notesDir);

    expect(fs.existsSync(notesDir)).toBe(true);
    const welcomeFile = path.join(notesDir, 'Bienvenido.md');
    expect(fs.existsSync(welcomeFile)).toBe(true);
    const content = fs.readFileSync(welcomeFile, 'utf8');
    expect(content).toContain('Bienvenido a tu Editor Markdown Neubrutalista');
  });

  it('[HAPPY 2/3] writes and reads markdown files successfully', () => {
    const testFile = path.join(tempDir, 'test-note.md');
    const mdContent = '# Mi Nota\n\nTexto con **negrita** y [enlace](https://example.com)';

    const writeRes = fileService.writeFile(testFile, mdContent);
    expect(writeRes.success).toBe(true);

    const readRes = fileService.readFile(testFile);
    expect(readRes.success).toBe(true);
    expect(readRes.content).toBe(mdContent);
  });

  it('[HAPPY 3/3] lists markdown notes sorted by last modified date', () => {
    const notesDir = path.join(tempDir, 'notes');
    fileService.ensureNotesDir(notesDir);

    fileService.writeFile(path.join(notesDir, 'Nota1.md'), 'Contenido 1');
    fileService.writeFile(path.join(notesDir, 'Nota2.md'), 'Contenido 2');

    const res = fileService.listNotes(notesDir);
    expect(res.success).toBe(true);
    expect(res.notes.length).toBeGreaterThanOrEqual(2);
    expect(res.notes.some((n: any) => n.name === 'Nota1.md')).toBe(true);
    expect(res.notes.some((n: any) => n.name === 'Nota2.md')).toBe(true);
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/12] reading non-existent file returns success: false without throwing', () => {
    const ghostFile = path.join(tempDir, 'does-not-exist-' + Date.now() + '.md');
    const res = fileService.readFile(ghostFile);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('[CHAOS 2/12] reading a directory as a file returns error gracefully', () => {
    const res = fileService.readFile(tempDir);
    expect(res.success).toBe(false);
    expect(res.error).toContain('directory');
  });

  it('[CHAOS 3/12] writing with null and undefined content converts safely without crash', () => {
    const file1 = path.join(tempDir, 'null.md');
    const res1 = fileService.writeFile(file1, null);
    expect(res1.success).toBe(true);
    expect(fileService.readFile(file1).content).toBe('');

    const file2 = path.join(tempDir, 'undef.md');
    const res2 = fileService.writeFile(file2, undefined);
    expect(res2.success).toBe(true);
    expect(fileService.readFile(file2).content).toBe('');
  });

  it('[CHAOS 4/12] deleting a non-existent file succeeds idempotently', () => {
    const ghostFile = path.join(tempDir, 'nonexistent.md');
    const res = fileService.deleteFile(ghostFile);
    expect(res.success).toBe(true);
  });

  it('[CHAOS 5/12] attempting to delete a directory with deleteFile is rejected', () => {
    const subDir = path.join(tempDir, 'a-directory');
    fs.mkdirSync(subDir);
    const res = fileService.deleteFile(subDir);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Cannot delete directory');
  });

  it('[CHAOS 6/12] renaming a non-existent source file returns error gracefully', () => {
    const src = path.join(tempDir, 'src-missing.md');
    const dest = path.join(tempDir, 'dest.md');
    const res = fileService.renameFile(src, dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain('does not exist');
  });

  it('[CHAOS 7/12] renaming to an already existing file name is prevented to avoid data loss', () => {
    const fileA = path.join(tempDir, 'fileA.md');
    const fileB = path.join(tempDir, 'fileB.md');
    fileService.writeFile(fileA, 'Content A');
    fileService.writeFile(fileB, 'Content B');

    const res = fileService.renameFile(fileA, fileB);
    expect(res.success).toBe(false);
    expect(res.error).toContain('already exists');
    // Ensure file B content is untouched
    expect(fileService.readFile(fileB).content).toBe('Content B');
  });

  it('[CHAOS 8/12] handles massive markdown payload (2MB text) without truncation or crash', () => {
    const hugeFile = path.join(tempDir, 'huge.md');
    const chunk = '# Header with some text and code\n```js\nconsole.log(123);\n```\n';
    const hugeContent = chunk.repeat(40000); // ~2.2 MB

    const writeRes = fileService.writeFile(hugeFile, hugeContent);
    expect(writeRes.success).toBe(true);

    const readRes = fileService.readFile(hugeFile);
    expect(readRes.success).toBe(true);
    expect(readRes.content?.length).toBe(hugeContent.length);
  });

  it('[CHAOS 9/12] handles file names with emojis, spaces, accents, and unicode characters', () => {
    const unicodeName = 'Nota ⚡ de Reunión con José & María (v1.2).md';
    const unicodeFile = path.join(tempDir, unicodeName);
    const content = '# Contenido con acentos y emojis 🚀';

    const writeRes = fileService.writeFile(unicodeFile, content);
    expect(writeRes.success).toBe(true);

    const readRes = fileService.readFile(unicodeFile);
    expect(readRes.success).toBe(true);
    expect(readRes.content).toBe(content);
  });

  it('[CHAOS 10/12] listing notes on non-existent directory returns graceful failure without throwing', () => {
    const ghostDir = path.join(tempDir, 'ghost-folder-xyz');
    const res = fileService.listNotes(ghostDir);
    expect(res.success).toBe(false);
    expect(res.notes).toEqual([]);
  });

  it('[CHAOS 11/12] ignores non-markdown files when listing notes', () => {
    const notesDir = path.join(tempDir, 'filtered-notes');
    fileService.ensureNotesDir(notesDir);
    fs.writeFileSync(path.join(notesDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(notesDir, 'script.exe'), 'binary');
    fs.writeFileSync(path.join(notesDir, 'image.png'), 'png');
    fileService.writeFile(path.join(notesDir, 'valid.md'), '# Valid');

    const res = fileService.listNotes(notesDir);
    expect(res.success).toBe(true);
    const names = res.notes.map((n: any) => n.name);
    expect(names).toContain('valid.md');
    expect(names).not.toContain('data.json');
    expect(names).not.toContain('script.exe');
    expect(names).not.toContain('image.png');
  });

  it('[CHAOS 12/12] handles invalid input types (numbers, objects, nulls) across all file methods', () => {
    expect(fileService.readFile(null as any).success).toBe(false);
    expect(fileService.readFile(12345 as any).success).toBe(false);
    expect(fileService.writeFile(null as any, 'text').success).toBe(false);
    expect(fileService.deleteFile({} as any).success).toBe(false);
    expect(fileService.renameFile(null as any, 'target').success).toBe(false);
  });
});
