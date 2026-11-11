import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import CommonJS service
const { getBaseDataDir, loadConfig, saveConfig } = require('../../electron/services/configService.cjs');

describe('Backend: ConfigService (20% Happy / 80% Destructive)', () => {
  let tempDir: string;
  let configPath: string;
  let notesPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boldnotes-test-config-'));
    configPath = path.join(tempDir, 'app-config.json');
    notesPath = path.join(tempDir, 'notes');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/2] returns valid default config when no config file exists', () => {
    const config = loadConfig(configPath, notesPath);
    expect(config).toBeDefined();
    expect(config.notesPath).toBe(notesPath);
    expect(config.alwaysOnTop).toBe(false);
    expect(config.githubBranch).toBe('main');
    expect(config.autoSyncOnSave).toBe(false);
  });

  it('[HAPPY 2/2] saves and loads valid config changes correctly', () => {
    const current = loadConfig(configPath, notesPath);
    const updated = saveConfig(configPath, current, {
      alwaysOnTop: true,
      githubRepo: 'https://github.com/test/repo.git',
      githubBranch: 'develop',
      autoSyncOnSave: true,
    });

    expect(updated.alwaysOnTop).toBe(true);
    expect(updated.githubRepo).toBe('https://github.com/test/repo.git');
    expect(updated.githubBranch).toBe('develop');

    // Reload from disk to verify persistence
    const reloaded = loadConfig(configPath, notesPath);
    expect(reloaded.alwaysOnTop).toBe(true);
    expect(reloaded.githubRepo).toBe('https://github.com/test/repo.git');
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/8] handles completely corrupt JSON without crashing and falls back to defaults', () => {
    fs.writeFileSync(configPath, '{{{MALFORMED_JSON:::invalid###', 'utf8');
    const config = loadConfig(configPath, notesPath);
    expect(config).toBeDefined();
    expect(config.notesPath).toBe(notesPath);
    expect(config.alwaysOnTop).toBe(false);
  });

  it('[CHAOS 2/8] handles empty config file without crashing', () => {
    fs.writeFileSync(configPath, '   \n  ', 'utf8');
    const config = loadConfig(configPath, notesPath);
    expect(config).toBeDefined();
    expect(config.githubBranch).toBe('main');
  });

  it('[CHAOS 3/8] handles config file containing primitive value instead of object', () => {
    fs.writeFileSync(configPath, '"just a string"', 'utf8');
    const config = loadConfig(configPath, notesPath);
    expect(config).toBeDefined();
    expect(config.notesPath).toBe(notesPath);

    fs.writeFileSync(configPath, '12345', 'utf8');
    const config2 = loadConfig(configPath, notesPath);
    expect(config2.notesPath).toBe(notesPath);
  });

  it('[CHAOS 4/8] handles config file containing JSON array instead of dictionary', () => {
    fs.writeFileSync(configPath, '[1, "two", null, true]', 'utf8');
    const config = loadConfig(configPath, notesPath);
    expect(config).toBeDefined();
    expect(config.openTabs).toEqual([]);
  });

  it('[CHAOS 5/8] resists prototype pollution attempts when saving', () => {
    const current = loadConfig(configPath, notesPath);
    const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "alwaysOnTop": true}');
    saveConfig(configPath, current, maliciousPayload);

    // Verify global prototype is not polluted
    expect((({} as any).polluted)).toBeUndefined();
  });

  it('[CHAOS 6/8] handles saving with null, undefined, and non-object parameters without throw', () => {
    const current = loadConfig(configPath, notesPath);
    const res1 = saveConfig(configPath, current, null);
    expect(res1).toEqual(current);

    const res2 = saveConfig(configPath, current, undefined);
    expect(res2).toEqual(current);

    const res3 = saveConfig(configPath, current, 'string' as any);
    expect(res3).toEqual(current);
  });

  it('[CHAOS 7/8] creates parent directory recursively if deeply nested path is provided', () => {
    const deepConfigPath = path.join(tempDir, 'sub1', 'sub2', 'sub3', 'nested-config.json');
    const current = loadConfig(deepConfigPath, notesPath);
    const updated = saveConfig(deepConfigPath, current, { alwaysOnTop: true });

    expect(fs.existsSync(deepConfigPath)).toBe(true);
    expect(updated.alwaysOnTop).toBe(true);
  });

  it('[CHAOS 8/8] resolves portable directory correctly with PORTABLE_EXECUTABLE_DIR environment variable', () => {
    const fakePortableDir = path.join(tempDir, 'portable-root');
    const env = { PORTABLE_EXECUTABLE_DIR: fakePortableDir };
    const baseDir = getBaseDataDir(env, '/dummy/exec', '/dummy/userData');
    expect(baseDir).toBe(path.join(fakePortableDir, 'data'));
  });
});
