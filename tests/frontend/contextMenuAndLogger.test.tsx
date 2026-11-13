import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { buildMenu, readMenuContext, isEditCommand } from '../../src/lib/contextMenu';
import { registerTerminal, terminalSelection } from '../../src/lib/terminalRegistry';
import { log, logError, describeError } from '../../src/lib/logger';
import { useAppContextMenu, type ContextMenuHandlers } from '../../src/hooks/useAppContextMenu';
import { copyText } from '../../src/lib/clipboard';
import { notePathOf } from '../../src/lib/paths';
import { loadChatPrefs, saveChatPrefs } from '../../src/lib/claudeChatPrefs';

describe('logger', () => {
  let send: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    send = vi.fn().mockResolvedValue(true);
    window.electronAPI = { log: send } as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends scope, message, stack and context to the system log', () => {
    logError('ideas.addIdea', new Error('quota'), { count: 3 });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', scope: 'ideas.addIdea', message: 'failed: quota', context: { count: 3 }, stack: expect.stringContaining('quota') })
    );
  });

  it('never throws, even when the bridge or the context are broken', () => {
    window.electronAPI = {
      log: () => {
        throw new Error('bridge down');
      },
    } as any;
    const circular: any = {};
    circular.self = circular;
    expect(() => log('warn', 'x', 'y', undefined, circular)).not.toThrow();
    expect(describeError(42).message).toBe('42');
  });
});

describe('contextMenu', () => {
  it('builds the menu for each kind of place', () => {
    expect(buildMenu({ kind: 'page', selection: '', chatTabId: null })).toBeNull();
    const chat = buildMenu({ kind: 'page', selection: 'hola', chatTabId: 'c1' })!;
    expect(chat.filter((e) => e !== 'separator').map((e) => (e as any).action)).toEqual(['copy', 'selectAll', 'sendToChat', 'saveIdea', 'pin']);
    const field = buildMenu({ kind: 'editable', selection: '', chatTabId: null })!;
    expect(field.find((e) => e !== 'separator' && e.action === 'cut')).toMatchObject({ disabled: true });
    expect(isEditCommand('paste')).toBe(true);
    expect(isEditCommand('pin')).toBe(false);
  });

  it('logs and returns null instead of throwing on a bad context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(buildMenu(null as any)).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reads what was right-clicked from the DOM', () => {
    document.body.innerHTML = `
      <div data-term-tab="t1"><span id="in-term">x</span></div>
      <div data-chat-tab="c1"><p id="in-chat">msg</p><textarea id="draft">abcdef</textarea></div>`;
    const ta = document.getElementById('draft') as HTMLTextAreaElement;
    ta.setSelectionRange(1, 4);
    expect(readMenuContext(document.getElementById('in-term'), () => 'sel')).toEqual({ ctx: { kind: 'terminal', selection: 'sel', chatTabId: null }, termTabId: 't1' });
    expect(readMenuContext(ta, () => '').ctx).toEqual({ kind: 'editable', selection: 'bcd', chatTabId: null });
    expect(readMenuContext(document.getElementById('in-chat'), () => '').ctx).toMatchObject({ kind: 'page', chatTabId: 'c1' });
  });
});

describe('terminalRegistry', () => {
  it('gives the selection of a registered terminal and logs a failing one', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const off = registerTerminal('t1', { getSelection: () => 'ls -la', paste: vi.fn(), selectAll: vi.fn() });
    expect(terminalSelection('t1')).toBe('ls -la');
    off();
    expect(terminalSelection('t1')).toBe('');
    const off2 = registerTerminal('t2', {
      getSelection: () => {
        throw new Error('disposed');
      },
      paste: vi.fn(),
      selectAll: vi.fn(),
    });
    expect(terminalSelection('t2')).toBe('');
    expect(spy).toHaveBeenCalled();
    off2();
    spy.mockRestore();
  });
});

describe('useAppContextMenu', () => {
  const Harness = (props: ContextMenuHandlers) => {
    const { menu, runAction } = useAppContextMenu(props);
    return (
      <div>
        <div data-chat-tab="c1">
          <p>mensaje del chat</p>
        </div>
        {menu && (
          <div data-testid="menu">
            {menu.entries.map((e, i) =>
              e === 'separator' ? null : (
                <button key={i} onClick={() => runAction(e.action)}>
                  {e.label}
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  it('opens on a selection in a chat and runs "Guardar idea" / "Fijar en este chat"', () => {
    window.electronAPI = { editCommand: vi.fn().mockResolvedValue(true) } as any;
    const handlers = { sendToChat: vi.fn(), saveIdea: vi.fn(), pin: vi.fn() };
    render(<Harness {...handlers} />);
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'una idea' } as any);
    const p = screen.getByText('mensaje del chat');
    act(() => void fireEvent.contextMenu(p));
    fireEvent.click(screen.getByText('Guardar idea'));
    expect(handlers.saveIdea).toHaveBeenCalledWith('una idea', 'c1');
    act(() => void fireEvent.contextMenu(p));
    fireEvent.click(screen.getByText('Fijar en este chat'));
    expect(handlers.pin).toHaveBeenCalledWith('una idea', 'c1');
    act(() => void fireEvent.contextMenu(p));
    fireEvent.click(screen.getByText('Copiar'));
    expect(window.electronAPI!.editCommand).toHaveBeenCalledWith('copy');
    vi.restoreAllMocks();
  });
});

describe('clipboard, paths and chat prefs (log instead of failing silently)', () => {
  it('copyText reports success and logs a refused write', async () => {
    const send = vi.fn().mockResolvedValue(true);
    window.electronAPI = { log: send } as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await copyText('hola', 'test.copy')).toBe(true);
    (navigator.clipboard.writeText as any).mockRejectedValue(new Error('denied'));
    expect(await copyText('hola', 'test.copy')).toBe(false);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ scope: 'test.copy', message: 'copy to clipboard failed: denied' }));
    vi.restoreAllMocks();
  });

  it('notePathOf uses the file, else the notes folder with its own separator', () => {
    expect(notePathOf({ path: 'C:\\n\\a.md', title: 'a.md' }, 'C:\\x')).toBe('C:\\n\\a.md');
    expect(notePathOf({ path: null, title: 'b.md' }, 'C:\\notas')).toBe('C:\\notas\\b.md');
    expect(notePathOf({ title: 'b.md' }, '/home/n')).toBe('/home/n/b.md');
    expect(notePathOf({ title: 'b.md' }, '')).toBe('b.md');
  });

  it('chat prefs survive a broken storage and log it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('yanote.claude.chatPrefs', '{bad json');
    expect(loadChatPrefs()).toEqual({});
    localStorage.removeItem('yanote.claude.chatPrefs');
    saveChatPrefs({ mode: 'plan', model: 'opus' });
    expect(loadChatPrefs()).toEqual({ mode: 'plan', model: 'opus' });
    expect(console.error).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
