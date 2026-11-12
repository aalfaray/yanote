import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useSpeech, pickVoice } from '../../src/hooks/useSpeech';
import { SpeechPlayerBar, SpeechToolbarButton } from '../../src/components/SpeechControls';
import { SpeechContext, type SpeechActions } from '../../src/components/speechContext';

class FakeUtterance {
  text: string;
  rate = 1;
  lang = '';
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const spoken: FakeUtterance[] = [];
const defaultVoices = [
  { name: 'English', lang: 'en-US', localService: true, default: true },
  { name: 'Sabina', lang: 'es-MX', localService: true, default: false },
];
const synth = {
  paused: false,
  getVoices: vi.fn(() => defaultVoices as unknown[]),
  speak: vi.fn((u: FakeUtterance) => {
    spoken.push(u);
  }),
  cancel: vi.fn(),
  pause: vi.fn(() => {
    synth.paused = true;
  }),
  resume: vi.fn(() => {
    synth.paused = false;
  }),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const lastUtterance = () => spoken[spoken.length - 1];

function Harness({ actions }: { actions?: Partial<SpeechActions> }) {
  const speech = useSpeech();
  const value: SpeechActions = {
    speech,
    captureSelection: () => ({ text: '', node: null }),
    readAll: () => speech.play([{ text: 'Uno' }, { text: 'Dos' }, { text: 'Tres' }]),
    readSelection: () => {},
    readParagraph: () => {},
    paragraphsAvailable: true,
    ...actions,
  };
  return (
    <SpeechContext.Provider value={value}>
      <SpeechToolbarButton />
      <SpeechPlayerBar speech={speech} />
    </SpeechContext.Provider>
  );
}

beforeEach(() => {
  spoken.length = 0;
  synth.paused = false;
  vi.clearAllMocks();
  synth.getVoices.mockImplementation(() => defaultVoices);
  (window as any).speechSynthesis = synth;
  (globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
});

afterEach(() => {
  delete (window as any).speechSynthesis;
  delete (globalThis as any).SpeechSynthesisUtterance;
  delete (window as any).electronAPI;
});

const openMenu = () => {
  const button = screen.getByTestId('speech-toolbar-button');
  fireEvent.mouseDown(button);
  fireEvent.click(button);
};

describe('Text to speech controls', () => {
  it('prefers a local Spanish voice', () => {
    expect(pickVoice(defaultVoices as any)?.name).toBe('Sabina');
  });

  it('menu disables selection/paragraph options when nothing is selected', () => {
    render(<Harness actions={{ paragraphsAvailable: false }} />);
    openMenu();
    expect(screen.getByTestId('speech-menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Leer todo/ })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /Leer selección/ })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /párrafo actual/ })).toBeDisabled();
    expect(screen.getByText(/vista enriquecida/)).toBeInTheDocument();
  });

  it('passes the captured selection to "Leer selección"', () => {
    const readSelection = vi.fn();
    const node = document.createTextNode('x');
    render(<Harness actions={{ captureSelection: () => ({ text: 'Texto elegido', node }), readSelection }} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Leer selección/ }));
    expect(readSelection).toHaveBeenCalledWith({ text: 'Texto elegido', node });
    expect(screen.queryByTestId('speech-menu')).not.toBeInTheDocument();
  });

  it('reads all paragraphs in order with the player bar, then hides it', async () => {
    render(<Harness />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Leer todo/ }));

    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(lastUtterance().text).toBe('Uno');
    expect((lastUtterance().voice as any).name).toBe('Sabina');
    expect(screen.getByTestId('speech-player')).toHaveTextContent('1/3');

    act(() => lastUtterance().onend!());
    expect(lastUtterance().text).toBe('Dos');
    expect(screen.getByTestId('speech-player')).toHaveTextContent('2/3');

    act(() => lastUtterance().onend!());
    act(() => lastUtterance().onend!());
    expect(screen.queryByTestId('speech-player')).not.toBeInTheDocument();
  });

  it('supports pause, resume, next, previous, rate and stop', async () => {
    render(<Harness />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Leer todo/ }));
    await waitFor(() => expect(spoken).toHaveLength(1));

    fireEvent.click(screen.getByLabelText('Pausar'));
    expect(synth.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Reanudar'));
    expect(synth.resume).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Párrafo siguiente'));
    await waitFor(() => expect(lastUtterance().text).toBe('Dos'));
    fireEvent.click(screen.getByLabelText('Párrafo anterior'));
    await waitFor(() => expect(lastUtterance().text).toBe('Uno'));

    fireEvent.click(screen.getByLabelText('Cambiar velocidad'));
    await waitFor(() => expect(lastUtterance().rate).toBe(1.25));

    // A finished utterance from an older run must not advance the queue
    const count = spoken.length;
    act(() => spoken[0].onend!());
    expect(spoken).toHaveLength(count);

    fireEvent.click(screen.getByLabelText('Detener'));
    expect(synth.cancel).toHaveBeenCalled();
    expect(screen.queryByTestId('speech-player')).not.toBeInTheDocument();
  });

  it('falls back to native System.Speech when there are no web voices', async () => {
    synth.getVoices.mockImplementation(() => []);
    let emit: (e: any) => void = () => {};
    const ttsSpeak = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = {
      ttsSpeak,
      ttsStop: vi.fn().mockResolvedValue(true),
      onTtsEvent: (cb: (e: any) => void) => {
        emit = cb;
        return () => {};
      },
    };

    render(<Harness />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Leer todo/ }));
    await waitFor(() => expect(ttsSpeak).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const request = ttsSpeak.mock.calls[0][0];
    expect(request).toMatchObject({ segments: ['Uno', 'Dos', 'Tres'], start: 0, rate: 1 });

    act(() => emit({ id: request.id, type: 'segment', index: 2 }));
    expect(screen.getByTestId('speech-player')).toHaveTextContent('3/3');
    act(() => emit({ id: request.id + 99, type: 'end' })); // stale run: ignored
    expect(screen.getByTestId('speech-player')).toBeInTheDocument();
    act(() => emit({ id: request.id, type: 'end' }));
    expect(screen.queryByTestId('speech-player')).not.toBeInTheDocument();
  });

  it('shows an error when no engine is available', async () => {
    delete (window as any).speechSynthesis;
    render(<Harness />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Leer todo/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay voces');
  });
});
