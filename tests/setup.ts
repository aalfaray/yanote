import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { configureLanguage } from '../src/lib/i18n';

// Keep existing Spanish assertions independent of the host machine's display language.
configureLanguage('auto', ['es-PE']);
beforeEach(() => configureLanguage('auto', ['es-PE']));

// Global mocks for JSDOM
if (typeof window !== 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.matchMedia = window.matchMedia || function () {
    return {
      matches: false,
      addListener: function () {},
      removeListener: function () {},
      addEventListener: function () {},
      removeEventListener: function () {},
    };
  };

  // Mock confirm and alert
  window.confirm = () => true;
  window.alert = () => {};

  // Mock DOM scroll methods for JSDOM
  if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
    Element.prototype.scrollBy = Element.prototype.scrollBy || function () {};
  }
}
