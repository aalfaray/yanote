import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { savePastedImage } = require('../../electron/services/clipboardImageService.cjs');

describe('Backend: clipboard image paste for terminals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-paste-test-'));
  afterEach(() => {
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  });

  it('writes the PNG and returns its path', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const file = savePastedImage(png, dir, 1000);
    expect(file).toBe(path.join(dir, 'imagen-1000.png'));
    expect(fs.readFileSync(file)).toEqual(png);
  });

  it('returns null when there is no image', () => {
    expect(savePastedImage(Buffer.alloc(0), dir)).toBeNull();
    expect(savePastedImage(null, dir)).toBeNull();
  });

  it('removes pasted images older than a day', () => {
    const old = path.join(dir, 'imagen-old.png');
    fs.writeFileSync(old, 'x');
    const twoDaysAgo = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(old, twoDaysAgo, twoDaysAgo);
    savePastedImage(Buffer.from([1]), dir);
    expect(fs.existsSync(old)).toBe(false);
  });
});
