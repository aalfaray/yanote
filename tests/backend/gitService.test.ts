import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const gitService = require('../../electron/services/gitService.cjs');

describe('Backend: GitService (20% Happy / 80% Destructive)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boldnotes-test-git-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/4] initGit initializes a repository with .gitignore and initial commit', async () => {
    const res = await gitService.initGit(tempDir);
    expect(res.success).toBe(true);
    expect(res.isRepo).toBe(true);

    const gitDir = path.join(tempDir, '.git');
    expect(fs.existsSync(gitDir)).toBe(true);

    const gitignore = path.join(tempDir, '.gitignore');
    expect(fs.existsSync(gitignore)).toBe(true);
  });

  it('[HAPPY 2/4] commitChanges stages all files and creates commit', async () => {
    await gitService.initGit(tempDir);

    const noteFile = path.join(tempDir, 'TestNote.md');
    fs.writeFileSync(noteFile, '# Testing Git Commit', 'utf8');

    const commitRes = await gitService.commitChanges(tempDir, 'Add TestNote');
    expect(commitRes.success).toBe(true);

    const status = await gitService.getGitStatus(tempDir);
    expect(status.success).toBe(true);
    expect(status.hasChanges).toBe(false);
  });

  it('[HAPPY 3/4] getHistory returns commit logs with messages and hashes', async () => {
    await gitService.initGit(tempDir);

    fs.writeFileSync(path.join(tempDir, 'NoteA.md'), 'Content A', 'utf8');
    await gitService.commitChanges(tempDir, 'Commit A');

    fs.writeFileSync(path.join(tempDir, 'NoteB.md'), 'Content B', 'utf8');
    await gitService.commitChanges(tempDir, 'Commit B');

    const histRes = await gitService.getHistory(tempDir, undefined, 5);
    expect(histRes.success).toBe(true);
    expect(histRes.all.length).toBeGreaterThanOrEqual(2);
    expect(histRes.all[0].message).toBe('Commit B');
    expect(histRes.all[1].message).toBe('Commit A');
  });

  it('[HAPPY 4/4] formatAuthenticatedUrl inserts Personal Access Token correctly', () => {
    const url = 'https://github.com/myuser/mynotes.git';
    const token = 'ghp_abc123secret';
    const authed = gitService.formatAuthenticatedUrl(url, token);
    expect(authed).toBe('https://ghp_abc123secret@github.com/myuser/mynotes.git');
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/12] commitChanges with empty or whitespace message generates safe fallback timestamp message', async () => {
    await gitService.initGit(tempDir);

    fs.writeFileSync(path.join(tempDir, 'EmptyMsg.md'), 'Content', 'utf8');
    const commitRes = await gitService.commitChanges(tempDir, '   ');
    expect(commitRes.success).toBe(true);

    const hist = await gitService.getHistory(tempDir);
    expect(hist.all[0].message).toContain('Actualización de notas');
  });

  it('[CHAOS 2/12] initGit on non-existent directory returns failure gracefully without crash', async () => {
    const ghostDir = path.join(tempDir, 'does-not-exist-dir');
    const res = await gitService.initGit(ghostDir);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('[CHAOS 3/12] getGitStatus on non-git folder returns descriptive error safely', async () => {
    const plainDir = path.join(tempDir, 'non-git-dir');
    fs.mkdirSync(plainDir);
    const res = await gitService.getGitStatus(plainDir);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Not a git repository');
  });

  it('[CHAOS 4/12] committing when working tree is already clean succeeds without failure', async () => {
    await gitService.initGit(tempDir);
    const res = await gitService.commitChanges(tempDir, 'Redundant commit');
    expect(res.success).toBe(true);
  });

  it('[CHAOS 5/12] formatAuthenticatedUrl handles invalid URLs, nulls, and non-https safely', () => {
    expect(gitService.formatAuthenticatedUrl(null, 'token')).toBe('');
    expect(gitService.formatAuthenticatedUrl('git@github.com:user/repo.git', 'token')).toBe('git@github.com:user/repo.git');
    expect(gitService.formatAuthenticatedUrl('https://github.com/user/repo.git', '')).toBe('https://github.com/user/repo.git');
    expect(gitService.formatAuthenticatedUrl('https://github.com/user/repo.git', null)).toBe('https://github.com/user/repo.git');
  });

  it('[CHAOS 6/12] formatAuthenticatedUrl safely encodes tokens containing special characters', () => {
    const tokenWithSpecialChars = 'token with spaces & symbols';
    const url = 'https://github.com/user/repo.git';
    const res = gitService.formatAuthenticatedUrl(url, tokenWithSpecialChars);
    expect(res).toContain(encodeURIComponent(tokenWithSpecialChars));
  });

  it('[CHAOS 7/12] setRemote fails gracefully if empty remote URL is passed', async () => {
    await gitService.initGit(tempDir);
    const res = await gitService.setRemote(tempDir, '');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Remote URL cannot be empty');
  });

  it('[CHAOS 8/12] pushChanges to unreachable remote fails gracefully without unhandled exception', async () => {
    await gitService.initGit(tempDir);
    await gitService.setRemote(tempDir, 'https://github.com/invalid-non-existing-user-12345/non-existing-repo-6789.git');

    const res = await gitService.pushChanges(tempDir, 'main');
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  }, 15000);

  it('[CHAOS 9/12] pullChanges on unreachable remote fails gracefully', async () => {
    await gitService.initGit(tempDir);
    await gitService.setRemote(tempDir, 'https://github.com/invalid-non-existing-user-12345/non-existing-repo-6789.git');

    const res = await gitService.pullChanges(tempDir, 'main');
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  }, 15000);

  it('[CHAOS 10/12] getFileAtCommit with invalid / bogus commit hash returns error safely', async () => {
    await gitService.initGit(tempDir);
    const res = await gitService.getFileAtCommit(tempDir, 'NoteA.md', '0000000000000000000000000000000000000000');
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('[CHAOS 11/12] getHistory with zero or negative maxCount handles safely', async () => {
    await gitService.initGit(tempDir);
    const res = await gitService.getHistory(tempDir, undefined, -5);
    expect(res.success).toBe(true);
    expect(Array.isArray(res.all)).toBe(true);
  });

  it('[CHAOS 12/12] syncAll when no remote is configured commits changes locally and notifies user', async () => {
    await gitService.initGit(tempDir);
    fs.writeFileSync(path.join(tempDir, 'SyncNote.md'), 'Content', 'utf8');

    const res = await gitService.syncAll(tempDir, 'Sync without remote');
    expect(res.success).toBe(true);
    expect(res.synced).toBe(false);
    expect(res.message).toContain('localmente');
  });
});
