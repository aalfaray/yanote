import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from './fixtures.ts';

const test = base.extend({
  dataDir: async ({ dataDir }, provide) => {
    fs.writeFileSync(path.join(dataDir, 'app-config.json'), JSON.stringify({
      language: 'es',
      openTabs: Array.from({ length: 20 }, (_, i) => ({
        kind: 'scratch', title: `scroll-${i}.md`,
        content: Array.from({ length: 250 }, (_, line) => `Párrafo ${line}: prueba de desplazamiento.`).join('\n\n'),
      })),
      activeTabIndex: 0,
    }));
    await provide(dataDir);
  },
});

test('Alt acelera el editor y soltarlo restaura el scroll normal', async ({ yanote }) => {
  const page = yanote.window;
  const editor = page.getByRole('textbox', { name: 'markdown editable' });
  await expect(editor).toBeVisible();
  await editor.evaluate((node) => {
    for (let el: typeof node | null = node; el; el = el.parentElement) {
      if (/auto|scroll/.test(node.ownerDocument.defaultView!.getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) {
        el.dataset.e2eScroll = 'true';
        el.scrollTop = 0;
        return;
      }
    }
    throw new Error('No scrollable editor found');
  });
  const scroller = page.locator('[data-e2e-scroll]');
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const position = () => scroller.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 80);
  await expect.poll(position).toBe(80);
  await page.keyboard.down('Alt');
  try {
    await page.mouse.wheel(0, 80);
    await expect.poll(position).toBe(480);
    await page.mouse.wheel(0, -80);
    await expect.poll(position).toBe(80);
  } finally {
    await page.keyboard.up('Alt');
  }
  await page.mouse.wheel(0, 80);
  await expect.poll(position).toBe(160);
});

test('Alt también acelera el desplazamiento horizontal de las pestañas', async ({ yanote }) => {
  const page = yanote.window;
  const strip = page.locator('[data-horizontal-wheel]');
  await expect(strip).toBeVisible();
  await strip.evaluate((el) => { el.style.scrollBehavior = 'auto'; el.scrollLeft = 0; });
  const box = (await strip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const position = () => strip.evaluate((el) => el.scrollLeft);
  await page.mouse.wheel(0, 40);
  await expect.poll(position).toBe(40);
  await page.keyboard.down('Alt');
  try {
    await page.mouse.wheel(0, 40);
    await expect.poll(position).toBe(240);
  } finally {
    await page.keyboard.up('Alt');
  }
  await page.mouse.wheel(0, 40);
  await expect.poll(position).toBe(280);
});
