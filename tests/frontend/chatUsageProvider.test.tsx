import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useClaudeUsage } from '../../src/components/ClaudeUsageMeter';
import { App } from '../../src/App';

vi.mock('../../src/components/Editor', () => ({ Editor: () => null }));
vi.mock('../../src/components/ClaudeChatView', () => ({ ClaudeChatView: () => null }));
vi.mock('../../src/components/ClaudeUsageMeter', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/components/ClaudeUsageMeter')>(),
  useClaudeUsage: vi.fn(() => ({ success: true, available: true, fiveHour: { percent: 80, resetsAt: null }, weekly: null })),
}));

describe('App: usage belongs to the chat provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({
        openTabs: [
          { kind: 'claude', title: 'Claude Code' },
          { kind: 'claude', title: 'Antigravity', provider: 'antigravity' },
          { kind: 'scratch', title: 'note.md', content: '' },
        ],
        activeTabIndex: 0,
      }),
      getNotesPath: vi.fn().mockResolvedValue('/notes'),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      agyUsage: vi.fn().mockResolvedValue({ success: true, available: true, group: 'Gemini Models', weekly: { percent: 42, resetsAt: null } }),
    } as any;
  });

  it('shows Claude usage only on Claude Code, even with cached usage while switching tabs', async () => {
    render(<App />);
    await screen.findAllByText('Claude Code');
    expect(screen.getByTestId('claude-usage')).toHaveTextContent('80%');
    const claudeId = vi.mocked(useClaudeUsage).mock.lastCall![0][0];
    expect(vi.mocked(useClaudeUsage).mock.lastCall).toEqual([[claudeId], claudeId]);

    fireEvent.click(screen.getAllByText('Antigravity')[0]);
    expect(screen.queryByTestId('claude-usage')).not.toBeInTheDocument();
    expect(vi.mocked(useClaudeUsage).mock.lastCall).toEqual([[claudeId], undefined]);
    expect(await screen.findByText('42%')).toBeInTheDocument();
    expect(screen.getByTestId('antigravity-usage').title).toContain('Gemini Models');

    fireEvent.click(screen.getAllByText('note.md')[0]);
    expect(screen.queryByTestId('claude-usage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('antigravity-usage')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Claude Code')[0]);
    expect(screen.getByTestId('claude-usage')).toHaveTextContent('80%');
    expect(screen.queryByTestId('antigravity-usage')).not.toBeInTheDocument();
  });

  it('does not request Claude quota for a session containing only Antigravity', async () => {
    vi.mocked(window.electronAPI!.getAppConfig).mockResolvedValue({
      notesPath: '/notes', alwaysOnTop: false,
      openTabs: [{ kind: 'claude', title: 'Antigravity', provider: 'antigravity' }],
    });
    render(<App />);
    await screen.findAllByText('Antigravity');
    expect(vi.mocked(useClaudeUsage).mock.lastCall).toEqual([[], undefined]);
    expect(screen.queryByTestId('claude-usage')).not.toBeInTheDocument();
  });
});
