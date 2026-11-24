import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

export interface SelectItemProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}

/**
 * Declarative child item for Select.
 */
export function SelectItem(_props: SelectItemProps) {
  return null;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options?: SelectOption[];
  onValueChange?: (value: string) => void;
  size?: 'xs' | 'sm' | 'md';
  containerClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
  placeholder?: string;
  triggerAriaLabel?: string;
}

function extractOptionsFromChildren(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  const traverse = (nodes: ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === React.Fragment) {
        traverse((child.props as { children?: ReactNode }).children);
        return;
      }
      const props = child.props as any;
      if (props && 'value' in props) {
        options.push({
          value: String(props.value ?? ''),
          label: props.children ?? props.label ?? String(props.value ?? ''),
          disabled: Boolean(props.disabled),
          hint: props.title ?? props.hint,
        });
      }
    });
  };

  traverse(children);
  return options;
}

export function Select({
  options: propOptions,
  children,
  value,
  defaultValue,
  onChange,
  onValueChange,
  placeholder,
  size = 'sm',
  className,
  containerClassName,
  triggerClassName,
  contentClassName,
  disabled,
  title,
  id,
  name,
  required,
  'aria-label': ariaLabel,
  triggerAriaLabel,
  style,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;

  // Derive options from propOptions or JSX children (option / SelectItem)
  const resolvedOptions: SelectOption[] = propOptions ?? extractOptionsFromChildren(children);

  // Manage internal value for uncontrolled mode or state tracking
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (value !== undefined) return String(value);
    if (defaultValue !== undefined) return String(defaultValue);
    return resolvedOptions[0]?.value ?? '';
  });

  const isControlled = value !== undefined;
  const currentValue = isControlled ? String(value) : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [dropdownCoords, setDropdownCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxWidth: number;
    placement: 'bottom' | 'top';
  }>({
    top: 0,
    left: 0,
    minWidth: 0,
    maxWidth: 320,
    placement: 'bottom',
  });

  // The menu stays hidden until its real position is known, so it never
  // flashes at (0, 0) and its entry animation starts in the right place.
  const [isPositioned, setIsPositioned] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Keep internal value updated if controlled value changes
  useEffect(() => {
    if (isControlled) {
      setInternalValue(String(value));
    }
  }, [isControlled, value]);

  // Current selected option object
  const currentOption = resolvedOptions.find((opt) => opt.value === currentValue);

  // Reposition dropdown whenever it opens or window scrolls/resizes
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setIsPositioned(false);
      return;
    }

    const updateCoords = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      const menuHeight = menuRef.current ? menuRef.current.offsetHeight : 180;
      const menuWidth = menuRef.current ? menuRef.current.offsetWidth : Math.max(rect.width, 130);

      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      const openAbove = spaceBelow < Math.min(menuHeight, 180) + 8 && spaceAbove > spaceBelow;

      const top = openAbove
        ? Math.max(8, rect.top - (menuRef.current?.offsetHeight || 160) - 4)
        : Math.min(viewportHeight - 40, rect.bottom + 4);

      let left = rect.left;
      if (left + menuWidth > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - menuWidth - 8);
      }

      setDropdownCoords({
        top,
        left,
        minWidth: Math.max(rect.width, 120),
        maxWidth: Math.min(viewportWidth - 16, 360),
        placement: openAbove ? 'top' : 'bottom',
      });
      setIsPositioned(true);
    };

    updateCoords();
    const frameId = requestAnimationFrame(updateCoords);

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen]);

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Select an option programmatically or on user click
  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    setIsOpen(false);

    if (!isControlled) {
      setInternalValue(option.value);
    }
    onValueChange?.(option.value);

    // Update hidden select element and dispatch native change event so React & tests detect it
    if (selectRef.current) {
      const prototype = Object.getPrototypeOf(selectRef.current);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor?.set) {
        descriptor.set.call(selectRef.current, option.value);
      } else {
        selectRef.current.value = option.value;
      }
      const event = new Event('change', { bubbles: true });
      selectRef.current.dispatchEvent(event);
    }

    triggerRef.current?.focus();
  };

  // Keyboard navigation on trigger button & menu
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        const idx = resolvedOptions.findIndex((o) => o.value === currentValue && !o.disabled);
        setFocusedIndex(idx >= 0 ? idx : 0);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (focusedIndex >= 0 && resolvedOptions[focusedIndex]) {
          handleSelect(resolvedOptions[focusedIndex]);
        }
      }
      return;
    }

    if (isOpen) {
      if (e.key === 'Tab') {
        setIsOpen(false);
      }
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const enabledIndices = resolvedOptions
        .map((o, i) => (!o.disabled ? i : -1))
        .filter((i) => i >= 0);
      if (enabledIndices.length === 0) return;
      const currentPos = enabledIndices.indexOf(focusedIndex);
      const nextPos = (currentPos + 1) % enabledIndices.length;
      setFocusedIndex(enabledIndices[nextPos]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const enabledIndices = resolvedOptions
        .map((o, i) => (!o.disabled ? i : -1))
        .filter((i) => i >= 0);
      if (enabledIndices.length === 0) return;
      const currentPos = enabledIndices.indexOf(focusedIndex);
      const prevPos = (currentPos - 1 + enabledIndices.length) % enabledIndices.length;
      setFocusedIndex(enabledIndices[prevPos]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIndex >= 0 && resolvedOptions[focusedIndex]) {
        handleSelect(resolvedOptions[focusedIndex]);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Sizing definitions
  const sizeClasses = {
    xs: 'h-6 text-[10.5px] px-2 py-0.5 gap-1',
    sm: 'h-7 text-xs px-2.5 py-1 gap-1.5',
    md: 'h-9 text-sm px-3 py-1.5 gap-2',
  }[size];

  const chevronSize = size === 'xs' ? 11 : 13;

  return (
    <div
      className={cn('relative inline-flex items-center min-w-0 max-w-full', containerClassName)}
      style={style}
    >
      {/* Hidden native select for standard accessibility, form bindings & automated test queries */}
      <select
        ref={selectRef}
        id={selectId}
        name={name}
        value={currentValue}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        title={title}
        tabIndex={-1}
        aria-hidden="false"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={(e) => {
          if (!isControlled) {
            setInternalValue(e.target.value);
          }
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        {...rest}
      >
        {resolvedOptions.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled} title={opt.hint}>
            {typeof opt.label === 'string' || typeof opt.label === 'number'
              ? String(opt.label)
              : opt.value}
          </option>
        ))}
      </select>

      {/* Custom styled trigger button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${selectId}-menu` : undefined}
        title={title || currentOption?.hint}
        disabled={disabled}
        data-slot="select-trigger"
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => {
              const next = !prev;
              if (next) {
                const idx = resolvedOptions.findIndex(
                  (o) => o.value === currentValue && !o.disabled
                );
                setFocusedIndex(idx >= 0 ? idx : 0);
              }
              return next;
            });
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'inline-flex items-center justify-between rounded-md border border-border bg-card dark:bg-muted text-foreground font-medium select-none cursor-pointer outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 min-w-0 max-w-full',
          sizeClasses,
          className,
          triggerClassName
        )}
      >
        <span className="truncate flex-1 text-left min-w-0">
          {currentOption ? currentOption.label : placeholder || '\u00A0'}
        </span>
        <ChevronDown
          size={chevronSize}
          strokeWidth={2}
          className={cn(
            'shrink-0 ml-1 opacity-70 transition-transform duration-200 ease-out',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Custom styled dropdown popover menu */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            id={`${selectId}-menu`}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            style={{
              position: 'fixed',
              top: `${dropdownCoords.top}px`,
              left: `${dropdownCoords.left}px`,
              minWidth: `${dropdownCoords.minWidth}px`,
              maxWidth: `${dropdownCoords.maxWidth}px`,
              zIndex: 999999,
              visibility: isPositioned ? 'visible' : 'hidden',
              transformOrigin: dropdownCoords.placement === 'top' ? 'bottom left' : 'top left',
            }}
            className={cn(
              'overflow-y-auto max-h-60 rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1 text-xs select-none outline-none',
              isPositioned && 'animate-in fade-in zoom-in-95 duration-100',
              contentClassName
            )}
          >
            {resolvedOptions.map((opt, i) => {
              const isSelected = opt.value === currentValue;
              const isFocused = i === focusedIndex;

              return (
                <div
                  key={`${opt.value}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  title={opt.hint}
                  onMouseEnter={() => {
                    if (!opt.disabled) setFocusedIndex(i);
                  }}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full px-2.5 py-1.5 flex items-center justify-between text-left cursor-pointer transition-colors outline-none mx-0.5 rounded-[4px]',
                    isFocused && 'bg-accent text-accent-foreground',
                    isSelected && 'font-semibold text-foreground bg-accent/40',
                    opt.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isSelected && (
                    <Check size={12} strokeWidth={2.5} className="shrink-0 text-primary ml-1.5" />
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
