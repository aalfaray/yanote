import { t } from '../lib/i18n';
import { useEffect, useState } from 'react';
import type { AntigravityUsage } from '../types/electron';

export function useAntigravityUsage(tabId?: string): AntigravityUsage | null {
  const [result, setResult] = useState<{ id: string; usage: AntigravityUsage } | null>(null);
  useEffect(() => {
    const api = window.electronAPI;
    if (!tabId || !api?.agyUsage) return;
    let cancelled = false;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async (force = false) => {
      const request = ++revision;
      let usage: AntigravityUsage;
      try {
        usage = await api.agyUsage!(tabId, force);
      } catch (err) {
        usage = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (cancelled || request !== revision) return;
      setResult((prev) => ({ id: tabId, usage: usage.success ? usage
        : prev?.id === tabId && prev.usage.available ? { ...prev.usage, stale: true, error: usage.error } : usage }));
    };
    const soon = (force = false) => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(force), 500);
    };
    soon();
    const interval = setInterval(() => void refresh(), 2 * 60_000);
    const off = api.onAgyEvent?.((event) => {
      if (event.id !== tabId) return;
      const message = event.type === 'message' ? event.message : null;
      if ((event.type === 'applied_settings' && event.model) || (message?.type === 'system' && message.subtype === 'init' && message.model)) {
        ++revision;
        setResult(null);
        soon();
      } else if (message?.type === 'result') soon(true);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
      off?.();
    };
  }, [tabId]);
  if (tabId && !window.electronAPI?.agyUsage) return { success: false, error: t("Reinicia yanote para activar la consulta de cuota de Antigravity.") };
  return result && result.id === tabId ? result.usage : null;
}

