import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine,
  FileText,
  Pause,
  Pilcrow,
  Play,
  SkipBack,
  SkipForward,
  Square,
  TextSelect,
  Volume2,
} from 'lucide-react';
import { SPEECH_RATES, type SpeechController } from '../hooks/useSpeech';
import { SpeechContext, type SelectionSnapshot } from './speechContext';
import { DismissButton } from './ui/DismissButton';


const formatRate = (rate: number) => `${rate}x`.replace('.', ',');

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, hint, disabled, onSelect }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onSelect}
    className="w-full px-3 py-2 min-[640px]:py-1.5 flex items-center gap-2.5 text-left hover:bg-[#FFE500] hover:text-black dark:hover:text-black transition-colors cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:text-zinc-100"
  >
    <span className="shrink-0 text-black/70 dark:text-zinc-400 group-hover:text-black">{icon}</span>
    <span className="flex-1">{label}</span>
    {hint && <span className="text-[10px] font-semibold opacity-60">{hint}</span>}
  </button>
);

/** Toolbar button ("Leer en voz alta") with a dropdown of reading modes. */
export const SpeechToolbarButton: React.FC = () => {
  const ctx = useContext(SpeechContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<SelectionSnapshot>({ text: '', node: null });
  const [menu, setMenu] = useState<{ x: number; y: number; snapshot: SelectionSnapshot } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  if (!ctx) return null;
  const { speech, captureSelection, readAll, readSelection, readParagraph, paragraphsAvailable } = ctx;
  const isActive = speech.state.status !== 'idle';

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    const menuWidth = 240;
    const x = Math.max(8, Math.min(rect?.left ?? 8, window.innerWidth - menuWidth - 8));
    setMenu({ x, y: (rect?.bottom ?? 40) + 6, snapshot: snapshotRef.current });
  };

  const run = (action: () => void) => {
    setMenu(null);
    action();
  };

  const snapshot = menu?.snapshot ?? { text: '', node: null };
  const hasSelection = snapshot.text.trim().length > 0;
  const hasCaret = paragraphsAvailable && snapshot.node !== null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Leer en voz alta (Ctrl+Shift+Espacio)"
        aria-label="Leer en voz alta"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        data-state={isActive ? 'on' : 'off'}
        data-testid="speech-toolbar-button"
        // Keep the editor selection alive while clicking the button
        onMouseDown={(e) => {
          e.preventDefault();
          snapshotRef.current = captureSelection();
        }}
        onClick={toggleMenu}
      >
        <Volume2 size={16} strokeWidth={2.5} />
      </button>

      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Opciones de lectura en voz alta"
            data-testid="speech-menu"
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-[999999] w-60 max-w-[calc(100vw-16px)] bg-[#FAF8F5] dark:bg-[#1C1C20] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-700 rounded shadow-[4px_4px_0px_#000] py-1 select-none text-xs font-bold"
          >
            <MenuItem icon={<FileText size={13} strokeWidth={2.5} />} label="Leer todo" onSelect={() => run(readAll)} />
            <MenuItem
              icon={<TextSelect size={13} strokeWidth={2.5} />}
              label="Leer selección"
              disabled={!hasSelection}
              onSelect={() => run(() => readSelection(snapshot))}
            />
            <MenuItem
              icon={<Pilcrow size={13} strokeWidth={2.5} />}
              label="Leer párrafo actual"
              disabled={!hasCaret}
              onSelect={() => run(() => readParagraph(snapshot, false))}
            />
            <MenuItem
              icon={<ArrowDownToLine size={13} strokeWidth={2.5} />}
              label="Leer desde aquí"
              disabled={!hasCaret}
              onSelect={() => run(() => readParagraph(snapshot, true))}
            />

            <div className="my-1 border-t border-black/15 dark:border-zinc-700" />
            <div className="px-3 pt-0.5 pb-1 text-[10px] uppercase tracking-wide opacity-60">Velocidad</div>
            <div className="px-2 pb-1.5 flex gap-1">
              {SPEECH_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => speech.setRate(rate)}
                  aria-pressed={speech.state.rate === rate}
                  className={`flex-1 h-8 min-[640px]:h-6 text-[10px] font-black border-[1.5px] border-black dark:border-zinc-600 rounded transition-colors ${
                    speech.state.rate === rate
                      ? 'bg-[#FFE500] text-black shadow-[1px_1px_0px_#000]'
                      : 'bg-white dark:bg-[#27272A] hover:bg-[#FFE500] hover:text-black'
                  }`}
                >
                  {formatRate(rate)}
                </button>
              ))}
            </div>
            {!paragraphsAvailable && (
              <div className="px-3 pb-1 text-[10px] font-semibold opacity-60">
                Las opciones por párrafo funcionan en la vista enriquecida.
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

const playerButton =
  'h-7 min-w-7 px-1 inline-flex items-center justify-center border-[1.5px] border-black dark:border-zinc-600 rounded bg-white dark:bg-[#27272A] shadow-[1.5px_1.5px_0px_#000] hover:bg-[#FFE500] hover:text-black transition-colors disabled:opacity-40';

/** Floating mini-player shown while reading. */
export const SpeechPlayerBar: React.FC<{ speech: SpeechController }> = ({ speech }) => {
  const { state } = speech;

  if (state.status === 'idle') {
    if (!state.error) return null;
    return (
      <div
        role="alert"
        className="absolute bottom-2 inset-x-2 min-[480px]:inset-x-auto min-[480px]:left-3 min-[480px]:bottom-3 z-30 px-3 py-1.5 rounded border-2 border-black font-black text-xs shadow-[3px_3px_0px_#000] bg-[#FF6B6B] text-white flex items-center justify-between gap-2"
      >
        <span className="min-w-0">{state.error}</span>
        <DismissButton onClick={speech.clearError} />
      </div>
    );
  }

  const cycleRate = () => {
    const i = SPEECH_RATES.indexOf(state.rate as (typeof SPEECH_RATES)[number]);
    speech.setRate(SPEECH_RATES[(i + 1) % SPEECH_RATES.length]);
  };

  return (
    <div
      data-testid="speech-player"
      className="absolute bottom-2 inset-x-2 min-[480px]:inset-x-auto min-[480px]:left-3 min-[480px]:bottom-3 z-30 flex items-center justify-between min-[480px]:justify-start gap-1 p-1 rounded border-2 border-black dark:border-zinc-700 bg-[#FAF8F5] dark:bg-[#1C1C20] text-black dark:text-zinc-100 shadow-[3px_3px_0px_#000] text-xs font-black select-none"
    >
      <Volume2 size={14} strokeWidth={2.5} className="mx-1 shrink-0 animate-pulse hidden min-[380px]:block" />
      <button type="button" className={playerButton} onClick={speech.previous} disabled={state.index === 0} title="Párrafo anterior" aria-label="Párrafo anterior">
        <SkipBack size={13} strokeWidth={2.5} />
      </button>
      {state.status === 'speaking' ? (
        <button type="button" className={`${playerButton} !bg-[#FFE500] text-black`} onClick={speech.pause} title="Pausar" aria-label="Pausar">
          <Pause size={13} strokeWidth={2.5} />
        </button>
      ) : (
        <button type="button" className={`${playerButton} !bg-[#78E08F] text-black`} onClick={speech.resume} title="Reanudar" aria-label="Reanudar">
          <Play size={13} strokeWidth={2.5} />
        </button>
      )}
      <button
        type="button"
        className={playerButton}
        onClick={speech.next}
        disabled={state.index >= state.total - 1}
        title="Párrafo siguiente"
        aria-label="Párrafo siguiente"
      >
        <SkipForward size={13} strokeWidth={2.5} />
      </button>
      <button type="button" className={playerButton} onClick={speech.stop} title="Detener (Esc)" aria-label="Detener">
        <Square size={12} strokeWidth={2.5} />
      </button>
      <button type="button" className={`${playerButton} text-[10px]`} onClick={cycleRate} title="Cambiar velocidad" aria-label="Cambiar velocidad">
        {formatRate(state.rate)}
      </button>
      <span className="px-1.5 tabular-nums opacity-70" aria-live="polite">
        {state.index + 1}/{state.total}
      </span>
    </div>
  );
};
