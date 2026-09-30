import { expect, test } from '@playwright/test';
import { phase, startMatch, type TestWindow } from './helpers';

/* Casilla del tablero -> coordenadas de página con el escenario a 1280×720 (escala 1). */
const tile = (x: number, y: number) => ({ x: 240 + 100 * x, y: 144 + 84 * y });

test('menú, planificación y un turno completo sin errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await startMatch(page);
  await expect(page.getByRole('button', { name: /Confirmar turno/ })).toBeEnabled();
  await expect(page.getByRole('timer')).toBeVisible();

  // Mover al ninja activo a una casilla alcanzable (fila 1 o 3 de la columna 1).
  const start = await page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    const n = s.match.ninjas.find((x) => x.id === s.active);
    return n ? n.pos : { x: 0, y: 0 };
  });
  const target = tile(1, start.y === 0 ? 1 : start.y - 1);
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(() => page.evaluate(() => Object.keys((window as unknown as TestWindow).__ventisca.getState().plans).length))
    .toBe(1);

  // Deshacer con clic derecho y completar el plan con sugerencias.
  await page.mouse.click(640, 300, { button: 'right' });
  for (let i = 0; i < 3; i++) await page.keyboard.press('s');
  await page.keyboard.press('Space');
  await expect.poll(() => phase(page)).toBe('resolving');
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');

  // Pausa y reanudación.
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Pausa' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('una partida completa con sugerencias llega a resultados @lento', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startMatch(page, 0.15);
  for (let turn = 0; turn < 60; turn++) {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const s = (window as unknown as TestWindow).__ventisca.getState();
            return s.screen === 'results' ? 'results' : s.phase;
          }),
        { timeout: 120_000 },
      )
      .toMatch(/planning|results/);
    if ((await page.getByRole('heading', { name: /Victoria|Derrota/ }).count()) > 0) break;
    for (let i = 0; i < 3; i++) await page.keyboard.press('s');
    await page.keyboard.press('Space');
  }
  await expect(page.getByRole('heading', { name: /Victoria|Derrota/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('colección y tienda: comprar una caja descuenta monedas y suma cartas (R-28)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ventisca:profile:v1',
      JSON.stringify({
        version: 1,
        coins: 500,
        camino: 'snow',
        boxesOpened: 0,
        collection: { 'fire-01': 1, 'water-01': 1, 'snow-01': 1, 'snow-18': 1 },
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Colección', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Colección y tienda' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Nieve/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Comprar caja de 2 cartas de Nieve por 180 monedas' }).click();
  await expect(page.getByRole('dialog', { name: 'Tu caja de Nieve' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir' }).click();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('ventisca:profile:v1') ?? '{}'));
  expect(saved.coins).toBe(320);
  const snowCards = Object.entries(saved.collection as Record<string, number>)
    .filter(([id]) => id.startsWith('snow-'))
    .reduce((sum, [, qty]) => sum + qty, 0);
  expect(snowCards).toBe(4);
  expect(errors).toEqual([]);
});
