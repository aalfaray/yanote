import { t, getLanguage } from './i18n';
import type { RecentFile } from '../types/electron';

export type { RecentFile };

export const MAX_RECENT_FILES = 30;

/** Windows paths are case-insensitive and may mix separators. */

const samePath = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();

/** Moves (or adds) a file to the top of the history, without duplicates, capped to MAX_RECENT_FILES. */

export function addRecentFile(list: RecentFile[], file: { path: string; name: string }, now = Date.now()): RecentFile[] {
  const rest = list.filter((f) => !samePath(f.path, file.path));
  return [{ path: file.path, name: file.name, openedAt: now }, ...rest].slice(0, MAX_RECENT_FILES);
}

export function removeRecentFile(list: RecentFile[], filePath: string): RecentFile[] {
  return list.filter((f) => !samePath(f.path, filePath));
}

/** Keeps only well-formed entries (the list comes from the config file on disk). */

export function sanitizeRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (f): f is RecentFile =>
        !!f && typeof f.path === 'string' && f.path.length > 0 && typeof f.name === 'string' && typeof f.openedAt === 'number'
    )
    .slice(0, MAX_RECENT_FILES);
}

/** "hace un momento", "hace 5 min", "hace 3 h", "ayer", "hace 4 días", or a date. */

export function formatOpenedAgo(openedAt: number, now = Date.now()): string {
  const diff = Math.max(0, now - openedAt);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("hace un momento");
  if (min < 60) return t("hace {0} min", [min]);
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("hace {0} h", [hours]);
  const days = Math.floor(hours / 24);
  if (days === 1) return t("ayer");
  if (days < 7) return t("hace {0} días", [days]);
  return new Date(openedAt).toLocaleDateString(getLanguage());
}
