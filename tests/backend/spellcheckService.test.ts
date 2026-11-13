import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
const { createSpellcheckService } = require('../../electron/services/spellcheckService.cjs');

function setup() {
  const contents: any = new EventEmitter();
  contents.session = { availableSpellCheckerLanguages: ['es', 'es-MX', 'en-US'], setSpellCheckerEnabled: vi.fn(), setSpellCheckerLanguages: vi.fn() };
  contents.send = vi.fn();
  contents.replaceMisspelling = vi.fn();
  const service = createSpellcheckService();
  service.attach(contents, 'win32');
  return { contents, service };
}
const context = { isEditable: true, spellcheckEnabled: true, misspelledWord: 'escripta', dictionarySuggestions: ['escrita', 'escrito'], x: 30, y: 50 };

describe('Native chat spelling', () => {
  it('enables Spanish spelling and forwards native suggestions', () => {
    const { contents } = setup();
    expect(contents.session.setSpellCheckerEnabled).toHaveBeenCalledWith(true);
    expect(contents.session.setSpellCheckerLanguages).toHaveBeenCalledWith(['es']);
    contents.emit('context-menu', {}, context);
    expect(contents.send).toHaveBeenCalledWith('spelling:context', { requestId: 1, x: 30, y: 50, word: 'escripta', suggestions: ['escrita', 'escrito'] });
  });

  it('keeps native suggestions even when Electron reports spellcheckEnabled=false', () => {
    const { contents } = setup();
    contents.emit('context-menu', {}, { ...context, spellcheckEnabled: false });
    expect(contents.send).toHaveBeenCalledWith('spelling:context', expect.objectContaining({ word: 'escripta', suggestions: ['escrita', 'escrito'] }));
  });

  it('only accepts a suggestion for the current native context, once, and on the same webContents', () => {
    const { contents, service } = setup();
    contents.emit('context-menu', {}, context);
    expect(service.replace(contents, 1, 'arbitrary replacement')).toBe(false);
    expect(service.replace({}, 1, 'escrita')).toBe(false);
    expect(service.replace(contents, 1, 'escrita')).toBe(true);
    expect(contents.replaceMisspelling).toHaveBeenCalledWith('escrita');
    expect(service.replace(contents, 1, 'escrito')).toBe(false);
    contents.emit('context-menu', {}, context);
    contents.emit('context-menu', {}, { ...context, misspelledWord: '', dictionarySuggestions: [] });
    expect(service.replace(contents, 2, 'escrita')).toBe(false);
  });

  it('invalidates spelling contexts when the page navigates', () => {
    const { contents, service } = setup();
    contents.emit('context-menu', {}, context);
    contents.emit('did-start-navigation');
    expect(service.replace(contents, 1, 'escrita')).toBe(false);
  });
});
