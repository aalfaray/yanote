import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../../src/components/Editor', () => ({ Editor: () => <div data-testid="editor" /> }));
vi.mock('../../src/components/ClaudeChatView', () => ({
  ClaudeChatView: ({ tabId, cwd, initialDraft, accountId }: any) => (
    <div data-testid={`chat-${tabId}`} data-cwd={cwd ?? ''} data-draft={initialDraft ?? ''} data-account={accountId ?? ''} />
  ),
}));
import { App } from '../../src/App';

describe('Right-click > "Enviar a un chat nuevo de Claude"', () => {
  let sendToChat: (text: string) => void;
  beforeEach(() => {
    sendToChat = () => {};
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({ notesPath: '/n', alwaysOnTop: false, welcomeSeen: true, activeClaudeAccount: 'default' }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      getNotesPath: vi.fn().mockResolvedValue('/n'),
      readFile: vi.fn(),
      onSendToNewChat: vi.fn((cb) => {
        sendToChat = cb;
        return () => {};
      }),
    } as any;
  });

  it('opens a new chat in the same folder and account with the selected text ready, not sent', async () => {
    render(<App />);
    await waitFor(() => expect(window.electronAPI!.getAppConfig).toHaveBeenCalled());
    act(() => screen.getByTitle(/Elegir tipo de pestaña nueva/).click());
    act(() => screen.getByRole('menuitem', { name: /Chat con Claude/ }).click());
    const first = await screen.findByTestId(/^chat-claude-/);

    act(() => sendToChat('  Revisa el commit de apps/pos  '));
    await waitFor(() => expect(screen.getAllByTestId(/^chat-claude-/)).toHaveLength(2));
    const second = screen.getAllByTestId(/^chat-claude-/).find((el) => el !== first)!;
    expect(second.dataset.draft).toBe('Revisa el commit de apps/pos');
    expect(second.dataset.cwd).toBe(first.dataset.cwd);
    expect(second.dataset.account).toBe('default');
    expect(screen.getAllByText('Claude 2').length).toBeGreaterThan(0);
  });

  it('ignores an empty selection', async () => {
    render(<App />);
    await waitFor(() => expect(window.electronAPI!.getAppConfig).toHaveBeenCalled());
    act(() => sendToChat('   '));
    expect(screen.queryByTestId(/^chat-claude-/)).not.toBeInTheDocument();
  });
});
