import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { chatNotificationFor } from '../../src/lib/claudeNotify';

vi.mock('../../src/components/Editor', () => ({ Editor: () => <div data-testid="editor" /> }));
vi.mock('../../src/components/ClaudeChatView', () => ({ ClaudeChatView: ({ tabId }: any) => <div data-testid={`chat-${tabId}`} /> }));
import { App } from '../../src/App';

const result = (extra: object) => ({ id: 'c1', type: 'message' as const, message: { type: 'result', subtype: 'success', ...extra } });

describe('chatNotificationFor', () => {
  it('announces a finished task with a short, markdown-free summary', () => {
    const n = chatNotificationFor(result({ result: '## Listo\n\nCorregí **3 tests** en `app.ts`.\n```js\ncode()\n```' }), 'Claude 2');
    expect(n).toEqual({ title: 'Claude 2: tarea terminada ✅', body: 'Listo Corregí 3 tests en app.ts.' });
    expect(chatNotificationFor(result({ result: 'x'.repeat(500) }), 'Claude')!.body.length).toBe(140);
    expect(chatNotificationFor(result({}), '')!.body).toBe('Claude terminó de responder.');
  });

  it('announces a stopped task and anything waiting for the user', () => {
    expect(chatNotificationFor(result({ subtype: 'error_during_execution', is_error: true }), 'Claude')!.title).toBe('Claude: la tarea se detuvo');
    const perm = (toolName: string) =>
      chatNotificationFor({ id: 'c1', type: 'permission', requestId: 'p', toolName, input: {}, canAlwaysAllow: false } as any, 'Claude');
    expect(perm('Bash')).toEqual({ title: 'Claude: esperando tu respuesta', body: 'Claude necesita tu permiso para usar Bash' });
    expect(perm('AskUserQuestion')!.body).toBe('Claude tiene una pregunta para ti');
    expect(perm('ExitPlanMode')!.body).toBe('El plan está listo para que lo revises');
  });

  it('stays quiet for everything else', () => {
    expect(chatNotificationFor({ id: 'c1', type: 'message', message: { type: 'assistant' } }, 'Claude')).toBeNull();
    expect(chatNotificationFor({ id: 'c1', type: 'stderr', data: 'x' }, 'Claude')).toBeNull();
  });
});

describe('App: Windows notifications for Claude chats', () => {
  let emit: (e: any) => void = () => {};
  let focusTab: (id: string) => void = () => {};
  const setup = (config: object = {}) => {
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({ notesPath: '/n', alwaysOnTop: false, welcomeSeen: true, ...config }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      getNotesPath: vi.fn().mockResolvedValue('/n'),
      listNotes: vi.fn().mockResolvedValue({ success: true, notes: [] }),
      readFile: vi.fn(),
      onClaudeEvent: vi.fn((cb) => {
        emit = cb;
        return () => {};
      }),
      onFocusTab: vi.fn((cb) => {
        focusTab = cb;
        return () => {};
      }),
      notify: vi.fn().mockResolvedValue(true),
    } as any;
  };
  afterEach(() => vi.restoreAllMocks());

  const openChat = async () => {
    render(<App />);
    await waitFor(() => expect(window.electronAPI!.getAppConfig).toHaveBeenCalled());
    act(() => screen.getByTitle(/Elegir tipo de pestaña nueva/).click());
    act(() => screen.getByRole('menuitem', { name: /Chat con Claude/ }).click());
    const chat = await screen.findByTestId(/^chat-claude-/);
    return chat.getAttribute('data-testid')!.replace('chat-', '');
  };

  it('notifies when the chat finishes while yanote is in the background, and the click returns to it', async () => {
    setup();
    const id = await openChat();
    act(() => emit({ id, type: 'message', message: { type: 'result', subtype: 'success', result: 'Hecho' } }));
    // the chat is the active tab: the main process skips it if the window has focus
    expect(window.electronAPI!.notify).toHaveBeenLastCalledWith({ title: 'Claude: tarea terminada ✅', body: 'Hecho', tabId: id, skipIfFocused: true });

    // on another tab it always notifies; the notification click brings the chat back
    act(() => screen.getByTitle(/Nueva nota Markdown/).click());
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    act(() => emit({ id, type: 'permission', requestId: 'p', toolName: 'Bash', input: {}, canAlwaysAllow: false }));
    expect(window.electronAPI!.notify).toHaveBeenLastCalledWith(expect.objectContaining({ tabId: id, skipIfFocused: false }));
    act(() => focusTab(id));
    expect(screen.getByTestId(`chat-${id}`)).toBeInTheDocument();
  });

  it('respects the setting', async () => {
    setup({ notifyClaude: false });
    const id = await openChat();
    await waitFor(() => expect(window.electronAPI!.getAppConfig).toHaveBeenCalled());
    act(() => emit({ id, type: 'permission', requestId: 'p', toolName: 'Bash', input: {}, canAlwaysAllow: false }));
    expect(window.electronAPI!.notify).not.toHaveBeenCalled();
  });
});
