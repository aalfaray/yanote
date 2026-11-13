import React from 'react';
import { X } from 'lucide-react';

/** The "x" that closes an in-app notice or alert. Inherits the notice's text colour. */
export const DismissButton: React.FC<{ onClick: () => void; label?: string; className?: string }> = ({
  onClick,
  label = 'Cerrar aviso',
  className = '',
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    title={label}
    aria-label={label}
    className={`shrink-0 -my-1 -mr-1.5 ml-auto h-6 w-6 inline-flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current cursor-pointer ${className}`}
  >
    <X size={13} strokeWidth={3} />
  </button>
);
