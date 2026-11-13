import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  it('shows each account quota separately and prevents switching to an exhausted account', async () => {
    api.status.mockResolvedValue({ success: true, loggedIn: true, plan: 'pro' });
    api.usage = vi.fn(async (id: string) => ({ success: true, available: true,
      fiveHour: { percent: id === 'default' ? 100 : 12, resetsAt: '2099-01-01T00:00:00Z' },
      weekly: { percent: id === 'default' ? 20 : 34, resetsAt: null },
    }));
    const props = renderMenu('acc-b');
    expect(await screen.findByTestId('account-5h-default')).toHaveTextContent('100%');
    expect(await screen.findByTestId('account-5h-acc-b')).toHaveTextContent('12%');
    expect(screen.getByTestId('account-week-acc-b')).toHaveTextContent('34%');
    expect(screen.getByTitle('Cuenta sin cuota disponible')).toBeDisabled();
    fireEvent.click(screen.getByTitle('Cuenta sin cuota disponible'));
    expect(props.onSwitch).not.toHaveBeenCalled();
    expect(screen.getByText('Límite alcanzado')).toBeInTheDocument();
    expect(screen.getByTestId('account-usage-default').title).toContain('se reinicia');
  });

  it('shows a skeleton while checking quota, keeps old bars during refresh, and allows a recovered account', async () => {
    let finish!: (usage: any) => void;
    api.usage = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderMenu('acc-b');
    expect(await screen.findByRole('status', { name: 'Cargando uso de Principal' })).toBeInTheDocument();
    await act(async () => finish({ success: true, available: true, weekly: { percent: 100, resetsAt: null } }));
    expect(screen.getByTitle('Cuenta sin cuota disponible')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Actualizar uso de las cuentas'));
    expect(screen.getByTestId('account-week-default')).toHaveTextContent('100%');
    await act(async () => finish({ success: true, available: true, weekly: { percent: 40, resetsAt: null } }));
    expect(screen.getByTitle('Continuar este chat con Principal')).toBeEnabled();
    expect(screen.getByTestId('account-week-default')).toHaveTextContent('40%');
  });

  it('does not display a fake zero when usage is unavailable or query signed-out accounts', async () => {
    api.usage = vi.fn().mockRejectedValue(new Error('offline'));
    renderMenu();
    expect(await screen.findByText('Uso no disponible')).toBeInTheDocument();
    expect(api.usage).toHaveBeenCalledWith('default', false);
    expect(api.usage).not.toHaveBeenCalledWith('acc-b', expect.anything());
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('signs an account out after confirming, warning that the main one is the whole PC', async () => {
    api.logout = vi.fn(async () => ({ success: true }));
    renderMenu('acc-b');
    await screen.findByText('yo@ejemplo.com · Pro');
    fireEvent.click(screen.getByLabelText('Cerrar la sesión de Principal'));
    expect(screen.getByText(/en todo tu PC/)).toBeInTheDocument();
    expect(api.logout).not.toHaveBeenCalled();
    api.status.mockImplementation(async () => ({ success: true, loggedIn: false }));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    await waitFor(() => expect(api.logout).toHaveBeenCalledWith('default'));
    await waitFor(() => expect(screen.getAllByText('Sin iniciar sesión')).toHaveLength(2));
  });

  it('shows why a sign-out failed, and can be cancelled', async () => {
    api.logout = vi.fn(async () => ({ success: false, error: 'sin conexión' }));
    renderMenu('acc-b');
    await screen.findByText('yo@ejemplo.com · Pro');
    fireEvent.click(screen.getByLabelText('Cerrar la sesión de Principal'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/en todo tu PC/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Cerrar la sesión de Principal'));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar la sesión de Principal: sin conexión');
  });
});
