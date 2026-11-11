import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabContextMenu } from '../../src/components/ui/TabContextMenu';
import type { TabItem } from '../../src/types/electron';

describe('Frontend: TabContextMenu (Boldkit Neubrutalist) (20% Happy / 80% Destructive)', () => {
  const dummyTab: TabItem = {
    id: 'tab-12345',
    title: 'MiDocumento.md',
    path: '/user/notes/MiDocumento.md',
    content: '# Hello',
    isDirty: false,
    isPinned: false,
  };

  const defaultProps = {
    isOpen: true,
    x: 100,
    y: 150,
    tab: dummyTab,
    tabsCount: 2,
    canCloseOthers: true,
    onCloseMenu: vi.fn(),
    onRename: vi.fn(),
    onTogglePin: vi.fn(),
    onCopyId: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseAll: vi.fn(),
    onTogglePreview: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyRelativePath: vi.fn(),
    onRevealInExplorer: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/3] renders all 10 context menu options when right-click menu opens', () => {
    render(<TabContextMenu {...defaultProps} />);

    // 1. Renombrar
    expect(screen.getByText('Renombrar')).toBeInTheDocument();
    // 2. Fijar pestaña
    expect(screen.getByText('Fijar pestaña')).toBeInTheDocument();
    // 3. Copiar ID de pestaña
    expect(screen.getByText('Copiar ID de pestaña')).toBeInTheDocument();
    // 4. Cerrar (Ctrl+W)
    expect(screen.getByText('Cerrar')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+W')).toBeInTheDocument();
    // 5. Cerrar otras
    expect(screen.getByText('Cerrar otras')).toBeInTheDocument();
    // 6. Cerrar todas las pestañas del editor (Ctrl+Alt+W)
    expect(screen.getByText('Cerrar todas las pestañas del editor')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Alt+W')).toBeInTheDocument();
    // 7. Abrir vista previa de Markdown
    expect(screen.getByText('Abrir vista previa de Markdown')).toBeInTheDocument();
    // 8. Copiar ruta
    expect(screen.getByText('Copiar ruta')).toBeInTheDocument();
    // 9. Copiar ruta relativa
    expect(screen.getByText('Copiar ruta relativa')).toBeInTheDocument();
    // 10. Revelar en el Explorador de archivos
    expect(screen.getByText('Revelar en el Explorador de archivos')).toBeInTheDocument();
  });

  it('[HAPPY 2/3] clicking Renombrar triggers onRename and dismisses menu', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Renombrar'));
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
    expect(defaultProps.onRename).toHaveBeenCalledWith(dummyTab);
  });

  it('[HAPPY 3/3] shows Desfijar pestaña when tab.isPinned is true and toggles pin state', () => {
    const pinnedTab: TabItem = { ...dummyTab, isPinned: true };
    render(<TabContextMenu {...defaultProps} tab={pinnedTab} />);

    expect(screen.getByText('Desfijar pestaña')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Desfijar pestaña'));
    expect(defaultProps.onTogglePin).toHaveBeenCalledWith(pinnedTab);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  // --- 80% CHAOS / DESTRUCTIVE / ADVERSARIAL TESTS ---
  it('[CHAOS 1/12] disables Cerrar otras when canCloseOthers is false and prevents callback', () => {
    render(<TabContextMenu {...defaultProps} canCloseOthers={false} />);

    const closeOthersBtn = screen.getByText('Cerrar otras').closest('button');
    expect(closeOthersBtn).toBeDisabled();

    fireEvent.click(closeOthersBtn!);
    expect(defaultProps.onCloseOthers).not.toHaveBeenCalled();
    expect(defaultProps.onCloseMenu).not.toHaveBeenCalled();
  });

  it('[CHAOS 2/12] dismisses context menu when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <TabContextMenu {...defaultProps} />
      </div>
    );

    fireEvent.pointerDown(screen.getByTestId('outside-area'));
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 3/12] dismisses context menu when pressing Escape key', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 4/12] closes menu when window resize event is fired', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent(window, new Event('resize'));
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 5/12] clamps menu X position within viewport boundaries when clicked near right edge', () => {
    window.innerWidth = 500;
    render(<TabContextMenu {...defaultProps} x={490} y={100} />);

    const menu = screen.getByTestId('tab-context-menu');
    // 500 - 260 - 8 = 232px
    expect(menu.style.left).toBe('232px');
  });

  it('[CHAOS 6/12] clamps menu Y position within viewport boundaries when clicked near bottom edge', () => {
    window.innerHeight = 600;
    render(<TabContextMenu {...defaultProps} x={100} y={590} />);

    const menu = screen.getByTestId('tab-context-menu');
    // 600 - 350 - 8 = 242px
    expect(menu.style.top).toBe('242px');
  });

  it('[CHAOS 7/12] clicking Cerrar invokes onCloseTab with active tab', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Cerrar'));
    expect(defaultProps.onCloseTab).toHaveBeenCalledWith(dummyTab);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 8/12] clicking Cerrar todas las pestañas del editor invokes onCloseAll', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Cerrar todas las pestañas del editor'));
    expect(defaultProps.onCloseAll).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 9/12] clicking Abrir vista previa de Markdown invokes onTogglePreview', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Abrir vista previa de Markdown'));
    expect(defaultProps.onTogglePreview).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 10/12] clicking Copiar ruta executes onCopyPath', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Copiar ruta'));
    expect(defaultProps.onCopyPath).toHaveBeenCalledWith(dummyTab);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 11/12] clicking Copiar ruta relativa executes onCopyRelativePath', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Copiar ruta relativa'));
    expect(defaultProps.onCopyRelativePath).toHaveBeenCalledWith(dummyTab);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 12/12] clicking Revelar en el Explorador de archivos executes onRevealInExplorer', () => {
    render(<TabContextMenu {...defaultProps} />);

    fireEvent.click(screen.getByText('Revelar en el Explorador de archivos'));
    expect(defaultProps.onRevealInExplorer).toHaveBeenCalledWith(dummyTab);
    expect(defaultProps.onCloseMenu).toHaveBeenCalledTimes(1);
  });
});
