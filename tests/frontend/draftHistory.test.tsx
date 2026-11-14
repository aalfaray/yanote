import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useDraftHistory } from '../../src/hooks/useDraftHistory';
import { useAppContextMenu } from '../../src/hooks/useAppContextMenu';
import { AppContextMenu } from '../../src/components/ui/AppContextMenu';
import { ClaudeChatView } from '../../src/components/ClaudeChatView';

const Harness = ({ initial = '' }: { initial?: string }) => {
  const { draft, setDraft, resetDraft, inputRef, onDraftChange } = useDraftHistory(initial);
  const { menu, close, runAction } = useAppContextMenu({ sendToChat: vi.fn(), saveIdea: vi.fn(), pin: vi.fn(), readAloud: vi.fn() });
  return <>
    <textarea aria-label="Draft" data-chat-composer ref={inputRef} value={draft} onChange={onDraftChange} />
    <button onClick={() => setDraft((text) => `${text}\ninserted idea`)}>Append</button>
    <button onClick={() => resetDraft('')}>Send</button>
    {menu && <AppContextMenu x={menu.x} y={menu.y} entries={menu.entries} onAction={runAction} onClose={close} />}
  </>;
};

function input(box: HTMLTextAreaElement, text: string, caret: number, inputType = 'insertText') {
  act(() => { box.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true })); });
  fireEvent.input(box, { target: { value: text, selectionStart: caret, selectionEnd: caret }, inputType });
}
const undo = (box: HTMLElement) => fireEvent.keyDown(box, { key: 'z', ctrlKey: true });
const redo = (box: HTMLElement) => fireEvent.keyDown(box, { key: 'y', ctrlKey: true });

describe('draft editing history', () => {
  beforeEach(() => { window.electronAPI = { editCommand: vi.fn(async () => true) } as any; });
  afterEach(() => { delete window.electronAPI; });

  it('undoes typing in groups, keeps the initial path and supports both redo shortcuts', () => {
    render(<Harness initial={'C:\\project\\README.md '} />);
    const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    const path = box.value;
    box.setSelectionRange(path.length, path.length);
    for (const char of 'hola') input(box, box.value + char, box.value.length + 1);
    undo(box);
    expect(box).toHaveValue(path);
    expect(box.selectionStart).toBe(path.length);
    redo(box);
    expect(box).toHaveValue(path + 'hola');
    undo(box);
    fireEvent.keyDown(box, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(box).toHaveValue(path + 'hola');
  });

  it('restores replaced text and its selection, with paste and delete as separate edits', () => {
    render(<Harness initial="hola mundo" />);
    const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    box.setSelectionRange(5, 10);
    input(box, 'hola equipo', 11, 'insertFromPaste');
    input(box, 'hola equip', 10, 'deleteContentBackward');
    undo(box);
    expect(box).toHaveValue('hola equipo');
    undo(box);
    expect(box).toHaveValue('hola mundo');
    expect([box.selectionStart, box.selectionEnd]).toEqual([5, 10]);
    redo(box);
    expect(box).toHaveValue('hola equipo');
  });

  it('clears redo after a new edit and does nothing when the history is exhausted', () => {
    render(<Harness />);
    const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    undo(box);
    expect(box).toHaveValue('');
    input(box, 'first', 5, 'insertFromPaste');
    input(box, 'second', 6, 'insertReplacementText');
    undo(box);
    input(box, 'third', 5, 'insertReplacementText');
    redo(box);
    expect(box).toHaveValue('third');
    undo(box);
    expect(box).toHaveValue('first');
  });

  it('undoes programmatic insertions independently and resets history after sending', () => {
    render(<Harness initial="my draft" />);
    const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    fireEvent.click(screen.getByText('Append'));
    expect(box).toHaveValue('my draft\ninserted idea');
    undo(box);
    expect(box).toHaveValue('my draft');
    redo(box);
    fireEvent.click(screen.getByText('Send'));
    undo(box);
    expect(box).toHaveValue('');
    input(box, 'next message', 12);
    undo(box);
    expect(box).toHaveValue('');
  });

  it('uses the same history for the context menu and native beforeinput commands', () => {
    render(<Harness />);
    const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    input(box, 'draft', 5);
    fireEvent.contextMenu(box);
    fireEvent.click(screen.getByRole('menuitem', { name: /Deshacer/ }));
    expect(box).toHaveValue('');
    fireEvent.contextMenu(box);
    fireEvent.click(screen.getByRole('menuitem', { name: /Rehacer/ }));
    expect(box).toHaveValue('draft');
    expect(window.electronAPI!.editCommand).not.toHaveBeenCalled();
    act(() => { box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true })); });
    expect(box).toHaveValue('');
  });

  it('keeps separate steps when the caret moves or typing pauses', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      render(<Harness />);
      const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
      input(box, 'ab', 2);
      now += 1500;
      input(box, 'abc', 3);
      box.setSelectionRange(0, 0);
      fireEvent.select(box);
      input(box, 'Xabc', 1);
      undo(box);
      expect(box).toHaveValue('abc');
      expect(box.selectionStart).toBe(0);
      undo(box);
      expect(box).toHaveValue('ab');
    } finally { vi.restoreAllMocks(); }
  });

  it('leaves IME composition shortcuts alone and undoes the composed word together', () => {
    render(<Harness />);
    const box = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    input(box, 'n', 1, 'insertCompositionText');
    input(box, '你', 1, 'insertCompositionText');
    const key = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true });
    act(() => { box.dispatchEvent(key); });
    expect(key.defaultPrevented).toBe(false);
    expect(box).toHaveValue('你');
    fireEvent.compositionEnd(box);
    undo(box);
    expect(box).toHaveValue('');
  });
});

describe.each(['claude', 'antigravity'] as const)('%s chat composer', (provider) => {
  afterEach(() => { delete window.electronAPI; });

  it('keeps history across tab visibility changes and starts a fresh history for each sent message', async () => {
    const send = vi.fn(async () => ({ success: true }));
    window.electronAPI = {
      claudeStart: vi.fn(async () => ({ success: true })), claudeStop: vi.fn(), claudeSend: send,
      onClaudeEvent: vi.fn(() => () => {}),
      agyStart: vi.fn(async () => ({ success: true })), agyStop: vi.fn(), agySend: send,
      onAgyEvent: vi.fn(() => () => {}),
    } as any;
    const view = render(<ClaudeChatView tabId="chat" isActive provider={provider} initialDraft="README.md" />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    const initial = box.value;
    fireEvent.change(box, { target: { value: initial + 'wrong request' } });
    view.rerender(<ClaudeChatView tabId="chat" isActive={false} provider={provider} />);
    view.rerender(<ClaudeChatView tabId="chat" isActive provider={provider} />);
    undo(box);
    expect(box).toHaveValue(initial);
    redo(box);
    expect(box).toHaveValue(initial + 'wrong request');
    await waitFor(() => expect(screen.getByLabelText('Enviar')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Enviar'));
    expect(send).toHaveBeenCalledWith('chat', { text: 'README.md\n\nwrong request', images: [] });
    undo(box);
    expect(box).toHaveValue('');
    fireEvent.change(box, { target: { value: 'new draft' } });
    undo(box);
    expect(box).toHaveValue('');
  });
});
