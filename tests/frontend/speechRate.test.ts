import { describe, it, expect } from 'vitest';
import { sapiStepFor, webUtteranceRate } from '../../src/lib/speechRate';

const { toSapiRate } = require('../../electron/services/speechService.cjs');

// Chromium on Windows: SAPI step = trunc(10 * log10(utterance.rate)), rate clamped to 0.1–10
const chromiumStep = (rate: number) => Math.trunc(10 * Math.log10(Math.min(10, Math.max(0.1, rate))));

describe('speechRate: same speed in both engines', () => {
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  it('the native engine and the shared helper pick the same SAPI step', () => {
    for (const rate of RATES) expect(toSapiRate(rate)).toBe(sapiStepFor(rate));
  });

  it('on Windows, Chromium turns the web utterance rate into that same step', () => {
    for (const rate of RATES) expect(chromiumStep(webUtteranceRate(rate, true))).toBe(sapiStepFor(rate));
  });

  it('each label sounds close to its multiplier (SAPI: +10 = 3x)', () => {
    for (const rate of [0.75, 1.25, 1.5, 2]) {
      const real = Math.pow(3, sapiStepFor(rate) / 10);
      expect(Math.abs(real - rate) / rate).toBeLessThan(0.06);
    }
  });

  it('outside Windows the rate is passed through unchanged', () => {
    expect(webUtteranceRate(2, false)).toBe(2);
    expect(webUtteranceRate(1, true)).toBe(1);
  });
});
