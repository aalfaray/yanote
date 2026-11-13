import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { readClaudeDefaults } = require('../../electron/services/claudeSettings.cjs');

describe('Backend: readClaudeDefaults (model/effort before the first reply)', () => {
  let tmp: string;
  let home: string;
  let project: string;
  const write = (file: string, data: object) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-cs-'));
    home = path.join(tmp, 'home');
    project = path.join(tmp, 'proyecto');
    write(path.join(home, '.claude', 'settings.json'), {
      model: 'opus',
      effortLevel: 'xhigh',
      modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' }, raro: { effortLevel: 'turbo' } },
    });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('reads the user settings', () => {
    expect(readClaudeDefaults({ homedir: home, env: {} })).toEqual({
      model: 'opus',
      effortLevel: 'xhigh',
      modelEfforts: { 'claude-opus-5-5': 'medium' },
      effortFromEnv: null,
    });
  });

  it('lets project and local project settings override, then the environment', () => {
    write(path.join(project, '.claude', 'settings.json'), { model: 'sonnet' });
    write(path.join(project, '.claude', 'settings.local.json'), { effortLevel: 'low', modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } });
    const d = readClaudeDefaults({ homedir: home, cwd: project, env: {} });
    expect(d).toMatchObject({ model: 'sonnet', effortLevel: 'low', modelEfforts: { 'claude-opus-5-5': 'medium', 'claude-sonnet-5-5': 'high' } });
    const withEnv = readClaudeDefaults({ homedir: home, cwd: project, env: { ANTHROPIC_MODEL: 'haiku', CLAUDE_CODE_EFFORT_LEVEL: 'MAX' } });
    expect(withEnv).toMatchObject({ model: 'haiku', effortFromEnv: 'max' });
  });

  it('uses the account folder, and survives missing or broken files', () => {
    const accountDir = path.join(tmp, 'cuenta-b');
    write(path.join(accountDir, 'settings.json'), { model: 'fable' });
    expect(readClaudeDefaults({ homedir: home, configDir: accountDir, env: {} }).model).toBe('fable');
    fs.writeFileSync(path.join(accountDir, 'settings.json'), '{roto');
    expect(readClaudeDefaults({ homedir: home, configDir: accountDir, env: {} })).toEqual({ model: null, effortLevel: null, modelEfforts: {}, effortFromEnv: null });
  });
});
