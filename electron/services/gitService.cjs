const fs = require('fs');
const path = require('path');
const { simpleGit } = require('simple-git');

function formatAuthenticatedUrl(repoUrl, token) {
  if (!repoUrl || typeof repoUrl !== 'string') return '';
  if (!token || typeof token !== 'string' || !token.trim()) return repoUrl;

  try {
    if (repoUrl.startsWith('https://')) {
      const cleanUrl = repoUrl.replace(/^https:\/\/([^@]+@)?/, '');
      return `https://${encodeURIComponent(token.trim())}@${cleanUrl}`;
    }
  } catch (_) {}
  return repoUrl;
}

async function initGit(repoPath) {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      await git.init();
      const gitignore = path.join(repoPath, '.gitignore');
      if (!fs.existsSync(gitignore)) {
        fs.writeFileSync(gitignore, ".DS_Store\nThumbs.db\n*.tmp\n", 'utf8');
      }
      await git.add('-A');
      await git.commit('Initial commit - Notes initialized');
    }
    return { success: true, isRepo: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getGitStatus(repoPath) {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    const status = await git.status();
    const branchSummary = await git.branchLocal().catch(() => ({ current: 'main' }));
    let remotes = [];
    try {
      remotes = await git.getRemotes(true);
    } catch (_) {}

    return {
      success: true,
      currentBranch: status.current || branchSummary.current || 'main',
      modified: status.modified || [],
      not_added: status.not_added || [],
      staged: status.staged || [],
      ahead: status.ahead || 0,
      behind: status.behind || 0,
      tracking: status.tracking || '',
      hasChanges: !status.isClean(),
      remotes,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function commitChanges(repoPath, message) {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const git = simpleGit(repoPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { success: false, error: 'Not a git repository' };
    }

    await git.add('-A');
    const commitMsg = message && typeof message === 'string' && message.trim()
      ? message.trim()
      : `Actualización de notas - ${new Date().toLocaleString()}`;

    const result = await git.commit(commitMsg);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function setRemote(repoPath, remoteUrl, branch = 'main', token = '') {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    if (!remoteUrl || typeof remoteUrl !== 'string' || !remoteUrl.trim()) {
      return { success: false, error: 'Remote URL cannot be empty' };
    }

    const git = simpleGit(repoPath);
    const remotes = await git.getRemotes(false);
    const authUrl = formatAuthenticatedUrl(remoteUrl.trim(), token);

    if (remotes.some(r => r.name === 'origin')) {
      await git.remote(['set-url', 'origin', authUrl]);
    } else {
      await git.addRemote('origin', authUrl);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function pushChanges(repoPath, branch = 'main') {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const git = simpleGit(repoPath);
    const safeBranch = branch && typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
    const result = await git.env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
      .raw(['-c', 'http.timeout=3', 'push', 'origin', safeBranch, '--set-upstream']);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function pullChanges(repoPath, branch = 'main') {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const git = simpleGit(repoPath);
    const safeBranch = branch && typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
    const result = await git.env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
      .raw(['-c', 'http.timeout=3', 'pull', 'origin', safeBranch]);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function syncAll(repoPath, message, branch = 'main') {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const git = simpleGit(repoPath);
    const status = await git.status();

    if (!status.isClean()) {
      await git.add('-A');
      const msg = message && message.trim() ? message.trim() : `Sincronización - ${new Date().toLocaleString()}`;
      await git.commit(msg);
    }

    const remotes = await git.getRemotes();
    if (remotes.some(r => r.name === 'origin')) {
      const safeBranch = branch && typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
      try {
        await git.pull('origin', safeBranch, { '--rebase': 'true' });
      } catch (pullErr) {
        console.warn('Pull during sync notice:', pullErr.message);
      }
      await git.push('origin', safeBranch, { '--set-upstream': null });
      return { success: true, synced: true, message: 'Notas sincronizadas con éxito con GitHub' };
    }

    return {
      success: true,
      synced: false,
      message: 'Cambios confirmados localmente en Git. Configura un remoto para enviar a GitHub.',
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getHistory(repoPath, filePath, maxCount = 20) {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist', all: [] };
    }
    const git = simpleGit(repoPath);
    const options = { maxCount: Math.max(1, Number(maxCount) || 20) };
    if (filePath && typeof filePath === 'string') {
      options.file = filePath;
    }
    const log = await git.log(options);
    return { success: true, all: log.all || [] };
  } catch (err) {
    return { success: false, error: err.message, all: [] };
  }
}

async function getFileAtCommit(repoPath, filePath, commitHash) {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    if (!filePath || !commitHash) {
      return { success: false, error: 'File path and commit hash are required' };
    }
    const git = simpleGit(repoPath);
    const relativePath = path.relative(repoPath, filePath).replace(/\\/g, '/');
    const content = await git.show([`${commitHash}:${relativePath}`]);
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  formatAuthenticatedUrl,
  initGit,
  getGitStatus,
  commitChanges,
  setRemote,
  pushChanges,
  pullChanges,
  syncAll,
  getHistory,
  getFileAtCommit,
};
