const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const { withFreshPath } = require('./terminalService.cjs');
const { findAgyExecutable } = require('./antigravityChatService.cjs');

const CACHE_MS = 30_000;

/** /usage reports fractions remaining. The status bar consistently shows percent used. */
function summarizeUsage(data, model) {
  const groups = Array.isArray(data?.command?.data?.groups) ? data.command.data.groups : [];
  const family = /^gemini/i.test(model || '') ? /gemini/i : /^(claude|gpt)/i.test(model || '') ? /claude|gpt/i : null;
  const group = family && groups.find((g) => typeof g?.name === 'string' && family.test(g.name));
  if (!group) return { available: false, model, group: null, fiveHour: null, weekly: null };
  const window = (name) => {
    const bucket = (Array.isArray(group.buckets) ? group.buckets : []).find((b) => b?.window === name && !b.disabled);
    const remaining = bucket?.remaining_fraction;
    if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining < 0 || remaining > 1) return null;
    const resetsAt = typeof bucket.reset_time === 'string' && Number.isFinite(Date.parse(bucket.reset_time)) ? bucket.reset_time : null;
    return { percent: (1 - remaining) * 100, resetsAt };
  };
  const fiveHour = window('5h');
  const weekly = window('weekly');
  return { available: Boolean(fiveHour || weekly), model, group: group.name, fiveHour, weekly };
}

/** Query the CLI's built-in quota command; never send /usage as an AI prompt. */
function createAntigravityUsageService({
  run = promisify(execFile), env = process.env, platform = process.platform,
  readPath, findExecutable = findAgyExecutable, now = Date.now,
} = {}) {
  let cached = null;
  let fetchedAt = 0;
  let inFlight = null;
  async function fetchUsage(force) {
    if (inFlight) return inFlight;
    if (!force && cached && now() - fetchedAt < CACHE_MS) return cached;
    inFlight = (async () => {
      const childEnv = withFreshPath({ ...env }, platform, readPath);
      const executable = findExecutable(childEnv, platform);
      if (!executable) throw new Error('Antigravity CLI no está instalado');
      const { stdout } = await run(executable, ['--print', '/usage', '--output-format', 'json', '--print-timeout', '15s'], {
        env: childEnv, cwd: os.homedir(), windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024,
      });
      const data = JSON.parse(stdout);
      if (data.status !== 'SUCCESS' || data.command?.name !== 'usage' || !Array.isArray(data.command?.data?.groups)) {
        throw new Error('Antigravity no devolvió datos de cuota válidos');
      }
      cached = data;
      fetchedAt = now();
      return data;
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }
  return {
    async usage(model, force = false) {
      try {
        return { success: true, ...summarizeUsage(await fetchUsage(force), model) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

module.exports = { createAntigravityUsageService, summarizeUsage };
