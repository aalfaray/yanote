import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaudeAccountMenu, describeAccountStatus } from '../../src/components/ClaudeAccountMenu';

const accounts = [
  { id: 'default', name: 'Principal', configDir: null, isDefault: true },
  { id: 'acc-b', name: 'Trabajo', configDir: 'C:\\d\\acc-b', isDefault: false },
];

describe('ClaudeAccountMenu', () => {
  let api: any;
  beforeEach(() => {
    api = {
      list: vi.fn(async () => ({ accounts, activeId: 'default' })),
      status: vi.fn(async (id: string) =>
        id === 'default' ? { success: true, loggedIn: true, email: 'yo@ejemplo.com', plan: 'pro' } : { success: true, loggedIn: false }
      ),
      add: vi.fn(async (name: string) => ({ id: 'acc-c', name, configDir: 'C:\\d\\acc-c', isDefault: false })),
      remove: vi.fn(async () => true),
    };
    window.electronAPI = { claudeAccounts: api } as any;
  });

  const renderMenu = (currentId = 'default') => {
    const props = { onClose: vi.fn(), onSwitch: vi.fn(), onLogin: vi.fn() };
    render(<ClaudeAccountMenu currentId={currentId} {...props} />);
    return props;
  };

  it('lists the accounts with who is signed in and the plan', async () => {
    renderMenu();
    expect(await screen.findByText('yo@ejemplo.com · Pro')).toBeInTheDocument();
    expect(await screen.findByText('Sin iniciar sesión')).toBeInTheDocument();
    expect(screen.getByTitle('Cuenta actual de este chat')).toBeDisabled();
  });

  it('switches to a signed-in account and asks to sign in to the others', async () => {
    const props = renderMenu('acc-b');
    fireEvent.click(await screen.findByTitle('Continuar este chat con Principal'));
    expect(props.onSwitch).toHaveBeenCalledWith(accounts[0]);
    await screen.findByText('Sin iniciar sesión');
    // current account (signed out) still offers "Entrar"
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }));
    expect(props.onLogin).toHaveBeenCalledWith(accounts[1]);
  });

  it('adds an account and starts its sign-in right away', async () => {
    const props = renderMenu();
    fireEvent.click(await screen.findByText('Agregar otra cuenta'));
    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), { target: { value: 'Personal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(props.onLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-c', name: 'Personal' })));
    expect(api.add).toHaveBeenCalledWith('Personal');
  });

  it('removes an extra account only after confirming; the main one cannot be removed', async () => {
    renderMenu();
    await screen.findByText('Sin iniciar sesión');
    expect(screen.queryByLabelText('Quitar Principal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Quitar Trabajo'));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('acc-b'));
  });

  it('describes each status in plain words', () => {
    expect(describeAccountStatus(undefined)).toBe('Comprobando…');
    expect(describeAccountStatus({ success: false, error: 'No encontré Claude Code' })).toBe('No encontré Claude Code');
    expect(describeAccountStatus({ success: true, loggedIn: true, method: 'api_key' })).toBe('API key');
    expect(describeAccountStatus({ success: true, loggedIn: true, email: 'a@b.c', plan: 'max' })).toBe('a@b.c · Max');
  });
});
