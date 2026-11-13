import { t, useLanguage } from '../lib/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LogIn, LogOut, Plus, Trash2, UserRound, X, RefreshCw } from 'lucide-react';
import { logError } from '../lib/logger';
import type { ClaudeAccount, ClaudeAccountStatus, ClaudeUsage } from '../types/electron';
import { LoadingSkeleton } from './ui/Skeleton';
import { UsageWindowMeter } from './ClaudeUsageMeter';
import { describeWindow } from '../lib/claudeUsage';

const PLAN_LABEL: Record<string, string> = { pro: 'Pro', max: 'Max', team: 'Team', enterprise: 'Enterprise', free: 'Free' };

export function describeAccountStatus(status: ClaudeAccountStatus | undefined): string {
  if (!status) return t('Comprobando…');
  if (!status.success) return status.error || t("No se pudo comprobar");
  if (!status.loggedIn) return t("Sin iniciar sesión");
  const plan = status.plan ? PLAN_LABEL[status.plan] || status.plan : status.method === 'console' || status.method === 'api_key' ? 'API key' : '';
  return [status.email, plan].filter(Boolean).join(' · ') || t("Sesión iniciada");
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
  useLanguage();
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
  const [loaded, setLoaded] = useState(false);
  const loadRequest = useRef(0);
  const [usages, setUsages] = useState<Record<string, ClaudeUsage>>({});
  const [usageBusy, setUsageBusy] = useState<Record<string, boolean>>({});
  const usageRequests = useRef<Record<string, number>>({});

  const loadUsage = useCallback(async (id: string, request: number, force = false) => {
    const ticket = (usageRequests.current[id] || 0) + 1;
    usageRequests.current[id] = ticket;
    setUsageBusy((prev) => ({ ...prev, [id]: true }));
    let result: ClaudeUsage;
    try {
      result = await api?.usage?.(id, force) || { success: false, error: t('Uso no disponible') };
    } catch {
      result = { success: false, error: t('Uso no disponible') };
    }
    if (request !== loadRequest.current || ticket !== usageRequests.current[id]) return;
    setUsages((prev) => ({ ...prev, [id]: result }));
    setUsageBusy((prev) => ({ ...prev, [id]: false }));
  }, [api]);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    if (!api) { setLoaded(true); return; }
    try {
      const { accounts: list } = await api.list();
      if (request !== loadRequest.current) return;
      setAccounts(list);
      setError(null);
      // Each status settles independently; keep previous data during refresh.
      list.forEach((a) => {
        void api.status(a.id).catch((): ClaudeAccountStatus => ({ success: false, error: t("No se pudo comprobar la cuenta") })).then((s) => {
          if (request === loadRequest.current) {
            setStatuses((prev) => ({ ...prev, [a.id]: s }));
            if (s.success && s.loggedIn) void loadUsage(a.id, request);
          }
        });
      });
    } catch (err) {
      if (request === loadRequest.current) setError(t("No se pudieron cargar las cuentas. Cierra y vuelve a abrir este panel para reintentar."));
      logError('ClaudeAccountMenu.load', err);
    } finally {
      if (request === loadRequest.current) setLoaded(true);
    }
  }, [api, loadUsage]);

  useEffect(() => {
    void load();
    return () => { ++loadRequest.current; };
  }, [load]);

  const refreshUsage = useCallback(() => {
    accounts.filter((account) => statuses[account.id]?.loggedIn).forEach((account) => {
      void loadUsage(account.id, loadRequest.current, true);
    });
  }, [accounts, statuses, loadUsage]);
  useEffect(() => {
    const interval = setInterval(refreshUsage, 60_000);
    return () => clearInterval(interval);
  }, [refreshUsage]);

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
      if (!res.success) setError(t("No se pudo cerrar la sesión de {0}: {1}", [account.name, res.error || t("error desconocido")]));
      setConfirmLogout(null);
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      const status = await api.status(account.id);
      setStatuses((prev) => ({ ...prev, [account.id]: status }));
      setUsages((prev) => { const next = { ...prev }; delete next[account.id]; return next; });
      if (status.success && status.loggedIn) void loadUsage(account.id, loadRequest.current, true);
    } catch (err) {
      logError('ClaudeAccountMenu.logoutAccount', err, { accountId: account.id });
      setError(t("No se pudo cerrar la sesión de {0}", [account.name]));
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
      aria-label={t("Cuentas de Claude")}
      className="absolute top-9 right-2 left-2 min-[420px]:left-auto min-[420px]:w-80 z-40 bg-white dark:bg-[#1E1E21] text-black dark:text-zinc-100 border-2 border-black dark:border-zinc-600 rounded shadow-[3px_3px_0px_#000] text-[12px]"
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#FFE500] text-black border-b-2 border-black font-black text-[11px] uppercase">
        <UserRound size={13} strokeWidth={3} /> {' '}{t("Cuentas de Claude")}
        <button type="button" onClick={refreshUsage} disabled={!loaded || Object.values(usageBusy).some(Boolean)} title={t('Actualizar uso de las cuentas')} aria-label={t('Actualizar uso de las cuentas')} className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/10 disabled:opacity-40 cursor-pointer">
          <RefreshCw size={12} className={Object.values(usageBusy).some(Boolean) ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={onClose} aria-label={t("Cerrar")} title={t("Cerrar")} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/10 cursor-pointer">
          <X size={13} strokeWidth={3} />
        </button>
      </div>

      <ul className="max-h-[50vh] overflow-y-auto">
        {!loaded && <li className="p-3"><LoadingSkeleton label={t("Cargando cuentas de Claude")} /></li>}
        {accounts.map((a) => {
          const st = statuses[a.id];
          const current = a.id === currentId;
          const loggedIn = Boolean(st?.success && st.loggedIn);
          const usage = usages[a.id];
          const exhausted = usage?.success && [usage.fiveHour, usage.weekly].some((win) => win && win.percent >= 100 && (!win.resetsAt || Date.parse(win.resetsAt) > Date.now() || Number.isNaN(Date.parse(win.resetsAt))));
          const usageTitle = [
            usage?.fiveHour && describeWindow(t('Últimas 5 horas'), usage.fiveHour),
            usage?.weekly && describeWindow(t('Semana'), usage.weekly),
          ].filter(Boolean).join('\n');
          return (
            <li key={a.id} className={row}>
              {confirmLogout === a.id ? (
                <div className="flex-1 min-w-0 flex flex-col gap-1.5" role="alertdialog" aria-label={t("Cerrar la sesión de {0}", [a.name])}>
                  <span className="text-[11.5px] font-bold leading-snug">
                    {a.isDefault
                      ? t("¿Cerrar la sesión de {0}? Claude Code quedará sin sesión en todo tu PC (terminal y VS Code incluidos).", [a.name])
                      : t("¿Cerrar la sesión de {0}? La cuenta queda en la lista para volver a entrar.", [a.name])}
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={() => void logoutAccount(a)}
                      className="h-6 px-2 inline-flex items-center gap-1 text-[10.5px] font-black bg-[#FF6B6B] text-white border-2 border-black rounded cursor-pointer disabled:opacity-50"
                    >
                      <LogOut size={11} strokeWidth={3} /> {loggingOut ? t('Cerrando…') : t("Cerrar sesión")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmLogout(null)}
                      className="h-6 px-2 text-[10.5px] font-black bg-white dark:bg-zinc-700 border-2 border-black dark:border-zinc-500 rounded cursor-pointer"
                    >
                      {t("Cancelar")}</button>
                  </span>
                </div>
              ) : (
              <>
              <button
                type="button"
                disabled={current || !st || Boolean(exhausted)}
                onClick={() => (loggedIn ? onSwitch(a) : onLogin(a))}
                className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer disabled:cursor-default"
                title={current ? t("Cuenta actual de este chat") : exhausted ? t('Cuenta sin cuota disponible') : loggedIn ? t("Continuar este chat con {0}", [a.name]) : t("Iniciar sesión en {0}", [a.name])}
              >
                <span
                  className={`h-5 w-5 shrink-0 inline-flex items-center justify-center rounded border-2 border-black ${current ? 'bg-[#78E08F]' : 'bg-white dark:bg-zinc-700'}`}
                  aria-hidden="true"
                >
                  {current && <Check size={11} strokeWidth={4} className="text-black" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black truncate">{a.name}</span>
                  <span className={`block text-[10.5px] truncate ${st?.success && !st.loggedIn ? 'text-[#C0392B] dark:text-[#FCA5A5] font-bold' : 'opacity-60'}`}>
                    {st ? describeAccountStatus(st) : <LoadingSkeleton label={t("Comprobando cuenta {0}", [a.name])} variant="line" />}
                  </span>
                  {loggedIn && <span data-testid={`account-usage-${a.id}`} aria-busy={Boolean(usageBusy[a.id])} title={usageTitle || usage?.error} className="block mt-1 text-[10px]">
                    {!usage ? <LoadingSkeleton label={t('Cargando uso de {0}', [a.name])} variant="usage" />
                      : usage.success && usage.available && (usage.fiveHour || usage.weekly) ? <>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {usage.fiveHour && <UsageWindowMeter label="5h" win={usage.fiveHour} testId={`account-5h-${a.id}`} />}
                          {usage.weekly && <UsageWindowMeter label={t('Sem')} win={usage.weekly} testId={`account-week-${a.id}`} />}
                        </span>
                        {exhausted && <span className="block font-black text-[#C0392B] dark:text-[#FCA5A5] mt-1">{t('Límite alcanzado')}</span>}
                      </> : <span className="opacity-60">{usage.success && usage.available === false ? t('Cuota de suscripción no disponible') : t('Uso no disponible')}</span>}
                  </span>}
                </span>
              </button>
              {st && !loggedIn && (
                <button
                  type="button"
                  onClick={() => onLogin(a)}
                  className="shrink-0 h-6 px-1.5 inline-flex items-center gap-1 text-[10.5px] font-black bg-[#FFE500] text-black border-2 border-black rounded cursor-pointer"
                >
                  <LogIn size={11} strokeWidth={3} /> {' '}{t("Entrar")}</button>
              )}
              {loggedIn && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemove(null);
                    setConfirmLogout(a.id);
                  }}
                  title={t("Cerrar la sesión de {0}", [a.name])}
                  aria-label={t("Cerrar la sesión de {0}", [a.name])}
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
                      {t("Quitar")}</button>
                    <button type="button" onClick={() => setConfirmRemove(null)} aria-label={t("Cancelar")} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/10 cursor-pointer">
                      <X size={12} strokeWidth={3} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(a.id)}
                    disabled={current}
                    title={current ? t("Cambia de cuenta antes de quitarla") : t("Quitar {0} (cierra su sesión en yanote)", [a.name])}
                    aria-label={t("Quitar {0}", [a.name])}
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
            placeholder={t("Nombre (p. ej. Trabajo)")}
            maxLength={40}
            aria-label={t("Nombre de la cuenta")}
            className="flex-1 min-w-0 h-7 px-2 text-[12px] border-2 border-black dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 outline-none"
          />
          <button type="submit" className="shrink-0 h-7 px-2 text-[11px] font-black bg-[#FFE500] text-black border-2 border-black rounded cursor-pointer">
            {t("Agregar")}</button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full flex items-center gap-1.5 px-2.5 py-2 font-black text-[11.5px] hover:bg-[#FFE500] hover:text-black cursor-pointer"
        >
          <Plus size={13} strokeWidth={3} /> {' '}{t("Agregar otra cuenta")}</button>
      )}
      <p className="px-2.5 pb-2 text-[10px] opacity-60 leading-snug">
        {t("Cada cuenta inicia sesión una vez con Claude Code. Al cambiar, la conversación sigue con la otra cuenta. yanote no ve tus credenciales.")}</p>
    </div>
  );
};
