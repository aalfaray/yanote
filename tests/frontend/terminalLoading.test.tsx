import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TerminalView } from '../../src/components/TerminalView';

vi.mock('@xterm/xterm', () => ({ Terminal: class {
  cols = 80; rows = 24; options = {};
  loadAddon() {} open() {} attachCustomKeyEventHandler() {} write() {} writeln() {} dispose() {} focus() {}
  onData() { return { dispose() {} }; }
  onResize() { return { dispose() {} }; }
} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));

describe('Terminal initial loading', () => {
  it.each([true, false])('ends the skeleton when process creation succeeds=%s', async (success) => {
    let finish!: (value: any) => void;
    window.electronAPI = { termCreate: vi.fn(() => new Promise((resolve) => { finish = resolve; })) } as any;
    render(<TerminalView tabId="t1" shell="powershell" isActive isDarkMode={false} />);
    expect(screen.getByRole('status', { name: 'Iniciando terminal' })).toBeInTheDocument();
    await act(async () => finish({ success, error: success ? undefined : 'shell failed' }));
    expect(screen.queryByRole('status', { name: 'Iniciando terminal' })).not.toBeInTheDocument();
  });

  it('ends loading and reports a rejected process-creation request', async () => {
    window.electronAPI = { termCreate: vi.fn().mockRejectedValue(new Error('IPC failed')) } as any;
    render(<TerminalView tabId="t1" shell="powershell" isActive isDarkMode={false} />);
    expect(await screen.findByText('No se pudo iniciar la terminal')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Iniciando terminal' })).not.toBeInTheDocument();
  });
});
