import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Select, SelectItem } from '../../src/components/ui/Select';

describe('Select component', () => {
  it('renders with options prop and displays selected label', () => {
    const options = [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
    ];
    render(
      <Select
        aria-label="Fruit"
        value="banana"
        options={options}
      />
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Banana');

    const select = screen.getByLabelText('Fruit') as HTMLSelectElement;
    expect(select.value).toBe('banana');
  });

  it('renders with option children', () => {
    render(
      <Select aria-label="Car" defaultValue="tesla">
        <option value="ford">Ford</option>
        <option value="tesla">Tesla</option>
        <option value="bmw">BMW</option>
      </Select>
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Tesla');
  });

  it('renders with SelectItem children', () => {
    render(
      <Select aria-label="Color" defaultValue="blue">
        <SelectItem value="red">Red</SelectItem>
        <SelectItem value="blue">Blue</SelectItem>
      </Select>
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Blue');
  });

  it('opens popup menu on click and selects option', () => {
    const handleChange = vi.fn();
    const handleValueChange = vi.fn();

    render(
      <Select
        aria-label="Pets"
        defaultValue="cat"
        onChange={handleChange}
        onValueChange={handleValueChange}
        options={[
          { value: 'cat', label: 'Cat' },
          { value: 'dog', label: 'Dog' },
          { value: 'bird', label: 'Bird' },
        ]}
      />
    );

    const trigger = screen.getByRole('button');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Click trigger to open menu
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Click 'Dog' in listbox
    const listbox = screen.getByRole('listbox');
    const dogOption = within(listbox).getByText('Dog');
    fireEvent.click(dogOption);

    // Menu should close
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(handleValueChange).toHaveBeenCalledWith('dog');
    expect(handleChange).toHaveBeenCalled();
    expect(trigger).toHaveTextContent('Dog');
  });

  it('supports keyboard navigation (ArrowDown and Enter)', () => {
    const handleValueChange = vi.fn();

    render(
      <Select
        aria-label="Letters"
        defaultValue="a"
        onValueChange={handleValueChange}
        options={[
          { value: 'a', label: 'Letter A' },
          { value: 'b', label: 'Letter B' },
          { value: 'c', label: 'Letter C' },
        ]}
      />
    );

    const trigger = screen.getByRole('button');
    // Open menu with ArrowDown
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Navigate to next option (Letter B)
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    // Select it with Enter
    fireEvent.keyDown(listbox, { key: 'Enter' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(handleValueChange).toHaveBeenCalledWith('b');
    expect(trigger).toHaveTextContent('Letter B');
  });

  it('closes menu on Escape key', () => {
    render(
      <Select
        aria-label="EscapeTest"
        options={[
          { value: '1', label: 'One' },
          { value: '2', label: 'Two' },
        ]}
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes menu on outside click', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <Select
          aria-label="OutsideTest"
          options={[
            { value: '1', label: 'One' },
            { value: '2', label: 'Two' },
          ]}
        />
      </div>
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('works seamlessly with fireEvent.change on screen.getByLabelText', () => {
    const handleChange = vi.fn();
    render(
      <Select
        aria-label="Permisos"
        defaultValue="default"
        onChange={handleChange}
        options={[
          { value: 'default', label: 'Preguntar' },
          { value: 'acceptEdits', label: 'Aceptar ediciones' },
        ]}
      />
    );

    const select = screen.getByLabelText('Permisos') as HTMLSelectElement;
    expect(select.value).toBe('default');

    fireEvent.change(select, { target: { value: 'acceptEdits' } });
    expect(select.value).toBe('acceptEdits');
    expect(handleChange).toHaveBeenCalled();

    // Trigger UI should update
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Aceptar ediciones');
  });

  it('respects disabled state', () => {
    render(
      <Select
        aria-label="DisabledSelect"
        disabled
        options={[{ value: '1', label: 'One' }]}
      />
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
