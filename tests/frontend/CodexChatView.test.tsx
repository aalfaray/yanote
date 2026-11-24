import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClaudeChatView } from '../../src/components/ClaudeChatView';
import { TabBar } from '../../src/components/TabBar';
import { toSavedTabs, restoreTab } from '../../src/lib/session';

describe('Codex chat integration', () => {
  let api: any;
  let emit: (event: any) => void;
  beforeEach(() => {
    api = {
      codexStart: vi.fn().mockResolvedValue({ success: true }),
      codexStop: vi.fn(),
      codexSend: vi.fn().mockResolvedValue({ success: true }),
      codexInterrupt: vi.fn().mockResolvedValue({ success: true }),
      codexSetPermissionMode: vi.fn().mockResolvedValue({ success: true }),
      onCodexEvent: vi.fn((cb: any) => { emit = cb; return () => {}; }),
      claudeStart: vi.fn(), agyStart: vi.fn(),
    };
    window.electronAPI = api;
  });

  it('opens Codex from the new-tab menu and preserves the provider across restarts', () => {
    const onNewClaude = vi.fn();
    render(<TabBar tabs={[]} activeTabId="" onSelectTab={vi.fn()} onCloseTab={vi.fn()} onNewTab={vi.fn()} onNewClaude={onNewClaude} />);
    fireEvent.click(screen.getByTitle(/Elegir tipo de pestaña nueva/));
    fireEvent.click(screen.getByRole('menuitem', { name: /Chat con Codex/ }));
    expect(onNewClaude).toHaveBeenCalledWith('codex');
    const [saved] = toSavedTabs([{ id: 'c', title: 'Codex', kind: 'claude', provider: 'codex', path: null, content: '', sessionId: 'saved-id' }]);
    expect(restoreTab(saved, 'restored')).toMatchObject({ provider: 'codex', sessionId: 'saved-id' });
  });

  it('sends through Codex only, changes its sandbox and stops an active turn', async () => {
    render(<ClaudeChatView tabId="c" provider="codex" isActive />);
    await waitFor(() => expect(screen.getByLabelText('Enviar')).toBeDisabled());
    expect(api.codexStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'c', permissionMode: 'read-only' }));
    act(() => emit({ id: 'c', type: 'capabilities', commands: [], models: [], modes: [{ id: 'read-only', name: 'Solo lectura' }, { id: 'workspace-write', name: 'Editar carpeta' }] }));
    fireEvent.change(screen.getByLabelText('Modo de permisos'), { target: { value: 'workspace-write' } });
    expect(api.codexSetPermissionMode).toHaveBeenCalledWith('c', 'workspace-write');
    fireEvent.change(screen.getByLabelText('Mensaje para Codex'), { target: { value: 'Implementa' } });
    await waitFor(() => expect(screen.getByLabelText('Enviar')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Enviar'));
    expect(api.codexSend).toHaveBeenCalledWith('c', { text: 'Implementa', images: [] });
    fireEvent.click(screen.getByLabelText('Detener'));
    expect(api.codexInterrupt).toHaveBeenCalledWith('c');
    expect(api.claudeStart).not.toHaveBeenCalled();
    expect(api.agyStart).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Cuenta de Claude/)).not.toBeInTheDocument();
  });

  it('loads the saved Codex transcript and opens Codex login without touching Claude accounts', async () => {
    api.codexHistory = vi.fn().mockResolvedValue([{ type: 'assistant', message: { id: 'old', content: [{ type: 'text', text: 'Respuesta anterior' }] } }]);
    const onProviderLogin = vi.fn();
    const onLogin = vi.fn();
    render(<ClaudeChatView tabId="c" provider="codex" resumeSessionId="saved-id" isActive onProviderLogin={onProviderLogin} onLogin={onLogin} />);
    expect(await screen.findByText('Respuesta anterior')).toBeInTheDocument();
    expect(api.codexHistory).toHaveBeenCalledWith('saved-id');
    fireEvent.click(screen.getByLabelText('Iniciar sesión en Codex'));
    expect(onProviderLogin).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
    act(() => emit({ id: 'c', type: 'message', message: { type: 'assistant', error: 'authentication_failed', message: { content: [] } } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Iniciar sesión en Codex');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Anthropic');
  });
});
