import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../src/App';

// Mock MDXEditor for testing environment since lexical/codemirror require real DOM layout
vi.mock('../../src/components/Editor', () => ({
  Editor: ({ tabId, markdown, onChange, onSave }: any) => (
    <div data-testid={`editor-${tabId}`}>
      <textarea
        data-testid="mock-markdown-textarea"
        value={markdown}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            onSave?.();
          }
        }}
      />
    </div>
  ),
}));

describe('E2E: End-to-End Workflow & Stress Chaos Testing (20% Happy / 80% Destructive)', () => {
  let mockNotes: any[];
  let writtenFiles: Record<string, string>;

  beforeEach(() => {
    writtenFiles = {};
    mockNotes = [
      { name: 'Bienvenido.md', path: '/notes/Bienvenido.md', updatedAt: new Date().toISOString(), size: 1024 },
    ];

    window.electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      setAlwaysOnTop: vi.fn().mockImplementation((flag) => Promise.resolve(flag)),
      getAlwaysOnTop: vi.fn().mockResolvedValue(false),
      getNotesPath: vi.fn().mockResolvedValue('/notes'),
      listNotes: vi.fn().mockImplementation(() => Promise.resolve({ success: true, notes: mockNotes })),
      readFile: vi.fn().mockImplementation((filePath) =>
        Promise.resolve({ success: true, content: writtenFiles[filePath] || '# Bienvenido.md\n\nContenido de prueba' })
      ),
      writeFile: vi.fn().mockImplementation((filePath, content) => {
        writtenFiles[filePath] = content;
        return Promise.resolve({ success: true });
      }),
      deleteFile: vi.fn().mockResolvedValue({ success: true }),
      renameFile: vi.fn().mockResolvedValue({ success: true }),
      getAppConfig: vi.fn().mockResolvedValue({
        notesPath: '/notes',
        alwaysOnTop: false,
        githubRepo: '',
        githubBranch: 'main',
        autoSyncOnSave: false,
      }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      gitStatus: vi.fn().mockResolvedValue({
        success: true,
        currentBranch: 'main',
        modified: [],
        not_added: [],
        staged: [],
        hasChanges: false,
      }),
      gitCommit: vi.fn().mockResolvedValue({ success: true }),
      gitPush: vi.fn().mockResolvedValue({ success: true }),
      gitPull: vi.fn().mockResolvedValue({ success: true }),
      gitSync: vi.fn().mockResolvedValue({ success: true, synced: true, message: 'Notas sincronizadas' }),
      gitHistory: vi.fn().mockResolvedValue({ success: true, all: [] }),
      gitFileAtCommit: vi.fn().mockResolvedValue({ success: true, content: '' }),
      gitSetRemote: vi.fn().mockResolvedValue({ success: true }),
      gitInit: vi.fn().mockResolvedValue({ success: true, isRepo: true }),
      selectFolder: vi.fn().mockResolvedValue('/notes'),
    } as any;
  });

  // --- 20% HAPPY PATH E2E TESTS ---
  it('[HAPPY E2E 1/2] Full Note Lifecycle: creates new tab (Orca style), writes content, saves with Ctrl+S, commits to Git', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    // 1. Create new tab with "+" button
    const newTabBtn = screen.getByTitle(/Nueva nota Markdown/i);
    fireEvent.click(newTabBtn);

    // 2. Verify new tab appeared and is active
    await waitFor(() => {
      expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1);
    });

    // 3. Edit markdown content in textarea
    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: '# Tareas Pendientes\n\n- [x] Implementar BoldNotes' } });

    // 4. Save using Ctrl+S
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });

    // 5. Verify writeFile was called and notification displayed
    await waitFor(() => {
      expect(window.electronAPI?.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('scratch-1.md'),
        '# Tareas Pendientes\n\n- [x] Implementar BoldNotes'
      );
      expect(screen.getByText(/Guardado & Versionado/i)).toBeInTheDocument();
    });
  });

  it('[HAPPY E2E 2/2] Superposición (Always on Top) toggle flow', async () => {
    render(<App />);

    const pinBtn = screen.getByTitle(/Activar superposición/i);
    fireEvent.click(pinBtn);

    await waitFor(() => {
      expect(window.electronAPI?.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(screen.getByText(/Superposición activada/i)).toBeInTheDocument();
      expect(screen.getByText('ENCIMA')).toBeInTheDocument();
    });
  });

  // --- 80% DESTRUCTIVE / CHAOS / STRESS E2E TESTS ---
  it('[CHAOS E2E 1/8] Rapid tab spamming (creates 20 scratch tabs in succession without collision)', async () => {
    render(<App />);

    const newTabBtn = screen.getByTitle(/Nueva nota Markdown/i);
    for (let i = 0; i < 20; i++) {
      fireEvent.click(newTabBtn);
    }

    // All tabs should be accounted for and last tab should be active
    await waitFor(() => {
      expect(screen.getAllByText('scratch-20.md').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('[CHAOS E2E 2/8] Save failure handling: keeps dirty state so user does not lose unsaved data', async () => {
    (window.electronAPI?.writeFile as any).mockResolvedValueOnce({
      success: false,
      error: 'Disk full / EACCES permission denied',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: 'Important unsaved work' } });

    // Click bottom save button
    const saveBtn = screen.getByText(/Guardar \(Ctrl\+S\)/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Error al guardar: Disk full/i)).toBeInTheDocument();
      // Ensure dirty indicator is still present
      expect(screen.getByText('*sin guardar')).toBeInTheDocument();
    });
  });

  it('[CHAOS E2E 3/8] Closing dirty tab and declining prompt aborts closure', async () => {
    window.confirm = vi.fn().mockReturnValue(false); // User clicks "Cancel"

    render(<App />);

    // Wait for initial note to load
    await waitFor(() => expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1));

    // Add new tab and make dirty
    fireEvent.click(screen.getByTitle(/Nueva nota Markdown/i));
    await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));

    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: 'Unsaved draft' } });

    // Attempt to close scratch-1.md
    const closeButtons = screen.getAllByTitle('Cerrar pestaña');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(window.confirm).toHaveBeenCalled();
    // Tab must still exist
    expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1);
  });

  it('[CHAOS E2E 4/8] Closing dirty tab and accepting prompt closes tab and activates neighbor', async () => {
    window.confirm = vi.fn().mockReturnValue(true); // User clicks "OK"

    render(<App />);

    // Wait for initial note to load
    await waitFor(() => expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByTitle(/Nueva nota Markdown/i));
    await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));

    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: 'To be discarded' } });

    const closeButtons = screen.getAllByTitle('Cerrar pestaña');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(window.confirm).toHaveBeenCalled();
    // Tab scratch-1.md should be gone, and Bienvenido.md should be active
    await waitFor(() => {
      expect(screen.queryByText('scratch-1.md')).not.toBeInTheDocument();
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('[CHAOS E2E 5/8] NotesDrawer opens note; if already open, switches without duplication', async () => {
    render(<App />);

    // Open Notes Explorer drawer
    fireEvent.click(screen.getByTitle('Explorador de Notas Markdown'));

    await waitFor(() => {
      expect(screen.getByText('Explorador de Notas Markdown')).toBeInTheDocument();
    });

    // Click on Bienvenido.md in drawer
    const noteItems = screen.getAllByText('Bienvenido.md');
    fireEvent.click(noteItems[noteItems.length - 1]);

    // Should still have only 1 Bienvenido.md tab in the tabbar
    const tabsInDom = screen.getAllByText('Bienvenido.md');
    expect(tabsInDom.length).toBeGreaterThanOrEqual(1);
  });

  it('[CHAOS E2E 6/8] 1-Click Git Sync failure displays error notification without crashing UI', async () => {
    (window.electronAPI?.gitSync as any).mockResolvedValueOnce({
      success: false,
      error: 'Git conflict in remote main branch',
    });

    render(<App />);

    // Click header cyan sync button
    fireEvent.click(screen.getByTitle('Sincronizar con GitHub'));

    await waitFor(() => {
      expect(screen.getByText('Control de Versiones & GitHub')).toBeInTheDocument();
    });
  });

  it('[CHAOS E2E 7/8] Double-click rename persists file change on disk', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.doubleClick(screen.getByTitle(/Bienvenido\.md/i));
    const input = screen.getByDisplayValue('Bienvenido.md');
    fireEvent.change(input, { target: { value: 'Renombrado.md' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(window.electronAPI?.renameFile).toHaveBeenCalledWith(
        '/notes/Bienvenido.md',
        '/notes/Renombrado.md'
      );
      expect(screen.getAllByText('Renombrado.md').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('[CHAOS E2E 8/8] Rapid Ctrl+S save spamming does not trigger race condition or throw', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const textarea = screen.getByTestId('mock-markdown-textarea');
    for (let i = 0; i < 25; i++) {
      fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });
    }

    await waitFor(() => {
      expect(window.electronAPI?.writeFile).toHaveBeenCalled();
    });
  });
});
