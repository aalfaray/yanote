import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { t } from '../../lib/i18n';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 min-[480px]:p-3 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-background text-foreground border border-border rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-16px)] min-[480px]:max-h-[90vh] transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-foreground">
              {title}
            </span>
            {badge && (
              <span className="bg-secondary text-secondary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0">
                {badge}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            aria-label={t("Cerrar modal")}
            className="p-1 rounded-md text-muted-foreground"
          >
            <X size={16} strokeWidth={1.75} className="text-foreground" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-3 min-[480px]:p-4 overflow-y-auto flex-1 text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
};
