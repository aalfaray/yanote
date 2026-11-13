import type { ClaudeEvent } from '../types/electron';

export interface ChatNotification {
  title: string;
  body: string;
}

const MAX_BODY = 140;

function snippet(text: unknown): string {
  if (typeof text !== 'string') return '';
  const flat = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*`~]+/g, '')
    .replace(/^[#>\s-]+|[#>|]+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > MAX_BODY ? `${flat.slice(0, MAX_BODY - 1)}…` : flat;
}

/**
 * Windows notification for a Claude chat event, or null when it isn't worth one:
 * the turn finished (or failed), or Claude is waiting for a permission/answer.
 */
export function chatNotificationFor(event: ClaudeEvent, chatTitle: string): ChatNotification | null {
  const name = chatTitle || 'Claude';
  if (event.type === 'permission') {
    const what =
      event.toolName === 'AskUserQuestion'
        ? 'Claude tiene una pregunta para ti'
        : event.toolName === 'ExitPlanMode'
          ? 'El plan está listo para que lo revises'
          : `Claude necesita tu permiso para usar ${event.toolName}`;
    return { title: `${name}: esperando tu respuesta`, body: what };
  }
  if (event.type === 'message' && event.message?.type === 'result') {
    const msg = event.message as { subtype?: string; result?: unknown; is_error?: boolean };
    const failed = msg.is_error || (typeof msg.subtype === 'string' && msg.subtype !== 'success');
    if (failed) {
      return { title: `${name}: la tarea se detuvo`, body: snippet(msg.result) || 'Claude no pudo terminar la tarea.' };
    }
    return { title: `${name}: tarea terminada ✅`, body: snippet(msg.result) || 'Claude terminó de responder.' };
  }
  return null;
}
