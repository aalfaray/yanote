import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'destructive' | 'danger' | 'success' | 'purple' | 'cyan' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
}

// Keep the existing variant names so every app action retains its public API.
const primary = 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90';
const destructive = 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/30';
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors select-none outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: primary,
        primary,
        secondary: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        destructive,
        danger: destructive,
        success: 'border border-success/20 bg-success/10 text-success hover:bg-success/20',
        purple: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        cyan: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        xs: 'min-h-6 px-1.5 py-0.5 text-xs',
        sm: 'min-h-7 px-2.5 py-1 text-xs',
        md: 'min-h-9 px-3.5 py-1.5 text-sm',
        lg: 'min-h-10 px-4 py-2 text-sm',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'sm' },
  }
);

export function Button({ className, variant = 'secondary', size = 'sm', active = false, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      data-active={active || undefined}
      className={cn(buttonVariants({ variant, size }), active && 'ring-2 ring-ring ring-offset-1 ring-offset-background', className)}
      {...props}
    />
  );
}
