import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmModal } from '../../src/components/ui/ConfirmModal';

describe('Frontend: ConfirmModal (Boldkit Style) (20% Happy / 80% Destructive)', () => {
  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/3] renders modal with title, message and action buttons', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Aviso Crítico"
        message="¿Deseas descartar los cambios?"
        subMessage="Se perderán los datos."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Aviso Crítico')).toBeInTheDocument();
    expect(screen.getByText('¿Deseas descartar los cambios?')).toBeInTheDocument();
    expect(screen.getByText('Se perderán los datos.')).toBeInTheDocument();
    expect(screen.getByText('Descartar y Cerrar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('[HAPPY 2/3] triggers onConfirm callback when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        message="¿Confirmar acción?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Descartar y Cerrar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('[HAPPY 3/3] triggers onCancel callback when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        message="¿Confirmar acción?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/6] does not render in the DOM when isOpen=false', () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        message="Invisible modal"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('[CHAOS 2/6] renders saveAndClose button and calls onSaveAndConfirm when provided', () => {
    const onSaveAndConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        message="Pregunta con guardado"
        saveAndCloseText="Guardar y Salir"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onSaveAndConfirm={onSaveAndConfirm}
      />
    );

    const saveBtn = screen.getByText(/Guardar y Salir/i);
    expect(saveBtn).toBeInTheDocument();
    fireEvent.click(saveBtn);
    expect(onSaveAndConfirm).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 3/6] clicking top X button triggers onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        message="Modal con X"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    const closeBtn = screen.getByTitle('Cerrar modal');
    fireEvent.click(closeBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 4/6] handles very long text content safely without layout break', () => {
    const longMessage = 'A'.repeat(500);
    render(
      <ConfirmModal
        isOpen={true}
        message={longMessage}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });

  it('[CHAOS 5/6] renders cleanly when subMessage is empty or undefined', () => {
    render(
      <ConfirmModal
        isOpen={true}
        message="Solo mensaje"
        subMessage=""
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Solo mensaje')).toBeInTheDocument();
  });

  it('[CHAOS 6/6] rapid clicking on confirm button triggers expected invocation count', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        message="Stress test"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const btn = screen.getByText('Descartar y Cerrar');
    for (let i = 0; i < 20; i++) {
      fireEvent.click(btn);
    }
    expect(onConfirm).toHaveBeenCalledTimes(20);
  });
});
