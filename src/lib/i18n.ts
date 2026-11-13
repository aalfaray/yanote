import { useSyncExternalStore } from 'react';
import english from '../../electron/locales/en.json';

export type Language = 'es' | 'en';
export type LanguagePreference = Language | 'auto';
export interface LocaleInfo { preference: LanguagePreference; language: Language; systemLanguages: string[] }
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
let systemLanguages = typeof navigator === 'undefined' ? ['en'] : [...(navigator.languages?.length ? navigator.languages : [navigator.language])];
let preference: LanguagePreference = 'auto';
export function resolveLanguage(value: LanguagePreference, languages: readonly string[]): Language {
  if (value !== 'auto') return value;
  for (const tag of languages) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === 'es' || language === 'en') return language;
  }
  return 'en';
}
let language = resolveLanguage(preference, systemLanguages);
export const getLanguage = () => language;
export const getLanguagePreference = () => preference;
export const getSystemLanguages = () => systemLanguages;
export function configureLanguage(value: LanguagePreference = 'auto', languages = systemLanguages) {
  preference = ['es', 'en', 'auto'].includes(value) ? value : 'auto';
  systemLanguages = languages;
  language = resolveLanguage(preference, systemLanguages);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
export function t(source: string, values: readonly unknown[] = []): string {
  const translated = language === 'en' ? (english as Record<string, string>)[source] || source : source;
  return translated.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)]) : match);
}
