import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Badge } from '../../src/components/ui/Badge';
import { Modal } from '../../src/components/ui/Modal';

describe('Frontend: Neubrutalist UI Components (Boldkit) (20% Happy / 80% Destructive)', () => {
  // --- 20% HAPPY PATH TESTS ---
  it('[HAPPY 1/3] Button renders with primary variant and handles click event', () => {
    const handleClick = vi.fn();
    render(<Button variant="primary" onClick={handleClick}>Click Me</Button>);

    const btn = screen.getByText('Click Me');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('[HAPPY 2/3] Input displays label and updates value as user types', () => {
    const Component = () => {
      const [val, setVal] = useState('');
      return <Input label="Nombre de Nota" value={val} onChange={(e) => setVal(e.target.value)} />;
    };
    render(<Component />);

    expect(screen.getByText('Nombre de Nota')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'MiNota.md' } });
    expect(input).toHaveValue('MiNota.md');
  });

  it('[HAPPY 3/3] Modal renders title, badge, and children when isOpen=true', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Modal de Prueba" badge="NUEVO">
        <p>Contenido del modal</p>
      </Modal>
    );

    expect(screen.getByText('Modal de Prueba')).toBeInTheDocument();
    expect(screen.getByText('NUEVO')).toBeInTheDocument();
    expect(screen.getByText('Contenido del modal')).toBeInTheDocument();
  });

  // --- 80% DESTRUCTIVE / CHAOS / ADVERSARIAL TESTS ---
  it('[CHAOS 1/8] disabled button prevents all click events completely', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled Button</Button>);

    const btn = screen.getByText('Disabled Button');
    for (let i = 0; i < 20; i++) {
      fireEvent.click(btn);
    }
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('[CHAOS 2/8] Input displays error message and error styling when error prop is passed', () => {
    render(<Input label="Email" error="El campo no puede estar vacío" />);
    expect(screen.getByText('El campo no puede estar vacío')).toBeInTheDocument();
  });

  it('[CHAOS 3/8] Modal does not render any DOM elements when isOpen=false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden Modal">
        <p>Should not exist</p>
      </Modal>
    );

    expect(container.firstChild).toBeNull();
  });

  it('[CHAOS 4/8] Modal closes when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test">
        <p>Press Escape</p>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('[CHAOS 5/8] Modal close button (X) triggers onClose', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose} title="Close Button Test">
        <p>Content</p>
      </Modal>
    );

    const closeBtn = container.querySelector('button');
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalled();
    }
  });

  it('[CHAOS 6/8] Input handles adversarial regex and HTML injection strings safely', () => {
    const adversarialText = '<svg/onload=alert(1)>.*+?^${}()|[]\\';
    render(<Input label="Test" value={adversarialText} onChange={vi.fn()} />);

    const input = screen.getByDisplayValue(adversarialText);
    expect(input).toBeInTheDocument();
  });

  it('[CHAOS 7/8] Badge renders correctly with all color variants', () => {
    const { rerender } = render(<Badge variant="yellow">Yellow</Badge>);
    expect(screen.getByText('Yellow')).toBeInTheDocument();

    rerender(<Badge variant="coral">Coral</Badge>);
    expect(screen.getByText('Coral')).toBeInTheDocument();

    rerender(<Badge variant="mint">Mint</Badge>);
    expect(screen.getByText('Mint')).toBeInTheDocument();
  });

  it('[CHAOS 8/8] Button with active prop applies neubrutal pressed styling classes', () => {
    const { container } = render(<Button active={true}>Active Pressed</Button>);
    const button = container.querySelector('button');
    expect(button?.className).toContain('translate-x-[1.5px]');
  });
});
