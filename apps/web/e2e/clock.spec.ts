import { expect, type Page, test } from '@playwright/test';
import { phase, startMatch, type TestWindow } from './helpers';

/*
 * R-04: al vencer el reloj se juega lo que se alcanzó a planear. Con el GameHost asíncrono
 * el envío devuelve una promesa y el resultado llega después como mensaje del host.
 */

type ClockWindow = TestWindow & { __confirmed: string[][] };

const planned = (page: Page) =>
  page.evaluate(() => Object.keys((window as unknown as TestWindow).__ventisca.getState().plans));

/* Casilla del tablero -> coordenadas de página con el escenario a 1280×720 (escala 1). */
const tile = (x: number, y: number) => ({ x: 240 + 100 * x, y: 144 + 84 * y });

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

  // Se planifica un solo ninja y no se confirma: el turno lo cierra el reloj. Se mueve a una
  // casilla alcanzable en vez de pedir una sugerencia, que a veces es quedarse quieto sin acción.
  const start = await page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    return s.match.ninjas.find((n) => n.id === s.active)?.pos ?? { x: 0, y: 0 };
  });
  const target = tile(1, start.y === 0 ? 1 : start.y - 1);
  await page.mouse.click(target.x, target.y);
  await expect.poll(() => planned(page)).toHaveLength(1);
  const plans = await planned(page);

  await expect
    .poll(() => page.evaluate(() => (window as unknown as ClockWindow).__confirmed), { timeout: 25_000 })
    .toEqual([plans]);
  await expect.poll(() => phase(page)).toBe('planning');
  expect(await page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().match.turn)).toBe(1);
  expect(errors).toEqual([]);
});
