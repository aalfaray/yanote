import { useSyncExternalStore } from 'react';
import type { ChatItem } from './claudeChat';
import type { ChatProvider } from '../types/electron';

/**
 * What every open chat is doing, for the file explorer (Orca shows agents on the files they touch):
 * each ClaudeChatView reports here and the explorer subscribes.
 */

export interface AgentActivity {
  tabId: string;
  provider: ChatProvider;
  /** Folder the agent works in */
  cwd?: string;
  starting: boolean;
  /** A turn is in flight */
  running: boolean;
  ended: boolean;
  /** Waiting for the user (permission / question) */
  waiting: boolean;
  /** Executable the session runs ("sdk-bundled" when the SDK picked it) */
  executable?: string;
  source?: 'user' | 'bundled' | 'sdk';
  /** Tool running right now and what it targets */
  currentTool?: { name: string; target?: string };
  /** Files a tool is working on right now (read, edit, write…) */
  activePaths: string[];
  /** Files the agent created or changed in this chat */
  touchedPaths: string[];
}

const agents = new Map<string, AgentActivity>();
let snapshot: AgentActivity[] = [];
const listeners = new Set<() => void>();

function publish() {
  snapshot = [...agents.values()];
  listeners.forEach((l) => l());
}

/** Reports (or with null, removes) one chat's activity; unchanged reports don't re-render anyone. */
export function reportAgent(tabId: string, info: AgentActivity | null) {
  if (!info) {
    if (agents.delete(tabId)) publish();
    return;
  }
  const prev = agents.get(tabId);
  if (prev && JSON.stringify(prev) === JSON.stringify(info)) return;
  agents.set(tabId, info);
  publish();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => snapshot;

export function useAgentActivity(): AgentActivity[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Tools that create or change files */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const;

const isAbsolute = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');

/** Absolute path of a tool's target (relative ones are inside the agent's folder). */
export function resolveToolPath(raw: string, cwd?: string): string {
  if (isAbsolute(raw) || !cwd) return raw;
  const sep = cwd.includes('\\') ? '\\' : '/';
  return `${cwd.replace(/[\\/]+$/, '')}${sep}${raw.replace(/^\.[\\/]/, '').replace(/[\\/]/g, sep)}`;
}

function toolPath(input: Record<string, unknown>): string | undefined {
  for (const key of PATH_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Files the transcript's tools are on right now and the ones they changed. */
export function deriveFileActivity(items: ChatItem[], cwd: string | undefined, running: boolean) {
  const active = new Set<string>();
  const touched = new Set<string>();
  let current: { name: string; target?: string } | undefined;
  for (const item of items) {
    if (item.kind !== 'tool') continue;
    const raw = toolPath(item.input);
    const abs = raw ? resolveToolPath(raw, cwd) : undefined;
    const done = Boolean(item.result);
    if (abs && WRITE_TOOLS.has(item.name) && done && !item.result?.isError) touched.add(abs);
    if (!done && running) {
      if (abs) active.add(abs);
      current = { name: item.name, target: raw };
    }
  }
  return { activePaths: [...active], touchedPaths: [...touched], currentTool: current };
}

/** Same path regardless of slash style / drive letter case (Windows paths are case-insensitive). */
export function normPath(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

/** `p` is `dir` or inside it */
export function isWithin(p: string, dir: string): boolean {
  const a = normPath(p);
  const b = normPath(dir);
  return a === b || a.startsWith(`${b}\\`);
}
