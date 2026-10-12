import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  type Board,
  clippedElements,
  savedSettings,
  smallText,
  startBoard,
  type TestState,
  type TestWindow,
} from './helpers';

/*
 * Consejos en el momento (D-80): cuatro consejos, cada uno una sola vez, en una burbuja que va siempre en
 * el mismo lugar, junto a la mano, nunca sobre el tablero. Lo que señala lleva el borde dorado: el panel
 * del ninja o la carta. Se cierran con "Entendido".
 */

/* Casilla del tablero -> coordenadas de página con el escenario a 1280×720 (escala 1). */
const tile = (x: number, y: number) => ({ x: 240 + 100 * x, y: 144 + 84 * y });
const click = (page: Page, x: number, y: number) => page.mouse.click(tile(x, y).x, tile(x, y).y);

/** El marco del tablero con su sombra, a 1280×720: lo que una burbuja nunca puede tapar. */
const FRAME = { left: 178, top: 90, right: 1104, bottom: 540 };

/** Los tres ninjas en la columna 1 y un gólem lejos: nadie alcanza a nadie, y nadie tiene cartas. */
const QUIET: Board = {
  ninjas: { fire: { at: [1, 1] }, water: { at: [1, 2] }, snow: { at: [1, 3] } },
  golems: [{ kind: 'colossus', at: [8, 0] }],
};
const withHands = (hands: Partial<Record<'fire' | 'water' | 'snow', number[]>>): Board => ({
  ...QUIET,
  ninjas: {
    fire: { at: [1, 1], hand: hands.fire ?? [] },
    water: { at: [1, 2], hand: hands.water ?? [] },
    snow: { at: [1, 3], hand: hands.snow ?? [] },
  },
});

const SWITCH = (name: string) => `${name} ya tiene su plan. Elige otro ninja con un clic o con Tab.`;
const FIRST_CARD =
  'Tu primera carta. Elígela con un clic (o la tecla 1) y colócala en una casilla roja. El ▶ junto al título muestra qué hace.';
const COMBO = 'Dos ninjas tienen carta. Si las juegan en el mismo turno, donde sea, hay combo.';
const FALL = (fallen: string, active: string) =>
  `${fallen} cayó. Mueve a ${active} junto a él para revivirlo. Se levanta al final del turno: protege a quien lo revive.`;
const PLAN_TIP = (name: string) => `Elige a dónde se mueve ${name}, o un objetivo desde donde está.`;

const bubble = (page: Page) => page.locator('.bubble');
const text = (page: Page) => bubble(page).locator('p');
const understood = (page: Page) => bubble(page).getByRole('button', { name: 'Entendido' });
const state = (page: Page): Promise<TestState> =>
  page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState());

/** Lo que lleva el borde dorado: el panel de un ninja (su elemento) o una carta (su identificador). */
const marked = (page: Page) =>
  page
    .locator('.tip-mark')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-ninja-panel') ?? el.getAttribute('data-card-id')));

async function boxOf(el: Locator) {
  const box = await el.boundingBox();
  if (!box) throw new Error('el elemento no está a la vista');
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

/** La burbuja, con su sombra de 4 px, no tapa el tablero, cabe en la pantalla y muestra su texto entero. */
async function expectClearOfBoard(page: Page) {
  const b = await boxOf(bubble(page));
  const apart = b.right + 4 <= FRAME.left || b.left >= FRAME.right || b.top >= FRAME.bottom;
  expect(apart, `la burbuja (${JSON.stringify(b)}) pisa el tablero`).toBe(true);
  expect(b.left).toBeGreaterThanOrEqual(0);
  expect(b.top).toBeGreaterThanOrEqual(0);
  expect(b.right + 4).toBeLessThanOrEqual(1280);
  expect(b.bottom + 4).toBeLessThanOrEqual(720);
  const sizes = await bubble(page).evaluate((node) => {
    const parts = [...node.querySelectorAll('*')] as HTMLElement[];
    return {
      clipped: parts.some((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
      smallest: Math.min(...parts.map((el) => Number.parseFloat(getComputedStyle(el).fontSize))),
    };
  });
  expect(sizes.clipped).toBe(false);
  expect(sizes.smallest).toBeGreaterThanOrEqual(13);
}

/**
 * La burbuja está en su lugar de siempre: la franja de abajo, a la derecha, dentro de la mano y a la
 * derecha de lo que haya en ella (sus cartas o, vacía, su frase).
 */
async function expectBesideHand(page: Page) {
  await expect(bubble(page)).toHaveClass(/at-hand/);
  await expectClearOfBoard(page);
  const b = await boxOf(bubble(page));
  const hand = await boxOf(page.locator('.hand'));
  expect(b.right + 4).toBeLessThanOrEqual(hand.right + 1);
  expect(b.top).toBeGreaterThanOrEqual(hand.top);
  expect(b.bottom).toBeLessThanOrEqual(hand.bottom);
  // Pegada a la derecha de la mano, y sin tapar nada de lo que hay en ella.
  expect(hand.right - b.right).toBeLessThanOrEqual(8);
  for (const item of await page.locator('.hand .card, .hand .hand-empty').all()) {
    expect((await boxOf(item)).right).toBeLessThanOrEqual(b.left);
  }
}

test('D-80: cambiar de ninja sale junto a la mano la primera vez que un ninja completa su plan', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startBoard(page, QUIET);
  // Al empezar el turno no hay nada que enseñar.
  await expect(bubble(page)).toHaveCount(0);

  // Brasa se mueve a donde no alcanza a nadie: ya no le queda nada por decidir, y a los otros dos sí.
  await click(page, 2, 1);
  await expect(text(page)).toHaveText(SWITCH('Brasa'));
  await expect(bubble(page)).toHaveAttribute('data-tip', 'switchNinja');
  // En su lugar de siempre, también con la mano vacía: a la derecha de la frase de la mano.
  await expect(page.locator('.hand .hand-empty')).toBeVisible();
  await expectBesideHand(page);
  // Habla de Brasa: lleva una franja de su color, y su panel, el borde dorado.
  await expect(bubble(page)).toHaveClass(/el-fire/);
  expect(await marked(page)).toEqual(['fire']);

  // No estorba: con la burbuja abierta se sigue jugando. Con Marea activa, que no tiene plan, se va.
  await page.keyboard.press('Tab');
  expect((await state(page)).active).toBe('water');
  await expect(bubble(page)).toHaveCount(0);
  expect(await marked(page)).toEqual([]);
  // Nadie la cerró: vuelve cuando Marea completa su plan. Está en el mismo lugar, y ahora señala a Marea.
  await click(page, 2, 2);
  await expect(text(page)).toHaveText(SWITCH('Marea'));
  await expectBesideHand(page);
  await expect(bubble(page)).toHaveClass(/el-water/);
  expect(await marked(page)).toEqual(['water']);

  // "Entendido" la cierra, y queda aprendida con los ajustes.
  await understood(page).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await marked(page)).toEqual([]);
  expect(await savedSettings(page)).toMatchObject({ learnedTips: ['switchNinja'], version: 2 });
  // No vuelve: Marea deshace su paso y lo da otra vez.
  await page.keyboard.press('Escape');
  await click(page, 2, 2);
  expect((await state(page)).plans).toMatchObject({ water: { moveTo: { x: 2, y: 2 } } });
  await expect(bubble(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('D-80: un consejo aprendido no vuelve a salir al abrir el juego otra vez', async ({ page }) => {
  await startBoard(page, QUIET, { learnedTips: ['switchNinja'] });
  await click(page, 2, 1);
  expect((await state(page)).plans).toMatchObject({ fire: { moveTo: { x: 2, y: 1 } } });
  await expect(page.locator('.tip-text')).toHaveText(
    'Elige otro ninja con un clic o con Tab. Falta planear a Marea y Escarcha.',
  );
  await expect(bubble(page)).toHaveCount(0);
});

test('D-80: Enter cierra el consejo sin confirmar el turno', async ({ page }) => {
  await startBoard(page, QUIET);
  await click(page, 2, 1);
  await expect(text(page)).toHaveText(SWITCH('Brasa'));
  const { turn } = (await state(page)).match;

  await page.keyboard.press('Enter');
  await expect(bubble(page)).toHaveCount(0);
  expect(await state(page)).toMatchObject({ phase: 'planning', match: { turn } });
  expect(await savedSettings(page)).toMatchObject({ learnedTips: ['switchNinja'] });

  // Sin consejo en pantalla, Enter confirma el turno como siempre.
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => {
      const s = await state(page);
      return s.phase === 'planning' ? s.match.turn : -1;
    })
    .toBe(turn + 1);
});

test('D-80: la primera carta y el combo posible salen en el mismo lugar, y marcan la carta', async ({ page }) => {
  // Brasa tiene dos cartas y Marea una.
  await startBoard(page, withHands({ fire: [9, 12], water: [11] }));
  await expect(text(page)).toHaveText(FIRST_CARD);
  await expect(bubble(page)).toHaveAttribute('data-tip', 'firstCard');
  // Junto a la mano, a la derecha de sus cartas, con la franja del color de Brasa.
  await expectBesideHand(page);
  await expect(bubble(page)).toHaveClass(/el-fire/);
  // El borde dorado va en su primera carta, la de la tecla 1. Ningún panel lo lleva.
  expect(await marked(page)).toEqual(['fire-1']);
  // La franja sigue con el estado del turno.
  await expect(page.locator('.tip-text')).toHaveText(PLAN_TIP('Brasa'));

  // La carta se puede elegir con la burbuja abierta.
  await page.keyboard.press('1');
  expect((await state(page)).pendingCard).toBe('fire-1');
  await page.keyboard.press('Escape');

  // Al cerrarla sale la siguiente: dos ninjas tienen carta. Marca las cartas de la mano que se ve.
  await understood(page).click();
  await expect(text(page)).toHaveText(COMBO);
  await expect(bubble(page)).toHaveAttribute('data-tip', 'combo');
  await expectBesideHand(page);
  expect(await marked(page)).toEqual(['fire-1', 'fire-2']);
  await understood(page).click();
  await expect(bubble(page)).toHaveCount(0);
  expect(await marked(page)).toEqual([]);
  expect(await savedSettings(page)).toMatchObject({ learnedTips: ['firstCard', 'combo'] });
});

/** Deja a Brasa con esas cartas en la mano, en la partida en curso. */
const giveFire = (page: Page, values: number[]) =>
  page.evaluate((values) => {
    type Ninja = { id: string; hand: unknown[] };
    const w = window as unknown as {
      __ventisca: { getState(): { match: { ninjas: Ninja[] } } };
      __ventiscaLoad(m: unknown): void;
    };
    const m = structuredClone(w.__ventisca.getState().match);
    for (const n of m.ninjas) {
      if (n.id === 'fire') n.hand = values.map((value, i) => ({ id: `fire-${i + 1}`, element: 'fire', value }));
    }
    w.__ventiscaLoad(m);
  }, values);

test('D-80: con tres o cuatro cartas no queda espacio junto a la mano, y la burbuja sube encima de ella', async ({
  page,
}) => {
  await startBoard(page, withHands({ fire: [9, 10, 11, 12] }));
  for (const count of [4, 3]) {
    await giveFire(page, [9, 10, 11, 12].slice(0, count));
    await expect(page.locator('.hand .card')).toHaveCount(count);
    await expect(text(page)).toHaveText(FIRST_CARD);
    await expect(bubble(page)).toHaveClass(/at-above-hand/);
    await expectClearOfBoard(page);
    const b = await boxOf(bubble(page));
    const hand = await boxOf(page.locator('.hand'));
    // Encima de la mano, a su derecha, en el margen del tablero: no tapa ninguna carta ni el tablero.
    expect(b.left).toBeGreaterThanOrEqual(FRAME.right);
    expect(b.bottom).toBeLessThanOrEqual(hand.top);
    expect(hand.top - b.bottom).toBeLessThanOrEqual(20);
    expect(Math.abs(hand.right - b.right)).toBeLessThanOrEqual(8);
    // Sigue marcando la primera carta.
    expect(await marked(page)).toEqual(['fire-1']);
  }
  // Con dos cartas vuelve a su lugar, junto a la mano.
  await giveFire(page, [9, 10]);
  await expect(page.locator('.hand .card')).toHaveCount(2);
  await expectBesideHand(page);
});

test('D-80 y R-09: la primera caída sale en su burbuja, y la franja sigue con el estado del turno', async ({
  page,
}) => {
  // A Marea le queda 1 de vida y está pegada a Témpano: cae este turno.
  await startBoard(page, {
    ninjas: { fire: { at: [1, 1] }, water: { at: [4, 2], hp: 1 }, snow: { at: [1, 3] } },
    golems: [{ kind: 'colossus', at: [5, 2] }],
  });
  const tip = page.locator('.tip-text');
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));
  await expect(bubble(page)).toHaveCount(0);
  const { turn } = (await state(page)).match;
  await page.keyboard.press('Space');
  await expect
    .poll(async () => {
      const s = await state(page);
      return s.phase === 'planning' ? s.match.turn : -1;
    })
    .toBe(turn + 1);
  expect((await state(page)).match.ninjas.find((n) => n.id === 'water')?.hp).toBe(0);

  // Nombra a quien cayó y al ninja activo, que es quien puede ir a revivirlo.
  await page.mouse.move(640, 60);
  await expect(text(page)).toHaveText(FALL('Marea', 'Brasa'));
  await expect(bubble(page)).toHaveAttribute('data-tip', 'firstFall');
  // En el mismo lugar que los demás, señalando a Brasa: la franja de su color y su panel con borde dorado.
  await expectBesideHand(page);
  await expect(bubble(page)).toHaveClass(/el-fire/);
  expect(await marked(page)).toEqual(['fire']);
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));
  // Con otro ninja activo, lo nombra y lo señala a él.
  await page.keyboard.press('Tab');
  await expect(text(page)).toHaveText(FALL('Marea', 'Escarcha'));
  await expect(bubble(page)).toHaveClass(/el-snow/);
  expect(await marked(page)).toEqual(['snow']);

  // Se cierra con "Entendido" y no vuelve, aunque Marea siga caída.
  await understood(page).click();
  await expect(bubble(page)).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(bubble(page)).toHaveCount(0);
  expect(await savedSettings(page)).toMatchObject({ learnedTips: ['firstFall'] });
});

test('D-80: con "Consejos en pantalla" apagado no sale ninguna burbuja', async ({ page }) => {
  await startBoard(page, withHands({ fire: [9], water: [11] }), { tips: false });
  // Brasa tiene su primera carta y Marea otra: con los consejos encendidos saldrían los de la mano.
  await expect(page.locator('.hand .card')).toHaveCount(1);
  await expect(bubble(page)).toHaveCount(0);
  // Escarcha, sin cartas, se mueve a donde no alcanza a nadie: tampoco sale el de cambiar de ninja.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await click(page, 2, 3);
  expect(await state(page)).toMatchObject({ active: 'snow', plans: { snow: { moveTo: { x: 2, y: 3 } } } });
  await expect(bubble(page)).toHaveCount(0);
  // Sin consejos en pantalla tampoco hay franja.
  await expect(page.locator('.tip')).toHaveCount(0);
});

test('D-80: desde la ayuda se pueden volver a ver los consejos', async ({ page }) => {
  await startBoard(page, QUIET, { learnedTips: ['switchNinja', 'firstFall'] });
  await click(page, 2, 1);
  await expect(bubble(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Cómo jugar' }).click();
  const help = page.getByRole('dialog', { name: 'Cómo jugar' });
  await expect(help.getByRole('heading', { name: 'Consejos' })).toBeVisible();
  const again = help.getByRole('button', { name: 'Volver a ver los consejos' });
  await again.scrollIntoViewIfNeeded();
  expect(await clippedElements(page)).toEqual([]);
  // Lo nuevo de la ayuda respeta el tamaño mínimo de texto: el párrafo y el botón.
  const small = (await smallText(page)).filter((found) => !found.startsWith('span.kbd'));
  expect(small).toEqual([]);
  await again.click();
  // El botón dice que quedó hecho, y los ajustes ya no guardan ningún consejo aprendido.
  await expect(help.getByRole('button', { name: 'Listo: volverán a salir' })).toBeDisabled();
  expect(await savedSettings(page)).toMatchObject({ learnedTips: [] });
  expect(await clippedElements(page)).toEqual([]);

  // De vuelta en la partida, el consejo de ese momento sale otra vez.
  await help.getByRole('button', { name: 'Volver a la pausa' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(text(page)).toHaveText(SWITCH('Brasa'));
});

test('D-80: con los consejos apagados, la ayuda dice dónde se encienden', async ({ page }) => {
  await startBoard(page, QUIET, { tips: false });
  await page.getByRole('button', { name: 'Cómo jugar' }).click();
  const help = page.getByRole('dialog', { name: 'Cómo jugar' });
  const note = help.getByText('Ahora están apagados: enciende «Consejos en pantalla» en la pausa o en «Tu equipo».');
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeVisible();
  expect(await clippedElements(page)).toEqual([]);
});
