import { topLevelItems, toolSummary, type ChatItem } from './claudeChat';
import type { MobileAction, MobileChatItem, MobileChatSnapshot, MobileChatTab, MobileOpenNote } from '../types/electron';

/**
 * The phone side of each chat tab (Orca Mobile): every chat view publishes a trimmed copy
 * of its transcript, and phone actions come back to the same view that typing would use.
 */

const MAX_TOOL_RESULT_CHARS = 1500;
const MAX_TEXT_CHARS = 60000;
const PUBLISH_DELAY_MS = 200;

export interface MobileChatHandlers {
  send: (text: string) => Promise<{ success: boolean; error?: string }>;
  decide: (requestId: string, behavior: 'allow' | 'deny') => void;
  interrupt: () => void;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…` : text);

/** Transcript items as the phone shows them: top level only, without images or huge tool output. */
export function toMobileItems(items: ChatItem[]): MobileChatItem[] {
  return topLevelItems(items).map((item): MobileChatItem => {
    switch (item.kind) {
      case 'user':
        return { kind: 'user', id: item.id, text: clip(item.text, MAX_TEXT_CHARS), imageCount: item.imageCount };
      case 'text':
      case 'thinking':
        return { kind: item.kind, id: item.id, text: clip(item.text, MAX_TEXT_CHARS), streaming: item.streaming };
      case 'tool':
        return {
          kind: 'tool',
          id: item.id,
          name: item.name,
          summary: toolSummary(item.name, item.input || {}),
          done: Boolean(item.result),
          ...(item.result ? { result: clip(item.result.text, MAX_TOOL_RESULT_CHARS), isError: item.result.isError } : {}),
        };
      case 'permission':
        return {
          kind: 'permission',
          id: item.id,
          toolName: item.request.toolName,
          ...(item.request.title ? { title: item.request.title } : {}),
          summary: toolSummary(item.request.toolName, item.request.input || {}),
          status: item.status,
        };
      case 'result':
        return { kind: 'result', id: item.id, isError: item.isError, durationMs: item.durationMs };
      case 'notice':
        return { kind: 'notice', id: item.id, text: item.text, tone: item.tone };
    }
  });
}

const handlers = new Map<string, MobileChatHandlers>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const latest = new Map<string, () => MobileChatSnapshot>();

/** The view's current handlers; returns the cleanup for when the tab closes. */
export function registerMobileChat(tabId: string, h: MobileChatHandlers): () => void {
  handlers.set(tabId, h);
  return () => {
    if (handlers.get(tabId) === h) handlers.delete(tabId);
    const timer = timers.get(tabId);
    if (timer) clearTimeout(timer);
    timers.delete(tabId);
    latest.delete(tabId);
  };
}

/**
 * Sends the chat to the main process, at most every 200 ms while a reply streams in.
 * `snapshot` is only built when it is actually sent.
 */
export function publishMobileChat(tabId: string, snapshot: () => MobileChatSnapshot): void {
  const api = window.electronAPI;
  if (!api?.mobilePublishChat) return;
  latest.set(tabId, snapshot);
  if (timers.has(tabId)) return;
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      const build = latest.get(tabId);
      if (build) api.mobilePublishChat?.(tabId, build());
    }, PUBLISH_DELAY_MS)
  );
}

let lastTabs = '';

export function publishMobileTabs(tabs: MobileChatTab[]): void {
  const key = JSON.stringify(tabs);
  if (key === lastTabs) return;
  lastTabs = key;
  window.electronAPI?.mobilePublishTabs?.(tabs);
}

let lastNotes = '';

/** Note tabs open in yanote: the phone may open them, and won't save over unsaved desktop edits. */
export function publishMobileNotes(notes: MobileOpenNote[]): void {
  const key = JSON.stringify(notes);
  if (key === lastNotes) return;
  lastNotes = key;
  window.electronAPI?.mobilePublishNotes?.(notes);
}

/**
 * Routes the phone's actions to their chat view; install once for the whole app.
 * `onNoteSaved` puts a note saved from the phone into its open tab.
 */
export function installMobileActions(onNoteSaved?: (path: string, content: string) => void): () => void {
  const api = window.electronAPI;
  if (!api?.onMobileAction) return () => {};
  return api.onMobileAction(async (action: MobileAction) => {
    const reply = (result: { success: boolean; error?: string }) => api.mobileActionResult?.(action.reqId, result);
    if (action.type === 'noteSaved') {
      onNoteSaved?.(action.path, action.content);
      return reply({ success: true });
    }
    const h = handlers.get(action.tabId);
    if (!h) return reply({ success: false, error: 'Ese chat ya no está abierto en yanote' });
    try {
      if (action.type === 'send') return reply(await h.send(action.text));
      if (action.type === 'decide') h.decide(action.requestId, action.behavior);
      else h.interrupt();
      reply({ success: true });
    } catch (err) {
      reply({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
