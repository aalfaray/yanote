import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { addIdea, removeIdea, formatIdeaDate, MAX_IDEAS } from '../../src/lib/ideas';
import { IdeasDrawer } from '../../src/components/IdeasDrawer';
import { PinnedStrip } from '../../src/components/ChatPinnedStrip';


describe('ideas list helpers', () => {
  it('adds newest first, trims, ignores empty text and moves a repeated idea to the top', () => {
    let list = addIdea([], { text: '  Primera  ', source: 'Claude' }, 1000);
    list = addIdea(list, { text: 'Segunda' }, 2000);
    expect(list.map((i) => i.text)).toEqual(['Segunda', 'Primera']);
    expect(list[1]).toMatchObject({ text: 'Primera', source: 'Claude', createdAt: 1000 });
    expect(addIdea(list, { text: '   ' })).toBe(list);
    list = addIdea(list, { text: 'Primera' }, 3000);
    expect(list.map((i) => i.text)).toEqual(['Primera', 'Segunda']);
    expect(removeIdea(list, list[0].id).map((i) => i.text)).toEqual(['Segunda']);
  });

  it('keeps at most the newest ideas and formats dates', () => {
    let list: any[] = [];
    for (let i = 0; i < MAX_IDEAS + 5; i++) list = addIdea(list, { text: `idea ${i}` }, i);
    expect(list).toHaveLength(MAX_IDEAS);
    expect(list[0].text).toBe(`idea ${MAX_IDEAS + 4}`);
    const now = Date.UTC(2026, 10, 13, 12);
    expect(formatIdeaDate(now - 30_000, now)).toBe('ahora');
    expect(formatIdeaDate(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(formatIdeaDate(now - 3 * 3600_000, now)).toBe('hace 3 h');
    expect(formatIdeaDate(now - 26 * 3600_000, now)).toBe('ayer');
  });
});

describe('IdeasDrawer', () => {
  const ideas = [
    { id: 'a', text: 'Usar el módulo punto_venta en el núcleo', source: 'Claude 2', createdAt: Date.now() },
    { id: 'b', text: 'Revisar los permisos de caja', createdAt: Date.now() },
  ];

  it('lists ideas and runs each action', () => {
    const props = { onClose: vi.fn(), onRemove: vi.fn(), onSendToNewChat: vi.fn(), onInsertInChat: vi.fn() };
    render(<IdeasDrawer isOpen ideas={ideas} {...props} />);
    expect(screen.getByText(/punto_venta/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Chat nuevo/ })[0]);
    expect(props.onSendToNewChat).toHaveBeenCalledWith(ideas[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /En este chat/ })[1]);
    expect(props.onInsertInChat).toHaveBeenCalledWith(ideas[1]);
    fireEvent.click(screen.getAllByLabelText('Borrar idea')[0]);
    expect(props.onRemove).toHaveBeenCalledWith('a');
  });

  it('hides "En este chat" when no chat is open and shows an empty state', () => {
    const { rerender } = render(<IdeasDrawer isOpen ideas={ideas} onClose={vi.fn()} onRemove={vi.fn()} onSendToNewChat={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /En este chat/ })).not.toBeInTheDocument();
    rerender(<IdeasDrawer isOpen ideas={[]} onClose={vi.fn()} onRemove={vi.fn()} onSendToNewChat={vi.fn()} />);
    expect(screen.getByText('Aún no guardaste ideas.')).toBeInTheDocument();
  });

  it('searches ignoring accents', () => {
    const many = [...ideas, { id: 'c', text: 'Otra', createdAt: 0 }, { id: 'd', text: 'Más', createdAt: 0 }];
    render(<IdeasDrawer isOpen ideas={many} onClose={vi.fn()} onRemove={vi.fn()} onSendToNewChat={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Buscar ideas'), { target: { value: 'nucleo' } });
    expect(screen.getByText(/punto_venta/)).toBeInTheDocument();
    expect(screen.queryByText('Otra')).not.toBeInTheDocument();
  });
});

describe('PinnedStrip', () => {
  it('shows pins, collapses, and unpins', () => {
    const onUnpin = vi.fn();
    render(<PinnedStrip pins={[{ id: 'p1', text: 'Ya tengo el diseño del paso 1' }]} onUnpin={onUnpin} />);
    expect(screen.getByText('Ya tengo el diseño del paso 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fijados \(1\)/ }));
    expect(screen.queryByText('Ya tengo el diseño del paso 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fijados \(1\)/ }));
    fireEvent.click(screen.getByLabelText('Quitar fijado'));
    expect(onUnpin).toHaveBeenCalledWith('p1');
  });
});
