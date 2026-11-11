import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'yellow' | 'mint' | 'coral' | 'lilac' | 'cyan' | 'neutral';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'yellow',
  ...props
}) => {
  const variantClasses = {
    yellow: 'bg-[#FFE500] text-black',
    mint: 'bg-[#78E08F] text-black',
    coral: 'bg-[#FF6B6B] text-white',
    lilac: 'bg-[#D8B4FE] text-black',
    cyan: 'bg-[#7DF9FF] text-black',
    neutral: 'bg-white text-black',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider border-1.5 border-black rounded shadow-[1.5px_1.5px_0px_#000]',
          variantClasses[variant],
          className
        )
      )}
      {...props}
    >
      {children}
    </span>
  );
};
