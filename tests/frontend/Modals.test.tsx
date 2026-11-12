import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecentFilesDrawer } from '../../src/components/RecentFilesDrawer';
import { SettingsModal } from '../../src/components/SettingsModal';
import type { RecentFile } from '../../src/types/electron';

describe('Frontend: Modals & Drawers (20% Happy / 80% Destructive)', () => {
  const sampleRecent: RecentFile[] = [
    { name: 'Bienvenido.md', path: '/notes/Bienvenido.md', openedAt: Date.now() - 60_000 },
    { name: 'ROADMAP.md', path: '/proyectos/nube-linda/roadmaps/ROADMAP.md', openedAt: Date.now() - 3 * 3_600_000 },
  ];

  const renderDrawer = (overrides: Partial<React.ComponentProps<typeof RecentFilesDrawer>> = {}) => {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      recentFiles: sampleRecent,
      openPaths: ['/notes/Bienvenido.md'],
      onOpenRecent: vi.fn(),
      onRemoveRecent: vi.fn(),
      onClearRecent: vi.fn(),
      onBrowse: vi.fn(),
      ...overrides,
    };
    render(<RecentFilesDrawer {...props} />);
    return props;
  };

  beforeEach(() => {
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({
        notesPath: '/notes',
        alwaysOnTop: false,
        darkMode: false,
      }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      selectFolder: vi.fn().mockResolvedValue('/custom/notes'),
    } as any;
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/2] RecentFilesDrawer lists history with folder and age, and opens on click', () => {
    const props = renderDrawer();
    expect(screen.getByText('Bienvenido.md')).toBeInTheDocument();
    expect(screen.getByText('/proyectos/nube-linda/roadmaps')).toBeInTheDocument();
    expect(screen.getByText('hace 1 min')).toBeInTheDocument();
    expect(screen.getByText('hace 3 h')).toBeInTheDocument();
    expect(screen.getByText('abierto')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ROADMAP.md'));
    expect(props.onOpenRecent).toHaveBeenCalledWith(sampleRecent[1]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('[HAPPY 2/2] SettingsModal loads config and allows folder selection', async () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onConfigChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('/notes')).toBeInTheDocument();
    });

    const browseBtn = screen.getByText('Examinar');
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(window.electronAPI?.selectFolder).toHaveBeenCalled();
    });
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/6] RecentFilesDrawer search filters by name or folder, accent-insensitive, with empty state', () => {
    renderDrawer();
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre o carpeta/i);
    fireEvent.change(searchInput, { target: { value: 'NUBE-LINDA' } });
    expect(screen.getByText('ROADMAP.md')).toBeInTheDocument();
    expect(screen.queryByText('Bienvenido.md')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'zzzz-no-existe' } });
    expect(screen.getByText(/Ningún archivo reciente coincide/i)).toBeInTheDocument();
  });

  it('[CHAOS 2/6] RecentFilesDrawer removes an entry without opening it, and clears the history', () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByLabelText('Quitar ROADMAP.md del historial'));
    expect(props.onRemoveRecent).toHaveBeenCalledWith('/proyectos/nube-linda/roadmaps/ROADMAP.md');
    expect(props.onOpenRecent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Limpiar historial'));
    expect(props.onClearRecent).toHaveBeenCalled();
  });

  it('[CHAOS 3/6] RecentFilesDrawer "Abrir…" closes the history and opens the file picker', () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByTitle(/Buscar un archivo en el disco/i));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onBrowse).toHaveBeenCalled();
  });

  it('[CHAOS 4/6] SettingsModal has no GitHub fields, never saves GitHub settings, and closes on save', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onConfigChanged={vi.fn()}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('/notes')).toBeInTheDocument();
    });
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ghp_/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Guardar Ajustes'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    const saved = (window.electronAPI?.saveAppConfig as any).mock.calls[0][0];
    expect(saved).toEqual({ alwaysOnTop: false, darkMode: false });
  });

  it('[CHAOS 5/6] SettingsModal displays error banner if saving config fails', async () => {
    (window.electronAPI?.saveAppConfig as any).mockRejectedValueOnce(new Error('Disco lleno'));

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onConfigChanged={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('/notes')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Guardar Ajustes'));

    await waitFor(() => {
      expect(screen.getByText('Disco lleno')).toBeInTheDocument();
    });
  });

  it('[CHAOS 6/6] RecentFilesDrawer renders gracefully with an empty history', () => {
    renderDrawer({ recentFiles: [] });
    expect(screen.getByText(/Todavía no abriste archivos/i)).toBeInTheDocument();
    expect(screen.queryByText('Limpiar historial')).not.toBeInTheDocument();
  });
});
