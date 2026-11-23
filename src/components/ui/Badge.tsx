import type { HTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'yellow' | 'mint' | 'coral' | 'lilac' | 'cyan' | 'neutral';
}

const badgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
  { variants: { variant: {
    default: 'border-transparent bg-primary text-primary-foreground',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    outline: 'border-border text-foreground',
    destructive: 'border-transparent bg-destructive/10 text-destructive',
    yellow: 'border-transparent bg-secondary text-secondary-foreground',
    mint: 'border-transparent bg-success/10 text-success',
    coral: 'border-transparent bg-destructive/10 text-destructive',
    lilac: 'border-transparent bg-secondary text-secondary-foreground',
    cyan: 'border-transparent bg-secondary text-secondary-foreground',
    neutral: 'border-border text-foreground',
  } }, defaultVariants: { variant: 'secondary' } }
);

export function Badge({ className, variant = 'yellow', ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
