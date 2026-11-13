import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LogIn, LogOut, Plus, Trash2, UserRound, X } from 'lucide-react';
import { logError } from '../lib/logger';
import type { ClaudeAccount, ClaudeAccountStatus } from '../types/electron';

const PLAN_LABEL: Record<string, string> = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise', free: 'Free' };

export function describeAccountStatus(status: ClaudeAccountStatus | undefined): string {
  if (!status) return 'Comprobando…';
  if (!status.success) return status.error || 'No se pudo comprobar';
  if (!status.loggedIn) return 'Sin iniciar sesión';
  const plan = status.plan ? PLAN_LABEL[status.plan] || status.plan : status.method === 'console' || status.method === 'api_key' ? 'API key' : '';
  return [status.email, plan].filter(Boolean).join(' · ') || 'Sesión iniciada';
}

interface ClaudeAccountMenuProps {
  /** Account the chat is using */
  currentId: string;
  onClose: () => void;
  /** Continue this chat with another (signed-in) account */
  onSwitch: (account: ClaudeAccount) => void;
  /** Run Claude Code's own sign-in for that account */
  onLogin: (account: ClaudeAccount) => void;
}

/**
 * Account switcher for a Claude chat. Each extra account keeps its own Claude Code sign-in,
 * so switching is one click (after signing in once). Mobile-first: full width at 340px.
 */
export const ClaudeAccountMenu: React.FC<ClaudeAccountMenuProps> = ({ currentId, onClose, onSwitch, onLogin }) => {
  const api = window.electronAPI?.claudeAccounts;
  const [accounts, setAccounts] = useState<ClaudeAccount[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ClaudeAccountStatus>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!api) return;
    const { accounts: list } = await api.list();
    setAccounts(list);
    // Each status runs `claude auth status`: fill them in as they arrive
    list.forEach((a) => {
      void api.status(a.id).then((s) => setStatuses((prev) => ({ ...prev, [a.id]: s })));
    });
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close on Escape or a click outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const addAccount = async () => {
    if (!api) return;
    const account = await api.add(newName);
    setAdding(false);
    setNewName('');
    await load();
    // A new account has no sign-in yet: start it right away
    onLogin(account);
  };

  /** Claude Code's own sign-out for that account, then its row shows "Sin iniciar sesión". */
  const logoutAccount = async (account: ClaudeAccount) => {
    if (!api) return;
    setLoggingOut(true);
    setError(null);
    try {
      const res = await api.logout(account.id);
      if (!res.success) setError(`No se pudo cerrar la sesión de ${account.name}: ${res.error || 'error desconocido'}`);
      setConfirmLogout(null);
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      const status = await api.status(account.id);
      setStatuses((prev) => ({ ...prev, [account.id]: status }));
    } catch (err) {
      logError('ClaudeAccountMenu.logoutAccount', err, { accountId: account.id });
      setError(`No se pudo cerrar la sesión de ${account.name}`);
    } finally {
      setLoggingOut(false);
    }
  };

  const removeAccount = async (id: string) => {
    if (!api) return;
    await api.remove(id);
    setConfirmRemove(null);
    await load();
  };

  const row = 'w-full flex items-center gap-2 px-2.5 py-2 text-left border-b-2 border-black/10 dark:border-zinc-700/60';

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Cuentas de Claude"
      className="absolute top-9 right-2 left-2 min-[420px]:left-auto min-[420px]:w-80 z-40 bg-white dark:bg-[#1E1E21] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-600 rounded shadow-[3px_3px_0px_#000] text-[12px]"
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#FFE500] text-black border-b-2 border-black font-black text-[11px] uppercase">
        <UserRound size={13} strokeWidth={3} /> Cuentas de Claude
        <button type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar" className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/10 cursor-pointer">
          <X size={13} strokeWidth={3} />
        </button>
      </div>

      <ul className="max-h-[50vh] overflow-y-auto">
        {accounts.map((a) => {
          const st = statuses[a.id];
          const current = a.id === currentId;
          const loggedIn = Boolean(st?.success && st.loggedIn);
          return (
            <li key={a.id} className={row}>
              {confirmLogout === a.id ? (
                <div className="flex-1 min-w-0 flex flex-col gap-1.5" role="alertdialog" aria-label={`Cerrar la sesión de ${a.name}`}>
                  <span className="text-[11.5px] font-bold leading-snug">
                    {a.isDefault
                      ? `¿Cerrar la sesión de ${a.name}? Claude Code quedará sin sesión en todo tu PC (terminal y VS Code incluidos).`
                      : `¿Cerrar la sesión de ${a.name}? La cuenta queda en la lista para volver a entrar.`}
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={() => void logoutAccount(a)}
                      className="h-6 px-2 inline-flex items-center gap-1 text-[10.5px] font-black bg-[#FF6B6B] text-white border-2 border-black rounded cursor-pointer disabled:opacity-50"
                    >
                      <LogOut size={11} strokeWidth={3} /> {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmLogout(null)}
                      className="h-6 px-2 text-[10.5px] font-black bg-white dark:bg-zinc-700 border-2 border-black dark:border-zinc-500 rounded cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </span>
                </div>
              ) : (
              <>
              <button
                type="button"
                disabled={current || !st}
                onClick={() => (loggedIn ? onSwitch(a) : onLogin(a))}
                className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer disabled:cursor-default"
                title={current ? 'Cuenta actual de este chat' : loggedIn ? `Continuar este chat con ${a.name}` : `Iniciar sesión en ${a.name}`}
              >
                <span
                  className={`h-5 w-5 shrink-0 inline-flex items-center justify-center rounded border-2 border-black ${current ? 'bg-[#78E08F]' : 'bg-white dark:bg-zinc-700'}`}
                  aria-hidden="true"
                >
                  {current && <Check size={11} strokeWidth={4} className="text-black" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-black truncate">{a.name}</span>
                  <span className={`block text-[10.5px] truncate ${st?.success && !st.loggedIn ? 'text-[#C0392B] dark:text-[#FCA5A5] font-bold' : 'opacity-60'}`}>
                    {describeAccountStatus(st)}
                  </span>
                </span>
              </button>
              {st && !loggedIn && (
                <button
                  type="button"
                  onClick={() => onLogin(a)}
                  className="shrink-0 h-6 px-1.5 inline-flex items-center gap-1 text-[10.5px] font-black bg-[#FFE500] text-black border-2 border-black rounded cursor-pointer"
                >
                  <LogIn size={11} strokeWidth={3} /> Entrar
                </button>
              )}
              {loggedIn && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemove(null);
                    setConfirmLogout(a.id);
                  }}
                  title={`Cerrar la sesión de ${a.name}`}
                  aria-label={`Cerrar la sesión de ${a.name}`}
                  className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                >
                  <LogOut size={12} strokeWidth={2.5} />
                </button>
              )}
              {!a.isDefault &&
                (confirmRemove === a.id ? (
                  <span className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void removeAccount(a.id)}
                      className="h-6 px-1.5 text-[10.5px] font-black bg-[#FF6B6B] text-white border-2 border-black rounded cursor-pointer"
                    >
                      Quitar
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(null)} aria-label="Cancelar" className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/10 cursor-pointer">
                      <X size={12} strokeWidth={3} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(a.id)}
                    disabled={current}
                    title={current ? 'Cambia de cuenta antes de quitarla' : `Quitar ${a.name} (cierra su sesión en yanote)`}
                    aria-label={`Quitar ${a.name}`}
                    className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-[#FF6B6B] hover:text-white disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                ))}
              </>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mx-2.5 mt-2 px-2 py-1 text-[11px] font-bold rounded border-2 border-[#C0392B] bg-[#FFE4E4] text-[#9B1C1C] dark:bg-[#3A1515] dark:text-[#FCA5A5]">
          {error}
        </p>
      )}

      {adding ? (
        <form
          className="flex items-center gap-1.5 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addAccount();
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre (p. ej. Trabajo)"
            maxLength={40}
            aria-label="Nombre de la cuenta"
            className="flex-1 min-w-0 h-7 px-2 text-[12px] border-2 border-black dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 outline-none"
          />
          <button type="submit" className="shrink-0 h-7 px-2 text-[11px] font-black bg-[#FFE500] text-black border-2 border-black rounded cursor-pointer">
            Agregar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full flex items-center gap-1.5 px-2.5 py-2 font-black text-[11.5px] hover:bg-[#FFE500] hover:text-black cursor-pointer"
        >
          <Plus size={13} strokeWidth={3} /> Agregar otra cuenta
        </button>
      )}
      <p className="px-2.5 pb-2 text-[10px] opacity-60 leading-snug">
        Cada cuenta inicia sesión una vez con Claude Code. Al cambiar, la conversación sigue con la otra cuenta. yanote no ve tus credenciales.
      </p>
    </div>
  );
};
