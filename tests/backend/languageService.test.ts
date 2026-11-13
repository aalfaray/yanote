import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
const { createLanguageService, resolveLanguage } = require('../../electron/services/languageService.cjs');
const { loadConfig, saveConfig } = require('../../electron/services/configService.cjs');
const { createSpellcheckService } = require('../../electron/services/spellcheckService.cjs');

describe('Native system and saved language', () => {
  it('detects system display preferences and updates the chosen language dynamically', () => {
    let preference = 'auto';
    const language = createLanguageService({ getPreference: () => preference, getSystemLanguages: () => ['en-US', 'es-PE'] });
    expect(language.info()).toMatchObject({ preference: 'auto', language: 'en' });
    expect(language.t('Guardar como')).toBe('Save as');
    preference = 'es';
    expect(language.t('Guardar como')).toBe('Guardar como');
    expect(resolveLanguage('auto', ['es-PE'])).toBe('es');
    expect(resolveLanguage('auto', ['de-DE'])).toBe('en');
  });

  it('persists explicit choices and defaults missing or invalid preferences to automatic', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanote-language-'));
    const file = path.join(dir, 'config.json');
    try {
      expect(loadConfig(file, dir).language).toBe('auto');
      for (const language of ['en', 'es', 'auto']) {
        saveConfig(file, {}, { language });
        expect(loadConfig(file, dir).language).toBe(language);
      }
      saveConfig(file, {}, { language: 'invalid' });
      expect(loadConfig(file, dir).language).toBe('auto');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('switches the spelling dictionary to the selected app language', () => {
    let languages: string[] = [];
    const session = { availableSpellCheckerLanguages: ['es', 'en-US'], setSpellCheckerEnabled() {}, setSpellCheckerLanguages(value: string[]) { languages = value; } };
    const spelling = createSpellcheckService();
    spelling.configure(session, 'en', 'win32');
    expect(languages).toEqual(['en-US']);
    spelling.configure(session, 'es', 'win32');
    expect(languages).toEqual(['es']);
  });
});
