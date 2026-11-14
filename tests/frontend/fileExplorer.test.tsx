import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FileExplorer } from '../../src/components/FileExplorer';
import { deriveFileActivity, reportAgent, resolveToolPath, isWithin, type AgentActivity } from '../../src/lib/agentActivity';
import { configureLanguage } from '../../src/lib/i18n';
import type { ChatItem } from '../../src/lib/claudeChat';

const tool = (id: string, name: string, input: Record<string, unknown>, done = true): ChatItem => ({
  kind: 'tool',
  id,
  name,
  input,
  partialInput: '',
  parentToolUseId: null,
  ...(done ? { result: { text: 'ok', isError: false } } : {}),
});

describe('agent activity', () => {
  it('resolves relative tool paths against the chat folder', () => {
    expect(resolveToolPath('src/a.ts', 'C:\\proj')).toBe('C:\\proj\\src\\a.ts');
    expect(resolveToolPath('./b.md', 'C:\\proj\\')).toBe('C:\\proj\\b.md');
    expect(resolveToolPath('D:\\x\\c.md', 'C:\\proj')).toBe('D:\\x\\c.md');
    expect(resolveToolPath('a.md', undefined)).toBe('a.md');
  });

  it('separates files being worked on from files the chat changed', () => {
    const items = [
      tool('1', 'Edit', { file_path: 'C:\\p\\done.ts' }),
      tool('2', 'Read', { file_path: 'C:\\p\\read.ts' }),
      tool('3', 'Write', { file_path: 'now.md' }, false),
      tool('4', 'Bash', { command: 'ls' }),
    ];
    expect(deriveFileActivity(items, 'C:\\p', true)).toEqual({
      activePaths: ['C:\\p\\now.md'],
      touchedPaths: ['C:\\p\\done.ts'],
      currentTool: { name: 'Write', target: 'now.md' },
    });
    // Not running: nothing is "in progress" even if a tool never got its result
    expect(deriveFileActivity(items, 'C:\\p', false).activePaths).toEqual([]);
  });

  it('compares Windows paths ignoring case and slash style', () => {
    expect(isWithin('c:/Proj/src/a.ts', 'C:\\proj')).toBe(true);
    expect(isWithin('C:\\proj', 'C:\\proj\\')).toBe(true);
    expect(isWithin('C:\\project2\\a', 'C:\\proj')).toBe(false);
  });
});

describe('FileExplorer', () => {
  afterEach(() => {
    reportAgent('chat-1', null);
    delete (window as any).electronAPI;
  });

  const setup = (root: string | undefined = 'C:\\proj') => {
    configureLanguage('es');
    let changed: ((c: { root: string; dirs: string[]; git: boolean }) => void) | undefined;
    const listing: Record<string, any[]> = {
      'C:\\proj': [
        { name: 'src', path: 'C:\\proj\\src', isDir: true },
        { name: 'README.md', path: 'C:\\proj\\README.md', isDir: false },
        { name: 'logo.png', path: 'C:\\proj\\logo.png', isDir: false },
      ],
      'C:\\proj\\src': [{ name: 'app.ts', path: 'C:\\proj\\src\\app.ts', isDir: false }],
    };
    const api = {
      treeList: vi.fn(async (dir: string) => ({ success: true, entries: listing[dir] ?? [] })),
      treeGitStatus: vi.fn(async () => ({ success: true, repo: true, branch: 'main', status: { 'C:\\proj\\src\\app.ts': 'M' } })),
      treeWatch: vi.fn(async () => ({ success: true })),
      treeUnwatch: vi.fn(async () => true),
      onTreeChanged: vi.fn((cb) => {
        changed = cb;
        return () => {};
      }),
      claudeInstallInfo: vi.fn(async () => ({ used: 'C:\\Users\\me\\.local\\bin\\claude.exe', source: 'user', user: 'C:\\Users\\me\\.local\\bin\\claude.exe', bundled: null, version: '2.1.0' })),
      openPath: vi.fn(async () => ''),
      revealInExplorer: vi.fn(async () => ({ success: true })),
      treeSelectFolder: vi.fn(async (): Promise<string | null> => 'D:\\work'),
      selectFolder: vi.fn(),
    };
    (window as any).electronAPI = api;
    const props = {
      root,
      followsActiveTab: true,
      onNavigateFolder: vi.fn(),
      tabTitles: { 'chat-1': 'Claude' },
      openPaths: [],
      width: 240,
      onResize: vi.fn(),
      onClose: vi.fn(),
      onOpenNote: vi.fn(),
      onFocusTab: vi.fn(),
      onNewChat: vi.fn(),
      onNewTerminal: vi.fn(),
      onNotify: vi.fn(),
    };
    const view = render(<FileExplorer {...props} />);
    return { api, props, listing, view, fireChange: (c: any) => changed?.(c) };
  };

  it('shows the folder tree, the git branch and where Claude Code is installed', async () => {
    const { api } = setup();
    expect(await screen.findByText('README.md')).toBeInTheDocument();
    expect(api.treeWatch).toHaveBeenCalledWith('C:\\proj');
    expect(await screen.findByText('main')).toBeInTheDocument();
    expect(await screen.findByText('C:\\Users\\me\\.local\\bin\\claude.exe')).toBeInTheDocument();
    expect(screen.getByTestId('claude-install-info')).toHaveTextContent('2.1.0');
    expect(screen.getByText('Ningún chat abierto en esta carpeta.')).toBeInTheDocument();
  });

  it('expands folders lazily, opens notes in tabs and other files with the system app', async () => {
    const { api, props } = setup();
    fireEvent.click(await screen.findByText('src'));
    expect(await screen.findByText('app.ts')).toBeInTheDocument();
    expect(api.treeList).toHaveBeenCalledWith('C:\\proj\\src');
    fireEvent.click(screen.getByText('README.md'));
    expect(props.onOpenNote).toHaveBeenCalledWith('C:\\proj\\README.md', 'README.md');
    fireEvent.click(screen.getByText('logo.png'));
    expect(api.openPath).toHaveBeenCalledWith('C:\\proj\\logo.png');
  });

  it('lists the chats running in the folder and marks the file Claude is working on', async () => {
    const { props } = setup();
    fireEvent.click(await screen.findByText('src'));
    await screen.findByText('app.ts');
    const agent: AgentActivity = {
      tabId: 'chat-1',
      provider: 'claude',
      cwd: 'C:\\proj',
      starting: false,
      running: true,
      ended: false,
      waiting: false,
      activePaths: ['C:\\proj\\src\\app.ts'],
      touchedPaths: [],
      currentTool: { name: 'Edit', target: 'src\\app.ts' },
    };
    act(() => reportAgent('chat-1', agent));
    const row = await screen.findByTestId('explorer-agent-chat-1');
    expect(row).toHaveTextContent('Edit · app.ts');
    // The folder and the file both show Claude working
    expect(screen.getAllByTestId('explorer-working')).toHaveLength(2);
    fireEvent.click(row);
    expect(props.onFocusTab).toHaveBeenCalledWith('chat-1');
  });

  it('reloads listed folders when the disk changes', async () => {
    const { api, listing, fireChange } = setup();
    await screen.findByText('README.md');
    listing['C:\\proj'] = [...listing['C:\\proj'], { name: 'nuevo.md', path: 'C:\\proj\\nuevo.md', isDir: false }];
    act(() => fireChange({ root: 'c:/proj', dirs: ['C:\\proj'], git: false }));
    expect(await screen.findByText('nuevo.md')).toBeInTheDocument();
    // Changes under another root are ignored
    const calls = api.treeList.mock.calls.length;
    act(() => fireChange({ root: 'C:\\other', dirs: ['C:\\other'], git: false }));
    await waitFor(() => expect(api.treeList.mock.calls.length).toBe(calls));
  });

  it('offers copy path, reveal and "new chat here" on right-click', async () => {
    const { api, props } = setup();
    fireEvent.contextMenu(await screen.findByText('src'));
    const menu = screen.getByTestId('explorer-menu');
    expect(menu).toHaveTextContent('Copiar ruta relativa');
    fireEvent.click(screen.getByText('Nuevo chat de Claude aquí'));
    expect(props.onNewChat).toHaveBeenCalledWith('C:\\proj\\src');
    fireEvent.contextMenu(screen.getByText('README.md'));
    fireEvent.click(screen.getByText('Mostrar en el Explorador'));
    expect(api.revealInExplorer).toHaveBeenCalledWith('C:\\proj\\README.md');
    fireEvent.contextMenu(screen.getByText('README.md'));
    fireEvent.click(screen.getByText('Nueva terminal aquí'));
    expect(props.onNewTerminal).toHaveBeenCalledWith('C:\\proj');
  });

  it('opens Claude in the selected folder and in the current folder before selection', async () => {
    const { props } = setup();
    await screen.findByText('README.md');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Claude aquí' }));
    expect(props.onNewChat).toHaveBeenLastCalledWith('C:\\proj');
    fireEvent.click(screen.getByText('src'));
    expect(screen.getByTestId('explorer-chat-folder')).toHaveTextContent('C:\\proj\\src');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Claude aquí' }));
    expect(props.onNewChat).toHaveBeenLastCalledWith('C:\\proj\\src');
    fireEvent.click(await screen.findByText('app.ts'));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Claude aquí' }));
    expect(props.onNewChat).toHaveBeenLastCalledWith('C:\\proj\\src');
  });

  it('navigates up, into folders with double-click or Enter, and back to the active tab', async () => {
    const { props, view, api } = setup();
    fireEvent.doubleClick(await screen.findByText('src'));
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith('C:\\proj\\src');
    fireEvent.keyDown(screen.getByText('src').closest('[role="treeitem"]')!, { key: 'Enter' });
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith('C:\\proj\\src');
    view.rerender(<FileExplorer {...props} root={'C:\\proj\\src'} followsActiveTab={false} />);
    await screen.findByText('app.ts');
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();
    expect(api.treeWatch).toHaveBeenLastCalledWith('C:\\proj\\src');
    fireEvent.click(screen.getByRole('button', { name: 'Subir a la carpeta superior' }));
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith('C:\\proj');
    fireEvent.click(screen.getByRole('button', { name: 'Seguir la carpeta de la pestaña activa' }));
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith(null);
  });

  it('jumps to any folder of the path from the breadcrumb', async () => {
    const { props, view } = setup();
    await act(async () => view.rerender(<FileExplorer {...props} root={String.raw`C:\proj\src`} />));
    const crumbs = screen.getByTestId('explorer-location');
    expect(crumbs).toHaveTextContent('C:projsrc');
    expect(screen.getByRole('button', { name: 'src' })).toHaveAttribute('aria-current', 'location');
    fireEvent.click(screen.getByRole('button', { name: 'C:' }));
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith(String.raw`C:\ `.trim());
    fireEvent.click(screen.getByRole('button', { name: 'proj' }));
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith(String.raw`C:\proj`);
  });

  it('opens Claude in, or goes into, a folder straight from its row', async () => {
    const { props } = setup();
    await screen.findByText('src');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Claude en src' }));
    expect(props.onNewChat).toHaveBeenLastCalledWith(String.raw`C:\proj\src`);
    expect(props.onNavigateFolder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar en src' }));
    expect(props.onNavigateFolder).toHaveBeenLastCalledWith(String.raw`C:\proj\src`);
  });

  it('chooses another folder even without a root and leaves the location unchanged on cancel', async () => {
    const { api, props } = setup('');
    expect(screen.getByRole('button', { name: 'Abrir Claude aquí' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subir a la carpeta superior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir carpeta' }));
    await waitFor(() => expect(props.onNavigateFolder).toHaveBeenCalledWith('D:\\work'));
    props.onNavigateFolder.mockClear();
    api.treeSelectFolder.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Elegir carpeta' }));
    await waitFor(() => expect(api.treeSelectFolder).toHaveBeenCalledTimes(2));
    expect(props.onNavigateFolder).not.toHaveBeenCalled();
    expect(api.selectFolder).not.toHaveBeenCalled();
  });

  it('does not navigate above drive and network share roots', async () => {
    const { props, view } = setup('C:\\');
    expect(screen.getByRole('button', { name: 'Subir a la carpeta superior' })).toBeDisabled();
    await act(async () => view.rerender(<FileExplorer {...props} root={'\\\\server\\share\\'} />));
    expect(screen.getByRole('button', { name: 'Subir a la carpeta superior' })).toBeDisabled();
  });
});
