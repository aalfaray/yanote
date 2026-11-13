import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechSegment } from '../lib/speechText';
import { logError } from '../lib/logger';

export type SpeechStatus = 'idle' | 'speaking' | 'paused';
export type SpeechEngine = 'web' | 'native';

export interface SpeechState {
  status: SpeechStatus;
  index: number;
  total: number;
  rate: number;
  engine: SpeechEngine | null;
  error: string | null;
}

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const HIGHLIGHT_ATTR = 'data-tts-active';

const getSynth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
    ? window.speechSynthesis
    : null;

const hasNativeEngine = () => typeof window !== 'undefined' && typeof window.electronAPI?.ttsSpeak === 'function';

/** Waits briefly for voices to load (Chromium fills them asynchronously). */
function loadVoices(synth: SpeechSynthesis, timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const voices = synth.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener?.('voiceschanged', done);
  });
}

/** Prefers a local Spanish voice, like the System.Speech script does. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  return spanish.find((v) => v.localService) ?? spanish[0] ?? voices.find((v) => v.default) ?? voices[0] ?? null;
}

const RATE_STORAGE_KEY = 'yanote.speech.rate';

/** Reading speed picked last time (shared by notes, chats and terminals). */
export function loadSpeechRate(): number {
  try {
    const saved = Number(localStorage.getItem(RATE_STORAGE_KEY));
    return (SPEECH_RATES as readonly number[]).includes(saved) ? saved : 1;
  } catch (err) {
    logError('useSpeech.loadSpeechRate', err);
    return 1;
  }
}

function saveSpeechRate(rate: number) {
  try {
    localStorage.setItem(RATE_STORAGE_KEY, String(rate));
  } catch (err) {
    // storage unavailable: it just won't be remembered
    logError('useSpeech.saveSpeechRate', err, { rate });
  }
}

function clearHighlight() {
  document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => el.removeAttribute(HIGHLIGHT_ATTR));
}

export function useSpeech() {
  const [state, setState] = useState<SpeechState>({
    status: 'idle',
    index: 0,
    total: 0,
    rate: loadSpeechRate(),
    engine: null,
    error: null,
  });

  const segmentsRef = useRef<SpeechSegment[]>([]);
  const indexRef = useRef(0);
  const rateRef = useRef(state.rate);
  const runRef = useRef(0); // bumping it invalidates callbacks from older runs
  const engineRef = useRef<SpeechEngine | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const showSegment = useCallback((index: number, status: SpeechStatus = 'speaking') => {
    indexRef.current = index;
    clearHighlight();
    const el = segmentsRef.current[index]?.el;
    if (el && el.isConnected) {
      el.setAttribute(HIGHLIGHT_ATTR, 'true');
      el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
    setState((s) => ({ ...s, status, index, total: segmentsRef.current.length, engine: engineRef.current, error: null }));
  }, []);

  const halt = useCallback(() => {
    runRef.current += 1;
    getSynth()?.cancel();
    void window.electronAPI?.ttsStop?.();
  }, []);

  const finish = useCallback((error: string | null = null) => {
    runRef.current += 1;
    clearHighlight();
    setState((s) => ({ ...s, status: 'idle', error }));
  }, []);

  const speakNative = useCallback(
    (index: number, run: number) => {
      showSegment(index);
      const texts = segmentsRef.current.slice(index).map((s) => s.text);
      window.electronAPI!.ttsSpeak!({ id: run, segments: texts, start: index, rate: rateRef.current }).catch((err: Error) => {
        if (run === runRef.current) finish(err.message);
      });
    },
    [showSegment, finish]
  );

  const speakWeb = useCallback(
    function speakFrom(index: number, run: number) {
      const synth = getSynth();
      if (!synth || run !== runRef.current) return;
      if (index >= segmentsRef.current.length) {
        finish();
        return;
      }
      showSegment(index);
      const utterance = new SpeechSynthesisUtterance(segmentsRef.current[index].text);
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
        utterance.lang = voiceRef.current.lang;
      } else {
        utterance.lang = 'es-ES';
      }
      utterance.rate = rateRef.current;
      utterance.onend = () => {
        if (run === runRef.current) speakFrom(index + 1, run);
      };
      utterance.onerror = (event) => {
        if (run !== runRef.current || event.error === 'interrupted' || event.error === 'canceled') return;
        if (hasNativeEngine()) {
          // Chromium voice failed: continue with Windows System.Speech from the same paragraph.
          engineRef.current = 'native';
          runRef.current += 1;
          speakNative(index, runRef.current);
        } else {
          finish(`Error de voz: ${event.error}`);
        }
      };
      synth.speak(utterance);
    },
    [showSegment, finish, speakNative]
  );

  const startAt = useCallback(
    async (index: number) => {
      halt();
      const run = runRef.current;
      if (segmentsRef.current.length === 0) {
        finish('No hay texto para leer.');
        return;
      }
      const target = Math.max(0, Math.min(index, segmentsRef.current.length - 1));

      if (engineRef.current === null) {
        const synth = getSynth();
        const voices = synth ? await loadVoices(synth) : [];
        if (run !== runRef.current) return;
        if (voices.length > 0) {
          engineRef.current = 'web';
          voiceRef.current = pickVoice(voices);
        } else if (hasNativeEngine()) {
          engineRef.current = 'native';
        } else {
          finish('No hay voces de síntesis disponibles en este sistema.');
          return;
        }
      }

      if (engineRef.current === 'web') speakWeb(target, run);
      else speakNative(target, run);
    },
    [halt, finish, speakWeb, speakNative]
  );

  /** Starts reading the given segments from `startIndex`. */
  const play = useCallback(
    (segments: SpeechSegment[], startIndex = 0) => {
      segmentsRef.current = segments.filter((s) => s.text.trim().length > 0);
      // Another reader (note, chat, terminal) may have changed the speed since this one mounted
      const rate = loadSpeechRate();
      rateRef.current = rate;
      setState((s) => (s.rate === rate ? s : { ...s, rate }));
      void startAt(startIndex);
    },
    [startAt]
  );

  const stop = useCallback(() => {
    halt();
    finish();
  }, [halt, finish]);

  const pause = useCallback(() => {
    const synth = getSynth();
    if (engineRef.current === 'web' && synth) {
      synth.pause();
    } else {
      // System.Speech runs in a separate process: stop it and resume from the same paragraph.
      halt();
    }
    setState((s) => ({ ...s, status: 'paused' }));
  }, [halt]);

  const resume = useCallback(() => {
    const synth = getSynth();
    if (engineRef.current === 'web' && synth?.paused) {
      synth.resume();
      setState((s) => ({ ...s, status: 'speaking' }));
    } else {
      void startAt(indexRef.current);
    }
  }, [startAt]);

  const next = useCallback(() => void startAt(indexRef.current + 1), [startAt]);
  const previous = useCallback(() => void startAt(indexRef.current - 1), [startAt]);

  const setRate = useCallback(
    (rate: number) => {
      rateRef.current = rate;
      saveSpeechRate(rate);
      setState((s) => ({ ...s, rate }));
      // Rate only applies to new utterances: restart the current paragraph.
      if (state.status === 'speaking') void startAt(indexRef.current);
    },
    [state.status, startAt]
  );

  // Progress events from the native (PowerShell) engine
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onTtsEvent?.((event) => {
      if (event.id !== runRef.current) return;
      if (event.type === 'segment') showSegment(event.index);
      else if (event.type === 'end') finish();
      else finish(event.message);
    });
    return () => unsubscribe?.();
  }, [showSegment, finish]);

  // Stop reading when the editor unmounts (tab switch, theme change, etc.)
  useEffect(() => () => {
    runRef.current += 1;
    getSynth()?.cancel();
    void window.electronAPI?.ttsStop?.();
    clearHighlight();
  }, []);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { state, play, stop, pause, resume, next, previous, setRate, clearError };
}

export type SpeechController = ReturnType<typeof useSpeech>;
