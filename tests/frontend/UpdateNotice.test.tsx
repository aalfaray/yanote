import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UpdateNotice } from '../../src/components/UpdateNotice';
import type { UpdateEvent } from '../../src/types/electron';

let emit: (e: UpdateEvent) => void;
const api = {
  onUpdateEvent: vi.fn((cb: (e: UpdateEvent) => void) => {
    emit = cb;
    return () => {};
  }),
  acceptUpdate: vi.fn(async () => ({ success: true })),
  installUpdate: vi.fn(async () => true),
};

beforeEach(() => {
  vi.useFakeTimers();
  (window as any).electronAPI = api;
  Object.values(api).forEach((f) => f.mockClear());
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as any).electronAPI;
});

const available = (version = '1.1.0'): UpdateEvent => ({
  type: 'available',
  mode: 'auto',
  version,
  currentVersion: '1.0.0',
  notes: 'Chat nuevo',
  url: '',
});

describe('Frontend: UpdateNotice', () => {
  it('announces the update and downloads + restarts after the user accepts', async () => {
    render(<UpdateNotice unsavedCount={0} />);
    act(() => emit(available()));
    expect(screen.getByText(/Tienes una nueva actualización vigente/)).toHaveTextContent('v1.1.0');
    expect(screen.getByText('Chat nuevo')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Aceptar y actualizar/ })));
    expect(api.acceptUpdate).toHaveBeenCalled();
    act(() => emit({ type: 'progress', percent: 50 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    act(() => emit({ type: 'downloaded', version: '1.1.0' }));
    expect(screen.getByText(/Instalando v1.1.0/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    expect(api.installUpdate).toHaveBeenCalled();
  });

  it('later hides it and does not nag again for the same version', () => {
    render(<UpdateNotice unsavedCount={0} />);
    act(() => emit(available()));
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => emit(available()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => emit(available('1.2.0')));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not restart on its own when there are unsaved notes', async () => {
    render(<UpdateNotice unsavedCount={2} />);
    act(() => emit(available()));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Aceptar y actualizar/ })));
    act(() => emit({ type: 'downloaded', version: '1.1.0' }));
    act(() => vi.advanceTimersByTime(3000));
    expect(api.installUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/2 notas sin guardar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar de todos modos/ }));
    expect(api.installUpdate).toHaveBeenCalled();
  });

  it('shows the result of a manual check', () => {
    render(<UpdateNotice unsavedCount={0} />);
    act(() => emit({ type: 'none', currentVersion: '1.0.0' }));
    expect(screen.getByRole('status')).toHaveTextContent('Ya tienes la última versión (v1.0.0)');
  });

  it('closes a notice with its x before it fades', () => {
    render(<UpdateNotice unsavedCount={0} />);
    act(() => emit({ type: 'error', error: 'sin conexión' } as UpdateEvent));
    expect(screen.getByRole('status')).toHaveTextContent('sin conexión');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
