const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { getLogger, isNotFound } = require('./logService.cjs');

const log = getLogger('terminalService');

/** Reads a PATH value from the Windows registry (REG_SZ or REG_EXPAND_SZ). */
function readRegistryPath(key) {
  try {
    const out = execFileSync('reg.exe', ['query', key, '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const match = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(out);
    return match ? match[1].trim() : '';
  } catch (err) {
    log.warn('cannot read PATH from registry', err, { key });
    return '';
  }
}

const expandWinVars = (value, env) =>
  value.replace(/%([^%]+)%/g, (whole, name) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? env[key] : whole;
  });

/**
 * Windows only: rebuilds PATH from the registry (machine + user) so tools installed
 * after the app started (e.g. `claude`) are found in new terminals. Entries that only
 * exist in the current process PATH are kept at the end.
 */
function withFreshPath(env, platform = process.platform, readPath = readRegistryPath) {
  if (platform !== 'win32') return env;
  const machine = readPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
  const user = readPath('HKCU\\Environment');
  if (!machine && !user) return env;

  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path';
  const seen = new Set();
  const entries = [];
  for (const raw of [machine, user, env[pathKey] || ''].join(';').split(';')) {
    const entry = expandWinVars(raw.trim(), env);
    const id = entry.toLowerCase().replace(/[\\/]+$/, '');
    if (entry && !seen.has(id)) {
      seen.add(id);
      entries.push(entry);
    }
  }
  return { ...env, [pathKey]: entries.join(';') };
}

/** First candidate that is an existing directory; the user's home folder otherwise. */
function resolveCwd(candidates, isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch (err) {
    if (!isNotFound(err)) log.warn('cannot stat terminal cwd candidate', err, { path: p });
    return false;
  }
}) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && isDir(c)) return c;
  }
  return os.homedir();
}

const SHELLS = {
  powershell: { file: 'powershell.exe', args: ['-NoLogo'] },
  cmd: { file: 'cmd.exe', args: [] },
};

function resolveShell(kind, platform = process.platform, env = process.env) {
  if (platform !== 'win32') {
    return { file: env.SHELL || '/bin/bash', args: [] };
  }
  return SHELLS[kind] || SHELLS.powershell;
}

/**
 * Manages pseudo-terminal sessions keyed by tab id.
 * `ptyModule` is injectable for tests (defaults to @lydell/node-pty).
 */
function createTerminalService({ ptyModule, platform = process.platform, env = process.env, readPath = readRegistryPath } = {}) {
  const sessions = new Map();
  const getPty = () => ptyModule || require('@lydell/node-pty');

  function create({ id, shell, cols = 80, rows = 24, cwd, fallbackCwd, initialCommand } = {}, emit) {
    if (!id) return { success: false, error: 'Falta el identificador de la terminal' };
    if (sessions.has(id)) return { success: true, reused: true };
    try {
      const { file, args } = resolveShell(shell, platform, env);
      const proc = getPty().spawn(file, args, {
        name: 'xterm-256color',
        cols: Math.max(2, cols | 0),
        rows: Math.max(2, rows | 0),
        cwd: resolveCwd([cwd, fallbackCwd]),
        env: withFreshPath(env, platform, readPath),
      });
      sessions.set(id, proc);
      // Ignore events from a killed/replaced session that reuses the same id
      const isCurrent = () => sessions.get(id) === proc;
      proc.onData((data) => {
        if (isCurrent()) emit({ id, type: 'data', data });
      });
      proc.onExit(({ exitCode }) => {
        if (!isCurrent()) return;
        sessions.delete(id);
        emit({ id, type: 'exit', exitCode });
      });
      // e.g. `claude auth login` for the chat's sign-in button; typed as if the user ran it
      if (typeof initialCommand === 'string' && initialCommand.trim()) {
        proc.write(`${initialCommand.replace(/[\r\n]+/g, ' ').trim()}\r`);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function write(id, data) {
    const proc = sessions.get(id);
    if (proc) proc.write(data);
  }

  function resize(id, cols, rows) {
    const proc = sessions.get(id);
    if (proc && cols > 1 && rows > 1) {
      try {
        proc.resize(cols | 0, rows | 0);
      } catch (err) {
        // pty may already be gone
        log.warn('terminal resize failed', err, { id, cols, rows });
      }
    }
  }

  function kill(id) {
    const proc = sessions.get(id);
    if (!proc) return false;
    sessions.delete(id);
    try {
      proc.kill();
    } catch (err) {
      // already exited
      log.warn('terminal kill failed', err, { id });
    }
    return true;
  }

  function killAll() {
    for (const id of [...sessions.keys()]) kill(id);
  }

  return { create, write, resize, kill, killAll, has: (id) => sessions.has(id) };
}

module.exports = { createTerminalService, resolveShell, withFreshPath, resolveCwd };
