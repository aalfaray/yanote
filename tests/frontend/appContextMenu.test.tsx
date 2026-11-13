import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { buildMenu } from '../../src/lib/contextMenu';
import { registerTerminal } from '../../src/lib/terminalRegistry';

vi.mock('../../src/components/Editor', () => ({ Editor: () => <textarea data-testid="editor" defaultValue="hola mundo" /> }));
vi.mock('../../src/components/ClaudeChatView', () => ({
  ClaudeChatView: ({ tabId, cwd, initialDraft, accountId, pins, onUnpin }: any) => (
    <div data-testid={`chat-${tabId}`} data-chat-tab={tabId} data-cwd={cwd ?? ''} data-draft={initialDraft ?? ''} data-account={accountId ?? ''}>
      <p data-testid={`reply-${tabId}`}>Ya tengo el diseño completo del paso 1</p>
      {(pins || []).map((p: any) => (
        <button key={p.id} data-testid="pin" onClick={() => onUnpin(p.id)}>
          {p.text}
        </button>
      ))}
    </div>
  ),
}));
import { App } from '../../src/App';

const labels = () => screen.getAllByRole('menuitem').map((b) => b.textContent?.replace(/Ctrl\+\w/, '').trim());

/** Select an element's text and right-click it, as the user would. */
function rightClickSelecting(el: Element) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.contextMenu(el, { clientX: 20, clientY: 20 });
}

describe('buildMenu', () => {
  it('offers editing in fields, copy/paste in terminals, and selection actions', () => {
    const field = buildMenu({ kind: 'editable', selection: '', chatTabId: null })!;
    expect(field.filter((e) => e !== 'separator').map((e) => (e as any).action)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
    expect(field.find((e) => e !== 'separator' && e.action === 'copy')).toMatchObject({ disabled: true });

    const term = buildMenu({ kind: 'terminal', selection: 'ls', chatTabId: null })!;
    expect(term.filter((e) => e !== 'separator').map((e) => (e as any).action)).toEqual(['copy', 'paste', 'selectAll', 'sendToChat', 'saveIdea']);

    const chat = buildMenu({ kind: 'page', selection: 'texto', chatTabId: 'c1' })!;
    expect(chat.filter((e) => e !== 'separator').map((e) => (e as any).action)).toEqual(['copy', 'selectAll', 'sendToChat', 'saveIdea', 'pin']);
    expect(buildMenu({ kind: 'page', selection: '  ', chatTabId: 'c1' })).toBeNull();
  });
});

describe('App: yanote right-click menu', () => {
  beforeEach(() => {
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({ notesPath: '/n', alwaysOnTop: false, welcomeSeen: true, ideas: [], activeClaudeAccount: 'default' }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      getNotesPath: vi.fn().mockResolvedValue('/n'),
      readFile: vi.fn(),
      editCommand: vi.fn().mockResolvedValue(true),
    } as any;
  });

  const openChat = async () => {
    render(<App />);
    await waitFor(() => expect(window.electronAPI!.getAppConfig).toHaveBeenCalled());
    act(() => screen.getByTitle(/Elegir tipo de pestaña nueva/).click());
    act(() => screen.getByRole('menuitem', { name: /Chat con Claude/ }).click());
    const chat = await screen.findByTestId(/^chat-claude-/);
    return chat.dataset.chatTab!;
  };

  it('replaces the native menu in a chat, with the selection actions', async () => {
    const id = await openChat();
    const reply = screen.getByTestId(`reply-${id}`);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
    const range = document.createRange();
    range.selectNodeContents(reply);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    act(() => {
      reply.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true); // no native menu
    expect(screen.getByTestId('app-context-menu')).toBeInTheDocument();
    expect(labels()).toEqual(['Copiar', 'Seleccionar todo', 'Enviar a un chat nuevo de Claude', 'Guardar idea', 'Fijar en este chat']);

    fireEvent.click(screen.getByRole('menuitem', { name: /Copiar/ }));
    expect(window.electronAPI!.editCommand).toHaveBeenCalledWith('copy');
    expect(screen.queryByTestId('app-context-menu')).not.toBeInTheDocument();
  });

  it('sends the selection to a new chat in the same folder and account, typed but not sent', async () => {
    const id = await openChat();
    rightClickSelecting(screen.getByTestId(`reply-${id}`));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Enviar a un chat nuevo de Claude' }));
    await waitFor(() => expect(screen.getAllByTestId(/^chat-claude-/)).toHaveLength(2));
    const second = screen.getAllByTestId(/^chat-claude-/)[1];
    expect(second.dataset.draft).toBe('Ya tengo el diseño completo del paso 1');
    expect(second.dataset.account).toBe('default');
    expect(second.dataset.cwd).toBe(screen.getAllByTestId(/^chat-claude-/)[0].dataset.cwd);
  });

  it('saves an idea with where it came from and offers it back from the lightbulb', async () => {
    const id = await openChat();
    rightClickSelecting(screen.getByTestId(`reply-${id}`));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Guardar idea' }));
    expect(await screen.findByText('💡 Idea guardada')).toBeInTheDocument();
    expect(window.electronAPI!.saveAppConfig).toHaveBeenCalledWith({
      ideas: [expect.objectContaining({ text: 'Ya tengo el diseño completo del paso 1', source: 'Claude' })],
    });
    fireEvent.click(screen.getByLabelText('Ideas guardadas'));
    fireEvent.click(screen.getByRole('button', { name: /Chat nuevo/ }));
    await waitFor(() => expect(screen.getAllByTestId(/^chat-claude-/)).toHaveLength(2));
    expect(screen.getAllByTestId(/^chat-claude-/)[1].dataset.draft).toBe('Ya tengo el diseño completo del paso 1');
  });

  it('pins the paragraph on top of its chat, once, and unpins it', async () => {
    const id = await openChat();
    for (let i = 0; i < 2; i++) {
      rightClickSelecting(screen.getByTestId(`reply-${id}`));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Fijar en este chat' }));
    }
    expect(screen.getAllByTestId('pin')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('pin'));
    expect(screen.queryByTestId('pin')).not.toBeInTheDocument();
  });

  it('in a text field: editing commands run on it', async () => {
    render(<App />);
    const editor = (await screen.findByTestId('editor')) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 4);
    fireEvent.contextMenu(editor, { clientX: 5, clientY: 5 });
    expect(labels()).toEqual(['Deshacer', 'Rehacer', 'Cortar', 'Copiar', 'Pegar', 'Seleccionar todo', 'Enviar a un chat nuevo de Claude', 'Guardar idea']);
    fireEvent.click(screen.getByRole('menuitem', { name: /Pegar/ }));
    expect(window.electronAPI!.editCommand).toHaveBeenCalledWith('paste');
  });

  it('in a terminal: copies its selection and pastes into it', async () => {
    render(<App />);
    await screen.findByTestId('editor');
    const term = document.createElement('div');
    term.dataset.termTab = 'term-x';
    document.body.appendChild(term);
    const actions = { getSelection: vi.fn(() => 'npm test'), paste: vi.fn(), selectAll: vi.fn() };
    const off = registerTerminal('term-x', actions);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    fireEvent.contextMenu(term, { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole('menuitem', { name: /Copiar/ }));
    expect(writeText).toHaveBeenCalledWith('npm test');
    fireEvent.contextMenu(term, { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole('menuitem', { name: /Pegar/ }));
    expect(actions.paste).toHaveBeenCalled();
    off();
    term.remove();
  });

  it('shows nothing on a right-click without selection outside fields, and closes with Escape', async () => {
    render(<App />);
    await screen.findByTestId('editor');
    window.getSelection()!.removeAllRanges();
    fireEvent.contextMenu(document.body, { clientX: 5, clientY: 5 });
    expect(screen.queryByTestId('app-context-menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId('editor'), { clientX: 5, clientY: 5 });
    expect(screen.getByTestId('app-context-menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('app-context-menu')).not.toBeInTheDocument();
  });

  it('leaves menus of their own alone (the tab menu)', async () => {
    render(<App />);
    await screen.findByTestId('editor');
    fireEvent.contextMenu(screen.getAllByText('scratch-1.md')[0], { clientX: 5, clientY: 5 });
    expect(screen.getByTestId('tab-context-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('app-context-menu')).not.toBeInTheDocument();
  });
});
