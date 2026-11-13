import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import CommonJS service
const { getBaseDataDir, loadConfig, saveConfig, migrateLegacyConfig } = require('../../electron/services/configService.cjs');

describe('Backend: ConfigService (20% Happy / 80% Destructive)', () => {
  let tempDir: string;
  let configPath: string;
  let notesPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-test-config-'));
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
    expect(config.darkMode).toBe(false);
    expect(config).not.toHaveProperty('githubRepo');
    expect(config).not.toHaveProperty('autoSyncOnSave');
  });

  it('[HAPPY 2/3] saves and loads valid config changes correctly', () => {
    const current = loadConfig(configPath, notesPath);
    const updated = saveConfig(configPath, current, {
      alwaysOnTop: true,
      notesPath: '/tmp/other-notes',
    });

    expect(updated.alwaysOnTop).toBe(true);
    expect(updated.notesPath).toBe('/tmp/other-notes');

    // Reload from disk to verify persistence
    const reloaded = loadConfig(configPath, notesPath);
    expect(reloaded.alwaysOnTop).toBe(true);
    expect(reloaded.notesPath).toBe('/tmp/other-notes');
  });

  it('persists the recent files history and drops malformed entries', () => {
    const current = loadConfig(configPath, notesPath);
    expect(current.recentFiles).toEqual([]);
    saveConfig(configPath, current, {
      recentFiles: [{ path: '/proyectos/Plan.md', name: 'Plan.md', openedAt: 5 }, { path: 42 }, null],
    });
    expect(loadConfig(configPath, notesPath).recentFiles).toEqual([
      { path: '/proyectos/Plan.md', name: 'Plan.md', openedAt: 5 },
    ]);
  });

  it('[HAPPY 3/3] saves and loads darkMode setting accurately across restarts', () => {
    const current = loadConfig(configPath, notesPath);
    const updated = saveConfig(configPath, current, {
      darkMode: true,
    });

    expect(updated.darkMode).toBe(true);

    const reloaded = loadConfig(configPath, notesPath);
    expect(reloaded.darkMode).toBe(true);
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
    expect(config.notesPath).toBe(notesPath);
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

  it('keeps only valid, unique saved tabs and the welcome flag', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        welcomeSeen: true,
        activeTabPath: 'C:\\n\\a.md',
        openTabs: [{ path: 'C:\\n\\a.md', title: 'a.md', content: 'no se guarda' }, { path: 'C:\\n\\a.md' }, null, { title: 'sin ruta' }, { path: 42 }],
      }),
      'utf8'
    );
    const config = loadConfig(configPath, notesPath);
    expect(config.welcomeSeen).toBe(true);
    expect(config.activeTabPath).toBe('C:\\n\\a.md');
    expect(config.openTabs).toEqual([{ path: 'C:\\n\\a.md', title: 'a.md', isPinned: false }]);
    expect(loadConfig(path.join(path.dirname(configPath), 'nuevo.json'), notesPath).welcomeSeen).toBe(false);
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

  it('[CHAOS 8/12] resolves portable directory correctly with PORTABLE_EXECUTABLE_DIR environment variable', () => {
    const fakePortableDir = path.join(tempDir, 'portable-root');
    const env = { PORTABLE_EXECUTABLE_DIR: fakePortableDir };
    const baseDir = getBaseDataDir(env, '/dummy/exec', '/dummy/userData');
    expect(baseDir).toBe(path.join(fakePortableDir, 'data'));
  });

  it('[CHAOS 9/12] handles darkMode with falsy and truthy values cleanly', () => {
    const current = loadConfig(configPath, notesPath);
    const updated1 = saveConfig(configPath, current, { darkMode: true });
    expect(updated1.darkMode).toBe(true);

    const updated2 = saveConfig(configPath, updated1, { darkMode: false });
    expect(updated2.darkMode).toBe(false);
  });

  it('[CHAOS 10/12] handles non-boolean values for darkMode without crashing', () => {
    const current = loadConfig(configPath, notesPath);
    expect(() => {
      saveConfig(configPath, current, { darkMode: 'yes' as any });
    }).not.toThrow();
  });

  it('[CHAOS 11/12] retains darkMode across multiple subsequent updates without resetting', () => {
    let cfg = loadConfig(configPath, notesPath);
    cfg = saveConfig(configPath, cfg, { darkMode: true });
    cfg = saveConfig(configPath, cfg, { alwaysOnTop: true });
    cfg = saveConfig(configPath, cfg, { notesPath: '/tmp/prod' });

    expect(cfg.darkMode).toBe(true);
    expect(cfg.alwaysOnTop).toBe(true);
    expect(cfg.notesPath).toBe('/tmp/prod');

    const reloaded = loadConfig(configPath, notesPath);
    expect(reloaded.darkMode).toBe(true);
  });

  it('[CHAOS 12/13] defaults darkMode to false when absent in corrupted config', () => {
    fs.writeFileSync(configPath, '{"alwaysOnTop": true}', 'utf8');
    const cfg = loadConfig(configPath, notesPath);
    expect(cfg.darkMode).toBe(false);
  });

  it('[CHAOS 13/13] drops legacy GitHub keys (including tokens) from old config files', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ alwaysOnTop: true, githubRepo: 'https://github.com/x/y.git', githubBranch: 'main', githubToken: 'ghp_secret', autoSyncOnSave: true }),
      'utf8'
    );
    const loaded = loadConfig(configPath, notesPath);
    expect(loaded).not.toHaveProperty('githubToken');

    // Even if an old in-memory config still carries them, saving must not persist them
    saveConfig(configPath, { ...loaded, githubToken: 'ghp_secret' }, { darkMode: true });
    const raw = fs.readFileSync(configPath, 'utf8');
    expect(raw).not.toMatch(/github|ghp_secret|autoSyncOnSave/);
    expect(JSON.parse(raw).alwaysOnTop).toBe(true);
  });

  // --- Rename BoldNotes -> yanote ---
  it('[MIGRATION] copies the old app-config.json into the new data folder once', () => {
    const legacy = path.join(tempDir, 'boldnotes');
    const fresh = path.join(tempDir, 'yanote');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'app-config.json'), JSON.stringify({ notesPath: 'C:\Notas', darkMode: true }));

    expect(migrateLegacyConfig(fresh, [path.join(tempDir, 'nada'), legacy])).toBe(legacy);
    expect(loadConfig(path.join(fresh, 'app-config.json'), notesPath)).toMatchObject({ notesPath: 'C:\Notas', darkMode: true });
    // The old folder is left untouched
    expect(fs.existsSync(path.join(legacy, 'app-config.json'))).toBe(true);
  });

  it('[MIGRATION] never overwrites an existing config and ignores missing legacy folders', () => {
    const legacy = path.join(tempDir, 'boldnotes');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'app-config.json'), JSON.stringify({ notesPath: 'viejo' }));
    fs.writeFileSync(configPath, JSON.stringify({ notesPath: 'nuevo' }));

    expect(migrateLegacyConfig(tempDir, [legacy])).toBeNull();
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).notesPath).toBe('nuevo');
    expect(migrateLegacyConfig(path.join(tempDir, 'otro'), [path.join(tempDir, 'no-existe')])).toBeNull();
  });
});
