import { t, useLanguage } from '../lib/i18n';
import type { AntigravityUsage } from '../types/electron';
import { describeWindow } from '../lib/claudeUsage';
import { UsageWindowMeter } from './ClaudeUsageMeter';
import { LoadingSkeleton } from './ui/Skeleton';

export function AntigravityUsageMeter({ usage }: { usage: AntigravityUsage | null }) {
  useLanguage();
  if (!usage) return <LoadingSkeleton label={t("Cargando uso de Antigravity")} variant="usage" />;
  const available = usage?.available && (usage.fiveHour || usage.weekly);
  const title = available ? [
    t("Uso de Antigravity · {0}", [usage.group || usage.model || '']),
    usage.fiveHour && describeWindow(t("Últimas 5 horas"), usage.fiveHour),
    usage.weekly && describeWindow(t("Semana"), usage.weekly),
    usage.stale && t("Última lectura disponible; no se pudo actualizar."),
  ].filter(Boolean).join('\n') : usage?.error || (usage ? t("Antigravity no informó una cuota para este modelo.") : t("Consultando la cuota de Antigravity…"));
  return (
    <span data-testid="antigravity-usage" title={title} aria-label={title} className="h-5 flex items-center gap-1.5 px-1 shrink-0 whitespace-nowrap">
      <span className="text-black/60 dark:text-zinc-400">AG</span>
      {available ? <>
        {usage.fiveHour && <UsageWindowMeter label="5h" win={usage.fiveHour} testId="agy-usage-5h" />}
        {usage.weekly && <UsageWindowMeter label={t("Sem")} win={usage.weekly} testId="agy-usage-week" />}
      </> : <span>{usage ? t("Uso no disponible") : '…'}</span>}
    </span>
  );
}
