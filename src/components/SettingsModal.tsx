import React, { useState, useEffect } from 'react';
import { Shield, Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import type { AppConfig } from '../types/electron';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged: () => void;
  /** Called after a successful save, right before the modal closes. */
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
  onSaved,
}) => {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState('');
  const [updateMode, setUpdateMode] = useState<'auto' | 'portable' | 'disabled' | ''>('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    window.electronAPI?.getAppVersion?.().then(setVersion).catch(() => {});
    window.electronAPI?.getUpdateMode?.().then(setUpdateMode).catch(() => {});
  }, [isOpen]);

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      // The answer shows up as the update dialog or a toast (UpdateNotice)
      await window.electronAPI?.checkForUpdates?.();
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      window.electronAPI.getAppConfig().then((cfg) => {
        setAlwaysOnTop(cfg.alwaysOnTop || false);
        setIsDarkMode(Boolean(cfg.darkMode));
      });
      setStatusMessage(null);
    }
  }, [isOpen]);

  const handleSaveSettings = async () => {
    if (!window.electronAPI) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const updated: Partial<AppConfig> = {
        alwaysOnTop,
        darkMode: isDarkMode,
      };

      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      await window.electronAPI.saveAppConfig(updated);

      onConfigChanged();
      onSaved?.();
      onClose();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustes">
      <div className="flex flex-col gap-4 text-xs">
        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded border-2 border-black font-bold flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-[#78E08F] text-black shadow-[2px_2px_0px_#000]'
                : 'bg-[#FF6B6B] text-white shadow-[2px_2px_0px_#000]'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={16} strokeWidth={2.5} />
            ) : (
              <AlertCircle size={16} strokeWidth={2.5} />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Section: Options & Portability */}
        <div className="flex flex-col gap-2 p-3 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-700 rounded shadow-[2px_2px_0px_#000]">
          <span className="font-black flex items-center gap-1.5 uppercase text-black dark:text-zinc-200">
            <Shield size={14} strokeWidth={2.5} /> Opciones del Editor & Apariencia
          </span>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={(e) => setIsDarkMode(e.target.checked)}
              className="w-4 h-4 rounded border-2 border-black text-[#FFE500] focus:ring-0 cursor-pointer accent-[#FFE500]"
            />
            <span className="font-bold text-black dark:text-zinc-200">
              🌙 Modo Oscuro (Tema Neubrutalista Nocturno)
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alwaysOnTop}
              onChange={(e) => setAlwaysOnTop(e.target.checked)}
              className="w-4 h-4 rounded border-2 border-black text-[#FFE500] focus:ring-0 cursor-pointer accent-[#FFE500]"
            />
            <span className="font-bold text-black dark:text-zinc-200">
              Iniciar siempre en modo superposición (Always on Top)
            </span>
          </label>
        </div>

        {/* Section: Version & updates */}
        {version && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-700 rounded shadow-[2px_2px_0px_#000]">
            <div className="flex flex-col">
              <span className="font-black uppercase text-black dark:text-zinc-200">yanote v{version}</span>
              <span className="text-[10px] text-neutral-500 dark:text-zinc-400 font-medium">
                {updateMode === 'portable'
                  ? 'Versión portable: te avisa de nuevas versiones para descargarlas.'
                  : updateMode === 'disabled'
                  ? 'Modo desarrollo: actualizaciones desactivadas.'
                  : 'Se actualiza automáticamente (te pregunta antes).'}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckUpdates}
              disabled={checking}
              className="dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-500"
            >
              <RefreshCw size={12} strokeWidth={2.5} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Buscando…' : 'Buscar actualizaciones'}
            </Button>
          </div>
        )}

        {/* Save Button */}
        <Button
          variant="primary"
          size="md"
          onClick={handleSaveSettings}
          disabled={saving}
          className="w-full py-2"
        >
          <Save size={15} strokeWidth={2.5} />
          {saving ? 'Guardando...' : 'Guardar Ajustes'}
        </Button>
      </div>
    </Modal>
  );
};
