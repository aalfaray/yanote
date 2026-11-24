import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { connectBridge, type Bridge, type BridgeInit } from './bridge';
import type { MobileChatItem, MobileChatSnapshot, MobileChatTab, MobileNoteFile } from '../src/types/electron';
import { NotesList, NoteView } from './notes';
import './styles.css';

/**
 * yanote's chats on the phone, shown by Orca Mobile. Lists the chat tabs open in yanote
 * and mirrors one of them live (long polls), with the same send / approve / stop actions.
 */

const WAIT_MS = 20000;
const PROVIDER_LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' };

type ChatState = { version: number; items: MobileChatItem[]; meta: MobileChatSnapshot['meta'] | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repeats `step` until unmounted; waits a moment after a failure (phone offline, yanote closed). */
function usePoll(step: (alive: () => boolean) => Promise<void>, deps: unknown[], onError: (msg: string | null) => void) {
  useEffect(() => {
    let alive = true;
    void (async () => {
      while (alive) {
        try {
          await step(() => alive);
          onError(null);
        } catch (err) {
          if (!alive) return;
          onError(err instanceof Error ? err.message : String(err));
          await sleep(2000);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function ChatList({ bridge, onOpen, machine }: { bridge: Bridge; onOpen: (tab: MobileChatTab) => void; machine: string }) {
  const [tabs, setTabs] = useState<MobileChatTab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(-1);

  usePoll(
    async (alive) => {
      const r = await bridge.request<{ version: number; tabs: MobileChatTab[] }>('yanote.chats.list', { version: version.current, waitMs: WAIT_MS }, WAIT_MS + 8000);
      if (!alive()) return;
      if (!r.ok || !r.result) throw new Error(r.error?.message || 'No se pudo leer la lista');
      version.current = r.result.version;
      setTabs(r.result.tabs);
    },
    [bridge],
    setError
  );

  return (
    <>
      <header className="bar">
        <div>
          <h1>Chats</h1>
          <p className="sub">yanote · {machine}</p>
        </div>
      </header>
      {error && <div className="banner">{error}</div>}
      <main className="list">
        {tabs === null && <p className="empty">Cargando…</p>}
        {tabs?.length === 0 && <p className="empty">No hay chats abiertos en yanote. Abre uno en el ordenador (Claude, Codex o Antigravity) y aparecerá aquí.</p>}
        {tabs?.map((tab) => (
          <button key={tab.tabId} className="row" onClick={() => onOpen(tab)}>
            <span className={`badge ${tab.provider}`}>{PROVIDER_LABELS[tab.provider] || tab.provider}</span>
            <span className="title">{tab.title}</span>
            {tab.active && <span className="dot" title="Pestaña activa en el ordenador" />}
            <span className="chev">›</span>
          </button>
        ))}
      </main>
    </>
  );
}

type Section = 'chats' | 'notes';

/** Chats and Notes, switched with the bar at the bottom. */
function Home({ bridge, machine, section, onSection, onOpenChat, onOpenNote }: {
  bridge: Bridge;
  machine: string;
  section: Section;
  onSection: (s: Section) => void;
  onOpenChat: (tab: MobileChatTab) => void;
  onOpenNote: (note: MobileNoteFile) => void;
}) {
  return (
    <div className="screen">
      {section === 'chats' ? <ChatList bridge={bridge} onOpen={onOpenChat} machine={machine} /> : <NotesList bridge={bridge} onOpen={onOpenNote} />}
      <nav className="tabbar">
        <button className={section === 'chats' ? 'on' : ''} onClick={() => onSection('chats')}>
          <span className="icon">💬</span>Chats
        </button>
        <button className={section === 'notes' ? 'on' : ''} onClick={() => onSection('notes')}>
          <span className="icon">📝</span>Notas
        </button>
      </nav>
    </div>
  );
}

function Item({ item, onDecide }: { item: MobileChatItem; onDecide: (requestId: string, behavior: 'allow' | 'deny') => void }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="msg user">
          {item.text}
          {item.imageCount > 0 && <div className="meta">🖼 {item.imageCount}</div>}
        </div>
      );
    case 'text':
      return (
        <div className="msg assistant md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
          {item.streaming && <span className="cursor" />}
        </div>
      );
    case 'thinking':
      return (
        <details className="thinking">
          <summary>Pensando…</summary>
          <div className="md">{item.text}</div>
        </details>
      );
    case 'tool':
      return (
        <details className={`tool ${item.isError ? 'err' : ''}`}>
          <summary>
            <span className={item.done ? 'tick' : 'spin'}>{item.done ? (item.isError ? '✕' : '✓') : '◌'}</span>
            <b>{item.name}</b> <span className="summary">{item.summary}</span>
          </summary>
          {item.result && <pre>{item.result}</pre>}
        </details>
      );
    case 'permission':
      return (
        <div className={`perm ${item.status}`}>
          <div className="perm-title">{item.title || `¿Permitir ${item.toolName}?`}</div>
          {item.summary && <code>{item.summary}</code>}
          {item.status === 'pending' ? (
            <div className="perm-actions">
              <button className="deny" onClick={() => onDecide(item.id, 'deny')}>Rechazar</button>
              <button className="allow" onClick={() => onDecide(item.id, 'allow')}>Permitir</button>
            </div>
          ) : (
            <div className="meta">{item.status === 'allowed' ? 'Permitido' : item.status === 'denied' ? 'Rechazado' : 'Cancelado'}</div>
          )}
        </div>
      );
    case 'result':
      return <div className={`result ${item.isError ? 'err' : ''}`}>{item.isError ? 'Terminó con error' : `Listo · ${Math.round(item.durationMs / 1000)} s`}</div>;
    case 'notice':
      return <div className={`notice ${item.tone}`}>{item.text}</div>;
  }
}

function ChatView({ bridge, tab, onBack }: { bridge: Bridge; tab: MobileChatTab; onBack: () => void }) {
  const [chat, setChat] = useState<ChatState>({ version: 0, items: [], meta: null });
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const versionRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  usePoll(
    async (alive) => {
      if (closed) {
        await sleep(60000);
        return;
      }
      const r = await bridge.request<{ version: number; from: number; total: number; items: MobileChatItem[]; meta: ChatState['meta'] }>(
        'yanote.chat.get',
        { tabId: tab.tabId, version: versionRef.current, waitMs: WAIT_MS },
        WAIT_MS + 8000
      );
      if (!alive()) return;
      if (!r.ok || !r.result) {
        if (r.error?.code === 'chat_closed') {
          setClosed(true);
          return;
        }
        throw new Error(r.error?.message || 'No se pudo leer el chat');
      }
      const res = r.result;
      // yanote restarted (versions start over): read the whole chat again
      if (res.version < versionRef.current) {
        versionRef.current = 0;
        return;
      }
      versionRef.current = res.version;
      setChat((prev) => ({ version: res.version, items: [...prev.items.slice(0, res.from), ...res.items].slice(0, res.total), meta: res.meta }));
    },
    [bridge, tab.tabId, closed],
    setError
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const act = useCallback(
    async (method: string, params: object) => {
      const r = await bridge.request<{ success: boolean; error?: string }>(method, { tabId: tab.tabId, ...params });
      const res = r.ok ? r.result : { success: false, error: r.error?.message };
      if (!res?.success) setError(res?.error || 'No se pudo completar la acción');
      return Boolean(res?.success);
    },
    [bridge, tab.tabId]
  );

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    stick.current = true;
    try {
      if (await act('yanote.chat.send', { text })) setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const meta = chat.meta;
  const canSend = !closed && meta !== null && !meta.starting && !meta.ended;
  const status = closed ? 'Chat cerrado en el ordenador' : !meta ? 'Cargando…' : meta.starting ? 'Iniciando…' : meta.ended ? 'Sesión terminada' : meta.running ? 'Trabajando…' : meta.model || 'Listo';

  return (
    <div className="screen">
      <header className="bar">
        <button className="back" onClick={onBack} aria-label="Volver">‹</button>
        <div className="bar-text">
          <h2>{tab.title}</h2>
          <p className="sub">
            <span className={`badge ${tab.provider}`}>{PROVIDER_LABELS[tab.provider] || tab.provider}</span> {status}
          </p>
        </div>
        {meta?.running && !closed && (
          <button className="stop" onClick={() => void act('yanote.chat.interrupt', {})}>Detener</button>
        )}
      </header>
      {error && (
        <div className="banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div className="transcript" ref={scrollRef} onScroll={onScroll}>
        {chat.items.length === 0 && meta && <p className="empty">Todavía no hay mensajes en este chat.</p>}
        {chat.items.map((item) => (
          <Item key={item.id} item={item} onDecide={(requestId, behavior) => void act('yanote.chat.decide', { requestId, behavior })} />
        ))}
        {meta?.running && <div className="working">●●●</div>}
      </div>
      <footer className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={canSend ? 'Escribe un mensaje…' : 'No se puede escribir ahora'}
          disabled={!canSend}
          rows={1}
        />
        <button className="send" onClick={() => void send()} disabled={!canSend || !draft.trim() || sending} aria-label="Enviar">
          ↑
        </button>
      </footer>
    </div>
  );
}

function App() {
  const [bridge] = useState(connectBridge);
  const [init, setInit] = useState<BridgeInit | null>(null);
  const [open, setOpen] = useState<MobileChatTab | null>(null);
  const [note, setNote] = useState<MobileNoteFile | null>(null);
  const [section, setSection] = useState<Section>('chats');

  useEffect(() => bridge?.onInit(setInit), [bridge]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = init?.colorScheme === 'light' ? 'light' : 'dark';
    const insets = init?.safeAreaInsets;
    root.style.setProperty('--safe-top', `${insets?.top ?? 0}px`);
    root.style.setProperty('--safe-bottom', `${Math.max(insets?.bottom ?? 0, init?.keyboardInset ?? 0)}px`);
    root.style.setProperty('--safe-left', `${insets?.left ?? 0}px`);
    root.style.setProperty('--safe-right', `${insets?.right ?? 0}px`);
  }, [init]);

  if (!bridge) return <div className="screen"><p className="empty">Abre esta página desde la app Orca Mobile.</p></div>;
  if (!init) return <div className="screen"><p className="empty">Conectando con yanote…</p></div>;
  const machine = init.hostStatus?.machineName || init.host?.name || 'ordenador';
  if (open) return <ChatView bridge={bridge} tab={open} onBack={() => setOpen(null)} />;
  if (note) return <NoteView bridge={bridge} note={note} onBack={() => setNote(null)} />;
  return <Home bridge={bridge} machine={machine} section={section} onSection={setSection} onOpenChat={setOpen} onOpenNote={setNote} />;
}

createRoot(document.getElementById('root')!).render(<App />);
