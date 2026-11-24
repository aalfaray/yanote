import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Bridge } from './bridge';
import type { MobileNoteFile } from '../src/types/electron';

/** The notes folder on the phone: list + search, read with formatting, edit and save. */

interface NoteDoc {
  path: string;
  name: string;
  content: string;
  mtime: number;
  dirty: boolean;
}

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const title = (name: string) => name.replace(/\.(md|markdown|txt)$/i, '');

export function NotesList({ bridge, onOpen }: { bridge: Bridge; onOpen: (note: MobileNoteFile) => void }) {
  const [notes, setNotes] = useState<MobileNoteFile[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    bridge
      .request<{ notes: MobileNoteFile[] }>('yanote.notes.list')
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.result) {
          setNotes(r.result.notes);
          setError(null);
        } else setError(r.error?.message || 'No se pudo leer la carpeta de notas');
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [bridge, reload]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes ?? []).filter((n) => !q || n.name.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q)).slice(0, 300);
  }, [notes, query]);

  return (
    <>
      <header className="bar">
        <div className="bar-text">
          <h1>Notas</h1>
        </div>
        <button className="stop plain" onClick={() => setReload((n) => n + 1)} aria-label="Actualizar">↻</button>
      </header>
      {error && <div className="banner">{error}</div>}
      <div className="search">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nota…" />
      </div>
      <main className="list">
        {notes === null && !error && <p className="empty">Cargando…</p>}
        {notes?.length === 0 && <p className="empty">Tu carpeta de notas está vacía.</p>}
        {shown.map((n) => (
          <button key={n.path} className="row note" onClick={() => onOpen(n)}>
            <span className="note-text">
              <span className="title">{title(n.name)}</span>
              <span className="sub">
                {n.folder ? `${n.folder} · ` : ''}
                {when(n.mtime)}
                {n.dirty ? ' · sin guardar en el PC' : n.open ? ' · abierta en el PC' : ''}
              </span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
      </main>
    </>
  );
}

export function NoteView({ bridge, note, onBack }: { bridge: Bridge; note: MobileNoteFile; onBack: () => void }) {
  const [doc, setDoc] = useState<NoteDoc | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Leaving with unsaved edits takes a second tap (WebViews may not show confirm())
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const r = await bridge.request<NoteDoc>('yanote.notes.read', { path: note.path });
      if (r.ok && r.result) setDoc(r.result);
      else setError(r.error?.message || 'No se pudo abrir la nota');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.path]);

  const startEditing = () => {
    if (!doc) return;
    setDraft(doc.content);
    setSaved(false);
    setEditing(true);
  };

  const save = async () => {
    if (!doc || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await bridge.request<{ success: boolean; mtime: number }>('yanote.notes.write', { path: doc.path, content: draft, mtime: doc.mtime });
      if (r.ok && r.result?.success) {
        setDoc({ ...doc, content: draft, mtime: r.result.mtime });
        setEditing(false);
        setSaved(true);
      } else setError(r.error?.message || 'No se pudo guardar');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const changed = editing && doc !== null && draft !== doc.content;
  const leave = () => {
    if (changed && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    setConfirmLeave(false);
    if (editing) setEditing(false);
    else onBack();
  };

  return (
    <div className="screen">
      <header className="bar">
        <button className="back" onClick={leave} aria-label="Volver">‹</button>
        <div className="bar-text">
          <h2>{title(note.name)}</h2>
          <p className="sub">{editing ? (changed ? 'Editando · sin guardar' : 'Editando') : saved ? 'Guardada ✓' : note.folder || 'Notas'}</p>
        </div>
        {doc && !editing && !doc.dirty && (
          <button className="action" onClick={startEditing}>Editar</button>
        )}
        {editing && (
          <button className="action primary" onClick={() => void save()} disabled={saving || !changed}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </header>
      {error && <div className="banner" onClick={() => setError(null)}>{error}</div>}
      {confirmLeave && <div className="banner warn">Tienes cambios sin guardar. Toca ‹ otra vez para descartarlos, o pulsa Guardar.</div>}
      {doc?.dirty && !editing && <div className="banner warn">Tiene cambios sin guardar en el ordenador: aquí ves la última versión guardada. Guárdala allí para poder editarla desde el teléfono.</div>}
      {!doc && !error && <p className="empty">Cargando…</p>}
      {doc && !editing && (
        <div className="transcript note-body md">
          {doc.content.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown> : <p className="empty">Nota vacía.</p>}
        </div>
      )}
      {doc && editing && (
        <textarea className="note-editor" value={draft} onChange={(e) => { setDraft(e.target.value); setConfirmLeave(false); }} autoFocus spellCheck />
      )}
    </div>
  );
}
