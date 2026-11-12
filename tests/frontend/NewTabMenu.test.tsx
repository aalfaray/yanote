import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../../src/components/TabBar';
import type { TabItem } from '../../src/types/electron';

const tabs: TabItem[] = [
  { id: '1', title: 'Bienvenido.md', path: null, content: '', isDirty: false },
  { id: 't', title: 'PowerShell', path: null, content: '', kind: 'terminal', shell: 'powershell' },
];

function setup() {
  const onNewTab = vi.fn();
  const onNewTerminal = vi.fn();
  const onRenameTab = vi.fn();
  render(
    <TabBar
      tabs={tabs}
      activeTabId="1"
      onSelectTab={vi.fn()}
      onCloseTab={vi.fn()}
      onNewTab={onNewTab}
      onNewTerminal={onNewTerminal}
      onRenameTab={onRenameTab}
    />
  );
  return { onNewTab, onNewTerminal, onRenameTab };
}

describe('Frontend: NUEVA split button menu', () => {
  it('opens a menu with Markdown, PowerShell and CMD options', () => {
    setup();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Elegir tipo de pestaña nueva/i));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Nota Markdown.md',
      'PowerShellPS',
      'Terminal (CMD)cmd',
    ]);
  });

  it('creates the chosen tab type and closes the menu', () => {
    const { onNewTab, onNewTerminal } = setup();
    const caret = screen.getByTitle(/Elegir tipo de pestaña nueva/i);

    fireEvent.click(caret);
    fireEvent.click(screen.getByRole('menuitem', { name: /PowerShell/ }));
    expect(onNewTerminal).toHaveBeenLastCalledWith('powershell');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(caret);
    fireEvent.click(screen.getByRole('menuitem', { name: /CMD/ }));
    expect(onNewTerminal).toHaveBeenLastCalledWith('cmd');

    fireEvent.click(caret);
    fireEvent.click(screen.getByRole('menuitem', { name: /Markdown/ }));
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it('closes the menu with Escape or an outside click', () => {
    setup();
    const caret = screen.getByTitle(/Elegir tipo de pestaña nueva/i);
    fireEvent.click(caret);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(caret);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renaming a terminal tab does not append .md', () => {
    const { onRenameTab } = setup();
    fireEvent.doubleClick(screen.getByText('PowerShell'));
    const input = screen.getByDisplayValue('PowerShell');
    fireEvent.change(input, { target: { value: 'Servidor' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameTab).toHaveBeenCalledWith('t', 'Servidor');
  });
});

describe('Frontend: NUEVA menu - open existing file', () => {
  it('shows "Abrir archivo…" when onOpenFile is provided and calls it', () => {
    const onOpenFile = vi.fn();
    render(
      <TabBar
        tabs={tabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onNewTerminal={vi.fn()}
        onOpenFile={onOpenFile}
        onRenameTab={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle(/Elegir tipo de pestaña nueva/i));
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Nota Markdown.md',
      'Abrir archivo…Ctrl+O',
      'PowerShellPS',
      'Terminal (CMD)cmd',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: /Abrir archivo/ }));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Frontend: NUEVA menu — Claude chat', () => {
  it('offers "Chat con Claude" and opens it', () => {
    const onNewClaude = vi.fn();
    render(
      <TabBar
        tabs={[{ id: 'c', title: 'Claude', path: null, content: '', kind: 'claude' }]}
        activeTabId="c"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onNewTerminal={vi.fn()}
        onNewClaude={onNewClaude}
      />
    );
    fireEvent.click(screen.getByTitle(/Elegir tipo de pestaña nueva/i));
    fireEvent.click(screen.getByRole('menuitem', { name: /Chat con Claude/ }));
    expect(onNewClaude).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
