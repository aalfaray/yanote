import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { TerminalShell } from '../types/electron';
import { pasteFromClipboard } from '../lib/terminalPaste';
import { extractLastResponse } from '../lib/terminalSpeech';
import { plainTextToSegments } from '../lib/speechText';
import { useSpeech } from '../hooks/useSpeech';
import { SpeechPlayerBar } from './SpeechControls';

/** Buffer as text lines, re-joining lines the terminal soft-wrapped. */
function bufferLines(term: Terminal): string[] {
  const buf = term.buffer.active;
  const out: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true);
    if (line.isWrapped && out.length) out[out.length - 1] += text;
    else out.push(text);
  }
  return out;
}

interface TerminalViewProps {
  tabId: string;
  shell: TerminalShell;
  isActive: boolean;
  isDarkMode: boolean;
  cwd?: string;
}

const DARK_THEME = {
  background: '#121212',
  foreground: '#E4E4E7',
  cursor: '#FFE500',
  cursorAccent: '#121212',
  selectionBackground: '#FFE50055',
};

const LIGHT_THEME = {
  background: '#FAF8F5',
  foreground: '#111111',
  cursor: '#000000',
  cursorAccent: '#FAF8F5',
  selectionBackground: '#FFE50099',
  // Light background needs darker variants of the bright ANSI colours
  yellow: '#9A7B00',
  brightYellow: '#B38F00',
  white: '#555555',
  brightWhite: '#333333',
};

/**
 * One xterm.js instance bound to one pseudo-terminal in the main process.
 * Kept mounted while the tab exists (hidden when inactive) so the buffer survives tab switches.
 */
export const TerminalView: React.FC<TerminalViewProps> =({ tabId, shell, isActive, isDarkMode, cwd }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const speech = useSpeech();
  const [notice, setNotice] = useState<string | null>(null);

  // Selected text if any, otherwise the latest answer (Claude Code reply or last command output)
  const readLatest = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const paragraphs = term.hasSelection()
      ? plainTextToSegments(term.getSelection())
      : extractLastResponse(bufferLines(term));
    if (paragraphs.length === 0) {
      setNotice('No encontré una respuesta para leer');
      return;
    }
    speech.play(paragraphs.map((text) => ({ text })));
  }, [speech]);

  const toggleReading = useCallback(() => {
    const status = speech.state.status;
    if (status === 'speaking') speech.pause();
    else if (status === 'paused') speech.resume();
    else readLatest();
  }, [speech, readLatest]);

  // The xterm key handler is created once; it calls the latest toggle through this ref
  const toggleReadingRef = useRef(toggleReading);
  useEffect(() => {
    toggleReadingRef.current = toggleReading;
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const container = containerRef.current;
    const api = window.electronAPI;
    if (!container) return;

    const term = new Terminal({
      fontFamily: 'Cascadia Mono, Consolas, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: isDarkMode ? DARK_THEME : LIGHT_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {
      // container may be hidden
    }

    if (!api?.termCreate) {
      term.writeln('La terminal solo está disponible en la app de escritorio (Electron).');
      return () => {
        term.dispose();
        termRef.current = null;
      };
    }

    const offEvent = api.onTermEvent?.((evt) => {
      if (evt.id !== tabId) return;
      if (evt.type === 'data') {
        term.write(evt.data);
      } else {
        term.writeln(`\r\n\x1b[33m[Proceso terminado con código ${evt.exitCode}]\x1b[0m`);
      }
    });

    const inputSub = term.onData((data) => api.termWrite?.(tabId, data));
    const resizeSub = term.onResize(({ cols, rows }) => api.termResize?.(tabId, cols, rows));

    api.termCreate({ id: tabId, shell, cols: term.cols, rows: term.rows, cwd }).then((res) => {
      if (!res.success) {
        term.writeln(`\x1b[31mNo se pudo iniciar la terminal: ${res.error}\x1b[0m`);
      }
    });

    // Ctrl+C copies when there is a selection; Ctrl+V pastes; Ctrl+Shift+Space reads aloud
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey) return true;
      if (e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        toggleReadingRef.current();
        return false;
      }
      const key = e.key.toLowerCase();
      if (key === 'c' && term.hasSelection()) {
        navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        return false;
      }
      if (key === 'v') {
        e.preventDefault();
        pasteFromClipboard(term, api);
        return false;
      }
      return true;
    });

    const observer = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        try {
          fit.fit();
        } catch {
          // ignore
        }
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      offEvent?.();
      inputSub.dispose();
      resizeSub.dispose();
      api.termKill?.(tabId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // The pty lives as long as the tab; shell/cwd are fixed at creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = isDarkMode ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!isActive) return;
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore
      }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isActive]);

  return (
    <div
      className={`absolute inset-0 p-2 bg-[#FAF8F5] dark:bg-[#121212] ${isActive ? '' : 'invisible pointer-events-none'}`}
      aria-hidden={!isActive}
      data-testid={`terminal-${tabId}`}
    >
      <div ref={containerRef} className="w-full h-full" />

      {speech.state.status === 'idle' && (
        <button
          type="button"
          onClick={readLatest}
          title="Leer en voz alta la última respuesta (Ctrl+Shift+Espacio). Si hay texto seleccionado, lee la selección."
          aria-label="Leer la última respuesta"
          className="absolute top-2 right-3 z-20 h-7 w-7 inline-flex items-center justify-center border-2 border-black dark:border-zinc-600 rounded bg-white dark:bg-[#27272A] text-black dark:text-zinc-100 shadow-[1.5px_1.5px_0px_#000] opacity-60 hover:opacity-100 hover:bg-[#FFE500] hover:text-black transition"
        >
          <Volume2 size={14} strokeWidth={2.5} />
        </button>
      )}

      {/* Player pinned to the top so it doesn't cover the CLI's input box at the bottom */}
      <div className="absolute top-0 inset-x-0 h-12 pointer-events-none [&>*]:pointer-events-auto">
        <SpeechPlayerBar speech={speech} />
      </div>

      {notice && (
        <div
          role="status"
          className="absolute top-11 right-3 z-30 px-2 py-1 rounded border-2 border-black text-[11px] font-black bg-[#FFE500] text-black shadow-[2px_2px_0px_#000]"
        >
          {notice}
        </div>
      )}
    </div>
  );
};
