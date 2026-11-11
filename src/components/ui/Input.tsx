import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  ...props
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label className="text-xs font-black uppercase tracking-wider text-black dark:text-zinc-200">
          {label}
        </label>
      )}
      <input
        className={twMerge(
          clsx(
            'w-full px-3 py-1.5 text-sm font-medium bg-white dark:bg-zinc-800 text-black dark:text-white border-2 border-black dark:border-zinc-600 rounded shadow-[2px_2px_0px_#000] focus:outline-none focus:ring-2 focus:ring-[#FFE500] focus:shadow-[3px_3px_0px_#000] transition-all placeholder:text-neutral-400 dark:placeholder:text-zinc-500',
            error && 'border-[#FF6B6B]',
            className
          )
        )}
        {...props}
      />
      {error && <span className="text-[11px] font-bold text-[#FF6B6B]">{error}</span>}
    </div>
  );
};
