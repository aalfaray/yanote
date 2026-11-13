const english = require('../locales/en.json');
const normalizeLanguage = (value) => ['auto', 'es', 'en'].includes(value) ? value : 'auto';

function resolveLanguage(preference, systemLanguages = []) {
  if (preference === 'es' || preference === 'en') return preference;
  for (const tag of systemLanguages) {
    const code = String(tag).toLowerCase().split(/[-_]/)[0];
    if (code === 'es' || code === 'en') return code;
  }
  return 'en';
}

function translate(source, language, values = []) {
  const text = language === 'en' ? english[source] || source : source;
  return text.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}

function createLanguageService({ getPreference, getSystemLanguages }) {
  const info = () => {
    const preference = normalizeLanguage(getPreference());
    const systemLanguages = getSystemLanguages();
    return { preference, language: resolveLanguage(preference, systemLanguages), systemLanguages };
  };
  return { info, t: (source, values) => translate(source, info().language, values) };
}

module.exports = { normalizeLanguage, resolveLanguage, translate, createLanguageService };
