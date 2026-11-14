import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ClaudeUsageMeter, useClaudeUsage } from '../../src/components/ClaudeUsageMeter';
import { formatReset, formatPercent, usageTone, describeWindow, formatCountdown, isExhausted } from '../../src/lib/claudeUsage';

describe('claudeUsage formatting', () => {
  const now = new Date(2026, 10, 13, 3, 0); // Fri 13 Nov 2026, 03:00 local

  it('formats reset times relative to now', () => {
    expect(formatReset(new Date(2026, 10, 13, 3, 45).toISOString(), now)).toBe('en 45 min');
    expect(formatReset(new Date(2026, 10, 13, 5, 0).toISOString(), now)).toBe('en 2 h (05:00)');
    expect(formatReset(new Date(2026, 10, 13, 6, 20).toISOString(), now)).toBe('en 3 h 20 min (06:20)');
    expect(formatReset(new Date(2026, 10, 17, 14, 0).toISOString(), now)).toBe('mar 17, 14:00');
    expect(formatReset(new Date(2026, 10, 13, 2, 0).toISOString(), now)).toBe('ahora');
    expect(formatReset(null, now)).toBe('');
    expect(formatReset('no es fecha', now)).toBe('');
  });

  it('formats a compact countdown and detects used-up windows', () => {
    expect(formatCountdown(new Date(2026, 10, 13, 3, 45).toISOString(), now)).toBe('45m');
    expect(formatCountdown(new Date(2026, 10, 13, 5, 15).toISOString(), now)).toBe('2h 15m');
    expect(formatCountdown(new Date(2026, 10, 13, 5, 0).toISOString(), now)).toBe('2h');
    expect(formatCountdown(new Date(2026, 10, 16, 7, 0).toISOString(), now)).toBe('3d 4h');
    expect(formatCountdown(new Date(2026, 10, 13, 2, 0).toISOString(), now)).toBe('');
    expect(formatCountdown(null, now)).toBe('');
    expect(isExhausted({ percent: 100, resetsAt: new Date(2026, 10, 13, 5, 0).toISOString() }, now)).toBe(true);
    expect(isExhausted({ percent: 100, resetsAt: new Date(2026, 10, 13, 2, 0).toISOString() }, now)).toBe(false);
    expect(isExhausted({ percent: 99, resetsAt: null }, now)).toBe(false);
  });

  it('rounds percents and picks a colour step', () => {
    expect(formatPercent(16.4)).toBe('16%');
    expect(formatPercent(140)).toBe('100%');
    expect([usageTone(10), usageTone(70), usageTone(95)]).toEqual(['ok', 'warn', 'high']);
    expect(describeWindow('Semana', { percent: 41, resetsAt: null }, now)).toBe('Semana: 41% usado');
  });
});

describe('ClaudeUsageMeter (status bar)', () => {
  it('shows the 5-hour and weekly usage with reset times on hover', () => {
    render(
      <ClaudeUsageMeter
        usage={{ success: true, available: true, plan: 'pro', fiveHour: { percent: 16, resetsAt: null }, weekly: { percent: 41, resetsAt: null } }}
      />
    );
    expect(screen.getByTestId('usage-5h')).toHaveTextContent('5h16%');
    expect(screen.getByTestId('usage-week')).toHaveTextContent('Sem41%');
    expect(screen.getByTestId('claude-usage').getAttribute('title')).toContain('Últimas 5 horas: 16% usado');
  });

  it('shows the time left instead of the percent once a window is used up', () => {
    const soon = new Date(Date.now() + (2 * 60 + 15) * 60000 - 1000).toISOString();
    const later = new Date(Date.now() + (3 * 24 + 4) * 3600000 - 1000).toISOString();
    render(
      <ClaudeUsageMeter
        usage={{ success: true, available: true, fiveHour: { percent: 100, resetsAt: soon }, weekly: { percent: 100, resetsAt: later } }}
      />
    );
    expect(screen.getByTestId('usage-5h-countdown')).toHaveTextContent('2h 15m');
    expect(screen.getByTestId('usage-week-countdown')).toHaveTextContent('3d 4h');
    expect(screen.getByTestId('usage-5h')).not.toHaveTextContent('100%');
  });

  it('shows a skeleton before the first reading, then hides when the provider has no plan limits', () => {
    const { container, rerender } = render(<ClaudeUsageMeter usage={null} />);
    expect(screen.getByRole('status', { name: 'Cargando uso de Claude' })).toHaveAttribute('aria-busy', 'true');
    rerender(<ClaudeUsageMeter usage={{ success: true, available: false, fiveHour: null, weekly: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('useClaudeUsage', () => {
  let listener: ((e: any) => void) | null;
  const Probe = ({ ids }: { ids: string[] }) => {
    const usage = useClaudeUsage(ids, ids[0]);
    return <span data-testid="probe">{usage?.fiveHour ? usage.fiveHour.percent : 'none'}</span>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    listener = null;
    let n = 10;
    window.electronAPI = {
      claudeUsage: vi.fn(async () => ({ success: true, available: true, fiveHour: { percent: n++, resetsAt: null }, weekly: null })),
      onClaudeEvent: vi.fn((cb: any) => {
        listener = cb;
        return () => {
          listener = null;
        };
      }),
    } as any;
  });
  afterEach(() => vi.useRealTimers());

  it('asks only while a chat is open, and refreshes after each Claude reply', async () => {
    const { rerender } = render(<Probe ids={[]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(window.electronAPI!.claudeUsage).not.toHaveBeenCalled();

    rerender(<Probe ids={['claude-1']} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(window.electronAPI!.claudeUsage).toHaveBeenCalledWith('claude-1');
    expect(screen.getByTestId('probe')).toHaveTextContent('10');

    await act(async () => {
      listener?.({ id: 'claude-1', type: 'message', message: { type: 'result' } });
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('11');

    rerender(<Probe ids={[]} />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
    expect(listener).toBeNull();
  });

  it('keeps the last numbers when a refresh fails', async () => {
    render(<Probe ids={['claude-1']} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    (window.electronAPI!.claudeUsage as any).mockResolvedValueOnce({ success: false, error: 'timeout' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 10);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('10');
  });
});
