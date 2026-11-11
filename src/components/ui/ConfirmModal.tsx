import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  subMessage?: string;
  confirmText?: string;
  cancelText?: string;
  saveAndCloseText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSaveAndConfirm?: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = 'Cambios sin guardar',
  message,
  subMessage = 'Si cierras esta nota ahora, perderás las modificaciones realizadas.',
  confirmText = 'Descartar y Cerrar',
  cancelText = 'Cancelar',
  saveAndCloseText,
  onConfirm,
  onCancel,
  onSaveAndConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-100">
      <div className="w-full max-w-sm bg-[#FAF8F5] border-3 border-black rounded-lg shadow-[6px_6px_0px_#000] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#FF6B6B] border-b-2 border-black text-white">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={3} className="text-white" />
            <span className="font-black text-xs tracking-wider uppercase">
              {title}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-black/20 rounded cursor-pointer transition-all"
            title="Cerrar modal"
          >
            <X size={15} strokeWidth={3} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-2">
          <p className="font-black text-sm text-black leading-snug">
            {message}
          </p>
          {subMessage && (
            <p className="text-xs text-neutral-600 font-medium leading-relaxed">
              {subMessage}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-3">
            {onSaveAndConfirm && saveAndCloseText && (
              <Button
                variant="primary"
                size="sm"
                onClick={onSaveAndConfirm}
                className="w-full py-2 bg-[#FFE500] hover:bg-[#FFD700] text-black font-black"
              >
                💾 {saveAndCloseText}
              </Button>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onCancel}
                className="flex-1 py-1.5 font-bold"
              >
                {cancelText}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onConfirm}
                className="flex-1 py-1.5 font-black bg-[#FF6B6B] hover:bg-[#FF5252] text-white shadow-[2px_2px_0px_#000]"
              >
                {confirmText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
