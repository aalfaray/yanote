import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../../src/App';
import { configureLanguage, getLanguage, resolveLanguage, t } from '../../src/lib/i18n';
import { translateEditor } from '../../src/lib/editorTranslation';
import { pickVoice } from '../../src/hooks/useSpeech';
import english from '../../electron/locales/en.json';

vi.mock('../../src/components/Editor', () => ({ Editor: ({ markdown }: any) => <textarea aria-label="Note content" readOnly value={markdown} /> }));
vi.mock('../../src/components/TerminalView', () => ({ TerminalView: () => null }));

describe('Application languages', () => {
  it('detects regional system languages, honors manual choices and falls back to English', () => {
    expect(resolveLanguage('auto', ['es-PE', 'en-US'])).toBe('es');
    expect(resolveLanguage('auto', ['en-GB', 'es-MX'])).toBe('en');
    expect(resolveLanguage('auto', ['fr-FR', 'es-ES'])).toBe('es');
    expect(resolveLanguage('auto', ['ja-JP'])).toBe('en');
    expect(resolveLanguage('es', ['en-US'])).toBe('es');
    expect(resolveLanguage('en', ['es-PE'])).toBe('en');
    configureLanguage('auto', ['en-US']);
    expect(t('Guardar')).toBe('Save');
    expect(document.documentElement.lang).toBe('en');
  });

  it('preserves interpolation values and every translation keeps its placeholders', () => {
    configureLanguage('en');
    expect(t('Mensaje para {0}', ['Guardar {0} <script>'])).toBe('Message for Guardar {0} <script>');
    for (const [source, translated] of Object.entries(english)) {
      expect(translated.match(/\{\d+\}/g)?.sort() || [], source).toEqual(source.match(/\{\d+\}/g)?.sort() || []);
    }
  });

  it('uses English editor tools and voices when English is selected', () => {
    configureLanguage('en');
    expect(translateEditor('toolbar.bold', 'Bold')).toBe('Bold');
    expect(translateEditor('toolbar.blockTypes.heading', 'Heading {{level}}', { level: 2 })).toBe('Heading 2');
    const voices = [{ lang: 'es-PE', localService: true }, { lang: 'en-US', localService: true }] as SpeechSynthesisVoice[];
    expect(pickVoice(voices)?.lang).toBe('en-US');
    configureLanguage('es');
    expect(translateEditor('toolbar.bold', 'Bold')).toBe('Negrita');
  });

  it('switches the app in settings and persists the choice without restarting the chat or changing drafts', async () => {
    let config: any = {
      language: 'es', notesPath: '/notes', alwaysOnTop: false,
      openTabs: [{ kind: 'scratch', title: 'nota.md', content: '# Mi texto en español' }, { kind: 'claude', title: 'Claude' }], activeTabIndex: 1,
    };
    const api = {
      getAppConfig: vi.fn(async () => config),
      getLocaleInfo: vi.fn(async () => ({ preference: config.language, language: config.language, systemLanguages: ['es-PE'] })),
      getNotesPath: vi.fn().mockResolvedValue('/notes'),
      saveAppConfig: vi.fn(async (partial) => { config = { ...config, ...partial }; return config; }),
      claudeStart: vi.fn().mockResolvedValue({ success: true }), claudeStop: vi.fn(),
    };
    window.electronAPI = api as any;
    const view = render(<App />);
    const composer = await screen.findByLabelText('Mensaje para Claude');
    fireEvent.change(composer, { target: { value: 'No traduzcas mi borrador' } });
    fireEvent.click(screen.getByTitle('Configuración'));
    fireEvent.change(await screen.findByLabelText('Idioma de la aplicación'), { target: { value: 'en' } });
    fireEvent.click(screen.getByText('Guardar Ajustes'));
    await screen.findByTitle('Settings');
    expect(getLanguage()).toBe('en');
    expect(config.language).toBe('en');
    expect(screen.getByLabelText('Message for Claude')).toHaveValue('No traduzcas mi borrador');
    expect(api.claudeStart).toHaveBeenCalledTimes(1);
    expect(api.claudeStop).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText('nota.md')[0]);
    expect(screen.getByLabelText('Note content')).toHaveValue('# Mi texto en español');
    view.unmount();
    render(<App />);
    await screen.findByLabelText('Message for Claude');
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
    expect(getLanguage()).toBe('en');
  });

  it('uses the native OS display language on startup rather than a different browser locale', async () => {
    window.electronAPI = {
      getAppConfig: vi.fn().mockResolvedValue({ language: 'auto', openTabs: [] }),
      getLocaleInfo: vi.fn().mockResolvedValue({ preference: 'auto', language: 'en', systemLanguages: ['en-GB'] }),
      getNotesPath: vi.fn().mockResolvedValue('/notes'), saveAppConfig: vi.fn().mockResolvedValue({}),
    } as any;
    render(<App />);
    await waitFor(() => expect(screen.getByTitle('Settings')).toBeInTheDocument());
    expect(getLanguage()).toBe('en');
    await act(async () => configureLanguage('es'));
    expect(screen.getByTitle('Configuración')).toBeInTheDocument();
  });
});
