/** Native spelling ranges stay in Chromium, preserving the draft, cursor and undo history. */
function createSpellcheckService({ now = Date.now } = {}) {
  const contexts = new WeakMap();
  let nextRequest = 0;
  function configure(ses, language = 'es', platform = process.platform) {
    ses.setSpellCheckerEnabled(true);
    if (platform !== 'darwin') {
      const available = ses.availableSpellCheckerLanguages || [];
      const spanish = ['es', 'es-ES', 'es-MX'].find((lang) => available.includes(lang)) || available.find((lang) => lang.startsWith('es'));
      const english = ['en-US', 'en-GB', 'en'].find((lang) => available.includes(lang));
      const selected = language === 'en' ? english : spanish;
      const languages = selected ? [selected] : [];
      if (languages.length) ses.setSpellCheckerLanguages(languages);
    }
  }
  function attach(contents, platform = process.platform, language = 'es') {
    configure(contents.session, language, platform);
    contents.on('context-menu', (_event, params) => {
      const requestId = ++nextRequest;
      const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions.filter((s) => typeof s === 'string').slice(0, 8) : [];
      const word = params.isEditable ? params.misspelledWord || '' : '';
      contexts.set(contents, { requestId, suggestions: word ? suggestions : [], at: now() });
      contents.send('spelling:context', { requestId, x: params.x, y: params.y, word, suggestions: word ? suggestions : [] });
    });
    contents.on('did-start-navigation', () => contexts.delete(contents));
  }
  function replace(contents, requestId, suggestion) {
    const context = contexts.get(contents);
    if (!context || context.requestId !== requestId || now() - context.at > 60_000 || !context.suggestions.includes(suggestion)) return false;
    contexts.delete(contents);
    contents.replaceMisspelling(suggestion);
    return true;
  }
  return { attach, replace, configure };
}

module.exports = { createSpellcheckService };
