import { t, useLanguage } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Blend } from 'lucide-react';

export const MIN_OPACITY = 0.3;
const PRESETS = [1, 0.85, 0.7, 0.5];

interface TransparencyControlProps {
  /** Current window opacity, 0.3–1 */

  opacity: number;
  onChange: (opacity: number) => void;
  /** Button classes shared with the rest of the titlebar */

  buttonClassName: string;
  activeClassName: string;
  idleClassName: string;
  iconProps: { size: number; strokeWidth: number };
}

const toPercent = (value: number) => Math.round(value * 100);

/** Titlebar button + popover with a slider to grade the whole window's transparency. */

export const TransparencyControl: React.FC<TransparencyControlProps> = ({
  opacity,
  onChange,
  buttonClassName,
  activeClassName,
  idleClassName,
  iconProps,
}) => {
  useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isTransparent = opacity < 1;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapperRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const toggle = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      // The titlebar clips overflow, so the panel is positioned in viewport coordinates
      setPos({ top: rect.bottom + 6, right: Math.max(4, window.innerWidth - rect.right) });
    }
    setIsOpen((v) => !v);
  };

  return (
    <div ref={wrapperRef} className="shrink-0 flex">
      <button
        onClick={toggle}
        title={t("Transparencia de la ventana ({0}%)", [toPercent(opacity)])}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-pressed={isTransparent}
        className={`${buttonClassName} ${isTransparent || isOpen ? activeClassName : idleClassName}`}
      >
        <Blend {...iconProps} />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t("Transparencia")}
          style={{ top: pos.top, right: pos.right }}
          className="no-drag fixed z-50 w-56 bg-white dark:bg-[#1C1C20] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-600 rounded shadow-[3px_3px_0px_#000] p-3 flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
            <span>{t("Transparencia")}</span>
            <span className="px-1.5 py-0.5 bg-[#FFE500] text-black border-2 border-black rounded text-[10px] tabular-nums">
              {toPercent(opacity)}%
            </span>
          </div>

          <input
            type="range"
            min={toPercent(MIN_OPACITY)}
            max={100}
            step={1}
            value={toPercent(opacity)}
            onChange={(e) => onChange(Number(e.target.value) / 100)}
            aria-label={t("Opacidad de la ventana")}
            className="opacity-slider w-full"
          />

          <div className="flex items-center justify-between text-[9px] font-bold text-neutral-500 dark:text-zinc-400 -mt-1">
            <span>{t("Más transparente")}</span>
            <span>{t("Opaca")}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((preset) => {
              const selected = toPercent(preset) === toPercent(opacity);
              return (
                <button
                  key={preset}
                  onClick={() => onChange(preset)}
                  className={`h-6 text-[10px] font-black border-2 border-black rounded shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-all ${
                    selected
                      ? 'bg-[#FFE500] text-black'
                      : 'bg-white text-black hover:bg-[#FFE500] dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600 dark:hover:bg-[#FFE500] dark:hover:text-black'
                  }`}
                >
                  {toPercent(preset)}%
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
