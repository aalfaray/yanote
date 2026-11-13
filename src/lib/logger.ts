/**
 * Renderer side of the system log: every failure is printed to the devtools console and sent to
 * the main process, which appends it to yanote.log next to its own entries (scope "renderer:…").
 *
 * Usage, in any function:
 *   try { ... } catch (err) { logError('ideas.addIdea', err, { textLength: text.length }); return fallback; }
 *
 * Logging never throws.
 */
export type LogLevel = 'error' | 'warn' | 'info';
export type LogContext = Record<string, unknown>;

export interface LogEntry {
  level: LogLevel;
  /** where it happened: "<module>.<function>" (e.g. "contextMenu.buildMenu") */
  scope: string;
  message: string;
  stack?: string;
  context?: LogContext;
}

/** Message + stack of anything thrown (Error, string, object…). */
export function describeError(error: unknown): { message: string; stack?: string } {
  try {
    if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
    if (error === undefined || error === null) return { message: '' };
    if (typeof error === 'string') return { message: error };
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Context made safe for IPC (structured clone fails on functions, DOM nodes…). */
function cloneable(context: LogContext | undefined): LogContext | undefined {
  try {
    return context ? (JSON.parse(JSON.stringify(context)) as LogContext) : undefined;
  } catch {
    return { note: 'context not serializable' };
  }
}

export function log(level: LogLevel, scope: string, message: string, error?: unknown, context?: LogContext): void {
  try {
    const err = describeError(error);
    const entry: LogEntry = {
      level,
      scope,
      message: [message, err.message].filter(Boolean).join(': '),
      stack: err.stack,
      context: cloneable(context),
    };
    const print = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    print(`[${scope}] ${entry.message}`, ...(context ? [context] : []), ...(error instanceof Error ? [error] : []));
    void window.electronAPI?.log?.(entry)?.catch?.((sendErr: unknown) => console.error('[logger] could not reach the system log', sendErr));
  } catch (logErr) {
    console.error('[logger] failed to log', scope, message, logErr);
  }
}

export const logError = (scope: string, error: unknown, context?: LogContext, message = 'failed') => log('error', scope, message, error, context);
export const logWarn = (scope: string, message: string, context?: LogContext) => log('warn', scope, message, undefined, context);
export const logInfo = (scope: string, message: string, context?: LogContext) => log('info', scope, message, undefined, context);

let installed = false;

/** Uncaught errors and unhandled promise rejections anywhere in the page also go to the log. */
export function installGlobalErrorLogging(): void {
  try {
    if (installed) return;
    installed = true;
    window.addEventListener('error', (e) =>
      logError('window.onerror', e.error ?? e.message, { source: e.filename, line: e.lineno, column: e.colno }, 'uncaught error')
    );
    window.addEventListener('unhandledrejection', (e) => logError('window.unhandledrejection', e.reason, undefined, 'unhandled promise rejection'));
  } catch (err) {
    console.error('[logger] could not install global handlers', err);
  }
}
