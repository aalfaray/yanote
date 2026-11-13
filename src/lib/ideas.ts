import type { SavedIdea } from '../types/electron';

export const MAX_IDEAS = 200;
export const MAX_IDEA_LENGTH = 20000;

/** Adds an idea at the top; saving the same text again just moves it up. */
export function addIdea(
  list: SavedIdea[],
  idea: { text: string; source?: string; cwd?: string },
  now: number = Date.now()
): SavedIdea[] {
  const text = idea.text.trim().slice(0, MAX_IDEA_LENGTH);
  if (!text) return list;
  const rest = list.filter((i) => i.text !== text);
  const saved: SavedIdea = {
    id: `idea-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    createdAt: now,
    ...(idea.source ? { source: idea.source } : {}),
    ...(idea.cwd ? { cwd: idea.cwd } : {}),
  };
  return [saved, ...rest].slice(0, MAX_IDEAS);
}

export function removeIdea(list: SavedIdea[], id: string): SavedIdea[] {
  return list.filter((i) => i.id !== id);
}

/** "hace 5 min", "ayer", "12 nov" */
export function formatIdeaDate(at: number, now: number = Date.now()): string {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(at).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
