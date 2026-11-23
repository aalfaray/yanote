import { t } from './i18n';
import { logWarn } from './logger';
import type { ClaudeUsage, ClaudeUsageWindow } from '../types/electron';

/** Colour step for a usage percent: calm, getting close, almost out. */

export function usageTone(percent: number): 'ok' | 'warn' | 'high' {
  if (percent >= 90) return 'high';
  if (percent >= 70) return 'warn';
  return 'ok';
}

/** "16%" — whole numbers, never above 100. */

export function formatPercent(percent: number): string {
  return `${Math.round(Math.max(0, Math.min(100, percent)))}%`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const getDays = () => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'].map((day) => t(day));

/**
 * When a window resets, for a tooltip: "en 45 min", "en 3 h 20 min (05:00)", "vie 14:00".
 * Local time; null/invalid dates give ''.
 */

export function formatReset(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.round((at.getTime() - now.getTime()) / 60000);
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (minutes <= 0) return t("ahora");
  if (minutes < 60) return t("en {0} min", [minutes]);
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return t("en {0} h{1} ({2})", [h, m ? t(" {0} min", [m]) : '', clock]);
  }
  return `${getDays()[at.getDay()]} ${at.getDate()}, ${clock}`;
}

/** True when a window is used up and its reset is still ahead (or unknown). */

export function isExhausted(win: ClaudeUsageWindow, now: Date = new Date()): boolean {
  if (win.percent < 100) return false;
  const at = win.resetsAt ? Date.parse(win.resetsAt) : NaN;
  return Number.isNaN(at) || at > now.getTime();
}

/**
 * Room an account has left (100 minus its most-used window), or null when it cannot take a turn now:
 * usage unknown (not signed in, query failed), no plan windows, or a window used up.
 */

export function quotaHeadroom(usage: ClaudeUsage | null | undefined, now: Date = new Date()): number | null {
  try {
    if (!usage?.success || usage.available === false) return null;
    const windows = [usage.fiveHour, usage.weekly].filter((w): w is ClaudeUsageWindow => Boolean(w));
    if (windows.length === 0 || windows.some((w) => isExhausted(w, now))) return null;
    // A window whose reset already passed is fresh again
    const used = windows.map((w) => (w.resetsAt && Date.parse(w.resetsAt) <= now.getTime() ? 0 : w.percent));
    return 100 - Math.max(...used);
  } catch (err) {
    logWarn('claudeUsage.quotaHeadroom', `headroom failed: ${(err as Error)?.message ?? err}`);
    return null;
  }
}

/** Account to continue with when the current one hits its limit: the one with the most room left. */

export function pickAccountWithQuota(candidates: { id: string; usage: ClaudeUsage | null | undefined }[], now: Date = new Date()): string | null {
  let best: { id: string; room: number } | null = null;
  for (const { id, usage } of candidates) {
    const room = quotaHeadroom(usage, now);
    if (room !== null && room > 0 && (!best || room > best.room)) best = { id, room };
  }
  return best?.id ?? null;
}

/**
 * Compact time left until a window resets, for the status bar: "45m", "2h 15m", "3d 4h".
 * Rounds up so it never reads "0m" while still waiting; '' when the date is missing, invalid or past.
 */

export function formatCountdown(iso: string | null | undefined, now: Date = new Date()): string {
  try {
    if (!iso) return '';
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return '';
    const minutes = Math.ceil((at - now.getTime()) / 60000);
    if (minutes <= 0) return '';
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 24 * 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(minutes / (24 * 60));
    const h = Math.floor((minutes % (24 * 60)) / 60);
    return h ? `${d}d ${h}h` : `${d}d`;
  } catch (err) {
    logWarn('claudeUsage.formatCountdown', `countdown failed: ${(err as Error)?.message ?? err}`);
    return '';
  }
}

/** Tooltip line for one window, e.g. "Últimas 5 horas: 16% usado · se reinicia en 2 h (05:00)". */

export function describeWindow(label: string, win: ClaudeUsageWindow, now: Date = new Date()): string {
  const reset = formatReset(win.resetsAt, now);
  return t("{0}: {1} usado{2}", [label, formatPercent(win.percent), reset ? t(" · se reinicia {0}", [reset]) : '']);
}
