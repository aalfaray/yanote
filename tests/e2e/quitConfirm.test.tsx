import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../src/App';

vi.mock('../../src/components/Editor', () => ({
  Editor: ({ tabId }: any) => <div data-testid={`editor-${tabId}`} />,
}));

describe('E2E: confirm before quitting from the titlebar close button', () => {
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    close = vi.fn();
    (window as any).electronAPI = {
      close,
      minimize: vi.fn(),
      maximize: vi.fn(),
      getAppConfig: vi.fn().mockResolvedValue({}),
      listNotes: vi.fn().mockResolvedValue({ success: true, notes: [] }),
      getNotesPath: vi.fn().mockResolvedValue('/notes'),
      saveAppConfig: vi.fn().mockResolvedValue({}),
    };
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('asks for confirmation, saves the open tabs, and only closes after "Sí, cerrar"', async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Cerrar'));

    expect(screen.getByText('¿Estás seguro de que deseas cerrar el programa?')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Sí, cerrar'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    // The tabs are written before the window closes, so the next launch reopens them
    expect((window as any).electronAPI.saveAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ openTabs: [expect.objectContaining({ id: 'tab-welcome' })], activeTabId: 'tab-welcome' })
    );
    expect(screen.queryByText('¿Estás seguro de que deseas cerrar el programa?')).not.toBeInTheDocument();
  });

  it('cancel keeps the app open', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Cerrar'));
    fireEvent.click(screen.getByText('Cancelar'));

    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByText('¿Estás seguro de que deseas cerrar el programa?')).not.toBeInTheDocument();
  });

  it('warns about unsaved notes', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle(/Nueva nota Markdown/i));
    fireEvent.click(screen.getByTitle('Cerrar'));

    expect(screen.getByText(/1 nota tiene cambios sin guardar/)).toBeInTheDocument();
  });
});
