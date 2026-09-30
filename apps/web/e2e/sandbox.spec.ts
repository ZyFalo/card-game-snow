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
