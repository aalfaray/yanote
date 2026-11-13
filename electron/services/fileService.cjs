const fs = require('fs');
const path = require('path');
const { getLogger } = require('./logService.cjs');

const log = getLogger('fileService');

// Spanish messages for the most common Node.js file system error codes
const FS_ERROR_MESSAGES = {
  ENOENT: 'El archivo o la carpeta no existe',
  EACCES: 'Permiso denegado',
  EPERM: 'Operación no permitida (permiso denegado)',
  EEXIST: 'Ya existe un archivo con ese nombre',
  EISDIR: 'La ruta indicada es una carpeta, no un archivo',
  ENOTDIR: 'Parte de la ruta no es una carpeta',
  ENOTEMPTY: 'La carpeta no está vacía',
  ENOSPC: 'No queda espacio en el disco',
  EBUSY: 'El archivo está en uso por otro programa',
  EMFILE: 'Demasiados archivos abiertos',
  EROFS: 'El disco es de solo lectura',
  ENAMETOOLONG: 'El nombre o la ruta es demasiado largo',
  EINVAL: 'Nombre de archivo o ruta no válido',
};

/** Translates a Node.js fs error into a Spanish message for the UI. */
function describeFsError(err) {
  if (err && FS_ERROR_MESSAGES[err.code]) return FS_ERROR_MESSAGES[err.code];
  return (err && err.message) || 'Error desconocido';
}

const WELCOME_CONTENT = `# Bienvenido a tu Editor Markdown Neubrutalista ⚡

Este es un editor **portable y flotante** diseñado con la estética **Boldkit**.

### ✨ Características destacadas:
- **Superposición (Always on Top):** Haz clic en el botón de pin 📌 en la barra superior para mantener la ventana siempre visible encima de otras aplicaciones.
- **Pestañas tipo Orca:** Abre múltiples notas simultáneamente con el botón \`+\`. Cada pestaña es un archivo markdown independiente.
- **Editor Rico con @mdxeditor/editor:** Formato enriquecido, tablas, bloques de código, listas, enlaces y alternancia rápida a código fuente Markdown.
- **Lectura en voz alta:** Escucha la nota completa, la selección o el párrafo actual con el botón 🔊 de la barra de herramientas.
- **Resolución Compacta y Redimensionable:** Diseñado inicialmente en tamaño pequeño/compacto tipo bloc de notas flotante, con libertad total para agrandarlo o maximizarlo.

---
> *Tip: Presiona Ctrl + S para guardar tu nota.*
`;

function ensureNotesDir(notesDir) {
  if (!notesDir || typeof notesDir !== 'string') {
    throw new Error('Ruta de la carpeta de notas no válida');
  }

  // Only the folder: never drop files into it (it may be a project opened with "Abrir con yanote")
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }
}

function listNotes(notesDir) {
  try {
    if (!notesDir || !fs.existsSync(notesDir)) {
      return { success: false, error: 'La carpeta no existe', notes: [] };
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
        } catch (err) {
          log.warn('listNotes: skipped unreadable file', err, { notesDir, file });
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { success: true, notes };
  } catch (err) {
    return { success: false, error: describeFsError(err), notes: [] };
  }
}

function readFile(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Ruta de archivo no válida' };
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'El archivo no existe' };
    }
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return { success: false, error: 'La ruta indicada es una carpeta, no un archivo' };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: describeFsError(err) };
  }
}

function writeFile(filePath, content) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Ruta de archivo no válida' };
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
    return { success: false, error: describeFsError(err) };
  }
}

function deleteFile(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Ruta de archivo no válida' };
    }
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return { success: false, error: 'No se puede eliminar una carpeta' };
      }
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: describeFsError(err) };
  }
}

function renameFile(oldPath, newPath) {
  try {
    if (!oldPath || !newPath || typeof oldPath !== 'string' || typeof newPath !== 'string') {
      return { success: false, error: 'Ruta de origen o destino no válida' };
    }
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: 'El archivo de origen no existe' };
    }
    // Check if newPath already exists and is different
    if (path.resolve(oldPath) !== path.resolve(newPath) && fs.existsSync(newPath)) {
      return { success: false, error: 'Ya existe un archivo con ese nombre' };
    }
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: describeFsError(err) };
  }
}

function resolveNotePath(notesDir, filename) {
  if (!notesDir || typeof notesDir !== 'string') return null;
  if (!filename || typeof filename !== 'string') return path.resolve(notesDir);
  const safeName = path.basename(filename);
  return path.resolve(notesDir, safeName);
}

function getRelativeNotePath(notesDir, fullPath) {
  if (!notesDir || !fullPath || typeof notesDir !== 'string' || typeof fullPath !== 'string') {
    return typeof fullPath === 'string' ? path.basename(fullPath) : '';
  }
  const rel = path.relative(notesDir, fullPath);
  return rel && !rel.startsWith('..') ? rel : path.basename(fullPath);
}

module.exports = {
  describeFsError,
  ensureNotesDir,
  listNotes,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  resolveNotePath,
  getRelativeNotePath,
  WELCOME_CONTENT,
};
