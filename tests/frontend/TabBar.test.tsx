import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../../src/components/TabBar';
import type { TabItem } from '../../src/types/electron';

describe('Frontend: TabBar (Orca Style) (20% Happy / 80% Destructive)', () => {
  const sampleTabs: TabItem[] = [
    { id: '1', title: 'Bienvenido.md', path: '/notes/Bienvenido.md', content: 'hello', isDirty: false },
    { id: '2', title: 'scratch-1.md', path: null, content: 'world', isDirty: true },
  ];

  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/2] renders tabs with titles and active tab highlighted', () => {
    const onSelectTab = vi.fn();
    render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={onSelectTab}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    expect(screen.getByText('Bienvenido.md')).toBeInTheDocument();
    expect(screen.getByText('scratch-1.md')).toBeInTheDocument();

    fireEvent.click(screen.getByText('scratch-1.md'));
    expect(onSelectTab).toHaveBeenCalledWith('2');
  });

  it('[HAPPY 2/2] clicking NUEVA button triggers onNewTab (Orca quick scratchpad creation)', () => {
    const onNewTab = vi.fn();
    render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={onNewTab}
        onRenameTab={vi.fn()}
      />
    );

    const newBtn = screen.getByTitle(/Nueva nota Markdown/i);
    fireEvent.click(newBtn);
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/8] prevents closing tab when only one tab exists', () => {
    const singleTab: TabItem[] = [
      { id: 'only-one', title: 'Only.md', path: null, content: '', isDirty: false },
    ];
    const onCloseTab = vi.fn();

    render(
      <TabBar
        tabs={singleTab}
        activeTabId="only-one"
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    expect(screen.queryByTitle(/Cerrar pestaña/i)).not.toBeInTheDocument();
    expect(onCloseTab).not.toHaveBeenCalled();
  });

  it('[CHAOS 2/8] shows dirty indicator only on tabs with unsaved changes', () => {
    const { container } = render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    // Tab 2 has isDirty: true, Tab 1 has isDirty: false
    const dirtyDots = container.querySelectorAll('[title="Cambios sin guardar"]');
    expect(dirtyDots.length).toBe(1);
  });

  it('[CHAOS 3/8] double-clicking triggers rename, auto-appends .md if omitted', () => {
    const onRenameTab = vi.fn();
    render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={onRenameTab}
      />
    );

    const tabTitle = screen.getByText('Bienvenido.md');
    fireEvent.doubleClick(tabTitle);

    const input = screen.getByDisplayValue('Bienvenido.md');
    fireEvent.change(input, { target: { value: 'MiNuevaNota' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameTab).toHaveBeenCalledWith('1', 'MiNuevaNota.md');
  });

  it('[CHAOS 4/8] cancelling rename with Escape preserves existing title', () => {
    const onRenameTab = vi.fn();
    render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={onRenameTab}
      />
    );

    const tabTitle = screen.getByText('Bienvenido.md');
    fireEvent.doubleClick(tabTitle);

    const input = screen.getByDisplayValue('Bienvenido.md');
    fireEvent.change(input, { target: { value: 'ChangedName' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRenameTab).not.toHaveBeenCalled();
  });

  it('[CHAOS 5/8] ignores empty string or whitespace during rename', () => {
    const onRenameTab = vi.fn();
    render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={onRenameTab}
      />
    );

    fireEvent.doubleClick(screen.getByText('Bienvenido.md'));
    const input = screen.getByDisplayValue('Bienvenido.md');
    fireEvent.change(input, { target: { value: '     ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameTab).not.toHaveBeenCalled();
  });

  it('[CHAOS 6/8] handles rapid spamming of tab clicks without errors', () => {
    const onSelectTab = vi.fn();
    render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={onSelectTab}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    const tab = screen.getByText('scratch-1.md');
    for (let i = 0; i < 50; i++) {
      fireEvent.click(tab);
    }
    expect(onSelectTab).toHaveBeenCalledTimes(50);
  });

  it('[CHAOS 7/8] renders safely with huge list of 50 tabs (stress test)', () => {
    const fiftyTabs: TabItem[] = Array.from({ length: 50 }, (_, i) => ({
      id: `tab-${i}`,
      title: `note-${i}.md`,
      path: `/notes/note-${i}.md`,
      content: `Content ${i}`,
      isDirty: i % 2 === 0,
    }));

    render(
      <TabBar
        tabs={fiftyTabs}
        activeTabId="tab-25"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    expect(screen.getByText('note-0.md')).toBeInTheDocument();
    expect(screen.getByText('note-49.md')).toBeInTheDocument();
  });

  it('[CHAOS 8/8] handles titles containing adversarial HTML and special script characters safely', () => {
    const adversarialTabs: TabItem[] = [
      {
        id: 'adv-1',
        title: '<script>alert(1)</script>.md',
        path: null,
        content: '',
        isDirty: false,
      },
    ];

    render(
      <TabBar
        tabs={adversarialTabs}
        activeTabId="adv-1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    // React escapes text content safely
    expect(screen.getByText('<script>alert(1)</script>.md')).toBeInTheDocument();
  });

  it('[CHAOS 9/10] mouse wheel triggers horizontal scroll without throwing', () => {
    const { container } = render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    const scrollContainer = container.querySelector('.overflow-x-auto');
    expect(scrollContainer).toBeInTheDocument();

    if (scrollContainer) {
      expect(() => {
        fireEvent.wheel(scrollContainer, { deltaY: 100 });
        fireEvent.wheel(scrollContainer, { deltaY: -50 });
        fireEvent.wheel(scrollContainer, { deltaX: 30 });
        fireEvent.wheel(scrollContainer, { deltaY: 0, deltaX: 0 });
      }).not.toThrow();
    }
  });

  it('[CHAOS 10/10] handles wheel events with extreme delta values and empty deltas safely', () => {
    const { container } = render(
      <TabBar
        tabs={sampleTabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onRenameTab={vi.fn()}
      />
    );

    const scrollContainer = container.querySelector('.overflow-x-auto');
    if (scrollContainer) {
      expect(() => {
        fireEvent.wheel(scrollContainer, { deltaY: 999999 });
        fireEvent.wheel(scrollContainer, { deltaY: -999999 });
        fireEvent.wheel(scrollContainer, {});
      }).not.toThrow();
    }
  });
});
