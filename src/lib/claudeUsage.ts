import { t } from './i18n';
import type { ClaudeUsageWindow } from '../types/electron';

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

/** Tooltip line for one window, e.g. "Últimas 5 horas: 16% usado · se reinicia en 2 h (05:00)". */

export function describeWindow(label: string, win: ClaudeUsageWindow, now: Date = new Date()): string {
  const reset = formatReset(win.resetsAt, now);
  return t("{0}: {1} usado{2}", [label, formatPercent(win.percent), reset ? t(" · se reinicia {0}", [reset]) : '']);
}
