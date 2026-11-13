import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAppContextMenu } from '../../src/hooks/useAppContextMenu';
import { AppContextMenu } from '../../src/components/ui/AppContextMenu';

const Harness = () => {
  const { menu, close, runAction } = useAppContextMenu({ sendToChat: vi.fn(), saveIdea: vi.fn(), pin: vi.fn(), readAloud: vi.fn() });
  return <><textarea aria-label="Draft" data-chat-composer defaultValue="hola escripta mundo" />
    {menu && <AppContextMenu x={menu.x} y={menu.y} entries={menu.entries} onAction={runAction} onClose={close} />}</>;
};

function setup() {
  let emit!: (context: any) => void;
  const replace = vi.fn().mockResolvedValue(true);
  window.electronAPI = { onSpellingContext: vi.fn((cb) => { emit = cb; return () => {}; }), replaceMisspelling: replace } as any;
  render(<Harness />);
  fireEvent.contextMenu(screen.getByLabelText('Draft'), { clientX: 30, clientY: 50 });
  act(() => emit({ requestId: 1, x: 30, y: 50, word: 'escripta', suggestions: ['escrita', 'escrito'] }));
  return { emit, replace };
}

describe('Spelling in the chat context menu', () => {
  it('opens correction suggestions by pointer and applies the selected native replacement', () => {
    const { replace } = setup();
    const parent = screen.getByRole('menuitem', { name: 'Corregir «escripta»' });
    expect(screen.queryByRole('menuitem', { name: 'escrita' })).not.toBeInTheDocument();
    fireEvent.mouseEnter(parent);
    fireEvent.click(screen.getByRole('menuitem', { name: 'escrita' }));
    expect(replace).toHaveBeenCalledWith(1, 'escrita');
    expect(screen.queryByTestId('app-context-menu')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation into the correction submenu', () => {
    const { replace } = setup();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(replace).toHaveBeenCalledWith(1, 'escrita');
  });

  it('shows ordinary editing actions for correctly spelled text', () => {
    const { emit } = setup();
    fireEvent.contextMenu(screen.getByLabelText('Draft'), { clientX: 30, clientY: 50 });
    act(() => emit({ requestId: 2, x: 30, y: 50, word: '', suggestions: [] }));
    expect(screen.queryByText(/Corregir/)).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Pegar/ })).toBeInTheDocument();
  });

  it('ignores stale context events and closes suggestions when the draft changes', () => {
    const { emit, replace } = setup();
    fireEvent.input(screen.getByLabelText('Draft'), { target: { value: 'new text' } });
    act(() => emit({ requestId: 1, x: 30, y: 50, word: 'escripta', suggestions: ['escrita'] }));
    expect(screen.queryByTestId('app-context-menu')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
