import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const fileService = require('../../electron/services/fileService.cjs');

describe('Backend: FileService (20% Happy / 80% Destructive)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-test-files-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/4] ensureNotesDir creates the folder but never writes files into it', () => {
    const notesDir = path.join(tempDir, 'notes');
    fileService.ensureNotesDir(notesDir);
    expect(fs.existsSync(notesDir)).toBe(true);
    expect(fs.readdirSync(notesDir)).toEqual([]);

    // e.g. a project folder opened with "Abrir con yanote"
    fileService.ensureNotesDir(tempDir);
    expect(fs.existsSync(path.join(tempDir, 'Bienvenido.md'))).toBe(false);
  });

  it('[HAPPY 2/4] writes and reads markdown files successfully', () => {
    const testFile = path.join(tempDir, 'test-note.md');
    const mdContent = '# Mi Nota\n\nTexto con **negrita** y [enlace](https://example.com)';

    const writeRes = fileService.writeFile(testFile, mdContent);
    expect(writeRes.success).toBe(true);

    const readRes = fileService.readFile(testFile);
    expect(readRes.success).toBe(true);
    expect(readRes.content).toBe(mdContent);
  });

  it('[HAPPY 3/4] lists markdown notes sorted by last modified date', () => {
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

  it('[HAPPY 4/4] resolveNotePath safely resolves note paths within base directory', () => {
    const notesDir = path.join(tempDir, 'notes');
    const resolved = fileService.resolveNotePath(notesDir, 'scratch-1.md');
    expect(resolved).toBe(path.join(notesDir, 'scratch-1.md'));

    const rel = fileService.getRelativeNotePath(notesDir, resolved);
    expect(rel).toBe('scratch-1.md');
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
    expect(res.error).toContain('carpeta');
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
    expect(res.error).toContain('No se puede eliminar una carpeta');
  });

  it('[CHAOS 6/12] renaming a non-existent source file returns error gracefully', () => {
    const src = path.join(tempDir, 'src-missing.md');
    const dest = path.join(tempDir, 'dest.md');
    const res = fileService.renameFile(src, dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain('no existe');
  });

  it('[CHAOS 7/12] renaming to an already existing file name is prevented to avoid data loss', () => {
    const fileA = path.join(tempDir, 'fileA.md');
    const fileB = path.join(tempDir, 'fileB.md');
    fileService.writeFile(fileA, 'Content A');
    fileService.writeFile(fileB, 'Content B');

    const res = fileService.renameFile(fileA, fileB);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Ya existe');
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

  it('[CHAOS 12/16] handles invalid input types (numbers, objects, nulls) across all file methods', () => {
    expect(fileService.readFile(null as any).success).toBe(false);
    expect(fileService.readFile(12345 as any).success).toBe(false);
    expect(fileService.writeFile(null as any, 'text').success).toBe(false);
    expect(fileService.deleteFile({} as any).success).toBe(false);
    expect(fileService.renameFile(null as any, 'target').success).toBe(false);
  });

  it('[CHAOS 13/16] resolveNotePath strips directory traversal attacks (../../etc/passwd) safely', () => {
    const notesDir = path.join(tempDir, 'notes');
    const traversal = '../../../../windows/system32/cmd.exe';
    const safeResolved = fileService.resolveNotePath(notesDir, traversal);
    // path.basename strips all directory traversal segments
    expect(safeResolved).toBe(path.join(notesDir, 'cmd.exe'));
    expect(safeResolved).not.toContain('system32');
  });

  it('[CHAOS 14/16] resolveNotePath handles null, undefined, non-string and empty filename safely', () => {
    const notesDir = path.join(tempDir, 'notes');
    expect(fileService.resolveNotePath(null, 'file.md')).toBeNull();
    expect(fileService.resolveNotePath(undefined as any, 'file.md')).toBeNull();
    expect(fileService.resolveNotePath(notesDir, '')).toBe(path.resolve(notesDir));
    expect(fileService.resolveNotePath(notesDir, null as any)).toBe(path.resolve(notesDir));
  });

  it('[CHAOS 15/16] getRelativeNotePath handles external absolute path or nested path safely without crashing', () => {
    const notesDir = path.join(tempDir, 'notes');
    const externalFile = 'C:\\Some\\Other\\Dir\\outside.md';
    const rel = fileService.getRelativeNotePath(notesDir, externalFile);
    // Should safely fall back to the basename
    expect(rel).toBe('outside.md');
  });

  it('[CHAOS 16/16] getRelativeNotePath handles malicious input types (symbols, numbers, objects) safely', () => {
    expect(fileService.getRelativeNotePath(null as any, null as any)).toBe('');
    expect(fileService.getRelativeNotePath(1234 as any, {} as any)).toBe('');
    expect(fileService.getRelativeNotePath('notes', 9999 as any)).toBe('');
  });

  it('[CHAOS i18n] translates common Node.js file system errors to Spanish', () => {
    expect(fileService.describeFsError({ code: 'EACCES', message: 'EACCES: permission denied' })).toBe('Permiso denegado');
    expect(fileService.describeFsError({ code: 'ENOSPC', message: 'no space' })).toBe('No queda espacio en el disco');
    expect(fileService.describeFsError({ code: 'EWEIRD', message: 'raw message' })).toBe('raw message');
    expect(fileService.describeFsError(null)).toBe('Error desconocido');
  });
});
