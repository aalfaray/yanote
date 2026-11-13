/**
 * ipcMain with logging: every handler runs inside try/catch, and a failure goes to the system log
 * with its channel and arguments before reaching the renderer (invoke) or being dropped (send).
 */

/** Arguments as log context: short strings, no huge payloads (file contents, images…). */
function summarizeArgs(args) {
  try {
    return args.map((a) => {
      if (typeof a === 'string') return a.length > 200 ? `${a.slice(0, 200)}… (${a.length} chars)` : a;
      if (a === null || typeof a !== 'object') return a;
      const json = JSON.stringify(a);
      return json.length > 300 ? `${json.slice(0, 300)}…` : a;
    });
  } catch (err) {
    return [`<unserializable: ${err && err.message}>`];
  }
}

/**
 * @param {{ handle: Function, on: Function }} ipcMain
 * @param {{ error: Function }} log scoped logger
 */
function createSafeIpc(ipcMain, log) {
  /** ipcMain.handle: logs and rethrows, so the renderer's promise still rejects as before. */
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await fn(event, ...args);
      } catch (err) {
        log.error(`IPC handler "${channel}" failed`, err, { channel, args: summarizeArgs(args) });
        throw err;
      }
    });
  }

  /** ipcMain.on: fire-and-forget, so a failure is logged and swallowed. */
  function on(channel, fn) {
    ipcMain.on(channel, (event, ...args) => {
      try {
        const result = fn(event, ...args);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => log.error(`IPC listener "${channel}" failed`, err, { channel, args: summarizeArgs(args) }));
        }
      } catch (err) {
        log.error(`IPC listener "${channel}" failed`, err, { channel, args: summarizeArgs(args) });
      }
    });
  }

  return { handle, on };
}

module.exports = { createSafeIpc, summarizeArgs };
