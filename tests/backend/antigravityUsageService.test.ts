import { describe, it, expect, vi } from 'vitest';
const { createAntigravityUsageService, summarizeUsage } = require('../../electron/services/antigravityUsageService.cjs');

const data = {
  status: 'SUCCESS', command: { name: 'usage', data: { groups: [
    { name: 'Gemini Models', buckets: [
      { window: 'weekly', remaining_fraction: 0, reset_time: '2026-11-14T12:51:58Z' },
      { window: '5h', disabled: true, remaining_fraction: 1 },
    ] },
    { name: 'Claude and GPT models', buckets: [
      { window: 'weekly', remaining_fraction: 0.47, reset_time: '2026-11-19T16:59:51Z' },
      { window: '5h', remaining_fraction: 0.95, reset_time: '2026-11-13T20:19:33Z' },
    ] },
  ] } },
};
const setup = (run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(data) })) => ({
  run, service: createAntigravityUsageService({ run, findExecutable: () => 'agy.exe', env: {}, readPath: () => '' }),
});

describe('Antigravity account quota', () => {
  it('converts remaining to used, selects the model group and omits disabled limits', () => {
    expect(summarizeUsage(data, 'gemini-3.8-flash')).toEqual({
      available: true, model: 'gemini-3.8-flash', group: 'Gemini Models',
      fiveHour: null, weekly: { percent: 100, resetsAt: '2026-11-14T12:51:58Z' },
    });
    for (const model of ['claude-sonnet-4-6', 'gpt-oss']) {
      const result = summarizeUsage(data, model);
      expect(result.group).toBe('Claude and GPT models');
      expect(result.fiveHour.percent).toBeCloseTo(5);
      expect(result.weekly.percent).toBeCloseTo(53);
    }
    expect(summarizeUsage(data, 'unknown-model').available).toBe(false);
    expect(summarizeUsage(data, null).available).toBe(false);
  });

  it('never invents percentages for missing or malformed quota values', () => {
    for (const value of [undefined, null, '0.5', -1, 2, NaN]) {
      const invalid = { command: { data: { groups: [{ name: 'Gemini Models', buckets: [{ window: 'weekly', remaining_fraction: value }] }] } } };
      expect(summarizeUsage(invalid, 'gemini-pro').available).toBe(false);
    }
  });

  it('uses the built-in command without a model turn, shares requests and caches raw groups across model changes', async () => {
    const { service, run } = setup();
    const [gemini, claude] = await Promise.all([service.usage('gemini-pro'), service.usage('claude-sonnet')]);
    expect(gemini.group).toBe('Gemini Models');
    expect(claude.group).toBe('Claude and GPT models');
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('agy.exe', ['--print', '/usage', '--output-format', 'json', '--print-timeout', '15s'],
      expect.objectContaining({ windowsHide: true, timeout: 20000, maxBuffer: 1048576 }));
    await service.usage('gemini-pro');
    expect(run).toHaveBeenCalledTimes(1);
    await service.usage('gemini-pro', true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('expires cached quota after 30 seconds', async () => {
    let now = 0;
    const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(data) });
    const service = createAntigravityUsageService({ run, findExecutable: () => 'agy.exe', env: {}, readPath: () => '', now: () => now });
    await service.usage('gemini');
    now = 30001;
    await service.usage('gemini');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reports failures and retries rather than caching invalid responses', async () => {
    const { service, run } = setup(vi.fn()
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce({ stdout: '{broken' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'SUCCESS', command: { name: 'other' } }) })
      .mockResolvedValue({ stdout: JSON.stringify(data) }));
    for (let i = 0; i < 3; i++) expect((await service.usage('gemini')).success).toBe(false);
    expect((await service.usage('gemini')).available).toBe(true);
    expect(run).toHaveBeenCalledTimes(4);
  });
});
