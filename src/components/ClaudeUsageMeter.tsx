import React, { useEffect, useRef, useState } from 'react';
import type { ClaudeUsage, ClaudeUsageWindow } from '../types/electron';
import { describeWindow, formatPercent, usageTone } from '../lib/claudeUsage';
import { logWarn } from '../lib/logger';

const POLL_MS = 2 * 60 * 1000;
/** Chat processes take a moment to start before they can answer */
const FIRST_FETCH_MS = 2500;

/**
 * Plan usage from Claude Code's /usage (5-hour and weekly windows), refreshed every couple of
 * minutes and after each Claude reply. Needs a live chat session, so it only runs while one is open.
 */
export function useClaudeUsage(chatIds: string[], preferredId?: string): ClaudeUsage | null {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const hasChats = chatIds.length > 0;
  const preferredRef = useRef(preferredId);
  preferredRef.current = preferredId && chatIds.includes(preferredId) ? preferredId : chatIds[0];

  useEffect(() => {
    if (!hasChats || !window.electronAPI?.claudeUsage) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const res = await window.electronAPI!.claudeUsage!(preferredRef.current);
        // A failed refresh keeps the last good numbers
        if (!cancelled && res?.success) setUsage(res);
      } catch (err) {
        // keep the last numbers and try again on the next tick (every 2 min)
        logWarn('ClaudeUsageMeter.refresh', `usage refresh failed: ${(err as Error)?.message ?? err}`);
      }
    };
    const refreshSoon = (ms: number) => {
      clearTimeout(soon);
      soon = setTimeout(() => void refresh(), ms);
    };
    refreshSoon(FIRST_FETCH_MS);
    const interval = setInterval(() => void refresh(), POLL_MS);
    // After each reply (and when Claude reports a limit change) the numbers have moved
    const off = window.electronAPI.onClaudeEvent?.((evt) => {
      const type = evt.type === 'message' ? (evt.message as { type?: string } | undefined)?.type : evt.type;
      if (type === 'result' || type === 'rate_limit_event') refreshSoon(1500);
      // A chat that couldn't answer yet (still starting) gets another try once it's ready
      if (evt.type === 'capabilities') refreshSoon(500);
    });
    return () => {
      cancelled = true;
      clearTimeout(soon);
      clearInterval(interval);
      off?.();
    };
  }, [hasChats]);

  return usage;
}

const TONE: Record<ReturnType<typeof usageTone>, string> = {
  ok: 'bg-[#78E08F]',
  warn: 'bg-[#FFE500]',
  high: 'bg-[#FF6B6B]',
};

const Meter: React.FC<{ label: string; win: ClaudeUsageWindow; testId: string }> = ({ label, win, testId }) => (
  <span data-testid={testId} className="flex items-center gap-1 leading-none">
    <span className="text-black/60 dark:text-zinc-400">{label}</span>
    <span className="relative h-2 w-6 min-[400px]:w-9 rounded-sm border border-black dark:border-zinc-500 bg-white dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
      <span className={`absolute inset-y-0 left-0 ${TONE[usageTone(win.percent)]}`} style={{ width: `${Math.max(0, Math.min(100, win.percent))}%` }} />
    </span>
    <span className="font-black tabular-nums">{formatPercent(win.percent)}</span>
  </span>
);

/** Compact "5h ▮▯ 16% · Sem ▮▯ 41%" for the status bar; hover for reset times. */
export const ClaudeUsageMeter: React.FC<{ usage: ClaudeUsage | null }> = ({ usage }) => {
  if (!usage?.available || (!usage.fiveHour && !usage.weekly)) return null;
  const title = [
    'Uso de tu plan de Claude (/usage)',
    usage.fiveHour && describeWindow('Últimas 5 horas', usage.fiveHour),
    usage.weekly && describeWindow('Semana', usage.weekly),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span data-testid="claude-usage" title={title} aria-label={title} className="h-5 flex items-center gap-1.5 px-1 shrink-0 whitespace-nowrap">
      {usage.fiveHour && <Meter label="5h" win={usage.fiveHour} testId="usage-5h" />}
      {usage.fiveHour && usage.weekly && <span className="text-black/30 dark:text-zinc-600">·</span>}
      {usage.weekly && <Meter label="Sem" win={usage.weekly} testId="usage-week" />}
    </span>
  );
};
