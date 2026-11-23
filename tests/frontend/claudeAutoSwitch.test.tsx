import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClaudeChatView } from '../../src/components/ClaudeChatView';
import { ClaudeAccountMenu } from '../../src/components/ClaudeAccountMenu';
import { pickAccountWithQuota, quotaHeadroom } from '../../src/lib/claudeUsage';
import { loadChatPrefs } from '../../src/lib/claudeChatPrefs';

const now = new Date(2026, 10, 14, 12, 0);
const later = new Date(2026, 10, 14, 15, 0).toISOString();
const earlier = new Date(2026, 10, 14, 10, 0).toISOString();
const usage = (five: number, week: number, fiveReset = later) => ({
  success: true, available: true, plan: 'pro',
  fiveHour: { percent: five, resetsAt: fiveReset }, weekly: { percent: week, resetsAt: later },
});

describe('Choosing the account to continue with when one hits its limit', () => {
  it('measures the room left by the most-used window and rules out unusable accounts', () => {
    expect(quotaHeadroom(usage(5, 83), now)).toBe(17);
    expect(quotaHeadroom(usage(100, 8), now)).toBeNull();
    // The 5-hour window already reset: only the weekly one counts
    expect(quotaHeadroom(usage(100, 40, earlier), now)).toBe(60);
    expect(quotaHeadroom({ success: false, error: 'Sin iniciar sesión' }, now)).toBeNull();
    expect(quotaHeadroom({ success: true, available: false }, now)).toBeNull();
    expect(quotaHeadroom(null, now)).toBeNull();
  });

  it('picks the account with the most room, or none when all are used up', () => {
    expect(pickAccountWithQuota([
      { id: 'a', usage: usage(100, 8) },
      { id: 'b', usage: usage(5, 83) },
      { id: 'c', usage: usage(30, 20) },
      { id: 'd', usage: null },
    ], now)).toBe('c');
    expect(pickAccountWithQuota([{ id: 'a', usage: usage(100, 8) }, { id: 'b', usage: usage(10, 100) }], now)).toBeNull();
    expect(pickAccountWithQuota([], now)).toBeNull();
  });
});

describe('ClaudeChatView switches accounts by itself when the limit is hit', () => {
  let emit: (e: any) => void;
  let api: any;
  const accounts = [
    { id: 'default', name: 'Principal', configDir: '', isDefault: true },
    { id: 'p1', name: 'Personal 1', configDir: '' },
    { id: 'p2', name: 'Robert', configDir: '' },
  ];

  beforeEach(() => {
    localStorage.clear();
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    const quota = (five: number, week: number) => ({ success: true, available: true, fiveHour: { percent: five, resetsAt: future }, weekly: { percent: week, resetsAt: future } });
    api = {
      claudeStart: vi.fn(async () => ({ success: true, executable: 'claude' })),
      claudeStop: vi.fn(),
      claudeSend: vi.fn(async () => ({ success: true })),
      claudeInterrupt: vi.fn(),
      claudeSetPermissionMode: vi.fn(async () => ({ success: true })),
      onClaudeEvent: vi.fn((cb: any) => {
        emit = cb;
        return () => {};
      }),
      claudeAccounts: {
        list: vi.fn(async () => ({ accounts, activeId: 'default' })),
        status: vi.fn(async () => ({ success: true, loggedIn: true })),
        usage: vi.fn(async (id: string) => ({ default: quota(100, 93), p1: quota(0, 100), p2: quota(5, 83) } as any)[id]),
        setActive: vi.fn(async () => true),
        copySession: vi.fn(async () => ({ success: true, copied: true })),
      },
    };
    window.electronAPI = api;
  });

  const hitLimit = async (tabId: string) => {
    render(<ClaudeChatView tabId={tabId} isActive accountId="default" />);
    await waitFor(() => expect(api.claudeStart).toHaveBeenCalledTimes(1));
    const box = screen.getByLabelText('Mensaje para Claude');
    fireEvent.change(box, { target: { value: 'revisa el roadmap' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(api.claudeSend).toHaveBeenCalledTimes(1));
    act(() => {
      emit({ id: tabId, type: 'message', message: { type: 'system', subtype: 'init', session_id: 'sesion-1' } });
      emit({ id: tabId, type: 'message', message: { type: 'assistant', error: 'rate_limit', message: { id: 'm', content: [{ type: 'text', text: "You've hit your limit" }] } } });
      emit({ id: tabId, type: 'message', message: { type: 'result', subtype: 'error_during_execution', is_error: true } });
    });
  };

  const turnOn = () => localStorage.setItem('yanote.claude.chatPrefs', JSON.stringify({ autoSwitchAccount: true }));

  it('moves the conversation to the account with quota left and carries on there', async () => {
    turnOn();
    await hitLimit('c1');

    // Personal 1 has its weekly window used up: Robert is the one with room
    await waitFor(() => expect(api.claudeAccounts.copySession).toHaveBeenCalledWith('sesion-1', 'default', 'p2'));
    expect(api.claudeAccounts.usage).toHaveBeenCalledWith('p1', true);
    expect(api.claudeAccounts.usage).not.toHaveBeenCalledWith('default', true);
    await waitFor(() => expect(api.claudeStart).toHaveBeenCalledTimes(2));
    expect(api.claudeStart).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 'p2', resume: 'sesion-1' }));
    expect(api.claudeAccounts.setActive).toHaveBeenCalledWith('p2');
    expect(await screen.findByText(/llegó a su límite de uso: sigo con la cuenta Robert/)).toBeInTheDocument();

    await waitFor(() => expect(api.claudeSend).toHaveBeenCalledTimes(2));
    expect(api.claudeSend).toHaveBeenLastCalledWith('c1', { text: expect.stringMatching(/^Continúa con lo que estabas haciendo/), images: [] });
    expect(screen.queryByTestId('rate-limit-card')).not.toBeInTheDocument();
  });

  it('stays put and says so when no other account has quota', async () => {
    api.claudeAccounts.usage = vi.fn(async (id: string) => (id === 'p1'
      ? { success: false, error: 'Sin iniciar sesión' }
      : { success: true, available: true, fiveHour: { percent: 100, resetsAt: new Date(Date.now() + 3600_000).toISOString() }, weekly: null }));
    turnOn();
    await hitLimit('c2');

    expect(await screen.findByText(/Ninguna otra cuenta con sesión iniciada tiene cuota disponible/)).toBeInTheDocument();
    expect(screen.getByTestId('rate-limit-card')).toBeInTheDocument();
    expect(api.claudeAccounts.copySession).not.toHaveBeenCalled();
    expect(api.claudeStart).toHaveBeenCalledTimes(1);
  });

  it('is off until the user turns it on: by default it only offers the manual switch', async () => {
    await hitLimit('c3');
    expect(await screen.findByTestId('rate-limit-card')).toBeInTheDocument();
    expect(screen.getByTestId('auto-switch-hint')).toHaveTextContent(/actívalo en «Cambiar de cuenta»/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(api.claudeAccounts.usage).not.toHaveBeenCalled();
    expect(api.claudeAccounts.copySession).not.toHaveBeenCalled();
    expect(api.claudeStart).toHaveBeenCalledTimes(1);
  });

  it('the account menu turns it on and off, and the choice is remembered', () => {
    const first = render(<ClaudeAccountMenu currentId="default" onClose={() => {}} onSwitch={() => {}} onLogin={() => {}} />);
    const toggle = screen.getByRole('checkbox', { name: /Cambiar de cuenta automáticamente/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(loadChatPrefs().autoSwitchAccount).toBe(true);
    first.unmount();

    render(<ClaudeAccountMenu currentId="default" onClose={() => {}} onSwitch={() => {}} onLogin={() => {}} />);
    const again = screen.getByRole('checkbox', { name: /Cambiar de cuenta automáticamente/ });
    expect(again).toBeChecked();
    fireEvent.click(again);
    expect(loadChatPrefs().autoSwitchAccount).toBe(false);
  });
});
