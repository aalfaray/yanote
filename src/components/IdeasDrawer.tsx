import { t, useLanguage } from '../lib/i18n';
import React, { useState } from 'react';
import { Search, Lightbulb, Send, ClipboardPaste, Copy, Trash2, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { foldChar } from '../lib/domSearch';
import { formatIdeaDate } from '../lib/ideas';
import type { SavedIdea } from '../types/electron';
import { LoadingSkeleton } from './ui/Skeleton';

interface IdeasDrawerProps {
  loading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  ideas: SavedIdea[];
  onRemove: (id: string) => void;
  /** Opens a new Claude chat with the idea typed in (not sent) */

  onSendToNewChat: (idea: SavedIdea) => void;
  /** Adds the idea to the message box of the chat on screen; absent when no chat is active */

  onInsertInChat?: (idea: SavedIdea) => void;
}

const fold = (s: string) => Array.from(s.toLowerCase()).map(foldChar).join('');

/** Ideas saved from a right-click on any text, to reuse later without hunting for the chat. */

export const IdeasDrawer: React.FC<IdeasDrawerProps> = ({ isOpen, onClose, ideas, onRemove, onSendToNewChat, onInsertInChat, loading = false }) => {
  useLanguage();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const term = fold(search.trim());
  const shown = term ? ideas.filter((i) => fold(i.text).includes(term) || fold(i.source || '').includes(term)) : ideas;

  const copy = (idea: SavedIdea) => {
    void navigator.clipboard?.writeText(idea.text);
    setCopied(idea.id);
    setTimeout(() => setCopied((c) => (c === idea.id ? null : c)), 1200);
  };

  const action =
    'h-7 px-2 inline-flex items-center gap-1 text-[11px] font-black border-2 border-black dark:border-zinc-600 rounded shadow-[1.5px_1.5px_0px_#000] cursor-pointer active:translate-x-[1px] active:translate-y-[1px]';
  if (loading) return <Modal isOpen={isOpen} onClose={onClose} title={t("Ideas guardadas")}><LoadingSkeleton label={t("Cargando ideas guardadas")} className="py-3" /></Modal>;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Ideas guardadas")} badge={`${ideas.length}`}>
      <div className="flex flex-col gap-3 text-black dark:text-zinc-100">
        {ideas.length > 3 && (
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-neutral-400 dark:text-zinc-400" />
            <input
              type="text"
              placeholder={t("Buscar en tus ideas…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("Buscar ideas")}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-600 rounded shadow-[2px_2px_0px_#000] focus:outline-none"
            />
          </div>
        )}

        {ideas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Lightbulb size={28} strokeWidth={2.5} className="text-[#E0B800]" />
            <p className="text-xs font-bold">{t("Aún no guardaste ideas.")}</p>
            <p className="text-[11px] opacity-70 max-w-[16rem]">{t("Selecciona un texto, haz clic derecho y elige «Guardar idea».")}</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-xs font-bold opacity-70 text-center py-4">{t('Ninguna idea coincide con «{0}».', [search])}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((idea) => {
              const open = expanded === idea.id;
              return (
                <li key={idea.id} className="p-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-600 rounded shadow-[2px_2px_0px_#000]">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : idea.id)}
                    title={open ? t("Ver menos") : t("Ver completa")}
                    className={`w-full text-left text-[12.5px] leading-snug whitespace-pre-wrap break-words cursor-pointer ${open ? '' : 'line-clamp-4'}`}
                  >
                    {idea.text}
                  </button>
                  <div className="mt-1 text-[10px] font-bold opacity-60 truncate">
                    {[idea.source, formatIdeaDate(idea.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => onSendToNewChat(idea)} className={`${action} bg-[#FFE500] text-black`}>
                      <Send size={11} strokeWidth={3} /> {' '}{t("Chat nuevo")}</button>
                    {onInsertInChat && (
                      <button type="button" onClick={() => onInsertInChat(idea)} className={`${action} bg-white dark:bg-zinc-700`} title={t("Añadir al mensaje del chat abierto")}>
                        <ClipboardPaste size={11} strokeWidth={3} /> {' '}{t("En este chat")}</button>
                    )}
                    <button type="button" onClick={() => copy(idea)} className={`${action} bg-white dark:bg-zinc-700`} aria-label={t("Copiar idea")}>
                      {copied === idea.id ? <Check size={11} strokeWidth={3} /> : <Copy size={11} strokeWidth={3} />}
                      {copied === idea.id ? t("Copiada") : t("Copiar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(idea.id)}
                      aria-label={t("Borrar idea")}
                      title={t("Borrar idea")}
                      className={`${action} ml-auto bg-white dark:bg-zinc-700 hover:bg-[#FF6B6B] hover:text-white`}
                    >
                      <Trash2 size={11} strokeWidth={3} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
};
