import { createContext } from 'react';
import type { SpeechController } from '../hooks/useSpeech';

export interface SelectionSnapshot {
  text: string;
  node: Node | null;
}

export interface SpeechActions {
  speech: SpeechController;
  /** Captures the current editor selection/caret (must run before focus leaves the editor). */
  captureSelection: () => SelectionSnapshot;
  readAll: () => void;
  readSelection: (snapshot: SelectionSnapshot) => void;
  readParagraph: (snapshot: SelectionSnapshot, toEnd: boolean) => void;
  /** Paragraph-based options need the rich-text view to locate the caret. */
  paragraphsAvailable: boolean;
}

export const SpeechContext = createContext<SpeechActions | null>(null);
