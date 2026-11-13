const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Several Claude accounts side by side. Each extra account is a separate Claude Code config
 * folder (CLAUDE_CONFIG_DIR) holding its own sign-in; the "Principal" account is the normal
 * ~/.claude. yanote never reads the credentials: it only runs Claude Code's own
 * `auth status` / `auth login` with the right folder.
 */

const DEFAULT_ID = 'default';
const DEFAULT_NAME = 'Principal';
/** Copied from the main account into a new one so it behaves the same (settings, memory, skills…) */
const SHARED_ITEMS = ['settings.json', 'CLAUDE.md', 'keybindings.json', 'agents', 'commands', 'skills'];

function sanitizeAccounts(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set([DEFAULT_ID]);
  const out = [];
  for (const a of list) {
    if (!a || typeof a.id !== 'string' || !/^[\w-]{1,64}$/.test(a.id) || seen.has(a.id)) continue;
    if (typeof a.configDir !== 'string' || !a.configDir.trim()) continue;
    seen.add(a.id);
    out.push({ id: a.id, name: typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 40) : 'Cuenta', configDir: a.configDir });
  }
  return out;
}

/** PowerShell single-quoted literal */
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

function createClaudeAccountService({
  getConfig,
  saveConfig,
  accountsRoot,
  getExecutable,
  env = process.env,
  homedir = os.homedir(),
  run = (file, args, options) =>
    new Promise((resolve) => {
      execFile(file, args, { timeout: 20000, windowsHide: true, ...options }, (err, stdout) => resolve({ err, stdout: String(stdout || '') }));
    }),
} = {}) {
  const defaultConfigDir = () => env.CLAUDE_CONFIG_DIR || path.join(homedir, '.claude');

  function extras() {
    return sanitizeAccounts(getConfig().claudeAccounts);
  }

  function list() {
    const accounts = [{ id: DEFAULT_ID, name: DEFAULT_NAME, configDir: null, isDefault: true }, ...extras().map((a) => ({ ...a, isDefault: false }))];
    const active = getConfig().activeClaudeAccount;
    return { accounts, activeId: accounts.some((a) => a.id === active) ? active : DEFAULT_ID };
  }

  function find(id) {
    return list().accounts.find((a) => a.id === (id || DEFAULT_ID)) || null;
  }

  /** Folder Claude Code uses for this account (null = its normal default). */
  function configDirFor(id) {
    const acc = find(id);
    return acc ? acc.configDir : null;
  }

  /** Environment for running Claude Code as this account. */
  function envFor(id, baseEnv = env) {
    const dir = configDirFor(id);
    return dir ? { ...baseEnv, CLAUDE_CONFIG_DIR: dir } : { ...baseEnv };
  }

  async function status(id) {
    const acc = find(id);
    if (!acc) return { success: false, error: 'Cuenta no encontrada' };
    const exe = getExecutable();
    if (!exe) return { success: false, error: 'No encontré Claude Code' };
    const childEnv = envFor(acc.id);
    delete childEnv.CLAUDECODE;
    const { err, stdout } = await run(exe, ['auth', 'status', '--json'], { env: childEnv });
    try {
      const info = JSON.parse(stdout);
      return {
        success: true,
        loggedIn: Boolean(info.loggedIn),
        email: typeof info.email === 'string' ? info.email : null,
        plan: typeof info.subscriptionType === 'string' ? info.subscriptionType : null,
        method: typeof info.authMethod === 'string' ? info.authMethod : null,
      };
    } catch {
      return { success: false, error: err ? err.message : 'Respuesta inesperada de Claude Code' };
    }
  }

  function add(name) {
    const id = `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const configDir = path.join(accountsRoot, id);
    fs.mkdirSync(configDir, { recursive: true });
    const from = defaultConfigDir();
    for (const item of SHARED_ITEMS) {
      const src = path.join(from, item);
      try {
        if (fs.existsSync(src)) fs.cpSync(src, path.join(configDir, item), { recursive: true });
      } catch {
        // best effort: the account works without them
      }
    }
    const account = { id, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : `Cuenta ${extras().length + 2}`, configDir };
    saveConfig({ claudeAccounts: [...extras(), account] });
    return { ...account, isDefault: false };
  }

  function rename(id, name) {
    if (id === DEFAULT_ID || typeof name !== 'string' || !name.trim()) return false;
    const next = extras().map((a) => (a.id === id ? { ...a, name: name.trim().slice(0, 40) } : a));
    saveConfig({ claudeAccounts: next });
    return true;
  }

  /** Forgets the account and deletes its folder (its sign-in included). The main account can't be removed. */
  function remove(id) {
    const acc = extras().find((a) => a.id === id);
    if (!acc) return false;
    saveConfig({
      claudeAccounts: extras().filter((a) => a.id !== id),
      ...(getConfig().activeClaudeAccount === id ? { activeClaudeAccount: DEFAULT_ID } : {}),
    });
    // Only ever delete folders yanote created itself
    if (path.resolve(acc.configDir).startsWith(path.resolve(accountsRoot) + path.sep)) {
      try {
        fs.rmSync(acc.configDir, { recursive: true, force: true });
      } catch {
        // leave it; it's no longer referenced
      }
    }
    return true;
  }

  function setActive(id) {
    if (!find(id)) return false;
    saveConfig({ activeClaudeAccount: id });
    return true;
  }

  /** PowerShell line that runs Claude Code's official sign-in for this account. */
  function loginCommand(id) {
    const acc = find(id);
    if (!acc) return null;
    const exe = getExecutable();
    const call = exe ? `& ${psQuote(exe)}` : 'claude';
    return acc.configDir ? `$env:CLAUDE_CONFIG_DIR=${psQuote(acc.configDir)}; ${call} auth login` : `${call} auth login`;
  }

  /**
   * Copies a conversation to another account so it can be resumed there
   * (Claude Code keeps each account's transcripts in its own folder).
   */
  function copySession(sessionId, fromId, toId) {
    if (typeof sessionId !== 'string' || !/^[\w-]+$/.test(sessionId)) return { success: false, error: 'Sesión inválida' };
    const fromAcc = find(fromId);
    const toAcc = find(toId);
    if (!fromAcc || !toAcc) return { success: false, error: 'Cuenta no encontrada' };
    const fromDir = fromAcc.configDir || defaultConfigDir();
    const toDir = toAcc.configDir || defaultConfigDir();
    if (path.resolve(fromDir) === path.resolve(toDir)) return { success: true, copied: false };
    const projects = path.join(fromDir, 'projects');
    let folders = [];
    try {
      folders = fs.readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return { success: false, error: 'No encontré la conversación' };
    }
    for (const folder of folders) {
      const file = path.join(projects, folder, `${sessionId}.jsonl`);
      if (!fs.existsSync(file)) continue;
      const target = path.join(toDir, 'projects', folder);
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(file, path.join(target, `${sessionId}.jsonl`));
      // Subagent transcripts / large tool results live next to it
      const extra = path.join(projects, folder, sessionId);
      if (fs.existsSync(extra)) fs.cpSync(extra, path.join(target, sessionId), { recursive: true });
      return { success: true, copied: true };
    }
    return { success: false, error: 'No encontré la conversación' };
  }

  /** The conversation's transcript file in that account's Claude Code folder, or null. */
  function findTranscript(sessionId, accountId) {
    if (typeof sessionId !== 'string' || !/^[\w-]+$/.test(sessionId)) return null;
    const acc = find(accountId);
    const projects = path.join((acc && acc.configDir) || defaultConfigDir(), 'projects');
    let folders = [];
    try {
      folders = fs.readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return null;
    }
    for (const folder of folders) {
      const file = path.join(projects, folder, `${sessionId}.jsonl`);
      if (fs.existsSync(file)) return file;
    }
    return null;
  }

  /**
   * Earlier messages of a conversation, in the shape the chat receives live (assistant turns and
   * user turns), so a chat restored after a restart shows what was said. Only the main thread:
   * subagent and system-injected entries are skipped. The last `limit` messages at most.
   */
  function readHistory(sessionId, accountId, limit = 600) {
    const file = findTranscript(sessionId, accountId);
    if (!file) return [];
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      return [];
    }
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!entry || (entry.type !== 'user' && entry.type !== 'assistant') || entry.isSidechain || entry.isMeta) continue;
      if (!entry.message || typeof entry.message !== 'object') continue;
      out.push({ type: entry.type, message: entry.message, parent_tool_use_id: null });
    }
    return out.slice(-limit);
  }

  return { list, status, add, rename, remove, setActive, loginCommand, copySession, readHistory, envFor, configDirFor, DEFAULT_ID };
}

module.exports = { createClaudeAccountService, sanitizeAccounts, DEFAULT_ID };
