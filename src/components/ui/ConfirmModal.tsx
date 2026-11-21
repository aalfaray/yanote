import { t, useLanguage } from '../../lib/i18n';
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
  title = t("Cambios sin guardar"),
  message,
  subMessage = t("Si cierras esta nota ahora, perderás las modificaciones realizadas."),
  confirmText = t("Descartar y Cerrar"),
  cancelText = t("Cancelar"),
  saveAndCloseText,
  onConfirm,
  onCancel,
  onSaveAndConfirm,
}) => {
  useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 min-[480px]:p-3 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-100">
      <div className="w-full max-w-sm bg-background text-foreground border border-border rounded-xl shadow-lg overflow-hidden flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-semibold text-sm">
              {title}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-black/20 rounded-md cursor-pointer transition-all"
            title={t("Cerrar modal")}
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-2">
          <p className="font-semibold text-sm text-foreground leading-snug">
            {message}
          </p>
          {subMessage && (
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
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
                className="w-full py-2"
              >
                💾 {saveAndCloseText}
              </Button>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onCancel}
                className="flex-1 py-1.5 font-medium"
              >
                {cancelText}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onConfirm}
                className="flex-1 py-1.5"
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
