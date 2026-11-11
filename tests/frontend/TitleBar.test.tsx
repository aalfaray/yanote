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
  it('[HAPPY 1/2] renders titlebar with logo, branch and superposición button', () => {
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
        gitBranch="main"
      />
    );

    expect(screen.getByText(/BOLDNOTES/i)).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByTitle(/Activar superposición/i)).toBeInTheDocument();
  });

  it('[HAPPY 2/2] clicking superposición button triggers onToggleAlwaysOnTop callback', () => {
    const onToggle = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={onToggle}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
      />
    );

    const pinBtn = screen.getByTitle(/Activar superposición/i);
    fireEvent.click(pinBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/7] displays highlighted state when superposición is active', () => {
    render(
      <TitleBar
        isAlwaysOnTop={true}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
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
        onOpenGit={vi.fn()}
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
        onOpenGit={vi.fn()}
      />
    );

    expect(() => {
      fireEvent.click(screen.getByTitle('Minimizar'));
      fireEvent.click(screen.getByTitle('Maximizar / Restaurar'));
      fireEvent.click(screen.getByTitle('Cerrar'));
    }).not.toThrow();
  });

  it('[CHAOS 4/7] displays pulsing indicator when git has uncommitted changes', () => {
    const { container } = render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
        hasGitChanges={true}
      />
    );

    const pulseDot = container.querySelector('.animate-pulse');
    expect(pulseDot).toBeInTheDocument();
  });

  it('[CHAOS 5/7] shows spinning animation on sync button when isSyncing is true', () => {
    const { container } = render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
        isSyncing={true}
      />
    );

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('[CHAOS 6/7] handles extremely long branch names without breaking layout', () => {
    const longBranch = 'feature/super-long-branch-name-that-exceeds-normal-viewport-width-12345';
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
        gitBranch={longBranch}
      />
    );

    expect(screen.getByText(longBranch)).toBeInTheDocument();
  });

  it('[CHAOS 7/7] rapid toggling of superposición button (stress test)', () => {
    const onToggle = vi.fn();
    render(
      <TitleBar
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={onToggle}
        onOpenSettings={vi.fn()}
        onOpenFiles={vi.fn()}
        onOpenGit={vi.fn()}
      />
    );

    const pinBtn = screen.getByTitle(/Activar superposición/i);
    for (let i = 0; i < 40; i++) {
      fireEvent.click(pinBtn);
    }
    expect(onToggle).toHaveBeenCalledTimes(40);
  });
});
