const fs = require('fs');
const path = require('path');

const WELCOME_CONTENT = `# Bienvenido a tu Editor Markdown Neubrutalista ⚡

Este es un editor **portable, flotante y sincronizado con GitHub** diseñado con la estética **Boldkit**.

### ✨ Características destacadas:
- **Superposición (Always on Top):** Haz clic en el botón de pin 📌 en la barra superior para mantener la ventana siempre visible encima de otras aplicaciones.
- **Pestañas tipo Orca:** Abre múltiples notas simultáneamente con el botón \`+\`. Cada pestaña es un archivo markdown independiente.
- **Editor Rico con @mdxeditor/editor:** Formato enriquecido, tablas, bloques de código, listas, enlaces y alternancia rápida a código fuente Markdown.
- **Control de Versiones & GitHub:** Tus notas se guardan localmente en un repositorio Git y se sincronizan con tu repositorio de GitHub con 1 solo clic.
- **Resolución Compacta y Redimensionable:** Diseñado inicialmente en tamaño pequeño/compacto tipo bloc de notas flotante, con libertad total para agrandarlo o maximizarlo.

---
> *Tip: Presiona Ctrl + S para guardar tu nota o usa la barra de herramientas para sincronizar con Git.*
`;

function ensureNotesDir(notesDir) {
  if (!notesDir || typeof notesDir !== 'string') {
    throw new Error('Invalid notes directory path');
  }

  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }

  try {
    const files = fs.readdirSync(notesDir);
    if (files.filter(f => f.endsWith('.md')).length === 0) {
      const welcomePath = path.join(notesDir, 'Bienvenido.md');
      fs.writeFileSync(welcomePath, WELCOME_CONTENT, 'utf8');
    }
  } catch (err) {
    console.warn('ensureNotesDir notice:', err.message);
  }
}

function listNotes(notesDir) {
  try {
    if (!notesDir || !fs.existsSync(notesDir)) {
      return { success: false, error: 'Directory does not exist', notes: [] };
    }
    const files = fs.readdirSync(notesDir);
    const notes = files
      .filter(file => file.endsWith('.md'))
      .map(file => {
        try {
          const fullPath = path.join(notesDir, file);
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            updatedAt: stats.mtime.toISOString(),
            size: stats.size,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { success: true, notes };
  } catch (err) {
    return { success: false, error: err.message, notes: [] };
  }
}

function readFile(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid file path' };
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return { success: false, error: 'Target path is a directory, not a file' };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function writeFile(filePath, content) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid file path' };
    }
    // Prevent null or undefined content crashes
    const safeContent = content === undefined || content === null ? '' : String(content);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, safeContent, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteFile(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid file path' };
    }
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Cannot delete directory with deleteFile' };
      }
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function renameFile(oldPath, newPath) {
  try {
    if (!oldPath || !newPath || typeof oldPath !== 'string' || typeof newPath !== 'string') {
      return { success: false, error: 'Invalid source or target path' };
    }
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: 'Source file does not exist' };
    }
    // Check if newPath already exists and is different
    if (path.resolve(oldPath) !== path.resolve(newPath) && fs.existsSync(newPath)) {
      return { success: false, error: 'Target file already exists' };
    }
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  ensureNotesDir,
  listNotes,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  WELCOME_CONTENT,
};
