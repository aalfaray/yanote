import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toSavedTabs, restoreTab } from '../../src/lib/session';
import { historyItems } from '../../src/lib/claudeChat';
import type { TabItem } from '../../src/types/electron';

vi.mock('../../src/components/Editor', () => ({ Editor: ({ markdown }: any) => <textarea data-testid="editor" readOnly value={markdown} /> }));
vi.mock('../../src/components/TerminalView', () => ({ TerminalView: ({ tabId, cwd, shell }: any) => <div data-testid={`term-${tabId}`} data-cwd={cwd} data-shell={shell} /> }));
vi.mock('../../src/components/ClaudeChatView', () => ({
  ClaudeChatView: ({ tabId, cwd, resumeSessionId, accountId, pins }: any) => (
    <div data-testid={`chat-${tabId}`} data-cwd={cwd} data-session={resumeSessionId} data-account={accountId} data-pins={(pins || []).length} />
  ),
}));
import { App } from '../../src/App';

const tabs: TabItem[] = [
  { id: 'tab-welcome', title: 'Bienvenido.md', path: null, content: '# hola', isDirty: false },
  { id: 'n1', title: 'plan.md', path: 'C:\\p\\plan.md', content: '# Plan', isDirty: true, isPinned: true },
  { id: 's1', title: 'scratch-1.md', path: null, content: 'borrador sin guardar', isDirty: true },
  { id: 't1', title: 'PowerShell', path: null, content: '', isDirty: false, kind: 'terminal', shell: 'powershell', cwd: 'C:\\p' },
  {
    id: 'c1',
    title: 'Claude 2',
    path: null,
    content: '',
    isDirty: false,
    kind: 'claude',
    cwd: 'C:\\p',
    sessionId: 'sess-123',
    accountId: 'acc-b',
    chatPins: [{ id: 'pin-1', text: 'Importante' }],
  },
];

describe('session helpers', () => {
  it('remembers every kind of tab (but not the welcome note)', () => {
    expect(toSavedTabs(tabs, ['tab-welcome'])).toEqual([
      { kind: 'note', path: 'C:\\p\\plan.md', title: 'plan.md', isPinned: true, content: '# Plan', isDirty: true },
      { kind: 'scratch', title: 'scratch-1.md', content: 'borrador sin guardar', isPinned: false },
      { kind: 'terminal', title: 'PowerShell', shell: 'powershell', cwd: 'C:\\p' },
      { kind: 'claude', title: 'Claude 2', cwd: 'C:\\p', sessionId: 'sess-123', accountId: 'acc-b', pins: [{ id: 'pin-1', text: 'Importante' }] },
    ]);
  });

  it('keeps empty pending text and full large edits, but reads clean notes from disk', () => {
    for (const content of ['', 'x'.repeat(500_001)]) {
      const [saved] = toSavedTabs([{ ...tabs[1], content }]);
      expect(restoreTab(saved, 'restored')).toMatchObject({ content, isDirty: true, path: tabs[1].path });
    }
    const [clean] = toSavedTabs([{ ...tabs[1], isDirty: false }]);
    expect(clean).not.toHaveProperty('content');
    expect(restoreTab(clean, 'clean')).toBeNull();
  });

  it('rebuilds tabs that need no disk read', () => {
    const [, scratch, term, chat] = toSavedTabs(tabs, ['tab-welcome']);
    expect(restoreTab(scratch, 'x')).toMatchObject({ title: 'scratch-1.md', content: 'borrador sin guardar', isDirty: true, path: null });
    expect(restoreTab(term, 'y')).toMatchObject({ kind: 'terminal', shell: 'powershell', cwd: 'C:\\p' });
    expect(restoreTab(chat, 'z')).toMatchObject({ kind: 'claude', sessionId: 'sess-123', accountId: 'acc-b', chatPins: [{ id: 'pin-1', text: 'Importante' }] });
    expect(restoreTab({ kind: 'note', path: 'a', title: 'a' }, 'n')).toBeNull();
  });
});

describe('chat history from a saved conversation', () => {
  it('shows typed prompts, replies and tool calls with their results; skips app-injected turns', () => {
    const items = historyItems([
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'continúa con el roadmap' }] } },
      { type: 'assistant', message: { id: 'm1', content: [{ type: 'thinking', thinking: '' }] } },
      { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'ROADMAP.md' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'contenido' }] } },
      { type: 'user', message: { content: '<task-notification>listo</task-notification>' } },
      { type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'Retomo CFG-07.' }] } },
      { type: 'user', message: { content: [{ type: 'image', source: {} }, { type: 'text', text: 'mira esto' }] } },
    ]);
    expect(items.map((i) => i.kind)).toEqual(['user', 'tool', 'text', 'user']);
    expect(items[0]).toMatchObject({ kind: 'user', text: 'continúa con el roadmap', imageCount: 0 });
    expect(items[1]).toMatchObject({ kind: 'tool', name: 'Read', result: { text: 'contenido' } });
    expect(items[2]).toMatchObject({ kind: 'text', text: 'Retomo CFG-07.' });
    expect(items[3]).toMatchObject({ kind: 'user', text: 'mira esto', imageCount: 1 });
  });
});

describe('App: opens with the tabs of last time', () => {
  beforeEach(() => {
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({
        notesPath: '/n',
        alwaysOnTop: false,
        welcomeSeen: true,
        openTabs: [
          ...toSavedTabs(tabs, ['tab-welcome']),
          { kind: 'note', path: 'C:\\p\\borrado.md', title: 'borrado.md' },
        ],
        activeTabIndex: 3,
      }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      getNotesPath: vi.fn().mockResolvedValue('/n'),
      readFile: vi.fn(async (p: string) => (p === 'C:\\p\\plan.md' ? { success: true, content: '# Plan en disco' } : { success: false, error: 'no existe' })),
    } as any;
  });

  it.each(['', 'pending changes'])('restores pending text %j even when the file is missing', async (content) => {
    window.electronAPI!.getAppConfig = vi.fn().mockResolvedValue({
      openTabs: [{ kind: 'note', path: '/missing.md', title: 'missing.md', content, isDirty: true }],
      activeTabIndex: 0,
    });
    window.electronAPI!.readFile = vi.fn().mockResolvedValue({ success: false });
    render(<App />);
    await screen.findAllByText('missing.md');
    expect(screen.getByTestId('editor')).toHaveValue(content);
    expect(screen.getByText(/Sin guardar/i)).toBeInTheDocument();
    expect(window.electronAPI!.readFile).not.toHaveBeenCalled();
  });

  it('restores notes, unsaved notes, terminals and chats in order, with the same active tab', async () => {
    render(<App />);
    const chat = await screen.findByTestId(/^chat-claude-restored-/);
    expect(chat.dataset).toMatchObject({ cwd: 'C:\\p', session: 'sess-123', account: 'acc-b', pins: '1' });
    expect(screen.getByTestId(/^term-term-restored-/).dataset).toMatchObject({ cwd: 'C:\\p', shell: 'powershell' });
    for (const title of ['plan.md', 'scratch-1.md', 'PowerShell', 'Claude 2']) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('borrado.md')).not.toBeInTheDocument();
    expect(screen.queryByText('Bienvenido.md')).not.toBeInTheDocument();
    // the chat (index 3) was the active tab
    expect(screen.getAllByText('Chat:').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('plan.md')[0]);
    expect(screen.getByTestId('editor')).toHaveValue('# Plan');
    expect(screen.getByText(/Sin guardar/i)).toBeInTheDocument();
    expect(window.electronAPI!.readFile).not.toHaveBeenCalledWith('C:\\p\\plan.md');
  });

  it('keeps the browsed folder across tab switches and reopening, and starts Claude there', async () => {
    window.electronAPI!.getAppConfig = vi.fn().mockResolvedValue({
      language: 'es', explorerOpen: true, explorerFolder: 'D:\\work',
      openTabs: [{ kind: 'note', path: 'C:\\p\\plan.md', title: 'plan.md', content: 'pending', isDirty: true }],
    });
    window.electronAPI!.treeList = vi.fn(async (folder) => ({ success: true, entries: folder === 'D:\\work' ? [{ name: 'project', path: 'D:\\work\\project', isDir: true }] : [] }));
    render(<App />);
    fireEvent.doubleClick(await screen.findByText('project'));
    await waitFor(() => expect(screen.getByTestId('explorer-location')).toHaveAttribute('title', 'D:\\work\\project'));
    expect(window.electronAPI!.saveAppConfig).toHaveBeenCalledWith({ explorerFolder: 'D:\\work\\project' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Claude aquí' }));
    const chat = await screen.findByTestId(/^chat-claude-/);
    expect(chat).toHaveAttribute('data-cwd', 'D:\\work\\project');
    fireEvent.click(screen.getAllByText('plan.md')[0]);
    expect(screen.getByTestId('editor')).toHaveValue('pending');
    expect(screen.getByTestId('explorer-location')).toHaveAttribute('title', 'D:\\work\\project');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar explorador' }));
    fireEvent.keyDown(window, { key: 'E', ctrlKey: true, shiftKey: true });
    expect(await screen.findByTestId('explorer-location')).toHaveAttribute('title', 'D:\\work\\project');
    fireEvent.click(screen.getByRole('button', { name: 'Seguir la carpeta de la pestaña activa' }));
    await waitFor(() => expect(screen.getByTestId('explorer-location')).toHaveAttribute('title', 'C:\\p'));
    expect(window.electronAPI!.saveAppConfig).toHaveBeenCalledWith({ explorerFolder: null });
  });
});
