import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ClaudeChatView } from '../../src/components/ClaudeChatView';
import { installMobileActions, toMobileItems } from '../../src/lib/mobileMirror';
import type { ChatItem } from '../../src/lib/claudeChat';

describe('chat tabs on the phone (Orca Mobile)', () => {
  let api: any;
  let emit: (event: any) => void;
  let phone: (action: any) => void;
  let uninstall: () => void;
  const lastSnapshot = () => api.mobilePublishChat.mock.calls.at(-1)?.[1];

  beforeEach(() => {
    api = {
      agyStart: vi.fn().mockResolvedValue({ success: true }),
      agyStop: vi.fn(),
      agySend: vi.fn().mockResolvedValue({ success: true }),
      agyRespondPermission: vi.fn(),
      agyInterrupt: vi.fn().mockResolvedValue({ success: true }),
      onAgyEvent: vi.fn((cb: any) => { emit = cb; return () => {}; }),
      mobilePublishChat: vi.fn(),
      mobileActionResult: vi.fn(),
      onMobileAction: vi.fn((cb: any) => { phone = cb; return () => {}; }),
    };
    window.electronAPI = api;
    uninstall = installMobileActions();
  });
  afterEach(() => uninstall());

  it('runs phone messages, approvals and stops through the tab, and mirrors the transcript', async () => {
    render(<ClaudeChatView tabId="a1" provider="antigravity" isActive />);
    await waitFor(() => expect(lastSnapshot()?.meta).toMatchObject({ starting: false, ended: false }));

    await act(async () => phone({ reqId: 1, type: 'send', tabId: 'a1', text: 'Escrito en el teléfono' }));
    await waitFor(() => expect(api.mobileActionResult).toHaveBeenCalledWith(1, { success: true }));
    expect(api.agySend).toHaveBeenCalledWith('a1', { text: 'Escrito en el teléfono', images: [] });
    // The desktop shows it like a typed message
    expect(screen.getByText('Escrito en el teléfono')).toBeInTheDocument();

    act(() => emit({ id: 'a1', type: 'permission', requestId: 'perm-1', toolName: 'Bash', input: { command: 'npm test' } }));
    await waitFor(() => expect(lastSnapshot().items).toContainEqual(expect.objectContaining({ kind: 'permission', id: 'perm-1', summary: 'npm test', status: 'pending' })));
    await act(async () => phone({ reqId: 2, type: 'decide', tabId: 'a1', requestId: 'perm-1', behavior: 'allow' }));
    expect(api.agyRespondPermission).toHaveBeenCalledWith('a1', 'perm-1', { behavior: 'allow' });
    await waitFor(() => expect(lastSnapshot().items).toContainEqual(expect.objectContaining({ id: 'perm-1', status: 'allowed' })));

    await act(async () => phone({ reqId: 3, type: 'interrupt', tabId: 'a1' }));
    expect(api.agyInterrupt).toHaveBeenCalledWith('a1');
    expect(api.mobileActionResult).toHaveBeenCalledWith(3, { success: true });
    expect(lastSnapshot().items[0]).toMatchObject({ kind: 'user', text: 'Escrito en el teléfono' });
  });

  it('refuses phone messages while the chat starts or after it ended, and for closed tabs', async () => {
    let ready!: (value: any) => void;
    api.agyStart.mockImplementation(() => new Promise((resolve) => { ready = resolve; }));
    render(<ClaudeChatView tabId="a1" provider="antigravity" isActive />);
    await act(async () => phone({ reqId: 1, type: 'send', tabId: 'a1', text: 'pronto' }));
    expect(api.mobileActionResult).toHaveBeenCalledWith(1, { success: false, error: 'El chat todavía se está iniciando' });
    await act(async () => ready({ success: true }));
    act(() => emit({ id: 'a1', type: 'exit' }));
    await act(async () => phone({ reqId: 2, type: 'send', tabId: 'a1', text: 'tarde' }));
    expect(api.mobileActionResult).toHaveBeenCalledWith(2, expect.objectContaining({ success: false }));
    expect(api.agySend).not.toHaveBeenCalled();

    await act(async () => phone({ reqId: 3, type: 'interrupt', tabId: 'otra' }));
    expect(api.mobileActionResult).toHaveBeenCalledWith(3, { success: false, error: 'Ese chat ya no está abierto en yanote' });
  });

  it('hands a note saved from the phone to the app', async () => {
    uninstall();
    const onNoteSaved = vi.fn();
    uninstall = installMobileActions(onNoteSaved);
    await act(async () => phone({ reqId: 9, type: 'noteSaved', path: 'C:\\notas\\idea.md', content: 'nuevo' }));
    expect(onNoteSaved).toHaveBeenCalledWith('C:\\notas\\idea.md', 'nuevo');
    expect(api.mobileActionResult).toHaveBeenCalledWith(9, { success: true });
  });

  it('keeps the phone copy small: no subagent items and clipped tool output', () => {
    const items: ChatItem[] = [
      { kind: 'tool', id: 't1', name: 'Bash', input: { command: 'ls' }, partialInput: '', parentToolUseId: null, result: { text: 'x'.repeat(5000), isError: false } },
      { kind: 'text', id: 'sub', msgId: 'm', text: 'interno', streaming: false, final: true, parentToolUseId: 't1' },
    ];
    const mobile = toMobileItems(items);
    expect(mobile).toHaveLength(1);
    expect(mobile[0]).toMatchObject({ kind: 'tool', summary: 'ls', done: true });
    expect((mobile[0] as { result: string }).result.length).toBeLessThan(1600);
  });
});
