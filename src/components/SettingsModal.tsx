import { t, useLanguage, configureLanguage, getLanguagePreference, getSystemLanguages, type LanguagePreference } from '../lib/i18n';
import React, { useState, useEffect } from 'react';
import { Shield, Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import type { AppConfig } from '../types/electron';
import { logError } from '../lib/logger';
import { LoadingSkeleton } from './ui/Skeleton';

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
  useLanguage();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notifyClaude, setNotifyClaude] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState('');
  const [updateMode, setUpdateMode] = useState<'auto' | 'portable' | 'disabled' | ''>('');
  const [checking, setChecking] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(getLanguagePreference);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setAboutLoading(true);
    void Promise.allSettled([window.electronAPI?.getAppVersion?.(), window.electronAPI?.getUpdateMode?.()]).then(([v, mode]) => {
      if (cancelled) return;
      if (v.status === 'fulfilled' && v.value) setVersion(v.value);
      if (mode.status === 'fulfilled' && mode.value) setUpdateMode(mode.value);
      setAboutLoading(false);
    });
    return () => { cancelled = true; };
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
    if (!isOpen) return;
    let cancelled = false;
    setConfigLoading(true);
    setStatusMessage(null);
    if (window.electronAPI) {
      void window.electronAPI.getAppConfig().then((cfg) => {
        if (cancelled) return;
        setIsDarkMode(Boolean(cfg.darkMode));
        setNotifyClaude(cfg.notifyClaude !== false);
        setLanguagePreference(cfg.language || 'auto');
        setConfigLoaded(true);
      }).catch((err) => {
        if (!cancelled) setStatusMessage({ type: 'error', text: t("No se pudieron cargar los ajustes. Cierra y vuelve a abrir este panel para reintentar.") });
        logError('SettingsModal.load', err);
      }).finally(() => { if (!cancelled) setConfigLoading(false); });
    } else {
      setConfigLoaded(true);
      setConfigLoading(false);
    }
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleSaveSettings = async () => {
    if (!window.electronAPI || !configLoaded || configLoading || saving) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const updated: Partial<AppConfig> = {
        darkMode: isDarkMode,
        notifyClaude,
        language: languagePreference,
      };

      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      await window.electronAPI.saveAppConfig(updated);
      configureLanguage(languagePreference);

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
    <Modal isOpen={isOpen} onClose={onClose} title={t("Ajustes")}>
      <div className="flex flex-col gap-4 text-xs">
        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded-md border border-border font-medium flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-success/15 text-foreground shadow-sm'
                : 'bg-destructive text-destructive-foreground shadow-sm'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={16} strokeWidth={1.75} />
            ) : (
              <AlertCircle size={16} strokeWidth={1.75} />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {configLoading && !configLoaded && <LoadingSkeleton label={t("Cargando ajustes")} className="p-3 min-h-32" />}
        {/* Section: Options & Portability */}
        {configLoaded && <fieldset disabled={configLoading || saving} aria-busy={configLoading} className="flex flex-col gap-2 p-3 bg-card border border-border rounded-md shadow-sm">
          <span className="font-semibold flex items-center gap-1.5 uppercase text-foreground">
            <Shield size={14} strokeWidth={1.75} /> {' '}{t("Opciones del Editor & Apariencia")}</span>

          <label className="flex flex-col gap-1 font-medium mb-2">
            {t('Idioma de la aplicación')}
            <select aria-label={t('Idioma de la aplicación')} value={languagePreference} onChange={(event) => setLanguagePreference(event.target.value as LanguagePreference)} className="h-8 px-2 bg-card border border-border rounded-md">
              <option value="auto">{t('Automático (sistema)')}</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <span className="text-[10px] font-medium opacity-60">{t('Idioma del sistema: {0}', [getSystemLanguages()[0] || 'en'])}</span>
            <span className="text-[10px] font-medium opacity-60">{t('Se aplica a la interfaz y al corrector ortográfico.')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={(e) => setIsDarkMode(e.target.checked)}
              className="w-4 h-4 rounded-md border border-border text-foreground focus:ring-0 cursor-pointer accent-primary"
            />
            <span className="font-medium text-foreground">
              {t("Modo oscuro")}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyClaude}
              onChange={(e) => setNotifyClaude(e.target.checked)}
              className="w-4 h-4 rounded-md border border-border text-foreground focus:ring-0 cursor-pointer accent-primary"
            />
            <span className="font-medium text-foreground">
              {t("🔔 Avisarme en Windows cuando Claude termine o necesite mi respuesta")}</span>
          </label>
        </fieldset>}

        {/* Section: Version & updates */}
        {aboutLoading && !version && <LoadingSkeleton label={t("Cargando versión y actualizaciones")} className="p-3" />}
        {version && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-card border border-border rounded-md shadow-sm">
            <div className="flex flex-col">
              <span className="font-semibold uppercase text-foreground">yanote v{version}</span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {updateMode === 'portable'
                  ? t("Versión portable: te avisa de nuevas versiones para descargarlas.")
                  : updateMode === 'disabled'
                  ? t("Modo desarrollo: actualizaciones desactivadas.")
                  : t("Se actualiza automáticamente (te pregunta antes).")}
              </span>


            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckUpdates}
              disabled={checking}
            >
              <RefreshCw size={12} strokeWidth={1.75} className={checking ? 'animate-spin' : ''} />
              {checking ? t('Buscando…') : t("Buscar actualizaciones")}
            </Button>
          </div>
        )}

        {/* Save Button */}
        <Button
          variant="primary"
          size="md"
          onClick={handleSaveSettings}
          disabled={saving || configLoading || !configLoaded}
          className="w-full py-2"
        >
          <Save size={15} strokeWidth={1.75} />
          {saving ? t('Guardando...') : t("Guardar Ajustes")}
        </Button>
      </div>
    </Modal>
  );
};
