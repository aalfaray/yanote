/**
 * Reading speed shared by both speech engines.
 *
 * On Windows both engines end up in SAPI, whose rate is a step from -10 to 10 on an
 * exponential scale: +10 reads 3x faster and -10 reads 3x slower (measured with
 * Helena). So a real "x2" is step 10·log3(2) ≈ 6.
 *
 * - Native engine (System.Speech, electron/services/speechService.cjs): sends that step.
 * - Web engine (Chromium): converts utterance.rate with trunc(10·log10(rate)), so x2 only
 *   reached step 3 (1.4x) while the native engine used step 10 (3x). Here we pick the
 *   utterance.rate that Chromium turns into the same step.
 */

/** SAPI step (-10…10) that sounds `rate` times faster than normal. */
export function sapiStepFor(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const step = Math.round((10 * Math.log(rate)) / Math.log(3));
  return Math.max(-10, Math.min(10, step)) || 0;
}

const isWindows = () => typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

/**
 * utterance.rate for the web engine. On Windows it targets the same SAPI step as the
 * native engine (half a step of margin so Chromium's truncation lands on it); elsewhere
 * the browser already treats the rate as a multiplier.
 */
export function webUtteranceRate(rate: number, windows = isWindows()): number {
  if (!windows) return rate;
  const step = sapiStepFor(rate);
  if (step === 0) return 1;
  return Math.pow(10, (step + Math.sign(step) * 0.5) / 10);
}
