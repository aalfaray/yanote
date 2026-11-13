import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { App } from '../../src/App';
import { SettingsModal } from '../../src/components/SettingsModal';
import { ClaudeAccountMenu } from '../../src/components/ClaudeAccountMenu';
import { ClaudeChatView } from '../../src/components/ClaudeChatView';
import { IdeasDrawer } from '../../src/components/IdeasDrawer';
import { RecentFilesDrawer } from '../../src/components/RecentFilesDrawer';

vi.mock('../../src/components/Editor', () => ({ Editor: ({ markdown }: any) => <textarea data-testid="note" value={markdown} readOnly /> }));
vi.mock('../../src/components/TerminalView', () => ({ TerminalView: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settingsProps = { isOpen: true, onClose: vi.fn(), onConfigChanged: vi.fn() };

describe('Initial content skeletons', () => {
  it('keeps the editor placeholder until the saved session is loaded, then reveals the pending text', async () => {
    const config = deferred<any>();
    window.electronAPI = { getAppConfig: vi.fn(() => config.promise), saveAppConfig: vi.fn().mockResolvedValue({}), getNotesPath: vi.fn().mockResolvedValue('/notes') } as any;
    render(<App />);
    expect(screen.getByRole('status', { name: 'Restaurando sesión' })).toBeInTheDocument();
    expect(screen.queryByTestId('note')).not.toBeInTheDocument();
    await act(async () => config.resolve({ openTabs: [{ kind: 'scratch', title: 'draft.md', content: 'pending text' }] }));
    expect(screen.queryByRole('status', { name: 'Restaurando sesión' })).not.toBeInTheDocument();
    expect(screen.getByTestId('note')).toHaveValue('pending text');
  });

  it('does not expose editable default settings during initial loading and preserves them on refresh', async () => {
    const config = deferred<any>();
    window.electronAPI = { getAppConfig: vi.fn(() => config.promise) } as any;
    const { rerender } = render(<SettingsModal {...settingsProps} />);
    expect(screen.getByRole('status', { name: 'Cargando ajustes' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Guardar Ajustes')).toBeDisabled();
    await act(async () => config.resolve({ darkMode: true }));
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    rerender(<SettingsModal {...settingsProps} isOpen={false} />);
    const refresh = deferred<any>();
    vi.mocked(window.electronAPI!.getAppConfig).mockReturnValue(refresh.promise);
    rerender(<SettingsModal {...settingsProps} />);
    expect(screen.queryByRole('status', { name: 'Cargando ajustes' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    expect(screen.getByText('Guardar Ajustes')).toBeDisabled();
    await act(async () => refresh.resolve({ darkMode: true }));
    expect(screen.getByText('Guardar Ajustes')).toBeEnabled();
  });

  it.each([true, false])('preserves the current note while opening a file, including cancellation (opened=%s)', async (opened) => {
    const picker = deferred<any>();
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({ openTabs: [{ kind: 'scratch', title: 'current.md', content: 'current text' }] }),
      saveAppConfig: vi.fn().mockResolvedValue({}), getNotesPath: vi.fn().mockResolvedValue('/notes'),
      openMarkdownFile: vi.fn(() => picker.promise),
    } as any;
    render(<App />);
    expect(await screen.findByTestId('note')).toHaveValue('current text');
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    expect(screen.getByRole('status', { name: 'Abriendo archivos' })).toBeInTheDocument();
    expect(screen.getByTestId('note')).toHaveValue('current text');
    await act(async () => picker.resolve(opened ? { files: [{ path: '/next.md', name: 'next.md', content: 'next text' }], errors: [] } : null));
    expect(screen.queryByRole('status', { name: 'Abriendo archivos' })).not.toBeInTheDocument();
    expect(screen.getByTestId('note')).toHaveValue(opened ? 'next text' : 'current text');
  });

  it('ends the settings skeleton on error and prevents saving unloaded defaults', async () => {
    window.electronAPI = { getAppConfig: vi.fn().mockRejectedValue(new Error('offline')) } as any;
    render(<SettingsModal {...settingsProps} />);
    expect(await screen.findByText(/No se pudieron cargar los ajustes/)).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando ajustes' })).not.toBeInTheDocument();
    expect(screen.getByText('Guardar Ajustes')).toBeDisabled();
  });

  it('loads account rows and their authentication status independently, settling errors', async () => {
    const list = deferred<any>();
    const status = deferred<any>();
    window.electronAPI = { claudeAccounts: { list: vi.fn(() => list.promise), status: vi.fn(() => status.promise) } } as any;
    render(<ClaudeAccountMenu currentId="default" onClose={vi.fn()} onSwitch={vi.fn()} onLogin={vi.fn()} />);
    expect(screen.getByRole('status', { name: 'Cargando cuentas de Claude' })).toBeInTheDocument();
    await act(async () => list.resolve({ accounts: [{ id: 'work', name: 'Trabajo' }] }));
    expect(screen.getByRole('status', { name: 'Comprobando cuenta Trabajo' })).toBeInTheDocument();
    await act(async () => status.reject(new Error('offline')));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('No se pudo comprobar la cuenta')).toBeInTheDocument();
  });

  it('shows a history skeleton until the transcript arrives, even if the process already started', async () => {
    const history = deferred<any>();
    window.electronAPI = { claudeStart: vi.fn().mockResolvedValue({ success: true }), claudeStop: vi.fn(), claudeHistory: vi.fn(() => history.promise) } as any;
    render(<ClaudeChatView tabId="chat" resumeSessionId="old" isActive />);
    await act(async () => {});
    expect(screen.getByRole('status', { name: 'Cargando historial del chat' })).toBeInTheDocument();
    expect(screen.queryByText('¿En qué te ayudo?')).not.toBeInTheDocument();
    await act(async () => history.resolve([{ type: 'user', message: { content: 'Previous question' } }]));
    expect(screen.getByText('Previous question')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando historial del chat' })).not.toBeInTheDocument();
  });

  it('does not show empty ideas or history messages while startup data is pending', () => {
    const ideas = { isOpen: true, onClose: vi.fn(), ideas: [], onRemove: vi.fn(), onSendToNewChat: vi.fn() };
    const { rerender, unmount } = render(<IdeasDrawer {...ideas} loading />);
    expect(screen.getByRole('status', { name: 'Cargando ideas guardadas' })).toBeInTheDocument();
    expect(screen.queryByText('Aún no guardaste ideas.')).not.toBeInTheDocument();
    rerender(<IdeasDrawer {...ideas} />);
    expect(screen.getByText('Aún no guardaste ideas.')).toBeInTheDocument();
    unmount();
    render(<RecentFilesDrawer isOpen loading onClose={vi.fn()} recentFiles={[]} openPaths={[]} onOpenRecent={vi.fn()} onRemoveRecent={vi.fn()} onClearRecent={vi.fn()} onBrowse={vi.fn()} />);
    expect(screen.getByRole('status', { name: 'Cargando archivos recientes' })).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no abriste/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
  });
});
