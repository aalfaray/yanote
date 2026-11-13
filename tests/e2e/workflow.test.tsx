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
      {/* What MDXEditor does right after loading a note: reformat it (onChange with the normalization flag) */}
      <button data-testid="mock-normalize" onClick={() => onChange(`${markdown}
`, true)} />
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
      }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      selectFolder: vi.fn().mockResolvedValue('/notes'),
      revealInExplorer: vi.fn().mockResolvedValue({ success: true }),
    } as any;
  });

  // --- 20% HAPPY PATH E2E TESTS ---
  it('[HAPPY E2E 1/4] Full Note Lifecycle: creates new tab (Orca style), writes content, saves with Ctrl+S', async () => {
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
    fireEvent.change(textarea, { target: { value: '# Tareas Pendientes\n\n- [x] Implementar yanote' } });

    // 4. Save using Ctrl+S
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });

    // 5. Verify writeFile was called and notification displayed
    await waitFor(() => {
      expect(window.electronAPI?.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('scratch-1.md'),
        '# Tareas Pendientes\n\n- [x] Implementar yanote'
      );
      expect(screen.getByText(/✓ Guardado: scratch-1.md/i)).toBeInTheDocument();
    });
  });

  it('[HAPPY E2E 2/4] Superposición (Always on Top) toggle flow', async () => {
    render(<App />);

    const pinBtn = screen.getByTitle(/Activar superposición/i);
    fireEvent.click(pinBtn);

    await waitFor(() => {
      expect(window.electronAPI?.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(screen.getByText(/Superposición activada/i)).toBeInTheDocument();
      expect(screen.getByText('ENCIMA')).toBeInTheDocument();
    });
  });

  it('[HAPPY E2E 3/4] Dark Mode Toggle Workflow: toggles dark mode, adds "dark" class to html, and persists config', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const darkBtn = screen.getByTitle(/Cambiar a modo oscuro/i);
    fireEvent.click(darkBtn);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(window.electronAPI?.saveAppConfig).toHaveBeenCalledWith({ darkMode: true });
      expect(screen.getByText(/Modo Oscuro Activado/i)).toBeInTheDocument();
      expect(screen.getByText('CLARO')).toBeInTheDocument();
    });
  });

  it('[HAPPY E2E 4/4] Tab Context Menu Complete Workflow: right-click tab, pin tab, and close other tabs', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    // Open second tab
    const newTabBtn = screen.getByTitle(/Nueva nota Markdown/i);
    fireEvent.click(newTabBtn);

    await waitFor(() => {
      expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1);
    });

    // Right-click on Bienvenido.md tab
    const bienvenidoTab = screen.getAllByText('Bienvenido.md')[0];
    fireEvent.contextMenu(bienvenidoTab, { clientX: 100, clientY: 100 });

    // Verify context menu opened
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Fijar pestaña')).toBeInTheDocument();

    // Click "Fijar pestaña"
    fireEvent.click(screen.getByText('Fijar pestaña'));

    await waitFor(() => {
      expect(screen.getByTitle('Pestaña fijada')).toBeInTheDocument();
      expect(screen.getByText(/Pestaña fijada/i)).toBeInTheDocument();
    });

    // Right-click again on Bienvenido.md to verify menu now shows "Desfijar pestaña"
    fireEvent.contextMenu(bienvenidoTab, { clientX: 100, clientY: 100 });
    expect(screen.getByText('Desfijar pestaña')).toBeInTheDocument();

    // Close other unpinned tabs
    const closeOthersBtn = screen.getByText('Cerrar otras');
    fireEvent.click(closeOthersBtn);

    // Because scratch-1.md has unsaved changes, ConfirmModal appears to protect user data
    await waitFor(() => {
      expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Descartar y Cerrar'));

    await waitFor(() => {
      expect(screen.queryByText('scratch-1.md')).not.toBeInTheDocument();
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
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
    const saveBtn = screen.getByTitle(/Guardar nota \(Ctrl \+ S\)/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Error al guardar: Disk full/i)).toBeInTheDocument();
      // Ensure dirty indicator is still present
      expect(screen.getByText('*sin guardar')).toBeInTheDocument();
    });
  });

  it('[CHAOS E2E 3/8] Closing dirty tab and declining prompt aborts closure', async () => {
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

    // Verify Neubrutalist ConfirmModal is shown
    await waitFor(() => {
      expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    });

    // Click "Cancelar"
    fireEvent.click(screen.getByText('Cancelar'));

    // Tab must still exist
    expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1);
  });

  it('[CHAOS E2E 4/8] Closing dirty tab and accepting prompt closes tab and activates neighbor', async () => {
    render(<App />);

    // Wait for initial note to load
    await waitFor(() => expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByTitle(/Nueva nota Markdown/i));
    await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));

    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: 'To be discarded' } });

    const closeButtons = screen.getAllByTitle('Cerrar pestaña');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    // Verify Neubrutalist ConfirmModal is shown
    await waitFor(() => {
      expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    });

    // Click "Descartar y Cerrar"
    fireEvent.click(screen.getByText('Descartar y Cerrar'));

    // Tab scratch-1.md should be gone, and Bienvenido.md should be active
    await waitFor(() => {
      expect(screen.queryByText('scratch-1.md')).not.toBeInTheDocument();
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('[CHAOS E2E 5/8] Recent files history opens a file; an already open one switches without duplication', async () => {
    (window.electronAPI?.getAppConfig as any).mockResolvedValue({
      notesPath: '/notes',
      alwaysOnTop: false,
      recentFiles: [
        { path: '/proyectos/Plan.md', name: 'Plan.md', openedAt: Date.now() - 60_000 },
        { path: '/notes/Bienvenido.md', name: 'Bienvenido.md', openedAt: Date.now() - 120_000 },
      ],
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTitle('Archivos recientes'));
    await waitFor(() => {
      expect(screen.getByText('Plan.md')).toBeInTheDocument();
    });
    expect(screen.getByText('/proyectos')).toBeInTheDocument();

    // Opens a file from another folder in a new tab and moves it to the top of the history
    fireEvent.click(screen.getByText('Plan.md'));
    await waitFor(() => {
      expect(window.electronAPI?.readFile).toHaveBeenCalledWith('/proyectos/Plan.md');
      expect(screen.getAllByText('Plan.md').length).toBeGreaterThanOrEqual(1);
    });
    expect(window.electronAPI?.saveAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ recentFiles: expect.arrayContaining([expect.objectContaining({ path: '/proyectos/Plan.md' })]) })
    );

    // Bienvenido.md is already open: picking it again must not duplicate the tab
    fireEvent.click(screen.getByTitle('Archivos recientes'));
    const items = await screen.findAllByText('Bienvenido.md');
    const before = screen.getAllByText('Bienvenido.md').length;
    fireEvent.click(items[items.length - 1]);
    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeLessThanOrEqual(before);
    });
  });

  it('[CHAOS E2E 6/8] App shows no Git / GitHub controls anywhere', async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByTitle(/git/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Control de Versiones|Sincronizar/i);
  });

  it('[CHAOS E2E 7/8] Double-click rename persists file change on disk', async () => {
    // The note on disk comes back from the previous session
    window.electronAPI!.getAppConfig = vi.fn().mockResolvedValue({
      notesPath: '/notes',
      alwaysOnTop: false,
      openTabs: [{ path: '/notes/Bienvenido.md', title: 'Bienvenido.md' }],
    });
    render(<App />);

    await waitFor(() => {
      expect(window.electronAPI?.readFile).toHaveBeenCalledWith('/notes/Bienvenido.md');
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

  it('[CHAOS E2E 9/12] toggling dark mode via Ctrl+Shift+D keyboard shortcut works reliably', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    // Toggle back with keyboard
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('[CHAOS E2E 10/12] rapid toggling between light and dark modes preserves tab content and active state', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: 'Preserved notes content' } });

    // Spam 10 dark mode toggles
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true });
    }

    expect((screen.getByTestId('mock-markdown-textarea') as HTMLTextAreaElement).value).toBe(
      'Preserved notes content'
    );
  });

  it('[CHAOS E2E 11/12] initial load respects darkMode: true from stored app-config.json', async () => {
    (window.electronAPI?.getAppConfig as any).mockResolvedValueOnce({
      notesPath: '/notes',
      alwaysOnTop: false,
      darkMode: true,
    });

    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(screen.getByText('CLARO')).toBeInTheDocument();
    });
  });

  it('[CHAOS E2E 12/16] saving dark mode when saveAppConfig fails rejects safely without unmounting editor', async () => {
    (window.electronAPI?.saveAppConfig as any).mockRejectedValueOnce(new Error('Disk write error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const darkBtn = screen.getByTitle(/Cambiar a modo oscuro/i);
    expect(() => fireEvent.click(darkBtn)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByTestId('mock-markdown-textarea')).toBeInTheDocument();
    });
  });

  it('[CHAOS E2E 13/16] Close All tabs via shortcut Ctrl+Alt+W triggers ConfirmModal if any tab has unsaved changes', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    // Make active tab dirty
    const textarea = screen.getByTestId('mock-markdown-textarea');
    fireEvent.change(textarea, { target: { value: 'Contenido no guardado para probar modal' } });

    // Press Ctrl+Alt+W
    fireEvent.keyDown(window, { key: 'w', ctrlKey: true, altKey: true });

    // ConfirmModal should appear
    await waitFor(() => {
      expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
      expect(screen.getByText(/tiene cambios sin guardar/i)).toBeInTheDocument();
    });

    // Cancel modal
    const cancelBtn = screen.getByText('Cancelar');
    fireEvent.click(cancelBtn);

    // Tab must still be present with content intact
    expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    expect((screen.getByTestId('mock-markdown-textarea') as HTMLTextAreaElement).value).toBe(
      'Contenido no guardado para probar modal'
    );
  });

  it('[CHAOS E2E 14/16] Close active tab via shortcut Ctrl+W prevents closing pinned tab', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    // Right-click and pin Bienvenido.md
    const tabEl = screen.getAllByText('Bienvenido.md')[0];
    fireEvent.contextMenu(tabEl, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByText('Fijar pestaña'));

    await waitFor(() => {
      expect(screen.getByTitle('Pestaña fijada')).toBeInTheDocument();
    });

    // Try pressing Ctrl+W to close it
    fireEvent.keyDown(window, { key: 'w', ctrlKey: true });

    // Should NOT close - Bienvenido.md remains open
    expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
  });

  it('[CHAOS E2E 15/16] Reveal in explorer IPC call handles failure safely without crashing app', async () => {
    (window.electronAPI?.revealInExplorer as any).mockResolvedValueOnce({
      success: false,
      error: 'Archivo no encontrado en disco',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const tabEl = screen.getAllByText('Bienvenido.md')[0];
    fireEvent.contextMenu(tabEl, { clientX: 100, clientY: 100 });

    const revealBtn = screen.getByText('Revelar en el Explorador de archivos');
    expect(() => fireEvent.click(revealBtn)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText(/Archivo no encontrado en disco/i)).toBeInTheDocument();
    });
  });

  it('[CHAOS E2E 16/16] Toggle preview mode via context menu switches editor viewMode and shows notification', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
    });

    const tabEl = screen.getAllByText('Bienvenido.md')[0];
    fireEvent.contextMenu(tabEl, { clientX: 100, clientY: 100 });

    const togglePreviewBtn = screen.getByText('Abrir vista previa de Markdown');
    fireEvent.click(togglePreviewBtn);

    await waitFor(() => {
      expect(screen.getByText(/Modo Código Fuente Markdown/i)).toBeInTheDocument();
    });

    // Toggle back to rich preview
    fireEvent.contextMenu(tabEl, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByText('Abrir vista previa de Markdown'));

    await waitFor(() => {
      expect(screen.getByText(/Modo Vista Previa Enriquecida/i)).toBeInTheDocument();
    });
  });

  describe('startup session', () => {
    const config = (extra: object) =>
      (window.electronAPI!.getAppConfig = vi.fn().mockResolvedValue({ notesPath: '/notes', alwaysOnTop: false, ...extra }));

    it('shows the welcome note only on the first start and remembers it was seen', async () => {
      config({});
      render(<App />);
      await waitFor(() => expect(window.electronAPI?.saveAppConfig).toHaveBeenCalledWith({ welcomeSeen: true }));
      expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1);
      // never opens notes from the folder on its own
      expect(window.electronAPI?.readFile).not.toHaveBeenCalled();
    });

    it('after the first start, opens an empty note instead of the welcome', async () => {
      config({ welcomeSeen: true });
      render(<App />);
      await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));
      expect(screen.queryByText('Bienvenido.md')).not.toBeInTheDocument();
    });

    it('reopens the notes left open last time, skipping missing ones, and keeps the active one', async () => {
      writtenFiles['/notes/a.md'] = '# A';
      writtenFiles['/notes/b.md'] = '# B';
      window.electronAPI!.readFile = vi.fn().mockImplementation((p: string) =>
        Promise.resolve(p in writtenFiles ? { success: true, content: writtenFiles[p] } : { success: false, error: 'no existe' })
      );
      config({
        welcomeSeen: true,
        openTabs: [
          { path: '/notes/a.md', title: 'a.md' },
          { path: '/notes/borrado.md', title: 'borrado.md' },
          { path: '/notes/b.md', title: 'b.md', isPinned: true },
        ],
        activeTabPath: '/notes/a.md',
      });
      render(<App />);
      await waitFor(() => expect(screen.getAllByText('b.md').length).toBeGreaterThanOrEqual(1));
      expect(screen.getAllByText('a.md').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('borrado.md')).not.toBeInTheDocument();
      expect(screen.queryByText('Bienvenido.md')).not.toBeInTheDocument();
      expect((screen.getByTestId('mock-markdown-textarea') as HTMLTextAreaElement).value).toBe('# A');
    });

    it('saves the open notes so they come back next time', async () => {
      config({ welcomeSeen: true });
      window.electronAPI!.openMarkdownFile = vi.fn().mockResolvedValue({
        files: [{ path: '/proyectos/plan.md', name: 'plan.md', content: '# Plan' }],
        errors: [],
      });
      render(<App />);
      await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));
      fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
      await waitFor(
        () =>
          expect(window.electronAPI?.saveAppConfig).toHaveBeenCalledWith({
            openTabs: [{ path: '/proyectos/plan.md', title: 'plan.md', isPinned: false }],
            activeTabPath: '/proyectos/plan.md',
          }),
        { timeout: 3000 }
      );
    });
  });

  describe('drag & drop of .md files', () => {
    const dropOn = (target: Element | Window, files: File[]) => {
      const dataTransfer = { files, types: ['Files'], dropEffect: 'none' };
      fireEvent.dragEnter(target, { dataTransfer });
      fireEvent.dragOver(target, { dataTransfer });
      return fireEvent.drop(target, { dataTransfer });
    };

    beforeEach(() => {
      window.electronAPI!.getAppConfig = vi.fn().mockResolvedValue({ notesPath: '/notes', alwaysOnTop: false, welcomeSeen: true });
      window.electronAPI!.getPathForFile = vi.fn((f: File) => `/docs/${f.name}`);
      writtenFiles['/docs/plan.md'] = '# Plan soltado';
      writtenFiles['/docs/ideas.markdown'] = '# Ideas';
    });

    it('opens every dropped markdown file in its own tab, even when dropped on the editor', async () => {
      render(<App />);
      await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));
      const editor = screen.getByTestId('mock-markdown-textarea');
      const notDefault = dropOn(editor, [new File(['x'], 'plan.md'), new File(['x'], 'ideas.markdown'), new File(['x'], 'foto.png')]);
      // the app handled it (no navigation to the file)
      expect(notDefault).toBe(false);
      await waitFor(() => expect(screen.getAllByText('ideas.markdown').length).toBeGreaterThanOrEqual(1));
      expect(screen.getAllByText('plan.md').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('foto.png')).not.toBeInTheDocument();
      // the empty start-up note was replaced, not kept next to them
      expect(screen.queryByText('scratch-1.md')).not.toBeInTheDocument();
      expect(window.electronAPI?.readFile).toHaveBeenCalledWith('/docs/plan.md');
      await waitFor(() =>
        expect(window.electronAPI?.saveAppConfig).toHaveBeenCalledWith(
          expect.objectContaining({ recentFiles: expect.arrayContaining([expect.objectContaining({ path: '/docs/plan.md' })]) })
        )
      );
    });

    it('focuses an already open note instead of duplicating it', async () => {
      render(<App />);
      await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));
      dropOn(window, [new File(['x'], 'plan.md')]);
      await waitFor(() => expect(screen.getAllByText('plan.md').length).toBeGreaterThanOrEqual(1));
      const count = screen.getAllByText('plan.md').length;
      dropOn(window, [new File(['x'], 'plan.md')]);
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getAllByText('plan.md').length).toBe(count);
    });

    it('shows the drop hint while dragging files and hides it after the drop', async () => {
      render(<App />);
      const dataTransfer = { files: [], types: ['Files'] };
      fireEvent.dragEnter(window, { dataTransfer });
      expect(await screen.findByTestId('drop-overlay')).toBeInTheDocument();
      fireEvent.drop(window, { dataTransfer });
      await waitFor(() => expect(screen.queryByTestId('drop-overlay')).not.toBeInTheDocument());
    });

    it('ignores non-markdown files and reports files without a disk path', async () => {
      window.electronAPI!.getPathForFile = vi.fn(() => null);
      render(<App />);
      await waitFor(() => expect(screen.getAllByText('scratch-1.md').length).toBeGreaterThanOrEqual(1));
      dropOn(window, [new File(['x'], 'foto.png')]);
      expect(window.electronAPI?.readFile).not.toHaveBeenCalled();
      dropOn(window, [new File(['x'], 'nota.md')]);
      expect(await screen.findByText(/No se pudo abrir: nota\.md/)).toBeInTheDocument();
    });
  });

  it('opening a note never marks it unsaved, even when the editor reformats it; typing does', async () => {
    window.electronAPI!.getAppConfig = vi.fn().mockResolvedValue({
      notesPath: '/notes',
      alwaysOnTop: false,
      welcomeSeen: true,
      openTabs: [{ path: '/notes/AGENTS.md', title: 'AGENTS.md' }],
    });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('AGENTS.md').length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getByTestId('mock-normalize'));
    expect(screen.queryByTitle('Cambios sin guardar')).not.toBeInTheDocument();
    expect(screen.queryByText(/sin guardar/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mock-markdown-textarea'), { target: { value: '# Editado' } });
    expect(screen.getAllByTitle('Cambios sin guardar').length).toBeGreaterThan(0);
  });

  it('the floating notice has an x that closes it right away', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Bienvenido.md').length).toBeGreaterThanOrEqual(1));
    fireEvent.keyDown(screen.getByTestId('mock-markdown-textarea'), { key: 's', ctrlKey: true });
    const notice = await screen.findByText(/Guardado/);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(notice).not.toBeInTheDocument();
  });
});
