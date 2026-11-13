/**
 * Editing commands for the app's own right-click menu (the page has no native menu):
 * run on the window's focused field / page selection through its webContents.
 */
const EDIT_COMMANDS = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);

/**
 * @param {{ error: Function }} log scoped logger
 */
function createEditCommandService(log) {
  /** Runs `command` on `webContents`; false when it is not an editing command or it failed. */
  function run(webContents, command) {
    try {
      if (!EDIT_COMMANDS.has(command)) {
        log.warn('unknown edit command', undefined, { command });
        return false;
      }
      if (!webContents || typeof webContents[command] !== 'function') {
        log.error('webContents cannot run edit command', undefined, { command });
        return false;
      }
      webContents[command]();
      return true;
    } catch (err) {
      log.error('edit command failed', err, { command });
      return false;
    }
  }

  return { run };
}

module.exports = { createEditCommandService, EDIT_COMMANDS };
