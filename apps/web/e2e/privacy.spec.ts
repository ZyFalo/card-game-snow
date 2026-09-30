import { expect, test } from '@playwright/test';
import { startMatch } from './helpers';

/*
 * Privacidad: jugar sin cuenta no le envía nada a otras empresas. Hasta las fuentes vienen del
 * propio juego (antes llegaban de Google Fonts, que recibía la IP en cada visita).
 */
test('abrir el juego y jugar un turno no pide nada a otros dominios', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:5174').origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== origin) foreign.push(url);
  });
  await startMatch(page);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
  expect(foreign).toEqual([]);
});

test('las fuentes del juego están disponibles, con todos sus pesos y el ∞ del reloj', async ({ page }) => {
  await page.goto('/');
  const faces = await page.evaluate(async () => {
    const wanted: [string, string][] = [
      ['400 16px "Dela Gothic One"', 'Ventisca'],
      ['18px "Dela Gothic One"', '∞'],
      ['400 16px "Zen Kaku Gothic New"', 'ñandú'],
      ['500 16px "Zen Kaku Gothic New"', 'ñandú'],
      ['700 16px "Zen Kaku Gothic New"', 'ñandú'],
      ['900 16px "Zen Kaku Gothic New"', 'ñandú'],
    ];
    const out: Record<string, number> = {};
    for (const [font, text] of wanted) out[`${font} · ${text}`] = (await document.fonts.load(font, text)).length;
    return out;
  });
  for (const [font, count] of Object.entries(faces)) expect(count, font).toBeGreaterThan(0);
});
