import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { addIdea, removeIdea, formatIdeaDate, MAX_IDEAS } from '../../src/lib/ideas';
import { IdeasDrawer } from '../../src/components/IdeasDrawer';
import { PinnedStrip } from '../../src/components/ChatPinnedStrip';

vi.mock('../../src/components/Editor', () => ({ Editor: () => <div data-testid="editor" /> }));
vi.mock('../../src/components/ClaudeChatView', () => ({
  ClaudeChatView: ({ tabId, pins, onUnpin, initialDraft, cwd }: any) => (
    <div data-testid={`chat-${tabId}`} data-chat-tab={tabId} data-draft={initialDraft ?? ''} data-cwd={cwd ?? ''}>
      {(pins || []).map((p: any) => (
        <button key={p.id} data-testid="pin" onClick={() => onUnpin(p.id)}>
          {p.text}
        </button>
      ))}
    </div>
  ),
}));
import { App } from '../../src/App';

describe('ideas list helpers', () => {
  it('adds newest first, trims, ignores empty text and moves a repeated idea to the top', () => {
    let list = addIdea([], { text: '  Primera  ', source: 'Claude' }, 1000);
    list = addIdea(list, { text: 'Segunda' }, 2000);
    expect(list.map((i) => i.text)).toEqual(['Segunda', 'Primera']);
    expect(list[1]).toMatchObject({ text: 'Primera', source: 'Claude', createdAt: 1000 });
    expect(addIdea(list, { text: '   ' })).toBe(list);
    list = addIdea(list, { text: 'Primera' }, 3000);
    expect(list.map((i) => i.text)).toEqual(['Primera', 'Segunda']);
    expect(removeIdea(list, list[0].id).map((i) => i.text)).toEqual(['Segunda']);
  });

  it('keeps at most the newest ideas and formats dates', () => {
    let list: any[] = [];
    for (let i = 0; i < MAX_IDEAS + 5; i++) list = addIdea(list, { text: `idea ${i}` }, i);
    expect(list).toHaveLength(MAX_IDEAS);
    expect(list[0].text).toBe(`idea ${MAX_IDEAS + 4}`);
    const now = Date.UTC(2026, 10, 13, 12);
    expect(formatIdeaDate(now - 30_000, now)).toBe('ahora');
    expect(formatIdeaDate(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(formatIdeaDate(now - 3 * 3600_000, now)).toBe('hace 3 h');
    expect(formatIdeaDate(now - 26 * 3600_000, now)).toBe('ayer');
  });
});

describe('IdeasDrawer', () => {
  const ideas = [
    { id: 'a', text: 'Usar el módulo punto_venta en el núcleo', source: 'Claude 2', createdAt: Date.now() },
    { id: 'b', text: 'Revisar los permisos de caja', createdAt: Date.now() },
  ];

  it('lists ideas and runs each action', () => {
    const props = { onClose: vi.fn(), onRemove: vi.fn(), onSendToNewChat: vi.fn(), onInsertInChat: vi.fn() };
    render(<IdeasDrawer isOpen ideas={ideas} {...props} />);
    expect(screen.getByText(/punto_venta/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Chat nuevo/ })[0]);
    expect(props.onSendToNewChat).toHaveBeenCalledWith(ideas[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /En este chat/ })[1]);
    expect(props.onInsertInChat).toHaveBeenCalledWith(ideas[1]);
    fireEvent.click(screen.getAllByLabelText('Borrar idea')[0]);
    expect(props.onRemove).toHaveBeenCalledWith('a');
  });

  it('hides "En este chat" when no chat is open and shows an empty state', () => {
    const { rerender } = render(<IdeasDrawer isOpen ideas={ideas} onClose={vi.fn()} onRemove={vi.fn()} onSendToNewChat={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /En este chat/ })).not.toBeInTheDocument();
    rerender(<IdeasDrawer isOpen ideas={[]} onClose={vi.fn()} onRemove={vi.fn()} onSendToNewChat={vi.fn()} />);
    expect(screen.getByText('Aún no guardaste ideas.')).toBeInTheDocument();
  });

  it('searches ignoring accents', () => {
    const many = [...ideas, { id: 'c', text: 'Otra', createdAt: 0 }, { id: 'd', text: 'Más', createdAt: 0 }];
    render(<IdeasDrawer isOpen ideas={many} onClose={vi.fn()} onRemove={vi.fn()} onSendToNewChat={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Buscar ideas'), { target: { value: 'nucleo' } });
    expect(screen.getByText(/punto_venta/)).toBeInTheDocument();
    expect(screen.queryByText('Otra')).not.toBeInTheDocument();
  });
});

describe('PinnedStrip', () => {
  it('shows pins, collapses, and unpins', () => {
    const onUnpin = vi.fn();
    render(<PinnedStrip pins={[{ id: 'p1', text: 'Ya tengo el diseño del paso 1' }]} onUnpin={onUnpin} />);
    expect(screen.getByText('Ya tengo el diseño del paso 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fijados \(1\)/ }));
    expect(screen.queryByText('Ya tengo el diseño del paso 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fijados \(1\)/ }));
    fireEvent.click(screen.getByLabelText('Quitar fijado'));
    expect(onUnpin).toHaveBeenCalledWith('p1');
  });
});

describe('App: right-click "Guardar idea" and "Fijar en este chat"', () => {
  let saveIdea: (p: any) => void;
  let pinInChat: (p: any) => void;
  beforeEach(() => {
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({ notesPath: '/n', alwaysOnTop: false, welcomeSeen: true, ideas: [] }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      getNotesPath: vi.fn().mockResolvedValue('/n'),
      readFile: vi.fn(),
      onSaveIdea: vi.fn((cb) => {
        saveIdea = cb;
        return () => {};
      }),
      onPinInChat: vi.fn((cb) => {
        pinInChat = cb;
        return () => {};
      }),
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

  it('saves an idea with where it came from, and it persists', async () => {
    const id = await openChat();
    act(() => saveIdea({ text: 'Empiezo por el núcleo: el módulo punto_venta', chatTabId: id }));
    expect(await screen.findByText('💡 Idea guardada')).toBeInTheDocument();
    expect(window.electronAPI!.saveAppConfig).toHaveBeenCalledWith({
      ideas: [expect.objectContaining({ text: 'Empiezo por el núcleo: el módulo punto_venta', source: 'Claude' })],
    });
    // the lightbulb shows the count; the list offers it back
    fireEvent.click(screen.getByLabelText('Ideas guardadas'));
    expect(screen.getByText('Empiezo por el núcleo: el módulo punto_venta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chat nuevo/ }));
    await waitFor(() => expect(screen.getAllByTestId(/^chat-claude-/)).toHaveLength(2));
    expect(screen.getAllByTestId(/^chat-claude-/)[1].dataset.draft).toBe('Empiezo por el núcleo: el módulo punto_venta');
  });

  it('pins a paragraph on top of its chat, once, and unpins it', async () => {
    const id = await openChat();
    act(() => pinInChat({ text: ' Ya tengo el diseño completo ', tabId: id }));
    act(() => pinInChat({ text: 'Ya tengo el diseño completo', tabId: id }));
    expect(screen.getAllByTestId('pin')).toHaveLength(1);
    expect(screen.getByTestId('pin')).toHaveTextContent('Ya tengo el diseño completo');
    fireEvent.click(screen.getByTestId('pin'));
    expect(screen.queryByTestId('pin')).not.toBeInTheDocument();
  });

  it('tells the menu which chat was right-clicked (not its message box)', async () => {
    const id = await openChat();
    fireEvent.contextMenu(screen.getByTestId(`chat-${id}`));
    expect((window as any).__yanoteContextTarget).toEqual({ chatTabId: id });
    fireEvent.contextMenu(document.body);
    expect((window as any).__yanoteContextTarget).toEqual({ chatTabId: null });
  });
});
