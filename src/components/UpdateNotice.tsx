import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { UpdateEvent, UpdateMode } from '../types/electron';
import { DismissButton } from './ui/DismissButton';

interface UpdateNoticeProps {
  /** Notes with unsaved changes: restarting would lose them, so the user is warned first */
  unsavedCount: number;
}

type Phase =
  | { kind: 'hidden' }
  | { kind: 'available'; version: string; currentVersion: string; notes: string; mode: UpdateMode }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'restarting'; version: string };

type Toast = { tone: 'ok' | 'error'; text: string } | null;

const btn =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3 border-2 border-black rounded font-black text-xs shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition';

/**
 * "Tienes una nueva actualización vigente": asks before downloading, shows progress,
 * then restarts into the new version (installed build) or opens the download page (portable).
 */
export const UpdateNotice: React.FC<UpdateNoticeProps> = ({ unsavedCount }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'hidden' });
  const [toast, setToast] = useState<Toast>(null);
  // "Más tarde" silences that version until the next app start
  const dismissedRef = useRef<string | null>(null);
  const acceptedRef = useRef(false);
  const unsavedRef = useRef(unsavedCount);
  useEffect(() => {
    unsavedRef.current = unsavedCount;
  });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateEvent) return;
    return api.onUpdateEvent((evt: UpdateEvent) => {
      switch (evt.type) {
        case 'available':
          if (dismissedRef.current === evt.version) return;
          setPhase((p) =>
            p.kind === 'downloading' || p.kind === 'ready' || p.kind === 'restarting'
              ? p
              : { kind: 'available', version: evt.version, currentVersion: evt.currentVersion, notes: evt.notes, mode: evt.mode }
          );
          break;
        case 'progress':
          setPhase((p) => (p.kind === 'downloading' ? { ...p, percent: evt.percent } : p));
          break;
        case 'downloaded':
          // Accepted and nothing to lose: restart straight away
          if (acceptedRef.current && unsavedRef.current === 0) {
            setPhase({ kind: 'restarting', version: evt.version });
            setTimeout(() => void api.installUpdate?.(), 1200);
          } else {
            setPhase({ kind: 'ready', version: evt.version });
          }
          break;
        case 'none':
          setToast({ tone: 'ok', text: `Ya tienes la última versión (v${evt.currentVersion})` });
          break;
        case 'error':
          setPhase((p) => (p.kind === 'downloading' ? { kind: 'hidden' } : p));
          setToast({ tone: 'error', text: `Actualización: ${evt.error}` });
          break;
      }
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const later = () => {
    if (phase.kind === 'available') dismissedRef.current = phase.version;
    setPhase({ kind: 'hidden' });
  };

  const accept = async () => {
    if (phase.kind !== 'available') return;
    const { version, mode } = phase;
    acceptedRef.current = true;
    if (mode === 'auto') setPhase({ kind: 'downloading', version, percent: 0 });
    const res = await window.electronAPI?.acceptUpdate?.();
    if (!res?.success) {
      setPhase({ kind: 'hidden' });
      setToast({ tone: 'error', text: `No se pudo actualizar: ${res?.error ?? 'error desconocido'}` });
    } else if (res.opened) {
      dismissedRef.current = version;
      setPhase({ kind: 'hidden' });
      setToast({ tone: 'ok', text: 'Abrí la página de descarga en tu navegador' });
    }
  };

  const restart = () => {
    if (phase.kind !== 'ready') return;
    setPhase({ kind: 'restarting', version: phase.version });
    void window.electronAPI?.installUpdate?.();
  };

  return (
    <>
      {phase.kind !== 'hidden' && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-2 min-[480px]:p-3 bg-black/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-title"
        >
          <div className="w-full max-w-sm bg-[#FAF8F5] dark:bg-[#18181B] text-black dark:text-zinc-100 border-[3px] border-black dark:border-zinc-700 rounded-lg shadow-[6px_6px_0px_#000] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#FFE500] border-b-2 border-black text-black">
              <span id="update-title" className="flex items-center gap-2 font-black text-xs tracking-wider uppercase">
                <Sparkles size={15} strokeWidth={3} /> Nueva actualización
              </span>
              {phase.kind === 'available' && (
                <button type="button" onClick={later} title="Más tarde" aria-label="Cerrar" className="p-1 hover:bg-black/10 rounded cursor-pointer">
                  <X size={15} strokeWidth={3} />
                </button>
              )}
            </div>

            <div className="p-4 flex flex-col gap-3">
              {phase.kind === 'available' && (
                <>
                  <p className="font-black text-sm leading-snug">
                    Tienes una nueva actualización vigente: <span className="whitespace-nowrap">v{phase.version}</span>
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-zinc-400 font-medium">
                    Tu versión actual es v{phase.currentVersion}.{' '}
                    {phase.mode === 'portable'
                      ? 'Estás usando la versión portable: al aceptar se abrirá la página de descarga.'
                      : 'Al aceptar se descargará e instalará, y yanote se reiniciará.'}
                  </p>
                  {phase.notes && (
                    <div className="max-h-40 overflow-auto text-[11.5px] whitespace-pre-wrap p-2 rounded border-2 border-black/20 dark:border-zinc-700 bg-white dark:bg-[#1C1C20]">
                      {phase.notes}
                    </div>
                  )}
                  {phase.mode === 'auto' && unsavedCount > 0 && (
                    <p className="text-[11px] font-bold text-[#B45309] dark:text-[#FCD34D]">
                      Tienes {unsavedCount} {unsavedCount === 1 ? 'nota sin guardar' : 'notas sin guardar'}: te pediré confirmación antes de reiniciar.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={later} className={`${btn} bg-white dark:bg-[#27272A] dark:border-zinc-600`}>
                      Más tarde
                    </button>
                    <button type="button" onClick={() => void accept()} autoFocus className={`${btn} bg-[#78E08F] text-black`}>
                      <Download size={13} strokeWidth={3} /> Aceptar y actualizar
                    </button>
                  </div>
                </>
              )}

              {phase.kind === 'downloading' && (
                <>
                  <p className="font-black text-sm">Descargando v{phase.version}…</p>
                  <div
                    className="h-4 border-2 border-black rounded bg-white dark:bg-[#27272A] overflow-hidden"
                    role="progressbar"
                    aria-valuenow={phase.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full bg-[#FFE500] transition-[width] duration-300" style={{ width: `${phase.percent}%` }} />
                  </div>
                  <p className="text-[11px] font-black opacity-60 text-right">{phase.percent}%</p>
                </>
              )}

              {phase.kind === 'ready' && (
                <>
                  <p className="font-black text-sm">v{phase.version} está lista para instalarse.</p>
                  {unsavedCount > 0 ? (
                    <p className="text-xs font-bold text-[#B45309] dark:text-[#FCD34D]">
                      Tienes {unsavedCount} {unsavedCount === 1 ? 'nota sin guardar' : 'notas sin guardar'}. Guárdalas antes de reiniciar o se perderán los cambios.
                      También se cerrarán las terminales y chats abiertos.
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-600 dark:text-zinc-400 font-medium">yanote se cerrará y volverá a abrirse con la nueva versión.</p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setPhase({ kind: 'hidden' })} className={`${btn} bg-white dark:bg-[#27272A] dark:border-zinc-600`}>
                      Al cerrar yanote
                    </button>
                    <button type="button" onClick={restart} className={`${btn} ${unsavedCount > 0 ? 'bg-[#FF6B6B] text-white' : 'bg-[#78E08F] text-black'}`}>
                      <RefreshCw size={13} strokeWidth={3} /> {unsavedCount > 0 ? 'Reiniciar de todos modos' : 'Reiniciar ahora'}
                    </button>
                  </div>
                </>
              )}

              {phase.kind === 'restarting' && (
                <p className="font-black text-sm flex items-center gap-2">
                  <RefreshCw size={14} strokeWidth={3} className="animate-spin" /> Instalando v{phase.version} y reiniciando…
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-10 right-2 z-[60] max-w-[calc(100%-16px)] px-3 py-1.5 rounded border-2 border-black font-black text-xs shadow-[3px_3px_0px_#000] flex items-center gap-1.5 ${
            toast.tone === 'ok' ? 'bg-[#78E08F] text-black' : 'bg-[#FF6B6B] text-white'
          }`}
        >
          {toast.tone === 'ok' ? <CheckCircle2 size={14} strokeWidth={3} className="shrink-0" /> : <AlertCircle size={14} strokeWidth={3} className="shrink-0" />}
          <span className="min-w-0">{toast.text}</span>
          <DismissButton onClick={() => setToast(null)} />
        </div>
      )}
    </>
  );
};
