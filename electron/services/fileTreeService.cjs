const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { getLogger } = require('./logService.cjs');

const log = getLogger('fileTreeService');

/**
 * File explorer backend (same idea as Orca's): one folder level at a time, directories first in
 * natural (numeric-aware) order, a recursive watcher that reports which folders changed, and the
 * git status used to color the rows.
 */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** Never listed: git's internals are noise and change on every command */
const HIDDEN_NAMES = new Set(['.git']);

function compareEntries(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** One level of a folder: [{ name, path, isDir }] sorted directories first, then files. */
function listDir(dir, { fsImpl = fs } = {}) {
  if (typeof dir !== 'string' || !dir) return { success: false, error: 'Ruta no válida', entries: [] };
  try {
    const entries = [];
    for (const dirent of fsImpl.readdirSync(dir, { withFileTypes: true })) {
      if (HIDDEN_NAMES.has(dirent.name)) continue;
      const full = path.join(dir, dirent.name);
      let isDir = dirent.isDirectory();
      // Symlinks / junctions: follow them to know whether they open like a folder
      if (!isDir && dirent.isSymbolicLink()) {
        try {
          isDir = fsImpl.statSync(full).isDirectory();
        } catch {
          // broken link: shown as a file
        }
      }
      entries.push({ name: dirent.name, path: full, isDir });
    }
    entries.sort(compareEntries);
    return { success: true, entries };
  } catch (err) {
    log.warn('listing folder failed', err, { dir });
    return { success: false, error: (err && err.code) || (err && err.message) || 'Error', entries: [] };
  }
}

/** `git status --porcelain=v1 -z` output -> { absolutePath: 'M' | 'A' | 'D' | 'R' | '?' | 'U' } */
function parseGitStatus(output, topLevel) {
  const status = {};
  const parts = String(output || '').split('\0');
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const rel = entry.slice(3);
    // Renames/copies carry the original path in the next field
    if (x === 'R' || x === 'C') i++;
    let code;
    if (x === '?' && y === '?') code = '?';
    else if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) code = 'U';
    else if (x === 'D' || y === 'D') code = 'D';
    else if (x === 'A') code = 'A';
    else if (x === 'R' || x === 'C') code = 'R';
    else code = 'M';
    const abs = path.join(topLevel, rel.replace(/\/$/, ''));
    status[abs] = code;
  }
  return status;
}

function run(file, args, { cwd, timeout = 8000, execImpl = execFile } = {}) {
  return new Promise((resolve) => {
    execImpl(file, args, { cwd, timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });
}

/** Git status of the repository containing `dir`; `{ repo: false }` outside a repository. */
async function gitStatus(dir, { execImpl } = {}) {
  if (typeof dir !== 'string' || !dir) return { success: false, repo: false, status: {} };
  const top = await run('git', ['rev-parse', '--show-toplevel'], { cwd: dir, execImpl });
  if (!top || !top.trim()) return { success: true, repo: false, status: {} };
  const topLevel = path.normalize(top.trim());
  const out = await run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: topLevel, execImpl });
  if (out === null) return { success: false, repo: true, root: topLevel, status: {} };
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: topLevel, execImpl });
  return { success: true, repo: true, root: topLevel, branch: branch ? branch.trim() : null, status: parseGitStatus(out, topLevel) };
}

/**
 * One recursive watcher per window: watching a new root replaces the previous one. Changes are
 * batched (150 ms) and reported as the set of folders whose listing may have changed.
 */
function createFileTreeWatcher({ watchImpl = fs.watch, delay = 150 } = {}) {
  const watchers = new Map();

  function unwatch(key) {
    const current = watchers.get(key);
    if (!current) return false;
    watchers.delete(key);
    clearTimeout(current.timer);
    try {
      current.watcher.close();
    } catch (err) {
      log.warn('closing watcher failed', err, { root: current.root });
    }
    return true;
  }

  function watch(key, root, emit) {
    if (typeof root !== 'string' || !root) return { success: false, error: 'Ruta no válida' };
    const existing = watchers.get(key);
    if (existing && existing.root === root) return { success: true, reused: true };
    unwatch(key);
    const entry = { root, watcher: null, timer: null, dirs: new Set(), git: false };
    const flush = () => {
      entry.timer = null;
      const dirs = [...entry.dirs];
      const git = entry.git;
      entry.dirs.clear();
      entry.git = false;
      if (watchers.get(key) === entry) emit({ root, dirs, git });
    };
    try {
      entry.watcher = watchImpl(root, { recursive: true }, (_event, filename) => {
        if (watchers.get(key) !== entry) return;
        const rel = filename ? String(filename) : '';
        const segments = rel.split(/[\\/]/);
        if (segments[0] === '.git') {
          // index / HEAD changes: only the git colors need a refresh
          entry.git = true;
        } else {
          entry.dirs.add(rel ? path.dirname(path.join(root, rel)) : root);
          entry.git = true;
        }
        if (!entry.timer) entry.timer = setTimeout(flush, delay);
      });
      entry.watcher.on?.('error', (err) => {
        log.warn('watcher error', err, { root });
        unwatch(key);
      });
    } catch (err) {
      log.warn('watching folder failed', err, { root });
      return { success: false, error: (err && err.message) || 'Error' };
    }
    watchers.set(key, entry);
    return { success: true };
  }

  return {
    watch,
    unwatch,
    unwatchAll: () => [...watchers.keys()].forEach(unwatch),
  };
}

/** Where the Claude Code yanote runs lives: the user's install (PATH) and the bundled fallback. */
async function claudeInstallInfo({ findUser, findBundled, execImpl } = {}) {
  const user = (findUser && findUser()) || null;
  const bundled = (findBundled && findBundled()) || null;
  const used = user || bundled;
  const out = used ? await run(used, ['--version'], { timeout: 8000, execImpl }) : null;
  const version = out ? out.trim().split(/\r?\n/)[0] : null;
  return { used, source: user ? 'user' : bundled ? 'bundled' : null, user, bundled, version };
}

module.exports = { listDir, compareEntries, parseGitStatus, gitStatus, createFileTreeWatcher, claudeInstallInfo };
