import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AntigravityUsageMeter } from '../../src/components/AntigravityUsageMeter';
import { useAntigravityUsage } from '../../src/hooks/useAntigravityUsage';

const gemini = { success: true, available: true, group: 'Gemini Models', weekly: { percent: 100, resetsAt: '2026-11-14T12:51:58Z' }, fiveHour: null };
const claude = { success: true, available: true, group: 'Claude and GPT models', weekly: { percent: 53, resetsAt: null }, fiveHour: { percent: 5, resetsAt: null } };
const Probe = ({ id }: { id?: string }) => <AntigravityUsageMeter usage={useAntigravityUsage(id)} />;

describe('Antigravity usage bar', () => {
  let emit: (e: any) => void;
  let off: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T11:51:58Z')); // 1 h before the Gemini weekly reset
    off = vi.fn();
    window.electronAPI = {
      agyUsage: vi.fn().mockResolvedValue(gemini),
      onAgyEvent: vi.fn((cb) => { emit = cb; return off; }),
    } as any;
  });
  afterEach(() => vi.useRealTimers());
  const advance = () => act(async () => { await vi.advanceTimersByTimeAsync(600); });

  it('shows actual used quota and reset times, without disabled windows or Claude Code labels', async () => {
    render(<Probe id="gemini-tab" />);
    await advance();
    expect(screen.getByTestId('agy-usage-week')).toHaveTextContent('Sem⏳ 1h'); // used up → time left, not 100%
    expect(screen.queryByTestId('agy-usage-5h')).not.toBeInTheDocument();
    expect(screen.getByTestId('antigravity-usage').title).toContain('Uso de Antigravity · Gemini Models');
    expect(screen.getByTestId('antigravity-usage').title).toContain('se reinicia');
    expect(window.electronAPI!.agyUsage).toHaveBeenCalledWith('gemini-tab', false);
  });

  it('refreshes after replies and switches quota groups when the model changes', async () => {
    render(<Probe id="a1" />);
    await advance();
    act(() => emit({ id: 'a1', type: 'message', message: { type: 'result' } }));
    await advance();
    expect(window.electronAPI!.agyUsage).toHaveBeenLastCalledWith('a1', true);
    vi.mocked(window.electronAPI!.agyUsage!).mockResolvedValue(claude);
    act(() => emit({ id: 'a1', type: 'applied_settings', model: 'claude-sonnet', effort: null }));
    expect(screen.queryByTestId('agy-usage-week')).not.toBeInTheDocument();
    await advance();
    expect(screen.getByTestId('agy-usage-week')).toHaveTextContent('53%');
    expect(screen.getByTestId('agy-usage-5h')).toHaveTextContent('5%');
  });

  it('never leaks usage across tabs or accepts a response for an old model', async () => {
    let finish!: (value: any) => void;
    vi.mocked(window.electronAPI!.agyUsage!).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { rerender } = render(<Probe id="a1" />);
    await advance();
    act(() => emit({ id: 'a1', type: 'applied_settings', model: 'claude-sonnet', effort: null }));
    await act(async () => finish(gemini));
    expect(screen.queryByTestId('agy-usage-week')).not.toBeInTheDocument();
    vi.mocked(window.electronAPI!.agyUsage!).mockResolvedValue(claude);
    await advance();
    expect(screen.getByTestId('agy-usage-week')).toHaveTextContent('53%');
    rerender(<Probe id="a2" />);
    expect(screen.queryByTestId('agy-usage-week')).not.toBeInTheDocument();
    expect(off).toHaveBeenCalled();
  });

  it('does not poll without an Antigravity tab and stops polling after leaving it', async () => {
    const { rerender } = render(<Probe />);
    await advance();
    expect(window.electronAPI!.agyUsage).not.toHaveBeenCalled();
    rerender(<Probe id="a1" />);
    await advance();
    rerender(<Probe />);
    await act(async () => { await vi.advanceTimersByTimeAsync(130000); });
    expect(window.electronAPI!.agyUsage).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable quota honestly and marks the last successful reading when refresh fails', async () => {
    vi.mocked(window.electronAPI!.agyUsage!).mockRejectedValueOnce(new Error('offline'));
    render(<Probe id="a1" />);
    await advance();
    expect(screen.getByText('Uso no disponible')).toBeInTheDocument();
    act(() => emit({ id: 'a1', type: 'message', message: { type: 'result' } }));
    await advance();
    vi.mocked(window.electronAPI!.agyUsage!).mockResolvedValueOnce({ success: false, error: 'offline' });
    act(() => emit({ id: 'a1', type: 'message', message: { type: 'result' } }));
    await advance();
    expect(screen.getByTestId('agy-usage-week')).toHaveTextContent('⏳ 1h');
    expect(screen.getByTestId('antigravity-usage').title).toContain('Última lectura disponible');
  });
});
