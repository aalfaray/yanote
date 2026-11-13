import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { createClaudeAccountService, sanitizeAccounts } = require('../../electron/services/claudeAccountService.cjs');

describe('Backend: ClaudeAccountService (several Claude accounts)', () => {
  let tmp: string;
  let home: string;
  let root: string;
  let config: any;

  const setup = (run = vi.fn()) =>
    createClaudeAccountService({
      getConfig: () => config,
      saveConfig: (partial: object) => {
        config = { ...config, ...partial };
        return config;
      },
      accountsRoot: root,
      getExecutable: () => 'C:\\bin\\claude.exe',
      env: { Path: 'C:\\bin' },
      homedir: home,
      run,
    });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-acc-'));
    home = path.join(tmp, 'home');
    root = path.join(tmp, 'data', 'claude-accounts');
    fs.mkdirSync(path.join(home, '.claude', 'skills', 'mi-skill'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{"model":"opus"}');
    fs.writeFileSync(path.join(home, '.claude', 'skills', 'mi-skill', 'SKILL.md'), '# skill');
    fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{"secreto":true}');
    config = {};
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('always has the main account, and adds accounts with their own folder (settings copied, never credentials)', () => {
    const svc = setup();
    expect(svc.list()).toEqual({ accounts: [{ id: 'default', name: 'Principal', configDir: null, isDefault: true }], activeId: 'default' });

    const acc = svc.add('Trabajo');
    expect(acc.name).toBe('Trabajo');
    expect(acc.configDir.startsWith(root)).toBe(true);
    expect(fs.readFileSync(path.join(acc.configDir, 'settings.json'), 'utf8')).toBe('{"model":"opus"}');
    expect(fs.existsSync(path.join(acc.configDir, 'skills', 'mi-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(acc.configDir, '.credentials.json'))).toBe(false);
    expect(svc.list().accounts.map((a: any) => a.name)).toEqual(['Principal', 'Trabajo']);
    expect(svc.add('').name).toBe('Cuenta 3');
  });

  it('runs Claude Code as the chosen account through CLAUDE_CONFIG_DIR', () => {
    const svc = setup();
    const acc = svc.add('B');
    expect(svc.configDirFor('default')).toBeNull();
    expect(svc.configDirFor(acc.id)).toBe(acc.configDir);
    expect(svc.envFor(acc.id).CLAUDE_CONFIG_DIR).toBe(acc.configDir);
    expect(svc.envFor('default').CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(svc.loginCommand('default')).toBe("& 'C:\\bin\\claude.exe' auth login");
    expect(svc.loginCommand(acc.id)).toBe(`$env:CLAUDE_CONFIG_DIR='${acc.configDir}'; & 'C:\\bin\\claude.exe' auth login`);
    expect(svc.loginCommand('no-existe')).toBeNull();
  });

  it('reads each account sign-in with `claude auth status`', async () => {
    const run = vi.fn(async (_file: string, _args: string[], opts: any) => ({
      err: null,
      stdout: JSON.stringify(
        opts.env.CLAUDE_CONFIG_DIR
          ? { loggedIn: false, authMethod: 'none' }
          : { loggedIn: true, authMethod: 'claude.ai', email: 'yo@ejemplo.com', subscriptionType: 'pro' }
      ),
    }));
    const svc = setup(run);
    const acc = svc.add('B');
    expect(await svc.status('default')).toEqual({ success: true, loggedIn: true, email: 'yo@ejemplo.com', plan: 'pro', method: 'claude.ai' });
    expect(await svc.status(acc.id)).toMatchObject({ success: true, loggedIn: false });
    expect(run).toHaveBeenCalledWith('C:\\bin\\claude.exe', ['auth', 'status', '--json'], expect.anything());

    run.mockResolvedValueOnce({ err: new Error('timeout'), stdout: '' });
    expect(await svc.status('default')).toEqual({ success: false, error: 'timeout' });
  });

  it('switches the active account and removes only its own folders', () => {
    const svc = setup();
    const acc = svc.add('B');
    expect(svc.setActive(acc.id)).toBe(true);
    expect(svc.list().activeId).toBe(acc.id);
    expect(svc.setActive('no-existe')).toBe(false);
    expect(svc.remove('default')).toBe(false);

    expect(svc.remove(acc.id)).toBe(true);
    expect(fs.existsSync(acc.configDir)).toBe(false);
    expect(svc.list().activeId).toBe('default');

    // a folder outside yanote's data is forgotten but never deleted
    const outside = path.join(tmp, 'mia');
    fs.mkdirSync(outside);
    config.claudeAccounts = [{ id: 'x', name: 'X', configDir: outside }];
    expect(svc.remove('x')).toBe(true);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('copies a conversation to another account so it can be resumed there', () => {
    const svc = setup();
    const acc = svc.add('B');
    const project = path.join(home, '.claude', 'projects', 'C--proyecto');
    fs.mkdirSync(path.join(project, 'sess-1', 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(project, 'sess-1.jsonl'), '{"m":1}\n');
    fs.writeFileSync(path.join(project, 'sess-1', 'subagents', 'a.jsonl'), '{}');

    expect(svc.copySession('sess-1', 'default', acc.id)).toEqual({ success: true, copied: true });
    expect(fs.readFileSync(path.join(acc.configDir, 'projects', 'C--proyecto', 'sess-1.jsonl'), 'utf8')).toBe('{"m":1}\n');
    expect(fs.existsSync(path.join(acc.configDir, 'projects', 'C--proyecto', 'sess-1', 'subagents', 'a.jsonl'))).toBe(true);

    // and back, with whatever was added meanwhile
    fs.appendFileSync(path.join(acc.configDir, 'projects', 'C--proyecto', 'sess-1.jsonl'), '{"m":2}\n');
    svc.copySession('sess-1', acc.id, 'default');
    expect(fs.readFileSync(path.join(project, 'sess-1.jsonl'), 'utf8')).toBe('{"m":1}\n{"m":2}\n');

    expect(svc.copySession('no-existe', 'default', acc.id).success).toBe(false);
    expect(svc.copySession('../../malo', 'default', acc.id)).toEqual({ success: false, error: 'Sesión inválida' });
    expect(svc.copySession('sess-1', 'default', 'default')).toEqual({ success: true, copied: false });
  });

  it('ignores malformed stored accounts', () => {
    expect(
      sanitizeAccounts([{ id: 'default', configDir: 'x' }, { id: 'ok', name: ' A ', configDir: 'C:\\a' }, { id: 'ok', configDir: 'C:\\b' }, { id: '../x', configDir: 'y' }, null, { id: 'sin-dir' }])
    ).toEqual([{ id: 'ok', name: 'A', configDir: 'C:\\a' }]);
  });

  it('reads a saved conversation back (main thread only) for a restored chat', () => {
    const svc = setup();
    const project = path.join(home, '.claude', 'projects', 'C--nube');
    fs.mkdirSync(project, { recursive: true });
    const lines = [
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'continúa' }] } },
      { type: 'attachment', attachment: {} },
      { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Retomo' }] } },
      { type: 'assistant', isSidechain: true, message: { id: 's', content: [{ type: 'text', text: 'subagente' }] } },
      { type: 'user', isMeta: true, message: { content: 'inyectado' } },
    ];
    fs.writeFileSync(path.join(project, 'sess-9.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n{roto\n');
    expect(svc.readHistory('sess-9', 'default')).toEqual([
      { type: 'user', message: lines[0].message, parent_tool_use_id: null },
      { type: 'assistant', message: lines[2].message, parent_tool_use_id: null },
    ]);
    expect(svc.readHistory('sess-9', 'default', 1)).toHaveLength(1);
    expect(svc.readHistory('no-existe', 'default')).toEqual([]);
    expect(svc.readHistory('../x', 'default')).toEqual([]);
  });
});
