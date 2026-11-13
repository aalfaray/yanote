const fs = require('fs');
const os = require('os');
const path = require('path');
const { getLogger, isNotFound } = require('./logService.cjs');

const log = getLogger('claudeSettings');

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    if (!isNotFound(err)) log.warn('unreadable Claude settings file', err, { file });
    return null;
  }
}

/**
 * The model and effort Claude Code will start a chat with, read from the same places it reads
 * them (lowest to highest priority): user settings, project settings, local project settings,
 * then ANTHROPIC_MODEL / CLAUDE_CODE_EFFORT_LEVEL. Lets the chat show them before the first reply.
 */
function readClaudeDefaults({ configDir, cwd, env = process.env, homedir = os.homedir() } = {}) {
  const userDir = configDir || env.CLAUDE_CONFIG_DIR || path.join(homedir, '.claude');
  const files = [path.join(userDir, 'settings.json')];
  if (typeof cwd === 'string' && cwd) {
    files.push(path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json'));
  }
  let model = null;
  let effortLevel = null;
  const modelEfforts = {};
  for (const file of files) {
    const s = readJson(file);
    if (!s) continue;
    if (typeof s.model === 'string' && s.model.trim()) model = s.model.trim();
    if (EFFORTS.has(s.effortLevel)) effortLevel = s.effortLevel;
    if (s.modelSettings && typeof s.modelSettings === 'object') {
      for (const [name, conf] of Object.entries(s.modelSettings)) {
        if (conf && EFFORTS.has(conf.effortLevel)) modelEfforts[name] = conf.effortLevel;
      }
    }
  }
  if (typeof env.ANTHROPIC_MODEL === 'string' && env.ANTHROPIC_MODEL.trim()) model = env.ANTHROPIC_MODEL.trim();
  const envEffort = String(env.CLAUDE_CODE_EFFORT_LEVEL || '').toLowerCase();
  const effortFromEnv = EFFORTS.has(envEffort) ? envEffort : null;
  return { model, effortLevel, modelEfforts, effortFromEnv };
}

module.exports = { readClaudeDefaults };
