import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  badge?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  badge,
  children,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-[#FAF8F5] dark:bg-[#18181B] border-3 border-black dark:border-zinc-700 rounded-lg shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#000] overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#FFE500] border-b-2 border-black">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm tracking-wide text-black uppercase">
              {title}
            </span>
            {badge && (
              <span className="bg-black text-[#FFE500] text-[10px] font-black px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            className="p-1 hover:bg-black/10 rounded"
          >
            <X size={16} strokeWidth={3} className="text-black" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 text-black dark:text-zinc-200">
          {children}
        </div>
      </div>
    </div>
  );
};
