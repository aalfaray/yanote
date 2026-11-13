import { useEffect, useRef } from 'react';
import { READ_ALOUD_EVENT, type ReadAloudRequest } from '../lib/readAloud';
import { plainTextToSegments } from '../lib/speechText';
import { logError } from '../lib/logger';

/**
 * Plays the text of "Leer en voz alta" requests addressed to this tab, with the view's own
 * player (so pause / next / speed work as usual).
 */
export function useReadAloudRequests(tabId: string, play: (segments: { text: string }[]) => void) {
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  useEffect(() => {
    const onRequest = (e: Event) => {
      try {
        const detail = (e as CustomEvent<ReadAloudRequest>).detail;
        if (!detail || detail.targetId !== tabId) return;
        const segments = plainTextToSegments(detail.text).map((text) => ({ text }));
        if (segments.length) playRef.current(segments);
      } catch (err) {
        logError('useReadAloudRequests.onRequest', err, { tabId });
      }
    };
    window.addEventListener(READ_ALOUD_EVENT, onRequest);
    return () => window.removeEventListener(READ_ALOUD_EVENT, onRequest);
  }, [tabId]);
}
