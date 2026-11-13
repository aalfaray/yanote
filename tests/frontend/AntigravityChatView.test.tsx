import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ClaudeChatView } from '../../src/components/ClaudeChatView';

describe('Antigravity session lifecycle', () => {
  let api: any;
  let emit: (event: any) => void;
  beforeEach(() => {
    api = {
      agyStart: vi.fn().mockResolvedValue({ success: true }),
      agyStop: vi.fn(),
      agySend: vi.fn().mockResolvedValue({ success: true }),
      onAgyEvent: vi.fn((cb: any) => { emit = cb; return () => {}; }),
    };
    window.electronAPI = api;
  });

  it('waits for startup before sending, including with Enter', async () => {
    let ready!: (value: any) => void;
    api.agyStart.mockImplementation(() => new Promise((resolve) => { ready = resolve; }));
    render(<ClaudeChatView tabId="a1" provider="antigravity" isActive />);
    expect(screen.getByRole('status', { name: 'Iniciando Antigravity' })).toHaveAttribute('aria-busy', 'true');
    const box = screen.getByLabelText('Mensaje para Antigravity');
    fireEvent.change(box, { target: { value: 'hola' } });
    expect(screen.getByLabelText('Enviar')).toBeDisabled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(api.agySend).not.toHaveBeenCalled();
    await act(async () => ready({ success: true }));
    expect(screen.queryByRole('status', { name: 'Iniciando Antigravity' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Enviar')).toBeEnabled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(api.agySend).toHaveBeenCalledWith('a1', { text: 'hola', images: [] });
  });

  it.each(['rejected result', 'IPC rejection'])('stops the spinner, preserves the draft and allows resume after %s', async (failure) => {
    if (failure === 'IPC rejection') api.agySend.mockRejectedValueOnce(new Error('connection lost'));
    else api.agySend.mockResolvedValueOnce({ success: false, error: 'session inactive' });
    render(<ClaudeChatView tabId="a1" provider="antigravity" isActive />);
    const box = screen.getByLabelText('Mensaje para Antigravity');
    fireEvent.change(box, { target: { value: 'hola' } });
    await waitFor(() => expect(screen.getByLabelText('Enviar')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Enviar'));
    const resume = await screen.findByText('Reanudar');
    expect(screen.queryByText('Trabajando…')).not.toBeInTheDocument();
    expect(box).toHaveValue('hola');
    fireEvent.click(resume);
    await waitFor(() => expect(api.agyStart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('Enviar')).toBeEnabled());
    expect(screen.queryByText('Reanudar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Enviar'));
    expect(api.agySend).toHaveBeenCalledTimes(2);
  });

  it.each(['failed result', 'IPC rejection'])('offers resume when startup fails with %s', async (failure) => {
    if (failure === 'IPC rejection') api.agyStart.mockRejectedValueOnce(new Error('startup failed'));
    else api.agyStart.mockResolvedValueOnce({ success: false, error: 'startup failed' });
    render(<ClaudeChatView tabId="a1" provider="antigravity" isActive />);
    expect(await screen.findByText('Reanudar')).toBeInTheDocument();
    expect(screen.getByLabelText('Enviar')).toBeDisabled();
    expect(screen.getByText(/No se pudo iniciar Antigravity/)).toBeInTheDocument();
  });

  it('allows resuming the same session after process exit', async () => {
    render(<ClaudeChatView tabId="a1" provider="antigravity" isActive />);
    await act(async () => {});
    act(() => emit({ id: 'a1', type: 'message', message: { type: 'system', subtype: 'init', session_id: 'saved-session' } }));
    act(() => emit({ id: 'a1', type: 'exit', code: 1 }));
    fireEvent.click(screen.getByText('Reanudar'));
    await waitFor(() => expect(api.agyStart).toHaveBeenLastCalledWith(expect.objectContaining({ resume: 'saved-session' })));
    await waitFor(() => expect(screen.getByLabelText('Mensaje para Antigravity')).toBeEnabled());
  });
});
