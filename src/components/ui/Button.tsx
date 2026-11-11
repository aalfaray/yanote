import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'purple' | 'cyan' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'secondary',
  size = 'sm',
  active = false,
  disabled,
  ...props
}) => {
  const variantClasses = {
    primary: 'bg-[#FFE500] hover:bg-[#FFD700] text-black',
    secondary: 'bg-white hover:bg-neutral-100 text-black',
    danger: 'bg-[#FF6B6B] hover:bg-[#FF5252] text-white',
    success: 'bg-[#78E08F] hover:bg-[#68d17f] text-black',
    purple: 'bg-[#D8B4FE] hover:bg-[#C084FC] text-black',
    cyan: 'bg-[#7DF9FF] hover:bg-[#5CE1E6] text-black',
    ghost: 'bg-transparent hover:bg-neutral-200/60 text-black border-transparent shadow-none',
  };

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-xs',
    sm: 'px-2.5 py-1 text-xs font-bold',
    md: 'px-3.5 py-1.5 text-sm font-bold',
    lg: 'px-4 py-2 text-base font-bold',
  };

  const isGhost = variant === 'ghost';

  return (
    <button
      disabled={disabled}
      className={twMerge(
        clsx(
          'inline-flex items-center justify-center gap-1.5 font-bold transition-all select-none cursor-pointer',
          !isGhost && 'border-2 border-black rounded shadow-[2px_2px_0px_#000]',
          !isGhost && !disabled && 'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
          active && !isGhost && 'translate-x-[1.5px] translate-y-[1.5px] shadow-[0.5px_0.5px_0px_#000] ring-1 ring-black',
          disabled && 'opacity-40 cursor-not-allowed shadow-none',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
      {...props}
    >
      {children}
    </button>
  );
};
