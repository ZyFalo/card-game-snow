import { expect, test } from '@playwright/test';
import { startBoard, startMatch } from './helpers';

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
  await expect(page.getByRole('button', { name: 'Jugar sin cuenta', exact: true })).toBeVisible();
  const stored = await page.evaluate(() => ({
    profile: localStorage.getItem('ventisca:profile:v1'),
    achievements: localStorage.getItem('ventisca:achievements:v1'),
    pace: (JSON.parse(localStorage.getItem('ventisca:settings:v1') ?? '{}') as { pace?: string }).pace,
  }));
  expect(stored).toEqual({ profile: null, achievements: null, pace: 'expert' });
});

test('D-34: el sandbox no da progreso: sin camino, sin monedas y sin colección', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Jugar sin cuenta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Colección/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Jugar sin cuenta', exact: true }).click();
  // Sin elegir camino: directo a la pantalla de equipo.
  await expect(page.getByRole('heading', { name: 'Tu equipo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Colección/ })).toHaveCount(0);
  await expect(page.locator('.coin-chip')).toHaveCount(0);
});

test('D-106: sin cuenta, con el mazo en 0 y la mano vacía, la mano dice que se acabaron las cartas de ese ninja', async ({
  page,
}) => {
  const panel = (ninja: string) => page.locator(`[data-ninja-panel="${ninja}"]`);
  // A Brasa no le queda nada; a Marea se le acabó el mazo, pero tiene una carta en la mano; Escarcha, con su mazo.
  await startBoard(page, {
    ninjas: {
      fire: { at: [1, 1], deck: 0 },
      water: { at: [1, 2], deck: 0, hand: [9] },
      snow: { at: [1, 3] },
    },
    golems: [{ kind: 'colossus', at: [8, 2] }],
  });
  await panel('fire').click();
  const note = page.locator('.deck-out');
  await expect(note).toHaveAttribute('data-deck-out', 'local');
  await expect(note).toHaveText(
    'Se acabaron las cartas de Brasa en esta partida.El medidor ya no da cartas. Sigue con ataques, curas y revivir.',
  );
  await expect(page.locator('.hand-empty')).toHaveCount(0);
  await expect(panel('fire').locator('.deck-zero')).toHaveText('Mazo 0');
  await expect(panel('fire').locator('.meter')).toHaveClass(/off/);
  await expect(panel('fire').locator('.meter')).toHaveAttribute('title', 'El medidor ya no da cartas.');
  // El aviso cabe en el lugar de las cartas, sin taparse con nada ni salirse de la pantalla.
  await expect(note).toBeInViewport({ ratio: 1 });

  // Con una carta en la mano, la mano la muestra; el panel sigue diciendo que el mazo se acabó.
  await panel('water').click();
  await expect(note).toHaveCount(0);
  await expect(page.locator('.hand .card')).toHaveCount(1);
  await expect(panel('water').locator('.deck-zero')).toHaveText('Mazo 0');
  await expect(panel('water').locator('.meter')).toHaveClass(/off/);

  // Con cartas en el mazo, la mano vacía dice cómo se ganan, y el panel no cambia.
  await panel('snow').click();
  await expect(note).toHaveCount(0);
  await expect(page.locator('.hand-empty')).toHaveText('Llena el medidor para ganar cartas');
  await expect(panel('snow').locator('.deck-zero')).toHaveCount(0);
  await expect(panel('snow').locator('.meter')).not.toHaveClass(/off/);
});
