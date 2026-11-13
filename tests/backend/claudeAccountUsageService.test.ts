import { describe, it, expect, vi } from 'vitest';
const { createClaudeAccountUsageService } = require('../../electron/services/claudeAccountUsageService.cjs');

function setup() {
  const turns: any[] = [];
  const connections: any[] = [];
  const sdk = { query: vi.fn(({ prompt, options }: any) => {
    const connection = Object.assign((async function* () { for await (const turn of prompt) { turns.push(turn); yield turn; } })(), {
      close: vi.fn(),
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi.fn(async () => ({
        subscription_type: 'pro', rate_limits_available: true,
        rate_limits: { five_hour: { utilization: options.env.CLAUDE_CONFIG_DIR === '/accounts/b' ? 12 : 100, resets_at: '2099-01-01T00:00:00Z' }, seven_day: { utilization: 40 } },
      })),
    });
    connections.push(connection);
    return connection;
  }) };
  const accounts = { list: () => ({ accounts: [{ id: 'default' }, { id: 'b' }] }), envFor: (id: string, env: any) => ({ ...env, CLAUDE_CONFIG_DIR: id === 'b' ? '/accounts/b' : '/accounts/default' }) };
  let now = 0;
  const service = createClaudeAccountUsageService({ accounts, getExecutable: () => '/cli/claude', loadSdk: async () => sdk,
    env: { PATH: '/bin', CLAUDECODE: '1' }, platform: 'linux', readPath: () => '', now: () => now, timeoutMs: 100 });
  return { service, sdk, turns, connections, advance: () => { now += 31000; } };
}

describe('Quota for each Claude account', () => {
  it('keeps account auth separate, requests only rate limits, never sends a prompt and closes temporary connections', async () => {
    const { service, sdk, turns, connections } = setup();
    const [primary, work] = await Promise.all([service.usage('default'), service.usage('b')]);
    expect(primary.fiveHour.percent).toBe(100);
    expect(work.fiveHour.percent).toBe(12);
    expect(sdk.query.mock.calls.map(([args]: any[]) => args.options.env.CLAUDE_CONFIG_DIR)).toEqual(['/accounts/default', '/accounts/b']);
    for (const [args] of sdk.query.mock.calls as any) {
      expect(args.options.env.CLAUDECODE).toBeUndefined();
      expect(args.options).toMatchObject({ persistSession: false, settingSources: [], tools: [], mcpServers: {}, strictMcpConfig: true });
    }
    expect(turns).toEqual([]);
    for (const q of connections) {
      expect(q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET).toHaveBeenCalledWith({ skipBehaviors: true });
      expect(q.close).toHaveBeenCalledTimes(1);
    }
  });

  it('deduplicates and caches per account, but refreshes expired, forced or invalidated readings', async () => {
    const { service, sdk, advance } = setup();
    await Promise.all([service.usage('b'), service.usage('b')]);
    await service.usage('b');
    expect(sdk.query).toHaveBeenCalledTimes(1);
    await service.usage('b', true);
    expect(sdk.query).toHaveBeenCalledTimes(2);
    service.invalidate('b');
    await service.usage('b');
    expect(sdk.query).toHaveBeenCalledTimes(3);
    advance();
    await service.usage('b');
    expect(sdk.query).toHaveBeenCalledTimes(4);
  });

  it('rejects unknown account ids instead of falling back to the primary account', async () => {
    const { service, sdk } = setup();
    expect((await service.usage('unknown')).success).toBe(false);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('does not fabricate usage on failures and retries a failed query', async () => {
    const { service, sdk } = setup();
    sdk.query.mockImplementationOnce(() => { throw new Error('offline'); });
    expect(await service.usage('b')).toEqual({ success: false, error: 'offline' });
    expect((await service.usage('b')).success).toBe(true);
  });

  it('aborts timed-out requests and releases the connection', async () => {
    vi.useFakeTimers();
    try {
      const { service, sdk, connections } = setup();
      const original = sdk.query.getMockImplementation()!;
      sdk.query.mockImplementationOnce((...args: any[]) => {
        const q = original(...args);
        q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET.mockImplementation(() => new Promise(() => {}));
        return q;
      });
      const pending = service.usage('b');
      await vi.advanceTimersByTimeAsync(101);
      expect((await pending).success).toBe(false);
      expect(connections[0].close).toHaveBeenCalled();
      expect(sdk.query.mock.calls[0][0].options.abortController.signal.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
