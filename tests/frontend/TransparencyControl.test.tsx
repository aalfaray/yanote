import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransparencyControl } from '../../src/components/TransparencyControl';

const { clampOpacity, loadConfig } = require('../../electron/services/configService.cjs');

function setup(opacity = 1) {
  const onChange = vi.fn();
  render(
    <TransparencyControl
      opacity={opacity}
      onChange={onChange}
      buttonClassName="btn"
      activeClassName="is-active"
      idleClassName="is-idle"
      iconProps={{ size: 14, strokeWidth: 2.5 }}
    />
  );
  return { onChange, button: screen.getByTitle(/Transparencia de la ventana/) };
}

describe('Frontend: TransparencyControl', () => {
  it('opens a panel with slider and presets; slider reports 0–1 opacity', () => {
    const { onChange, button } = setup(1);
    expect(button).toHaveClass('is-idle');
    fireEvent.click(button);

    const slider = screen.getByLabelText('Opacidad de la ventana');
    expect(slider).toHaveAttribute('min', '30');
    expect(slider).toHaveAttribute('max', '100');

    fireEvent.change(slider, { target: { value: '65' } });
    expect(onChange).toHaveBeenLastCalledWith(0.65);

    fireEvent.click(screen.getByText('50%'));
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('highlights the button and shows the percentage while transparent', () => {
    const { button } = setup(0.7);
    expect(button).toHaveClass('is-active');
    expect(button).toHaveAttribute('title', 'Transparencia de la ventana (70%)');
  });

  it('closes the panel with Escape and outside click', () => {
    const { button } = setup(1);
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Backend: opacity config', () => {
  it('clamps opacity to [0.3, 1] and defaults invalid values to 1', () => {
    expect(clampOpacity(0.55)).toBe(0.55);
    expect(clampOpacity(0)).toBe(0.3);
    expect(clampOpacity(5)).toBe(1);
    expect(clampOpacity('abc')).toBe(1);
  });

  it('defaults to fully opaque when no config exists', () => {
    expect(loadConfig('/does/not/exist.json', '/notes').opacity).toBe(1);
  });
});
