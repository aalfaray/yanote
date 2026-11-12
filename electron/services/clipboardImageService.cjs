const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Folder where pasted clipboard images are written for the integrated terminal. */
function defaultPasteDir() {
  return path.join(os.tmpdir(), 'yanote-paste');
}

/** Deletes pasted images older than a day so the temp folder doesn't grow forever. */
function cleanupOld(dir, now = Date.now()) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > MAX_AGE_MS) fs.unlinkSync(file);
    } catch {
      // in use or already gone
    }
  }
}

/**
 * Writes a PNG buffer to the paste folder and returns its path, or null when there is no image.
 * Terminal CLIs such as Claude Code attach an image when its file path is pasted.
 */
function savePastedImage(pngBuffer, dir = defaultPasteDir(), now = Date.now()) {
  if (!pngBuffer || pngBuffer.length === 0) return null;
  fs.mkdirSync(dir, { recursive: true });
  cleanupOld(dir, now);
  const file = path.join(dir, `imagen-${now}.png`);
  fs.writeFileSync(file, pngBuffer);
  return file;
}

module.exports = { savePastedImage, cleanupOld, defaultPasteDir };
