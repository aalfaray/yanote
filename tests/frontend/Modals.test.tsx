import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotesDrawer } from '../../src/components/NotesDrawer';
import { GitModal } from '../../src/components/GitModal';
import { SettingsModal } from '../../src/components/SettingsModal';
import type { NoteFile } from '../../src/types/electron';

describe('Frontend: Modals & Drawers (20% Happy / 80% Destructive)', () => {
  const sampleNotes: NoteFile[] = [
    { name: 'Bienvenido.md', path: '/notes/Bienvenido.md', updatedAt: new Date().toISOString(), size: 1024 },
    { name: 'Proyecto.md', path: '/notes/Proyecto.md', updatedAt: new Date().toISOString(), size: 2048 },
  ];

  beforeEach(() => {
    window.electronAPI = {
      gitStatus: vi.fn().mockResolvedValue({
        success: true,
        currentBranch: 'main',
        modified: ['Bienvenido.md'],
        not_added: [],
        staged: [],
        hasChanges: true,
      }),
      gitHistory: vi.fn().mockResolvedValue({
        success: true,
        all: [{ hash: 'abcdef1', date: new Date().toISOString(), message: 'Initial commit', author_name: 'Developer' }],
      }),
      gitCommit: vi.fn().mockResolvedValue({ success: true }),
      gitPush: vi.fn().mockResolvedValue({ success: true }),
      gitPull: vi.fn().mockResolvedValue({ success: true }),
      gitSync: vi.fn().mockResolvedValue({ success: true, synced: true, message: 'Sync done' }),
      getAppConfig: vi.fn().mockResolvedValue({
        notesPath: '/notes',
        alwaysOnTop: false,
        githubRepo: 'https://github.com/test/repo.git',
        githubBranch: 'main',
        githubToken: '',
        autoSyncOnSave: false,
      }),
      saveAppConfig: vi.fn().mockResolvedValue({}),
      selectFolder: vi.fn().mockResolvedValue('/custom/notes'),
      gitSetRemote: vi.fn().mockResolvedValue({ success: true }),
    } as any;
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/3] NotesDrawer displays notes and triggers onOpenNote on click', () => {
    const onOpenNote = vi.fn();
    render(
      <NotesDrawer
        isOpen={true}
        onClose={vi.fn()}
        notes={sampleNotes}
        onOpenNote={onOpenNote}
        onNewNote={vi.fn()}
        onDeleteNote={vi.fn()}
      />
    );

    expect(screen.getByText('Bienvenido.md')).toBeInTheDocument();
    expect(screen.getByText('Proyecto.md')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Bienvenido.md'));
    expect(onOpenNote).toHaveBeenCalledWith(sampleNotes[0]);
  });

  it('[HAPPY 2/3] GitModal loads branch name and triggers commit action', async () => {
    render(
      <GitModal
        isOpen={true}
        onClose={vi.fn()}
        onRefreshNotes={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    const commitInput = screen.getByPlaceholderText(/Notas de la reunión/i);
    fireEvent.change(commitInput, { target: { value: 'Fix typos' } });

    const commitBtn = screen.getByText('Solo Commit');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(window.electronAPI?.gitCommit).toHaveBeenCalledWith('Fix typos');
    });
  });

  it('[HAPPY 3/3] SettingsModal loads config and allows folder selection', async () => {
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
  it('[CHAOS 1/8] NotesDrawer search with non-matching string displays empty state message', () => {
    render(
      <NotesDrawer
        isOpen={true}
        onClose={vi.fn()}
        notes={sampleNotes}
        onOpenNote={vi.fn()}
        onNewNote={vi.fn()}
        onDeleteNote={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Buscar nota por nombre/i);
    fireEvent.change(searchInput, { target: { value: 'zzzz-does-not-exist' } });

    expect(screen.getByText(/No se encontraron notas/i)).toBeInTheDocument();
  });

  it('[CHAOS 2/8] NotesDrawer delete note button confirms and deletes on accept', () => {
    const onDeleteNote = vi.fn();
    window.confirm = () => true;

    const { container } = render(
      <NotesDrawer
        isOpen={true}
        onClose={vi.fn()}
        notes={sampleNotes}
        onOpenNote={vi.fn()}
        onNewNote={vi.fn()}
        onDeleteNote={onDeleteNote}
      />
    );

    const deleteBtns = container.querySelectorAll('button[title="Eliminar archivo"]');
    expect(deleteBtns.length).toBe(2);
    fireEvent.click(deleteBtns[0]);

    expect(onDeleteNote).toHaveBeenCalledWith(sampleNotes[0].path);
  });

  it('[CHAOS 3/8] NotesDrawer delete note cancelled if user declines confirm prompt', () => {
    const onDeleteNote = vi.fn();
    window.confirm = () => false;

    const { container } = render(
      <NotesDrawer
        isOpen={true}
        onClose={vi.fn()}
        notes={sampleNotes}
        onOpenNote={vi.fn()}
        onNewNote={vi.fn()}
        onDeleteNote={onDeleteNote}
      />
    );

    const deleteBtns = container.querySelectorAll('button[title="Eliminar archivo"]');
    fireEvent.click(deleteBtns[0]);

    expect(onDeleteNote).not.toHaveBeenCalled();
  });

  it('[CHAOS 4/8] GitModal displays error message when git commit fails', async () => {
    (window.electronAPI?.gitCommit as any).mockResolvedValueOnce({
      success: false,
      error: 'Lockfile already exists',
    });

    render(
      <GitModal
        isOpen={true}
        onClose={vi.fn()}
        onRefreshNotes={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Solo Commit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Solo Commit'));

    await waitFor(() => {
      expect(screen.getByText(/Error al hacer commit: Lockfile already exists/i)).toBeInTheDocument();
    });
  });

  it('[CHAOS 5/8] GitModal history tab displays commit records safely', async () => {
    render(
      <GitModal
        isOpen={true}
        onClose={vi.fn()}
        onRefreshNotes={vi.fn()}
      />
    );

    const historyTab = screen.getByText('Historial de Versiones');
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('Initial commit')).toBeInTheDocument();
      expect(screen.getByText('Developer')).toBeInTheDocument();
    });
  });

  it('[CHAOS 6/8] GitModal push failure shows descriptive alert', async () => {
    (window.electronAPI?.gitPush as any).mockResolvedValueOnce({
      success: false,
      error: 'Authentication failed for remote repository',
    });

    render(
      <GitModal
        isOpen={true}
        onClose={vi.fn()}
        onRefreshNotes={vi.fn()}
      />
    );

    const pushBtn = screen.getByText('Push a GitHub');
    fireEvent.click(pushBtn);

    await waitFor(() => {
      expect(screen.getByText(/Error en Push/i)).toBeInTheDocument();
    });
  });

  it('[CHAOS 7/8] SettingsModal displays error banner if gitSetRemote fails', async () => {
    (window.electronAPI?.gitSetRemote as any).mockResolvedValueOnce({
      success: false,
      error: 'Invalid remote repository format',
    });

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onConfigChanged={vi.fn()}
      />
    );

    // Wait for initial config to load into state
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://github.com/test/repo.git')).toBeInTheDocument();
    });

    const saveBtn = screen.getByText('Guardar Ajustes');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/error al vincular Git: Invalid remote repository format/i)).toBeInTheDocument();
    });
  });

  it('[CHAOS 8/8] NotesDrawer renders gracefully when 0 notes exist in repository', () => {
    render(
      <NotesDrawer
        isOpen={true}
        onClose={vi.fn()}
        notes={[]}
        onOpenNote={vi.fn()}
        onNewNote={vi.fn()}
        onDeleteNote={vi.fn()}
      />
    );

    expect(screen.getByText(/No hay notas en el repositorio aún/i)).toBeInTheDocument();
  });
});
