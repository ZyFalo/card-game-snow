import { expect, type Page, test } from '@playwright/test';
import { phase, startMatch, type TestWindow } from './helpers';

/*
 * R-04: al vencer el reloj se juega lo que se alcanzó a planear. Con el GameHost asíncrono
 * el envío devuelve una promesa y el resultado llega después como mensaje del host.
 */

type ClockWindow = TestWindow & { __confirmed: string[][] };

const planned = (page: Page) =>
  page.evaluate(() => Object.keys((window as unknown as TestWindow).__ventisca.getState().plans));

test('R-04: al vencer el reloj se juega lo planeado y empieza el turno siguiente', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Ritmo Experto: 5 s por ninja en pie, 15 s con los tres.
  await page.addInitScript(() => localStorage.setItem('ventisca:settings:v1', JSON.stringify({ pace: 'expert' })));
  await startMatch(page);
  await page.evaluate(() => {
    const w = window as unknown as ClockWindow;
    w.__confirmed = [];
    w.__ventisca.subscribe((s, prev) => {
      if (prev.phase === 'planning' && s.phase === 'resolving') w.__confirmed.push(Object.keys(prev.plans));
    });
  });

  // Se planifica un solo ninja y no se confirma: el turno lo cierra el reloj.
  await page.keyboard.press('s');
  const plans = await planned(page);
  expect(plans).toHaveLength(1);

  await expect
    .poll(() => page.evaluate(() => (window as unknown as ClockWindow).__confirmed), { timeout: 25_000 })
    .toEqual([plans]);
  await expect.poll(() => phase(page)).toBe('planning');
  expect(await page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().match.turn)).toBe(1);
  expect(errors).toEqual([]);
});
