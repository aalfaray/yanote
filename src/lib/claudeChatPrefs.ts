import type { ClaudeEffortLevel, ClaudePermissionMode } from '../types/electron';
import { logError } from './logger';

/**
 * Claude chat choices remembered across chats (localStorage): the last permission mode and model,
 * and the effort picked per model. A failure only means the choice isn't remembered: it is logged
 * and the defaults are used.
 */

const PERMISSION_MODES: readonly ClaudePermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'];
const EFFORT_STORAGE_KEY = 'yanote.claude.effortByModel';
const PREFS_STORAGE_KEY = 'yanote.claude.chatPrefs';

/** Last permission mode and model picked in a chat: new chats start with them. */
export interface ChatPrefs {
  mode?: ClaudePermissionMode;
  /** '' = Claude Code's default model */
  model?: string;
}

export const isPermissionMode = (value: unknown): value is ClaudePermissionMode =>
  typeof value === 'string' && (PERMISSION_MODES as readonly string[]).includes(value);

/** Effort chosen per model ('' = the model's default). */
export function loadEffortByModel(): Record<string, ClaudeEffortLevel> {
  try {
    const raw = localStorage.getItem(EFFORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    logError('claudeChatPrefs.loadEffortByModel', err);
    return {};
  }
}

export function saveEffortByModel(map: Record<string, ClaudeEffortLevel>): void {
  try {
    localStorage.setItem(EFFORT_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    logError('claudeChatPrefs.saveEffortByModel', err);
  }
}

export function loadChatPrefs(): ChatPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || '{}');
    const prefs: ChatPrefs = {};
    if (parsed && isPermissionMode(parsed.mode)) prefs.mode = parsed.mode;
    if (parsed && typeof parsed.model === 'string') prefs.model = parsed.model;
    return prefs;
  } catch (err) {
    logError('claudeChatPrefs.loadChatPrefs', err);
    return {};
  }
}

export function saveChatPrefs(partial: ChatPrefs): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ ...loadChatPrefs(), ...partial }));
  } catch (err) {
    logError('claudeChatPrefs.saveChatPrefs', err, { partial });
  }
}
