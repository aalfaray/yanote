import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  Square,
  ChevronRight,
  Check,
  X,
  ShieldCheck,
  Brain,
  Loader2,
  ImagePlus,
  RotateCcw,
  Volume2,
  Copy,
  CircleAlert,
  ListTodo,
  Sparkles,
  UserRound,
  ChevronDown,
} from 'lucide-react';
import type { ClaudeEffortLevel, ClaudeImageInput, ClaudePermissionMode, ClaudePermissionRequest } from '../types/electron';
import {
  chatReducer,
  initialChatState,
  topLevelItems,
  childItems,
  pendingPermissions,
  toolSummary,
  matchCommands,
  formatTokens,
  activeModelInfo,
  effortLevelsFor,
  EFFORT_LABELS,
  type ChatItem,
} from '../lib/claudeChat';
import { markdownToSegments } from '../lib/speechText';
import { useSpeech } from '../hooks/useSpeech';
import { SpeechPlayerBar } from './SpeechControls';
import { DismissButton } from './ui/DismissButton';
import { ClaudeAccountMenu } from './ClaudeAccountMenu';

interface ClaudeChatViewProps {
  tabId: string;
  cwd?: string;
  isActive: boolean;
  /** Called once Claude reports its session id (used to resume after a restart) */
  onSessionId?: (sessionId: string) => void;
  resumeSessionId?: string;
  /** Opens Claude Code's own sign-in (`claude auth login`) for that account */
  onLogin?: (account: { id: string; name: string }) => void;
  /** Claude account this chat uses (see ClaudeAccountMenu); the main one when missing */
  accountId?: string;
  /** The user moved this chat to another account */
  onAccountChange?: (accountId: string) => void;
}

const MODES: { value: ClaudePermissionMode; label: string; hint: string }[] = [
  { value: 'default', label: 'Preguntar', hint: 'Pide permiso antes de editar o ejecutar' },
  { value: 'acceptEdits', label: 'Aceptar ediciones', hint: 'Edita archivos sin preguntar; pide permiso para comandos' },
  { value: 'plan', label: 'Planificar', hint: 'Solo lee y propone un plan, sin cambiar nada' },
  { value: 'auto', label: 'Auto', hint: 'Un clasificador aprueba o rechaza cada acción' },
  { value: 'bypassPermissions', label: 'Acceso total', hint: 'Sin ninguna confirmación (peligroso)' },
];

const btn =
  'inline-flex items-center justify-center gap-1 border-2 border-black dark:border-zinc-600 rounded font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition';
const card = 'border-2 border-black dark:border-zinc-600 rounded bg-white dark:bg-[#1C1C20] shadow-[2px_2px_0px_#000]';

/* ---------------------------------- Markdown --------------------------------- */

const Markdown: React.FC<{ text: string }> = React.memo(({ text }) => (
  <div className="claude-md text-[13px] leading-relaxed break-words">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-2 decoration-[#FFB800] font-bold">
            {children}
          </a>
        ),
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
));

const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group my-2">
      <pre ref={ref} className="overflow-x-auto text-[12px] p-2.5 rounded border-2 border-black dark:border-zinc-600 bg-[#F4F1EA] dark:bg-[#0D0D0F]">
        {children}
      </pre>
      <button
        type="button"
        title="Copiar código"
        onClick={() => {
          navigator.clipboard?.writeText(ref.current?.innerText ?? '').catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className={`${btn} absolute top-1.5 right-1.5 h-6 w-6 bg-white dark:bg-[#27272A] opacity-0 group-hover:opacity-100 focus:opacity-100`}
      >
        {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} strokeWidth={2.5} />}
      </button>
    </div>
  );
};

/* ---------------------------------- Tools ----------------------------------- */

const Pre: React.FC<{ text: string; tone?: 'plain' | 'error'; max?: number }> = ({ text, tone = 'plain', max = 4000 }) => (
  <pre
    className={`overflow-auto max-h-72 whitespace-pre-wrap break-words text-[11.5px] p-2 rounded border border-black/30 dark:border-zinc-700 ${
      tone === 'error' ? 'bg-[#FFE4E4] text-[#9B1C1C] dark:bg-[#3A1515] dark:text-[#FCA5A5]' : 'bg-[#F4F1EA] dark:bg-[#0D0D0F]'
    }`}
  >
    {text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} caracteres más)` : text}
  </pre>
);

const Diff: React.FC<{ oldText: string; newText: string }> = ({ oldText, newText }) => (
  <pre className="overflow-auto max-h-72 text-[11.5px] rounded border border-black/30 dark:border-zinc-700 bg-[#F4F1EA] dark:bg-[#0D0D0F]">
    {oldText.split('\n').map((l, i) => (
      <div key={`o${i}`} className="px-2 bg-[#FFE4E4] text-[#9B1C1C] dark:bg-[#3A1515] dark:text-[#FCA5A5] whitespace-pre-wrap break-words">
        - {l}
      </div>
    ))}
    {newText.split('\n').map((l, i) => (
      <div key={`n${i}`} className="px-2 bg-[#DCFCE7] text-[#14532D] dark:bg-[#11301C] dark:text-[#86EFAC] whitespace-pre-wrap break-words">
        + {l}
      </div>
    ))}
  </pre>
);

type Todo = { content?: string; activeForm?: string; status?: string };

const TodoList: React.FC<{ todos: Todo[] }> = ({ todos }) => (
  <ul className="space-y-1 text-[12px]">
    {todos.map((t, i) => (
      <li key={i} className="flex items-start gap-1.5">
        <span
          className={`mt-[2px] h-3.5 w-3.5 shrink-0 border-2 border-black dark:border-zinc-500 rounded-sm flex items-center justify-center ${
            t.status === 'completed' ? 'bg-[#78E08F]' : t.status === 'in_progress' ? 'bg-[#FFE500]' : 'bg-white dark:bg-[#27272A]'
          }`}
        >
          {t.status === 'completed' && <Check size={9} strokeWidth={4} className="text-black" />}
        </span>
        <span className={t.status === 'completed' ? 'line-through opacity-60' : t.status === 'in_progress' ? 'font-black' : ''}>
          {t.status === 'in_progress' ? t.activeForm || t.content : t.content}
        </span>
      </li>
    ))}
  </ul>
);

/** Body of a tool call, shaped per tool like Claude Code's own renderers. */
const ToolDetails: React.FC<{ name: string; input: Record<string, unknown>; result?: { text: string; isError: boolean } }> = ({ name, input, result }) => {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  let body: React.ReactNode;
  if (name === 'Bash' || name === 'PowerShell') {
    body = <Pre text={`$ ${s('command')}`} />;
  } else if (name === 'Edit') {
    body = <Diff oldText={s('old_string')} newText={s('new_string')} />;
  } else if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    body = (input.edits as { old_string?: string; new_string?: string }[]).map((e, i) => (
      <Diff key={i} oldText={e.old_string || ''} newText={e.new_string || ''} />
    ));
  } else if (name === 'Write') {
    body = <Pre text={s('content')} />;
  } else if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch' || name === 'WebSearch') {
    body = null;
  } else {
    body = Object.keys(input).length ? <Pre text={JSON.stringify(input, null, 2)} /> : null;
  }
  const path = s('file_path') || s('notebook_path') || s('path');
  return (
    <div className="space-y-1.5">
      {path && <div className="text-[11px] font-mono opacity-70 break-all">{path}</div>}
      {body}
      {result && result.text && name !== 'Edit' && name !== 'Write' && <Pre text={result.text} tone={result.isError ? 'error' : 'plain'} />}
      {result && result.isError && (name === 'Edit' || name === 'Write') && <Pre text={result.text} tone="error" />}
    </div>
  );
};

const ToolCard: React.FC<{ item: Extract<ChatItem, { kind: 'tool' }>; all: ChatItem[]; running: boolean }> = ({ item, all, running }) => {
  const [open, setOpen] = useState(false);
  const summary = toolSummary(item.name, item.input);
  const done = Boolean(item.result);
  const failed = item.result?.isError;
  const children = item.name === 'Task' || item.name === 'Agent' ? childItems(all, item.id) : [];

  if (item.name === 'TodoWrite' && Array.isArray(item.input.todos)) {
    return (
      <div className={`${card} p-2`}>
        <div className="flex items-center gap-1.5 text-[11px] font-black mb-1.5">
          <ListTodo size={13} strokeWidth={2.5} /> Tareas
        </div>
        <TodoList todos={item.input.todos as Todo[]} />
      </div>
    );
  }

  return (
    <div className={`${card} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[#FFF8C4] dark:hover:bg-[#27272A] cursor-pointer"
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-black ${
            failed ? 'bg-[#FF6B6B]' : done ? 'bg-[#78E08F]' : running ? 'bg-[#FFE500] animate-pulse' : 'bg-zinc-300'
          }`}
        />
        <span className="text-[11px] font-black shrink-0">{item.name.replace(/^mcp__/, '')}</span>
        <span className="text-[11px] font-mono opacity-70 truncate min-w-0 flex-1">{summary}</span>
        {children.length > 0 && <span className="text-[10px] font-black opacity-60 shrink-0">{children.filter((c) => c.kind === 'tool').length} pasos</span>}
        <ChevronRight size={13} strokeWidth={3} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-2 pb-2 pt-0.5 border-t-2 border-black/10 dark:border-zinc-700 space-y-1.5">
          {children.length > 0 && (
            <ul className="text-[11px] font-mono space-y-0.5 opacity-80">
              {children
                .filter((c): c is Extract<ChatItem, { kind: 'tool' }> => c.kind === 'tool')
                .map((c) => (
                  <li key={c.id} className="truncate">
                    {c.result ? (c.result.isError ? '✗' : '✓') : '…'} {c.name} {toolSummary(c.name, c.input)}
                  </li>
                ))}
            </ul>
          )}
          <ToolDetails name={item.name} input={item.input} result={item.result} />
        </div>
      )}
    </div>
  );
};

/* ------------------------------ Permission prompts ------------------------------ */

type Question = { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] };

const QuestionPrompt: React.FC<{ request: ClaudePermissionRequest; onAnswer: (answers: Record<string, string>) => void; onDeny: () => void }> = ({
  request,
  onAnswer,
  onDeny,
}) => {
  const questions = (Array.isArray(request.input.questions) ? request.input.questions : []) as Question[];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const complete = questions.every((q) => (picked[q.question]?.length ?? 0) > 0 || other[q.question]?.trim());
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <div key={q.question}>
          {q.header && <div className="text-[10px] font-black uppercase opacity-60">{q.header}</div>}
          <div className="text-[12.5px] font-black mb-1.5">{q.question}</div>
          <div className="space-y-1">
            {q.options.map((o) => {
              const on = picked[q.question]?.includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() =>
                    setPicked((p) => {
                      const cur = p[q.question] || [];
                      const next = q.multiSelect ? (on ? cur.filter((l) => l !== o.label) : [...cur, o.label]) : [o.label];
                      return { ...p, [q.question]: next };
                    })
                  }
                  className={`w-full text-left px-2 py-1.5 border-2 border-black dark:border-zinc-600 rounded cursor-pointer ${
                    on ? 'bg-[#FFE500] text-black' : 'bg-white dark:bg-[#27272A] hover:bg-[#FFF8C4] dark:hover:bg-[#33333A]'
                  }`}
                >
                  <div className="text-[12px] font-black">{o.label}</div>
                  {o.description && <div className="text-[11px] opacity-70">{o.description}</div>}
                </button>
              );
            })}
            <input
              value={other[q.question] || ''}
              onChange={(e) => setOther((p) => ({ ...p, [q.question]: e.target.value }))}
              placeholder="Otra respuesta…"
              className="w-full px-2 py-1.5 text-[12px] border-2 border-black dark:border-zinc-600 rounded bg-white dark:bg-[#121212] outline-none focus:bg-[#FFFDE8] dark:focus:bg-[#1A1A1D]"
            />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!complete}
          onClick={() =>
            onAnswer(
              Object.fromEntries(
                questions.map((q) => [q.question, other[q.question]?.trim() || (picked[q.question] || []).join(', ')])
              )
            )
          }
          className={`${btn} h-7 px-2.5 bg-[#78E08F] text-black`}
        >
          <Check size={12} strokeWidth={3} /> Responder
        </button>
        <button type="button" onClick={onDeny} className={`${btn} h-7 px-2.5 bg-white dark:bg-[#27272A]`}>
          Omitir
        </button>
      </div>
    </div>
  );
};

const PermissionCard: React.FC<{
  item: Extract<ChatItem, { kind: 'permission' }>;
  onDecide: (requestId: string, decision: { behavior: 'allow' | 'deny'; always?: boolean; updatedInput?: Record<string, unknown>; message?: string }) => void;
}> = ({ item, onDecide }) => {
  const { request, status } = item;
  const isQuestion = request.toolName === 'AskUserQuestion';
  const isPlan = request.toolName === 'ExitPlanMode';
  const [reason, setReason] = useState('');

  if (status !== 'pending') {
    const label = isQuestion
      ? status === 'allowed' ? 'Respondido' : 'Pregunta omitida'
      : isPlan
      ? status === 'allowed' ? 'Plan aprobado' : 'Plan rechazado'
      : status === 'allowed' ? 'Permitido' : status === 'denied' ? 'Rechazado' : 'Cancelado';
    return (
      <div className="text-[10.5px] font-black opacity-60 flex items-center gap-1 pl-1">
        {status === 'allowed' ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
        {label}: {request.toolName} {toolSummary(request.toolName, request.input)}
      </div>
    );
  }

  return (
    <div className={`${card} p-2.5 bg-[#FFFBDA] dark:bg-[#26240F] border-[#000] space-y-2`} role="alertdialog" aria-label="Permiso solicitado">
      <div className="flex items-center gap-1.5 text-[12px] font-black">
        <ShieldCheck size={14} strokeWidth={2.5} />
        {isQuestion ? 'Claude te pregunta' : isPlan ? 'Claude propone este plan' : request.title || `Claude quiere usar ${request.toolName}`}
      </div>
      {request.decisionReason && !isQuestion && <div className="text-[11px] opacity-70">{request.decisionReason}</div>}

      {isQuestion ? (
        <QuestionPrompt
          request={request}
          onAnswer={(answers) => onDecide(request.requestId, { behavior: 'allow', updatedInput: { ...request.input, answers } })}
          onDeny={() => onDecide(request.requestId, { behavior: 'deny', message: 'El usuario no quiso responder' })}
        />
      ) : (
        <>
          {isPlan ? (
            <div className="max-h-80 overflow-auto px-2 py-1 rounded border border-black/30 bg-white dark:bg-[#1C1C20]">
              <Markdown text={typeof request.input.plan === 'string' ? request.input.plan : ''} />
            </div>
          ) : (
            <ToolDetails name={request.toolName} input={request.input} />
          )}
          {request.blockedPath && <div className="text-[11px] font-mono break-all opacity-70">Ruta: {request.blockedPath}</div>}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isPlan ? 'Qué cambiar del plan (opcional)…' : 'Motivo para rechazar / qué hacer en su lugar (opcional)…'}
            className="w-full px-2 py-1 text-[11.5px] border-2 border-black dark:border-zinc-600 rounded bg-white dark:bg-[#121212] outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              autoFocus
              onClick={() => onDecide(request.requestId, { behavior: 'allow' })}
              className={`${btn} h-7 px-2.5 bg-[#78E08F] text-black`}
            >
              <Check size={12} strokeWidth={3} /> {isPlan ? 'Aprobar plan' : 'Permitir'}
            </button>
            {request.canAlwaysAllow && !isPlan && (
              <button
                type="button"
                onClick={() => onDecide(request.requestId, { behavior: 'allow', always: true })}
                className={`${btn} h-7 px-2.5 bg-[#FFE500] text-black`}
                title="No volver a preguntar por esto en esta sesión"
              >
                Permitir siempre
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onDecide(request.requestId, {
                  behavior: 'deny',
                  message: reason.trim() || (isPlan ? 'El usuario quiere seguir planificando' : 'El usuario rechazó esta acción'),
                })
              }
              className={`${btn} h-7 px-2.5 bg-[#FF6B6B] text-white`}
            >
              <X size={12} strokeWidth={3} /> {isPlan ? 'Seguir planificando' : 'Rechazar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/* ---------------------------------- Main view ---------------------------------- */

/** Effort chosen per model, remembered across chats ('' = the model's default). */
const EFFORT_STORAGE_KEY = 'yanote.claude.effortByModel';

function loadEffortByModel(): Record<string, ClaudeEffortLevel> {
  try {
    const raw = localStorage.getItem(EFFORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveEffortByModel(map: Record<string, ClaudeEffortLevel>) {
  try {
    localStorage.setItem(EFFORT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable: the choice just won't be remembered
  }
}

function readImage(file: File): Promise<ClaudeImageInput & { url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const [, mediaType = 'image/png', data = ''] = /^data:([^;]+);base64,(.*)$/.exec(url) || [];
      resolve({ data, mediaType, url });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const ClaudeChatView: React.FC<ClaudeChatViewProps> = ({
  tabId,
  cwd,
  isActive,
  onSessionId,
  resumeSessionId,
  onLogin,
  accountId: initialAccountId,
  onAccountChange,
}) => {
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<(ClaudeImageInput & { url: string })[]>([]);
  const [mode, setMode] = useState<ClaudePermissionMode>('default');
  const [cmdIndex, setCmdIndex] = useState(0);
  const [starting, setStarting] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const [selectedModel, setSelectedModel] = useState('');
  const [effortByModel, setEffortByModel] = useState<Record<string, ClaudeEffortLevel>>(loadEffortByModel);
  const appliedEffortRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const sessionIdRef = useRef<string | undefined>(resumeSessionId);
  const executableRef = useRef<string | undefined>(undefined);
  const [accountId, setAccountId] = useState(initialAccountId || 'default');
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const [accountName, setAccountName] = useState('Principal');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const speech = useSpeech();
  const api = window.electronAPI;

  // Start (or resume) the Claude Code process for this tab
  useEffect(() => {
    if (!api?.claudeStart) {
      dispatch({ type: 'notice', text: 'El chat con Claude solo está disponible en la app de escritorio (Electron).', tone: 'error' });
      setStarting(false);
      return;
    }
    const off = api.onClaudeEvent?.((evt) => {
      if (evt.id === tabId) dispatch({ type: 'event', event: evt });
    });
    let cancelled = false;
    setStarting(true);
    api
      .claudeStart({ id: tabId, cwd, permissionMode: mode, resume: sessionIdRef.current, accountId: accountRef.current })
      .then((res) => {
        if (cancelled) return;
        setStarting(false);
        executableRef.current = res.executable;
        if (!res.success) {
          dispatch({ type: 'notice', text: `No se pudo iniciar Claude: ${res.error}`, tone: 'error' });
        }
      });
    return () => {
      cancelled = true;
      off?.();
      api.claudeStop?.(tabId);
    };
    // One process per tab (and per manual restart); mode changes go through setPermissionMode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, restartKey]);

  useEffect(() => {
    if (state.sessionId && state.sessionId !== sessionIdRef.current) {
      sessionIdRef.current = state.sessionId;
      onSessionId?.(state.sessionId);
    }
  }, [state.sessionId, onSessionId]);

  // Mirror the mode the CLI reports (e.g. after a plan is approved it leaves "plan")
  useEffect(() => {
    if (state.permissionMode && MODES.some((m) => m.value === state.permissionMode)) setMode(state.permissionMode as ClaudePermissionMode);
  }, [state.permissionMode]);

  // Keep following the conversation unless the user scrolled up
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [state.items]);

  useEffect(() => {
    if (!isActive) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isActive]);

  // Grow the composer with its content (up to ~8 lines)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  const suggestions = useMemo(() => matchCommands(state.commands, draft), [state.commands, draft]);
  useEffect(() => setCmdIndex(0), [suggestions.length]);

  // Name of the account in use, for the header chip
  useEffect(() => {
    let cancelled = false;
    void api?.claudeAccounts?.list().then(({ accounts }) => {
      if (!cancelled) setAccountName(accounts.find((a) => a.id === accountId)?.name || 'Principal');
    });
    return () => {
      cancelled = true;
    };
  }, [api, accountId, accountMenuOpen]);

  /** Continue this conversation with another account: copy it there, then resume it with that sign-in. */
  const switchAccount = async (account: { id: string; name: string }) => {
    setAccountMenuOpen(false);
    if (account.id === accountRef.current) return;
    if (state.running) await api?.claudeInterrupt?.(tabId);
    const sid = sessionIdRef.current;
    if (sid) {
      const res = await api?.claudeAccounts?.copySession(sid, accountRef.current, account.id);
      if (res && !res.success) {
        // Nothing to carry over: the other account starts a fresh conversation
        sessionIdRef.current = undefined;
        dispatch({ type: 'notice', text: `No se pudo pasar la conversación a ${account.name}: empieza una nueva.`, tone: 'error' });
      }
    }
    accountRef.current = account.id;
    setAccountId(account.id);
    setAccountName(account.name);
    void api?.claudeAccounts?.setActive(account.id);
    onAccountChange?.(account.id);
    dispatch({ type: 'auth_retry' });
    dispatch({ type: 'notice', text: `Ahora usas la cuenta ${account.name}`, tone: 'info' });
    setRestartKey((k) => k + 1);
  };

  const send = useCallback(async () => {
    const text = draft.trim();
    // The CLI's /login and /logout don't work inside an app: open the account switcher instead
    if (/^\/(login|logout|cuenta|account)\s*$/i.test(text)) {
      setDraft('');
      setAccountMenuOpen(true);
      return;
    }
    if ((!text && images.length === 0) || !api?.claudeSend || state.ended) return;
    const payload = { text, images: images.map(({ data, mediaType }) => ({ data, mediaType })) };
    dispatch({ type: 'send', text, imageCount: images.length });
    setDraft('');
    setImages([]);
    stickRef.current = true;
    const res = await api.claudeSend(tabId, payload);
    if (!res.success) dispatch({ type: 'notice', text: res.error || 'No se pudo enviar el mensaje', tone: 'error' });
  }, [draft, images, api, tabId, state.ended]);

  const interrupt = useCallback(() => {
    api?.claudeInterrupt?.(tabId);
  }, [api, tabId]);

  const decide = useCallback(
    (requestId: string, decision: { behavior: 'allow' | 'deny'; always?: boolean; updatedInput?: Record<string, unknown>; message?: string }) => {
      dispatch({ type: 'permission_resolved', requestId, allowed: decision.behavior === 'allow' });
      api?.claudeRespondPermission?.(tabId, requestId, decision);
    },
    [api, tabId]
  );

  const changeMode = async (next: ClaudePermissionMode) => {
    setMode(next);
    dispatch({ type: 'local_permission_mode', mode: next });
    const res = await api?.claudeSetPermissionMode?.(tabId, next);
    if (res && !res.success) dispatch({ type: 'notice', text: `No se pudo cambiar el modo: ${res.error}`, tone: 'error' });
  };

  const modelInfo = activeModelInfo(state.models, selectedModel, state.model);
  // Keyed by the real model so aliases (default / opus → same id) share one choice
  const modelKey = modelInfo?.resolvedModel ?? modelInfo?.value ?? 'default';
  const effortLevels = effortLevelsFor(modelInfo);
  const effort: ClaudeEffortLevel | '' = effortLevels.includes(effortByModel[modelKey]) ? effortByModel[modelKey] : '';

  /** Sends the effort remembered for `key` (or the default) to the running session. */
  const applyEffort = useCallback(
    async (key: string, level: ClaudeEffortLevel | '') => {
      appliedEffortRef.current = `${key}:${level}`;
      const res = await api?.claudeSetEffort?.(tabId, level || null);
      if (res && !res.success) dispatch({ type: 'notice', text: `No se pudo cambiar el esfuerzo: ${res.error}`, tone: 'error' });
    },
    [api, tabId]
  );

  // Once Claude reports its model, apply the effort the user picked for it in earlier chats
  useEffect(() => {
    if (!modelInfo || state.ended || appliedEffortRef.current !== null) return;
    if (effort) void applyEffort(modelKey, effort);
    else appliedEffortRef.current = `${modelKey}:`;
  }, [modelInfo, modelKey, effort, state.ended, applyEffort]);

  // A restarted process starts from scratch: re-apply on the next model report
  useEffect(() => {
    appliedEffortRef.current = null;
  }, [restartKey]);

  const changeModel = async (model: string) => {
    setSelectedModel(model);
    const res = await api?.claudeSetModel?.(tabId, model || null);
    if (res && !res.success) {
      dispatch({ type: 'notice', text: `No se pudo cambiar el modelo: ${res.error}`, tone: 'error' });
      return;
    }
    const next = activeModelInfo(state.models, model, undefined);
    const key = next?.resolvedModel ?? next?.value ?? 'default';
    const remembered = effortByModel[key];
    const level = remembered && effortLevelsFor(next).includes(remembered) ? remembered : '';
    // Each model keeps its own effort; models without effort control drop back to the default
    if (effortLevelsFor(next).length > 0 || effort) await applyEffort(key, level);
    dispatch({
      type: 'notice',
      text: `Modelo: ${next?.displayName || model || 'predeterminado'}${level ? ` · esfuerzo ${EFFORT_LABELS[level].toLowerCase()}` : ''}`,
      tone: 'info',
    });
  };

  const changeEffort = async (level: ClaudeEffortLevel | '') => {
    setEffortByModel((prev) => {
      const next = { ...prev };
      if (level) next[modelKey] = level;
      else delete next[modelKey];
      saveEffortByModel(next);
      return next;
    });
    await applyEffort(modelKey, level);
  };

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return false;
    const read = await Promise.all(imgs.map(readImage));
    setImages((prev) => [...prev, ...read]);
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && draft !== `/${suggestions[cmdIndex].name.replace(/^\//, '')}`)) {
        e.preventDefault();
        setDraft(`/${suggestions[cmdIndex].name.replace(/^\//, '')} `);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape' && state.running) {
      e.preventDefault();
      interrupt();
    }
  };

  const visible = topLevelItems(state.items);
  const lastTextId = [...visible].reverse().find((i) => i.kind === 'text')?.id;
  const streamingSomething = state.items.some((i) => (i.kind === 'text' || i.kind === 'thinking') && i.streaming);
  const cwdName = (state.cwd || cwd || '').split(/[\\/]/).filter(Boolean).pop();

  return (
    <div
      className={`absolute inset-0 flex flex-col bg-[#FAF8F5] dark:bg-[#121212] text-black dark:text-zinc-100 ${isActive ? '' : 'invisible pointer-events-none'}`}
      aria-hidden={!isActive}
      data-testid={`claude-chat-${tabId}`}
    >
      {/* Session strip */}
      <div className="h-8 shrink-0 flex items-center gap-1.5 px-2 border-b-2 border-black dark:border-zinc-700 text-[10.5px] font-black overflow-hidden whitespace-nowrap">
        <Sparkles size={13} strokeWidth={2.5} className="shrink-0 text-[#D97757]" />
        <span className="truncate min-w-0" title={state.cwd || cwd}>
          {cwdName || 'Claude'}
        </span>
        {state.model && <span className="hidden min-[420px]:inline opacity-60 truncate">· {state.model}</span>}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAccountMenuOpen((o) => !o)}
          title={`Cuenta de Claude: ${accountName} (clic para cambiar)`}
          aria-label={`Cuenta de Claude: ${accountName}`}
          aria-expanded={accountMenuOpen}
          className={`${btn} h-6 px-1.5 max-w-[9rem] shrink-0 bg-white dark:bg-[#27272A] ${accountMenuOpen ? 'bg-[#FFE500] text-black' : ''}`}
        >
          <UserRound size={11} strokeWidth={3} className="shrink-0" />
          <span className="truncate hidden min-[400px]:inline">{accountName}</span>
          <ChevronDown size={10} strokeWidth={3} className="shrink-0" />
        </button>
        {state.contextTokens > 0 && (
          <span className="hidden min-[480px]:inline opacity-60" title="Tokens de contexto de la última llamada">
            {formatTokens(state.contextTokens)} ctx
          </span>
        )}
        {state.totalCostUsd > 0 && <span className="opacity-60">${state.totalCostUsd.toFixed(state.totalCostUsd < 1 ? 3 : 2)}</span>}
        {state.ended && (
          <button
            type="button"
            onClick={() => setRestartKey((k) => k + 1)}
            className={`${btn} h-6 px-1.5 bg-[#FFE500] text-black`}
            title="Reanudar la sesión de Claude"
          >
            <RotateCcw size={11} strokeWidth={3} /> Reanudar
          </button>
        )}
      </div>

      {accountMenuOpen && (
        <ClaudeAccountMenu
          currentId={accountId}
          onClose={() => setAccountMenuOpen(false)}
          onSwitch={(a) => void switchAccount(a)}
          onLogin={(a) => {
            setAccountMenuOpen(false);
            onLogin?.(a);
          }}
        />
      )}

      {/* Transcript */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="claude-chat-scroll flex-1 min-h-0 overflow-y-auto px-2.5 min-[640px]:px-4 py-3"
      >
        <div className="max-w-3xl mx-auto space-y-2.5">
          {visible.length === 0 && (
            <div className="pt-10 text-center space-y-2">
              <Sparkles size={28} strokeWidth={2} className="mx-auto text-[#D97757]" />
              <div className="text-sm font-black">{starting ? 'Iniciando Claude Code…' : '¿En qué te ayudo?'}</div>
              <div className="text-[11px] opacity-60">
                Trabaja en <span className="font-mono">{state.cwd || cwd || 'la carpeta de notas'}</span>. Escribe <span className="font-mono">/</span> para ver comandos.
              </div>
            </div>
          )}

          {visible.map((item) => {
            switch (item.kind) {
              case 'user':
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[88%] px-2.5 py-1.5 rounded border-2 border-black bg-[#FFE500] text-black shadow-[2px_2px_0px_#000] text-[13px] whitespace-pre-wrap break-words">
                      {item.imageCount > 0 && (
                        <div className="text-[10px] font-black opacity-70 mb-0.5">
                          🖼 {item.imageCount} {item.imageCount === 1 ? 'imagen' : 'imágenes'}
                        </div>
                      )}
                      <span className="min-w-0 flex-1 break-words">{item.text}</span>
                    <DismissButton onClick={() => dispatch({ type: 'dismiss', id: item.id })} />
                    </div>
                  </div>
                );
              case 'text':
                return (
                  <div key={item.id} className="group relative">
                    <Markdown text={item.text} />
                    {item.streaming && <span className="inline-block w-2 h-3.5 bg-black dark:bg-zinc-200 animate-pulse align-middle" />}
                    {!item.streaming && item.id === lastTextId && speech.state.status === 'idle' && (
                      <button
                        type="button"
                        onClick={() => speech.play(markdownToSegments(item.text).map((text) => ({ text })))}
                        title="Leer en voz alta"
                        className={`${btn} h-6 w-6 mt-1 bg-white dark:bg-[#27272A] opacity-50 hover:opacity-100`}
                      >
                        <Volume2 size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                );
              case 'thinking':
                return item.text.trim() ? (
                  <details key={item.id} className="text-[12px] opacity-70" open={item.streaming}>
                    <summary className="cursor-pointer font-black flex items-center gap-1 select-none">
                      <Brain size={12} strokeWidth={2.5} /> {item.streaming ? 'Pensando…' : 'Razonamiento'}
                    </summary>
                    <div className="mt-1 pl-3 border-l-2 border-black/20 dark:border-zinc-700 italic whitespace-pre-wrap">{item.text}</div>
                  </details>
                ) : null;
              case 'tool':
                return <ToolCard key={item.id} item={item} all={state.items} running={state.running} />;
              case 'permission':
                return <PermissionCard key={item.id} item={item} onDecide={decide} />;
              case 'result':
                return (
                  <div
                    key={item.id}
                    className={`text-[10px] font-black flex items-center gap-1 ${item.isError ? 'text-[#C0392B]' : 'opacity-50'}`}
                  >
                    {item.isError ? <CircleAlert size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
                    {(item.durationMs / 1000).toFixed(1)}s{item.costUsd > 0 ? ` · $${item.costUsd.toFixed(4)}` : ''}
                    {item.errors.length > 0 && <span className="font-bold truncate">· {item.errors.join(' · ')}</span>}
                  </div>
                );
              case 'notice':
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-1.5 text-[11px] font-bold px-2 py-1 rounded border-2 ${
                      item.tone === 'error'
                        ? 'border-[#C0392B] bg-[#FFE4E4] text-[#9B1C1C] dark:bg-[#3A1515] dark:text-[#FCA5A5]'
                        : 'border-black/20 dark:border-zinc-700 opacity-70'
                    }`}
                  >
                    {item.text}
                  </div>
                );
              default:
                return null;
            }
          })}

          {state.authRequired && (
            <div className={`${card} p-3 space-y-2 bg-[#FFFBDA] dark:bg-[#26240F]`} role="alert">
              <div className="flex items-center gap-1.5 text-[13px] font-black">
                <ShieldCheck size={15} strokeWidth={2.5} /> Inicia sesión en Claude
              </div>
              <p className="text-[12px] opacity-80">
                El chat usa Claude Code con tu propia cuenta: tu suscripción de Claude o una API key de Anthropic. Se abrirá una terminal con el
                inicio de sesión oficial de Claude Code, que continúa en tu navegador. yanote no ve tus credenciales.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onLogin?.({ id: accountId, name: accountName })} className={`${btn} h-7 px-2.5 bg-[#FFE500] text-black`}>
                  Iniciar sesión{accountId !== 'default' ? ` (${accountName})` : ''}
                </button>
                <button type="button" onClick={() => setAccountMenuOpen(true)} className={`${btn} h-7 px-2.5 bg-white dark:bg-[#27272A]`}>
                  <UserRound size={11} strokeWidth={3} /> Usar otra cuenta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // A session that never authenticated has nothing to resume: start a fresh one
                    sessionIdRef.current = undefined;
                    dispatch({ type: 'auth_retry' });
                    setRestartKey((k) => k + 1);
                  }}
                  className={`${btn} h-7 px-2.5 bg-white dark:bg-[#27272A]`}
                >
                  <RotateCcw size={11} strokeWidth={3} /> Ya inicié sesión, reintentar
                </button>
              </div>
            </div>
          )}

          {state.rateLimited && !state.running && (
            <div className={`${card} p-3 space-y-2 bg-[#FFFBDA] dark:bg-[#26240F]`} role="alert" data-testid="rate-limit-card">
              <div className="flex items-center gap-1.5 text-[13px] font-black">
                <UserRound size={15} strokeWidth={2.5} /> {accountName} llegó a su límite de uso
              </div>
              <p className="text-[12px] opacity-80">Puedes esperar a que se reinicie o seguir esta misma conversación con otra de tus cuentas.</p>
              <button type="button" onClick={() => setAccountMenuOpen(true)} className={`${btn} h-7 px-2.5 bg-[#FFE500] text-black`}>
                <UserRound size={11} strokeWidth={3} /> Cambiar de cuenta
              </button>
            </div>
          )}

          {state.running && !streamingSomething && (
            <div className="flex items-center gap-1.5 text-[11px] font-black opacity-60">
              <Loader2 size={12} strokeWidth={3} className="animate-spin" />
              {state.status === 'compacting'
                ? 'Compactando conversación…'
                : pendingPermissions(state.items).length > 0
                ? 'Esperando tu respuesta…'
                : 'Trabajando…'}
            </div>
          )}
        </div>
      </div>

      <div className="relative shrink-0 [&>*]:pointer-events-auto">
        <SpeechPlayerBar speech={speech} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t-2 border-black dark:border-zinc-700 p-2 bg-[#FAF8F5] dark:bg-[#18181B]">
        <div className="max-w-3xl mx-auto relative">
          {suggestions.length > 0 && (
            <div role="listbox" className={`${card} absolute bottom-full mb-1.5 left-0 right-0 py-1 z-20 max-h-56 overflow-auto`}>
              {suggestions.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  role="option"
                  aria-selected={i === cmdIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDraft(`/${c.name.replace(/^\//, '')} `);
                    inputRef.current?.focus();
                  }}
                  className={`w-full text-left px-2 py-1 flex gap-2 items-baseline cursor-pointer ${i === cmdIndex ? 'bg-[#FFE500] text-black' : ''}`}
                >
                  <span className="text-[12px] font-black font-mono shrink-0">/{c.name.replace(/^\//, '')}</span>
                  <span className="text-[11px] opacity-70 truncate">{c.description}</span>
                </button>
              ))}
            </div>
          )}

          <div className={`${card} p-1.5 focus-within:shadow-[3px_3px_0px_#000]`}>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.url} alt="" className="h-12 w-12 object-cover rounded border-2 border-black" />
                    <button
                      type="button"
                      aria-label="Quitar imagen"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[#FF6B6B] border-2 border-black flex items-center justify-center cursor-pointer"
                    >
                      <X size={8} strokeWidth={4} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.some((f) => f.type.startsWith('image/'))) {
                  e.preventDefault();
                  void addFiles(files);
                }
              }}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files);
                if (files.some((f) => f.type.startsWith('image/'))) {
                  e.preventDefault();
                  void addFiles(files);
                }
              }}
              placeholder={state.ended ? 'Sesión terminada — pulsa Reanudar' : state.running ? 'Escribe para encolar otro mensaje…' : 'Pregúntale a Claude… ( / comandos )'}
              disabled={state.ended}
              aria-label="Mensaje para Claude"
              className="w-full resize-none bg-transparent outline-none text-[13px] leading-snug px-1 py-0.5 placeholder:text-black/40 dark:placeholder:text-zinc-500"
            />
            <div className="flex items-end gap-1 mt-1">
              {/* Pickers wrap onto a second line on narrow windows; send/stop stay pinned right */}
              <div className="flex flex-1 min-w-0 flex-wrap items-center gap-1">
              <select
                value={mode}
                onChange={(e) => void changeMode(e.target.value as ClaudePermissionMode)}
                title={MODES.find((m) => m.value === mode)?.hint}
                aria-label="Modo de permisos"
                className={`h-6 max-w-[9.5rem] px-1 text-[10.5px] font-black border-2 border-black dark:border-zinc-600 rounded cursor-pointer outline-none ${
                  mode === 'bypassPermissions'
                    ? 'bg-[#FF6B6B] text-white'
                    : mode === 'plan'
                    ? 'bg-[#A3D8F4] text-black'
                    : mode === 'acceptEdits' || mode === 'auto'
                    ? 'bg-[#78E08F] text-black'
                    : 'bg-white dark:bg-[#27272A]'
                }`}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {state.models.length > 0 && (
                <select
                  value={selectedModel}
                  onChange={(e) => void changeModel(e.target.value)}
                  aria-label="Modelo"
                  title={modelInfo?.description || 'Modelo'}
                  className="h-6 max-w-[9.5rem] px-1 text-[10.5px] font-black border-2 border-black dark:border-zinc-600 rounded cursor-pointer outline-none bg-white dark:bg-[#27272A]"
                >
                  <option value="">{selectedModel ? 'Predeterminado' : 'Modelo'}</option>
                  {state.models.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              )}
              {effortLevels.length > 0 && (
                <select
                  value={effort}
                  onChange={(e) => void changeEffort(e.target.value as ClaudeEffortLevel | '')}
                  aria-label="Esfuerzo"
                  title={`Esfuerzo de razonamiento para ${modelInfo?.displayName ?? 'este modelo'} (se recuerda por modelo)`}
                  className={`h-6 max-w-[7rem] px-1 text-[10.5px] font-black border-2 border-black dark:border-zinc-600 rounded cursor-pointer outline-none ${
                    effort === 'max' || effort === 'xhigh' ? 'bg-[#C9A7F5] text-black' : 'bg-white dark:bg-[#27272A]'
                  }`}
                >
                  <option value="">Esfuerzo</option>
                  {effortLevels.map((l) => (
                    <option key={l} value={l}>
                      {EFFORT_LABELS[l]}
                    </option>
                  ))}
                </select>
              )}
              <label title="Adjuntar imagen" className={`${btn} h-6 w-6 bg-white dark:bg-[#27272A]`}>
                <ImagePlus size={12} strokeWidth={2.5} />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
              </label>
              </div>
              {state.running && (
                <button type="button" onClick={interrupt} title="Detener (Esc)" aria-label="Detener" className={`${btn} h-7 w-7 bg-[#FF6B6B] text-white`}>
                  <Square size={11} strokeWidth={3} fill="currentColor" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void send()}
                disabled={state.ended || (!draft.trim() && images.length === 0)}
                title="Enviar (Enter)"
                aria-label="Enviar"
                className={`${btn} h-7 w-7 bg-[#FFE500] text-black`}
              >
                <ArrowUp size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
