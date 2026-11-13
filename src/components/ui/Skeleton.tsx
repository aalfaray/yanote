import type { ReactNode } from 'react';

/** Decorative placeholder; the enclosing loading region announces its purpose once. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block rounded bg-black/10 dark:bg-zinc-700 motion-safe:animate-pulse ${className}`} />;
}

export function LoadingSkeleton({ label, variant = 'panel', className = '' }: {
  label: string; variant?: 'panel' | 'chat' | 'usage' | 'line'; className?: string;
}) {
  let content: ReactNode;
  if (variant === 'usage') {
    content = <><Skeleton className="h-2 w-6" /><Skeleton className="h-2 w-9" /><Skeleton className="h-2 w-6" /></>;
  } else if (variant === 'line') {
    content = <Skeleton className="h-3 w-32 max-w-full" />;
  } else {
    content = <>
      {variant === 'chat' && <Skeleton className="h-9 w-2/5 self-end mb-4" />}
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-3/5" />
      {variant === 'chat' && <Skeleton className="h-20 w-full mt-3" />}
    </>;
  }
  return (
    <span role="status" aria-label={label} aria-busy="true" className={`${variant === 'usage' ? 'h-5 inline-flex items-center gap-1.5 px-1' : 'flex flex-col gap-3 min-w-0'} ${className}`}>
      <span className="sr-only">{label}</span>
      {content}
    </span>
  );
}
