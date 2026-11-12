import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TitleBar } from '../../src/components/TitleBar';

describe('Frontend: TitleBar & Superposición (Always on Top) (20% Happy / 80% Destructive)', () => {
  beforeEach(() => {
    window.electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
    } as any;
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/2] renders titlebar with logo and superposición button', () => {
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    expect(screen.getByText(/YANOTE/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Activar superposición/i)).toBeInTheDocument();
  });

  it('[HAPPY 2/3] clicking superposición button triggers onToggleAlwaysOnTop callback', () => {
    const onToggle = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={onToggle}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    const pinBtn = screen.getByTitle(/Activar superposición/i);
    fireEvent.click(pinBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('[HAPPY 3/3] renders dark mode toggle button and triggers onToggleDarkMode callback', () => {
    const onToggleDark = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        isDarkMode={false}
        onToggleDarkMode={onToggleDark}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    const darkBtn = screen.getByTitle(/Cambiar a modo oscuro/i);
    expect(darkBtn).toBeInTheDocument();
    expect(screen.getByText('OSCURO')).toBeInTheDocument();
    fireEvent.click(darkBtn);
    expect(onToggleDark).toHaveBeenCalledTimes(1);
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/7] displays highlighted state when superposición is active', () => {
    render(
      <TitleBar
        isAlwaysOnTop={true}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    expect(screen.getByText('ENCIMA')).toBeInTheDocument();
    expect(screen.getByTitle(/Superposición activa/i)).toBeInTheDocument();
  });

  it('[CHAOS 2/7] calls window controls (minimize, maximize, close) on electronAPI', () => {
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Minimizar'));
    expect(window.electronAPI?.minimize).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Maximizar / Restaurar'));
    expect(window.electronAPI?.maximize).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Cerrar'));
    expect(window.electronAPI?.close).toHaveBeenCalled();
  });

  it('[CHAOS 3/7] handles window controls gracefully even if window.electronAPI is undefined (browser mode)', () => {
    window.electronAPI = undefined;

    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    expect(() => {
      fireEvent.click(screen.getByTitle('Minimizar'));
      fireEvent.click(screen.getByTitle('Maximizar / Restaurar'));
      fireEvent.click(screen.getByTitle('Cerrar'));
    }).not.toThrow();
  });

  it('[CHAOS 4/7] no longer renders any Git / GitHub controls', () => {
    const { container } = render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    expect(screen.queryByTitle(/git/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/github|main/i);
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('[CHAOS 5/7] settings and recent files buttons trigger their callbacks', () => {
    const onOpenSettings = vi.fn();
    const onOpenFiles = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={onOpenSettings}
        onOpenFiles={onOpenFiles}
      />
    );

    fireEvent.click(screen.getByTitle('Configuración'));
    fireEvent.click(screen.getByTitle('Archivos recientes'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenFiles).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 7/11] rapid toggling of superposición button (stress test)', () => {
    const onToggle = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={onToggle}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    const pinBtn = screen.getByTitle(/Activar superposición/i);
    for (let i = 0; i < 40; i++) {
      fireEvent.click(pinBtn);
    }
    expect(onToggle).toHaveBeenCalledTimes(40);
  });

  it('[CHAOS 8/11] displays CLARO label when isDarkMode is true', () => {
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        isDarkMode={true}
        onToggleDarkMode={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    expect(screen.getByText('CLARO')).toBeInTheDocument();
    expect(screen.getByTitle(/Cambiar a modo claro/i)).toBeInTheDocument();
  });

  it('[CHAOS 9/11] rapid toggling of dark mode button (stress test 50 clicks)', () => {
    const onToggleDark = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        isDarkMode={false}
        onToggleDarkMode={onToggleDark}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    const darkBtn = screen.getByTitle(/Cambiar a modo oscuro/i);
    for (let i = 0; i < 50; i++) {
      fireEvent.click(darkBtn);
    }
    expect(onToggleDark).toHaveBeenCalledTimes(50);
  });

  it('[CHAOS 10/11] clicking dark mode button with undefined onToggleDarkMode does not throw', () => {
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
      />
    );

    const darkBtn = screen.getByTitle(/Cambiar a modo oscuro/i);
    expect(() => fireEvent.click(darkBtn)).not.toThrow();
  });

  it('[CHAOS 11/11] handles weird / non-boolean isDarkMode values without crashing', () => {
    expect(() => {
      render(
        <TitleBar
          isAlwaysOnTop={false}
          onToggleAlwaysOnTop={vi.fn()}
          isDarkMode={'not-a-bool' as any}
          onOpenSettings={vi.fn()}
          onOpenFiles={vi.fn()}
        />
      );
    }).not.toThrow();
  });
});
