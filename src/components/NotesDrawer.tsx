import React, { useState } from 'react';
import { Plus, Trash2, Search, FileText, Calendar, HardDrive } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ConfirmModal } from './ui/ConfirmModal';
import type { NoteFile } from '../types/electron';

interface NotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notes: NoteFile[];
  onOpenNote: (note: NoteFile) => void;
  onNewNote: () => void;
  onDeleteNote: (filePath: string) => void;
}

export const NotesDrawer: React.FC<NotesDrawerProps> = ({
  isOpen,
  onClose,
  notes,
  onOpenNote,
  onNewNote,
  onDeleteNote,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<NoteFile | null>(null);

  const filteredNotes = notes.filter((n) =>
    n.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Explorador de Notas Markdown" badge={`${notes.length} notas`}>
        <div className="flex flex-col gap-3">
          {/* Search & New Note */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-neutral-400 dark:text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar nota por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-white dark:bg-zinc-800 dark:text-zinc-100 border-2 border-black dark:border-zinc-600 rounded shadow-[2px_2px_0px_#000] focus:outline-none focus:ring-1 focus:ring-[#FFE500]"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onNewNote();
                onClose();
              }}
            >
              <Plus size={14} strokeWidth={3} />
              Nueva
            </Button>
          </div>

          {/* Note list */}
          <div className="flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-1">
            {filteredNotes.length === 0 ? (
              <div className="p-6 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-700 rounded text-center text-xs font-medium text-neutral-500 dark:text-zinc-400">
                {notes.length === 0 ? 'No hay notas en el repositorio aún.' : 'No se encontraron notas que coincidan.'}
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div
                  key={note.path}
                  onClick={() => {
                    onOpenNote(note);
                    onClose();
                  }}
                  className="group flex items-center justify-between p-2.5 bg-white dark:bg-zinc-800 border-2 border-black dark:border-zinc-700 rounded shadow-[2px_2px_0px_#000] hover:bg-[#FFFDF0] dark:hover:bg-zinc-700 hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                    <div className="p-1.5 bg-[#FFE500] border border-black rounded shadow-[1px_1px_0px_#000] shrink-0 text-black">
                      <FileText size={14} strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs text-black dark:text-zinc-100 truncate">{note.name}</span>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-zinc-400 font-medium">
                        <span className="flex items-center gap-0.5">
                          <Calendar size={10} />
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <HardDrive size={10} />
                          {(note.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteToDelete(note);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#FF6B6B] hover:text-white rounded border border-transparent hover:border-black transition-all text-neutral-600 dark:text-zinc-300"
                    title="Eliminar archivo"
                  >
                    <Trash2 size={13} strokeWidth={2.5} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Neubrutalist Confirmation Modal for Delete */}
      <ConfirmModal
        isOpen={Boolean(noteToDelete)}
        title="Eliminar Nota"
        message={`¿Estás seguro de que deseas eliminar "${noteToDelete?.name}"?`}
        subMessage="El archivo se borrará permanentemente de tu repositorio local."
        confirmText="Eliminar Archivo"
        cancelText="Cancelar"
        onConfirm={() => {
          if (noteToDelete) {
            onDeleteNote(noteToDelete.path);
            setNoteToDelete(null);
          }
        }}
        onCancel={() => setNoteToDelete(null)}
      />
    </>
  );
};
