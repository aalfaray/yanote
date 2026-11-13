import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClaudeChatView, loadChatPrefs } from '../../src/components/ClaudeChatView';

const models = [
  { value: 'default', displayName: 'Default', description: 'Opus 5.5 · Best', resolvedModel: 'claude-opus-5-5', supportedEffortLevels: ['low', 'medium', 'high'] },
  { value: 'opus', displayName: 'Opus 5.5', description: '', resolvedModel: 'claude-opus-5-5', supportedEffortLevels: ['low', 'medium', 'high'] },
  { value: 'sonnet', displayName: 'Sonnet 5.5', description: '', resolvedModel: 'claude-sonnet-5-5', supportedEffortLevels: ['low', 'medium', 'high'] },
];

describe('ClaudeChatView remembers the selectors for new chats', () => {
  let emit: (e: any) => void;
  let api: any;
  beforeEach(() => {
    localStorage.clear();
    api = {
      claudeStart: vi.fn(async () => ({ success: true, executable: 'claude' })),
      claudeStop: vi.fn(),
      claudeSetModel: vi.fn(async () => ({ success: true })),
      claudeSetEffort: vi.fn(async () => ({ success: true })),
      claudeSetPermissionMode: vi.fn(async () => ({ success: true })),
      claudeDefaults: vi.fn(async () => ({ model: null, effortLevel: null, modelEfforts: {}, effortFromEnv: null })),
      onClaudeEvent: vi.fn((cb: any) => {
        emit = cb;
        return () => {};
      }),
    };
    window.electronAPI = api;
  });

  const open = async (tabId: string) => {
    const view = render(<ClaudeChatView tabId={tabId} isActive />);
    await waitFor(() => expect(api.claudeStart).toHaveBeenCalled());
    act(() => emit({ id: tabId, type: 'capabilities', commands: [], models }));
    return view;
  };

  it('saves the mode, model and effort picked, and the next chat starts with them', async () => {
    const first = await open('c1');
    fireEvent.change(screen.getByLabelText('Modo de permisos'), { target: { value: 'acceptEdits' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'sonnet' } });
    await waitFor(() => expect(api.claudeSetModel).toHaveBeenCalledWith('c1', 'sonnet'));
    fireEvent.change(screen.getByLabelText('Esfuerzo'), { target: { value: 'high' } });
    await waitFor(() => expect(api.claudeSetEffort).toHaveBeenCalledWith('c1', 'high'));
    expect(loadChatPrefs()).toEqual({ mode: 'acceptEdits', model: 'sonnet' });
    first.unmount();

    api.claudeStart.mockClear();
    await open('c2');
    expect(api.claudeStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2', permissionMode: 'acceptEdits', model: 'sonnet' }));
    expect((screen.getByLabelText('Modo de permisos') as HTMLSelectElement).value).toBe('acceptEdits');
    expect((screen.getByLabelText('Modelo') as HTMLSelectElement).value).toBe('sonnet');
    expect((screen.getByLabelText('Esfuerzo') as HTMLSelectElement).value).toBe('high');
  });

  it('drops a remembered model that is no longer offered', async () => {
    localStorage.setItem('yanote.claude.chatPrefs', JSON.stringify({ model: 'modelo-retirado', mode: 'nada' }));
    await open('c3');
    expect(api.claudeStart).toHaveBeenCalledWith(expect.objectContaining({ model: 'modelo-retirado', permissionMode: 'default' }));
    await waitFor(() => expect(api.claudeSetModel).toHaveBeenCalledWith('c3', null));
    expect(loadChatPrefs().model).toBe('');
    expect(await screen.findByText(/ya no está disponible/)).toBeInTheDocument();
  });

  it('a chat opened with sent-over text has it in the box, waiting for the user to send it', async () => {
    api.claudeSend = vi.fn(async () => ({ success: true }));
    render(<ClaudeChatView tabId="c4" isActive initialDraft="Revisa este párrafo" />);
    await waitFor(() => expect(api.claudeStart).toHaveBeenCalled());
    const box = screen.getByLabelText('Mensaje para Claude') as HTMLTextAreaElement;
    expect(box.value).toBe('Revisa este párrafo\n\n');
    await new Promise((r) => setTimeout(r, 50));
    expect(api.claudeSend).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: `${box.value}y dime si hay errores` } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() =>
      expect(api.claudeSend).toHaveBeenCalledWith('c4', { text: 'Revisa este párrafo\n\ny dime si hay errores', images: [] })
    );
  });
});
