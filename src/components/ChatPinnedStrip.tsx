import { t, useLanguage } from '../lib/i18n';
import React, { useState } from 'react';
import { Pin, ChevronDown, ChevronRight, Copy, Check, X } from 'lucide-react';
import type { ChatPin } from '../types/electron';

/**
 * Paragraphs pinned on top of a chat. Collapsible so it never eats the transcript on a small
 * window; each pin expands on click and can be copied or unpinned.
 */

export const PinnedStrip: React.FC<{ pins: ChatPin[]; onUnpin?: (id: string) => void }> = ({ pins, onUnpin }) => {
  useLanguage();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div data-testid="chat-pins" className="shrink-0 border-b border-border bg-muted text-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full h-7 px-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase cursor-pointer"
      >
        {open ? <ChevronDown size={12} strokeWidth={1.75} /> : <ChevronRight size={12} strokeWidth={1.75} />}
        <Pin size={11} strokeWidth={1.75} /> {' '}{t("Fijados (")}{pins.length})
      </button>
      {open && (
        <ul className="max-h-[30vh] overflow-y-auto px-2 pb-2 flex flex-col gap-1.5">
          {pins.map((pin) => {
            const full = expanded === pin.id;
            return (
              <li key={pin.id} className="flex items-start gap-1.5 p-1.5 bg-card dark:bg-muted border border-border rounded-md">
                <button
                  type="button"
                  onClick={() => setExpanded(full ? null : pin.id)}
                  title={full ? t("Ver menos") : t("Ver completo")}
                  className={`flex-1 min-w-0 text-left text-[12px] leading-snug whitespace-pre-wrap break-words cursor-pointer ${full ? '' : 'line-clamp-2'}`}
                >
                  {pin.text}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(pin.text);
                    setCopied(pin.id);
                    setTimeout(() => setCopied((c) => (c === pin.id ? null : c)), 1200);
                  }}
                  aria-label={t("Copiar fijado")}
                  title={t("Copiar")}
                  className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md opacity-70 hover:opacity-100 hover:bg-black/10 cursor-pointer"
                >
                  {copied === pin.id ? <Check size={12} strokeWidth={1.75} /> : <Copy size={12} strokeWidth={1.75} />}
                </button>
                {onUnpin && (
                  <button
                    type="button"
                    onClick={() => onUnpin(pin.id)}
                    aria-label={t("Quitar fijado")}
                    title={t("Quitar fijado")}
                    className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md opacity-70 hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground cursor-pointer"
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
