import { expect, test } from '@playwright/test';
import { startMatch } from './helpers';

/* Sandbox (PRD de v2): siempre disponible, sin cuenta y sin progreso. */

type DeckWindow = {
  __ventisca: {
    getState(): { match: { ninjas: { id: string; hand: { value: number }[]; deck: { value: number }[] }[] } };
  };
};

test('D-50: en el sandbox cada ninja juega con el mazo de referencia (8, 9, 10, 10, 11 y 12)', async ({ page }) => {
  await startMatch(page);
  const decks = await page.evaluate(() =>
    Object.fromEntries(
      (window as unknown as DeckWindow).__ventisca
        .getState()
        .match.ninjas.map((n) => [n.id, [...n.hand, ...n.deck].map((c) => c.value).sort((a, b) => a - b)]),
    ),
  );
  const reference = [8, 9, 10, 10, 11, 12];
  expect(decks).toEqual({ fire: reference, water: reference, snow: reference });
});

test('D-55: al abrir el juego se descarta el progreso de v1 guardado en el navegador; los ajustes se conservan', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ventisca:profile:v1',
      JSON.stringify({ version: 1, coins: 500, camino: 'snow', boxesOpened: 2, collection: { 'snow-18': 1 } }),
    );
    localStorage.setItem('ventisca:achievements:v1', JSON.stringify({ combo2: '2026-09-29T12:00:00.000Z' }));
    localStorage.setItem('ventisca:settings:v1', JSON.stringify({ pace: 'expert' }));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Jugar', exact: true })).toBeVisible();
  const stored = await page.evaluate(() => ({
    profile: localStorage.getItem('ventisca:profile:v1'),
    achievements: localStorage.getItem('ventisca:achievements:v1'),
    pace: (JSON.parse(localStorage.getItem('ventisca:settings:v1') ?? '{}') as { pace?: string }).pace,
  }));
  expect(stored).toEqual({ profile: null, achievements: null, pace: 'expert' });
});

test('D-34: el sandbox no da progreso: sin camino, sin monedas y sin colección', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Jugar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Colección/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Jugar', exact: true }).click();
  // Sin elegir camino: directo a la pantalla de equipo.
  await expect(page.getByRole('heading', { name: 'Tu equipo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Colección/ })).toHaveCount(0);
  await expect(page.locator('.coin-chip')).toHaveCount(0);
});
