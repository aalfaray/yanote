/**
 * System log: one text file (`yanote.log` in the app's logs folder) every layer writes its
 * failures to, so a bug report can say what failed, where (scope) and why (message + stack).
 *
 * Line format:
 *   2026-11-13T06:30:00.000Z [ERROR] [main:fs:readFile] No such file  {"filePath":"C:\\a.md"}
 *       Error: ENOENT ...stack...
 *
 * The file is rotated to `yanote.old.log` when it grows past `maxBytes`.
 * Logging never throws: if the disk write fails it falls back to the console.
 */
const fs = require('fs');
const path = require('path');

const LEVELS = new Set(['error', 'warn', 'info']);
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 4000;

/** Message + stack of anything thrown (Error, string, object…). */
function describeError(error) {
  try {
    if (error instanceof Error) return { message: error.message || error.name, stack: error.stack || '' };
    if (error === undefined || error === null) return { message: '', stack: '' };
    if (typeof error === 'string') return { message: error, stack: '' };
    return { message: JSON.stringify(error), stack: '' };
  } catch (err) {
    return { message: `${String(error)} (not serializable: ${err && err.message})`, stack: '' };
  }
}

/** One log entry as text (multi-line when there is a stack). */
function formatEntry({ time, level, scope, message, stack, context }) {
  try {
    const lvl = String(level || 'error').toUpperCase();
    const ctx = context && Object.keys(context).length ? `  ${JSON.stringify(context)}` : '';
    const body = String(message || '').slice(0, MAX_TEXT);
    const trace = stack ? `\n    ${String(stack).slice(0, MAX_TEXT).split('\n').join('\n    ')}` : '';
    return `${time} [${lvl}] [${scope || 'app'}] ${body}${ctx}${trace}\n`;
  } catch (err) {
    return `${time} [ERROR] [log] could not format entry: ${err && err.message}\n`;
  }
}

/**
 * @param {{ dir: string, fileName?: string, maxBytes?: number, now?: () => Date, mirrorToConsole?: boolean }} options
 */
function createLogService({ dir, fileName = 'yanote.log', maxBytes = DEFAULT_MAX_BYTES, now = () => new Date(), mirrorToConsole = true }) {
  const filePath = path.join(dir, fileName);
  const oldPath = path.join(dir, fileName.replace(/\.log$/, '') + '.old.log');

  function rotateIfNeeded() {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > maxBytes) fs.renameSync(filePath, oldPath);
    } catch (err) {
      console.error('[log] rotate failed:', err && err.message);
    }
  }

  /** Formats and appends one entry (already split into message / stack). */
  function append(level, scope, message, stack, context) {
    try {
      const lvl = LEVELS.has(level) ? level : 'error';
      const line = formatEntry({ time: now().toISOString(), level: lvl, scope, message, stack, context });
      if (mirrorToConsole) (lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log)(line.trimEnd());
      fs.mkdirSync(dir, { recursive: true });
      rotateIfNeeded();
      fs.appendFileSync(filePath, line, 'utf8');
    } catch (err) {
      console.error('[log] write failed:', err && err.message, '| original:', scope, message);
    }
  }

  /**
   * Writes one entry. `error` (optional) adds its message/stack; `context` is any JSON-able detail
   * (ids, paths, arguments) that helps reproduce the failure.
   */
  function write(level, scope, message, error, context) {
    try {
      const err = describeError(error);
      append(level, scope, [message, err.message].filter(Boolean).join(': '), err.stack, context);
    } catch (err) {
      console.error('[log] write failed:', err && err.message, '| original:', scope, message);
    }
  }

  /** Logger bound to one scope (e.g. "main:ipc", "terminalService"). */
  function scoped(scope) {
    return {
      error: (message, error, context) => write('error', scope, message, error, context),
      warn: (message, error, context) => write('warn', scope, message, error, context),
      info: (message, context) => write('info', scope, message, undefined, context),
    };
  }

  /** Entry sent by the renderer through IPC (untrusted shape: only known fields, capped sizes). */
  function writeFromRenderer(entry) {
    try {
      if (!entry || typeof entry !== 'object') return false;
      const level = LEVELS.has(entry.level) ? entry.level : 'error';
      const scope = `renderer:${String(entry.scope || 'app').slice(0, 120)}`;
      const context = entry.context && typeof entry.context === 'object' ? entry.context : undefined;
      append(level, scope, String(entry.message || '').slice(0, MAX_TEXT), entry.stack ? String(entry.stack) : '', context);
      return true;
    } catch (err) {
      write('error', 'log', 'renderer entry rejected', err);
      return false;
    }
  }

  return { filePath, write, scoped, writeFromRenderer };
}

/** "Not there" errors (missing file/folder): an answer for probing functions, not a failure. */
function isNotFound(err) {
  return Boolean(err && (err.code === 'ENOENT' || err.code === 'ENOTDIR'));
}

// --- Shared log: configured once by main.cjs, used by every service through getLogger(scope) ---
let shared = null;

/** Creates the app-wide log (main.cjs, at startup). */
function configureSharedLog(options) {
  shared = createLogService(options);
  return shared;
}

/**
 * Logger for one module. Before configureSharedLog (unit tests, scripts) entries go to the
 * console only, and are silent under vitest so expected failures don't flood test output.
 */
function getLogger(scope) {
  const emit = (level, message, error, context) => {
    try {
      if (shared) return shared.write(level, scope, message, error, context);
      if (process.env.VITEST) return;
      const err = describeError(error);
      (level === 'error' ? console.error : console.warn)(`[${scope}] ${[message, err.message].filter(Boolean).join(': ')}`, context || '');
    } catch (err) {
      console.error('[log] getLogger emit failed:', err && err.message);
    }
  };
  return {
    error: (message, error, context) => emit('error', message, error, context),
    warn: (message, error, context) => emit('warn', message, error, context),
    info: (message, context) => emit('info', message, undefined, context),
  };
}

module.exports = { createLogService, describeError, formatEntry, isNotFound, configureSharedLog, getLogger };
