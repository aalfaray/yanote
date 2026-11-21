import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, 'aria-describedby': describedBy, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && <label htmlFor={inputId} className="text-xs font-medium text-foreground">{label}</label>}
      <input
        {...props}
        id={inputId}
        data-slot="input"
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
        className={cn(
          'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className
        )}
      />
      {error && <span id={errorId} className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
