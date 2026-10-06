import { expect, type Locator, type Page, test } from '@playwright/test';
import { HUD_BAND_Y } from '../src/art/scenery';
import { startMatch, type TestWindow } from './helpers';

/* El tablero durante la planificación (lineamientos de diseño, sección "Tablero"). */

/* Casilla del tablero -> coordenadas de página con el escenario a 1280×720 (escala 1). */
const tile = (x: number, y: number) => ({ x: 240 + 100 * x, y: 144 + 84 * y });

interface SceneImage {
  type: string;
  visible: boolean;
  texture?: { key: string };
}
type SceneWindow = { __ventiscaScene: { children: { list: SceneImage[] } } };

/** Las siluetas de los destinos planeados que están a la vista. */
const ghosts = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as SceneWindow).__ventiscaScene.children.list
      .filter((o) => o.type === 'Image' && o.visible && (o.texture?.key ?? '').endsWith('-outline'))
      .map((o) => o.texture?.key),
  );

/**
 * Espera a que terminen las animaciones de un elemento. La mano entra subiendo: medida antes de que
 * termine, su título todavía no está en su sitio.
 */
const settled = (el: Locator) =>
  el.evaluate(async (node) => {
    await Promise.allSettled(node.getAnimations({ subtree: true }).map((a) => a.finished));
  });

test('la mano muestra solo las cartas que hay, sin casillas vacías', async ({ page }) => {
  await startMatch(page);
  const hand = page.locator('.hand');
  await expect(hand).toBeVisible();
  await settled(hand);
  // Al empezar nadie tiene cartas: la mano queda con su título y la frase que dice cómo se ganan.
  await expect(hand.locator('.card')).toHaveCount(0);
  await expect(hand.getByText('Llena el medidor para ganar cartas')).toBeVisible();
  const title = await hand.locator('.hand-head').boundingBox();
  // El título va dentro de la franja que el fondo deja lisa: ninguna línea del fondo lo cruza.
  expect(title?.y ?? 0).toBeGreaterThan(HUD_BAND_Y + 2);

  // Con dos cartas en la mano del ninja activo se ven esas dos.
  await page.evaluate(() => {
    type Ninja = { id: string; hand: { id: string; element: string; value: number }[] };
    const store = (window as unknown as TestWindow).__ventisca as unknown as {
      getState(): { active: string; view: { ninjas: Ninja[] } };
      setState(patch: object): void;
    };
    const { active, view } = store.getState();
    const cards = [9, 11].map((value, i) => ({ id: `${active}-${i + 1}`, element: active, value }));
    store.setState({
      view: { ...view, ninjas: view.ninjas.map((n) => (n.id === active ? { ...n, hand: cards } : n)) },
    });
  });
  await expect(hand.locator('.card')).toHaveCount(2);
  await expect(hand.getByRole('button', { name: /^Carta de/ })).toHaveCount(2);
  await expect(hand.getByText('Llena el medidor para ganar cartas')).toHaveCount(0);
  // El título no se mueve al llegar las cartas: la mano guarda su alto.
  await settled(hand);
  expect(await hand.locator('.hand-head').boundingBox()).toEqual(title);
});

test('el destino planeado se marca con la silueta del ninja', async ({ page }) => {
  await startMatch(page);
  expect(await ghosts(page)).toEqual([]);
  const { active, pos } = await page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    return { active: s.active, pos: s.match.ninjas.find((n) => n.id === s.active)?.pos ?? { x: 0, y: 0 } };
  });
  // Una casilla alcanzable: la de al lado, en la columna 1.
  const to = tile(1, pos.y);
  await page.mouse.click(to.x, to.y);
  await expect.poll(() => ghosts(page)).toEqual([`ninja-${active}-outline`]);

  // Al empezar no hay a quién atacar ni cartas, pero el foco no salta tras moverse: sigue en su ninja.
  expect(await page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().active)).toBe(active);
  await page.keyboard.press('Escape');
  await expect.poll(() => ghosts(page)).toEqual([]);
});

/* ---------- Foco y pasos ---------- */

/** Lo que importa de la planificación: quién está activo, en qué paso y con qué planes. */
const planning = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    return { active: s.active, step: s.step, pendingCard: s.pendingCard, plans: s.plans };
  });

/**
 * Una partida con el tablero preparado: los tres ninjas en la columna 1 (Brasa arriba, Marea en medio y
 * Escarcha abajo) y tres gólems delante: Carámbano en (5,1), Témpano en (4,2) y Granizo en (5,3). Sin
 * reloj, para que el turno no se confirme solo a mitad de la prueba.
 */
async function startPrepared(page: Page, hand: number[] = []) {
  await page.addInitScript(() => window.localStorage.setItem('ventisca:settings:v1', '{"pace":"relaxed"}'));
  await startMatch(page);
  await page.evaluate((hand) => {
    type Unit = { id: string; pos: { x: number; y: number }; hp: number; maxHp: number };
    type Match = { ninjas: (Unit & { hand: unknown[] })[]; enemies: unknown[]; nextEnemySeq: number };
    const w = window as unknown as {
      __ventisca: { getState(): { match: Match }; setState(patch: object): void };
      __ventiscaScene: { setupMatch(m: Match): void };
    };
    const m = structuredClone(w.__ventisca.getState().match);
    const rows: Record<string, number> = { fire: 1, water: 2, snow: 3 };
    for (const n of m.ninjas) {
      n.pos = { x: 1, y: rows[n.id] ?? 0 };
      n.hand = n.id === 'fire' ? hand.map((value, i) => ({ id: `fire-${i + 1}`, element: 'fire', value })) : [];
    }
    const golem = (id: string, kind: string, x: number, y: number, hp: number) => ({
      id,
      kind,
      pos: { x, y },
      hp,
      maxHp: hp,
      stunned: false,
      burnTicks: 0,
    });
    m.enemies = [
      golem('e1', 'sniper', 5, 1, 30),
      golem('e2', 'colossus', 4, 2, 60),
      golem('e3', 'artillery', 5, 3, 45),
    ];
    m.nextEnemySeq = 4;
    w.__ventisca.setState({ match: m, view: m, plans: {}, active: 'fire', step: 'move', pendingCard: null });
    w.__ventiscaScene.setupMatch(m);
  }, hand);
}

const click = (page: Page, x: number, y: number) => page.mouse.click(tile(x, y).x, tile(x, y).y);

test('la planificación va en dos pasos, moverse y actuar, y pasa sola al siguiente ninja al elegir la acción', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startPrepared(page);
  expect(await planning(page)).toEqual({ active: 'fire', step: 'move', pendingCard: null, plans: {} });
  const toast = page.locator('.toast');
  const tip = page.locator('.tip-text');

  // Paso 1: el tablero solo acepta casillas. Un gólem todavía no es un objetivo.
  await click(page, 4, 2);
  await expect(toast).toHaveText('Primero elige a dónde se mueve Brasa. Para quedarse, haz clic en su casilla.');
  expect((await planning(page)).plans).toEqual({});

  // Una casilla a su alcance: Brasa pasa al paso de actuar, y desde ahí alcanza a dos gólems.
  await click(page, 3, 1);
  expect(await planning(page)).toMatchObject({
    active: 'fire',
    step: 'act',
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } } },
  });
  await expect(tip).toHaveText(
    'Elige qué hace Brasa: un objetivo o una carta. Para cambiar a dónde se mueve, haz clic en otra casilla de su color.',
  );

  // Paso 2: las casillas siguen valiendo. Otro clic en una de su color cambia el movimiento directamente.
  await click(page, 2, 1);
  expect(await planning(page)).toMatchObject({
    active: 'fire',
    step: 'act',
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } } },
  });
  // Un clic en la casilla de su fantasma lo cancela y lo devuelve a su lugar.
  await click(page, 2, 1);
  expect(await planning(page)).toEqual({ active: 'fire', step: 'act', pendingCard: null, plans: {} });
  // Una casilla a la que no llega no es de su color ni un objetivo: dice qué se puede hacer.
  await click(page, 8, 4);
  await expect(toast).toHaveText(
    'Ahora elige un objetivo. Para cambiar a dónde se mueve Brasa, haz clic en otra casilla de su color.',
  );

  // Vuelve junto a los gólems y elige uno: queda elegido y le toca al siguiente ninja, que empieza por moverse.
  await click(page, 3, 1);
  await click(page, 4, 2);
  expect(await planning(page)).toMatchObject({
    active: 'water',
    step: 'move',
    plans: { fire: { moveTo: { x: 3, y: 1 }, action: { type: 'attack', targetId: 'e2' } } },
  });
  // Con el ratón sobre un gólem, la franja de arriba habla de él: se aparta para leer el paso.
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText('Elige a dónde se mueve Marea. Para quedarse, haz clic en su casilla.');

  // Marea se queda: su propia casilla. Desde ahí no alcanza a nadie ni tiene cartas, pero el foco no salta:
  // puede elegir otra casilla. La franja dice cómo seguir, y Tab pasa a Escarcha.
  await click(page, 1, 2);
  expect(await planning(page)).toMatchObject({ active: 'water', step: 'act' });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText('Tab pasa al siguiente ninja. Falta planear a Escarcha.');
  await click(page, 2, 2);
  expect(await planning(page)).toMatchObject({
    active: 'water',
    step: 'act',
    plans: { water: { moveTo: { x: 2, y: 2 } } },
  });
  await page.keyboard.press('Tab');
  expect(await planning(page)).toMatchObject({ active: 'snow', step: 'move' });
  expect(errors).toEqual([]);
});

test('deshacer va paso a paso hacia atrás, y sin nada que deshacer Esc abre la pausa', async ({ page }) => {
  await startPrepared(page);
  await click(page, 3, 1);
  await click(page, 4, 2);
  // Brasa ya tiene su plan y el turno pasó a Marea: se vuelve a Brasa, que retoma en el paso de actuar.
  await page.locator('[data-ninja-panel="fire"]').click();
  expect(await planning(page)).toMatchObject({ active: 'fire', step: 'act' });

  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({
    step: 'act',
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } } },
  });
  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({ active: 'fire', step: 'move', plans: {} });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pausa' })).toBeVisible();
});

test('quedarse también se deshace: vuelve al paso de moverse', async ({ page }) => {
  await startPrepared(page);
  // Brasa se mueve primero junto a los gólems, para que al quedarse tenga a quién atacar.
  await page.evaluate(() => {
    type Ninja = { id: string; pos: { x: number; y: number } };
    const w = window as unknown as {
      __ventisca: { getState(): { match: { ninjas: Ninja[] } }; setState(patch: object): void };
      __ventiscaScene: { setupMatch(m: unknown): void };
    };
    const m = structuredClone(w.__ventisca.getState().match);
    for (const n of m.ninjas) if (n.id === 'fire') n.pos = { x: 3, y: 1 };
    w.__ventisca.setState({ match: m, view: m });
    w.__ventiscaScene.setupMatch(m);
  });
  await click(page, 3, 1);
  expect(await planning(page)).toMatchObject({ active: 'fire', step: 'act', plans: {} });
  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({ active: 'fire', step: 'move', plans: {} });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('elegir una carta cambia el tablero al modo carta, en cualquiera de los dos pasos', async ({ page }) => {
  await startPrepared(page, [10]);
  // Con una carta en la mano, Brasa ya tiene con qué actuar: tras moverse no pasa al siguiente.
  await click(page, 2, 1);
  expect(await planning(page)).toMatchObject({ active: 'fire', step: 'act' });

  await page.keyboard.press('1');
  expect(await planning(page)).toMatchObject({ pendingCard: 'fire-1', step: 'act' });
  await expect(page.locator('.tip-text')).toHaveText('Elige dónde colocar la carta de Brasa. Afecta un área de 3×3.');

  // Fuera del alcance de la carta, lo dice; Esc la devuelve a la mano y el tablero vuelve a su paso.
  await click(page, 8, 4);
  await expect(page.locator('.toast')).toHaveText('Esa casilla queda fuera del alcance de la carta.');
  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({
    pendingCard: null,
    step: 'act',
    plans: { fire: { moveTo: { x: 2, y: 1 } } },
  });

  // A su alcance: la carta queda colocada y el turno pasa al siguiente ninja.
  await page.keyboard.press('1');
  await click(page, 4, 1);
  expect(await planning(page)).toMatchObject({
    active: 'water',
    step: 'move',
    pendingCard: null,
    plans: { fire: { moveTo: { x: 2, y: 1 }, action: { type: 'card', cardId: 'fire-1', at: { x: 4, y: 1 } } } },
  });
});

/* ---------- La reanimación (R-09) ---------- */

type NinjaId = 'fire' | 'water' | 'snow';
interface Board {
  ninjas: Record<NinjaId, { at: [number, number]; hp?: number }>;
  golems: { kind: 'sniper' | 'artillery' | 'colossus'; at: [number, number] }[];
}

/**
 * Una partida en un tablero preparado, también en el anfitrión (`__ventiscaLoad`): al confirmar, el turno
 * se resuelve de verdad sobre ese tablero. Sin reloj, en Clásica.
 */
async function startBoard(page: Page, board: Board) {
  await page.addInitScript(() => window.localStorage.setItem('ventisca:settings:v1', '{"pace":"relaxed"}'));
  await startMatch(page);
  await page.evaluate((board) => {
    type Unit = { id: string; pos: { x: number; y: number }; hp: number; maxHp: number };
    type Match = {
      ninjas: (Unit & { everKo: boolean; hand: unknown[] })[];
      enemies: unknown[];
      nextEnemySeq: number;
      difficulty: string;
      round: number;
      bonusCondition: string;
    };
    const w = window as unknown as { __ventisca: { getState(): { match: Match } }; __ventiscaLoad(m: Match): void };
    const m = structuredClone(w.__ventisca.getState().match);
    Object.assign(m, { difficulty: 'classic', round: 1, bonusCondition: 'noKo' });
    for (const n of m.ninjas) {
      const spec = board.ninjas[n.id as 'fire' | 'water' | 'snow'];
      n.pos = { x: spec.at[0], y: spec.at[1] };
      n.hp = spec.hp ?? n.maxHp;
      n.everKo = n.hp <= 0;
      n.hand = [];
    }
    const life = { sniper: 30, artillery: 45, colossus: 60 };
    m.enemies = board.golems.map((g, i) => ({
      id: `e${i + 1}`,
      kind: g.kind,
      pos: { x: g.at[0], y: g.at[1] },
      hp: life[g.kind],
      maxHp: life[g.kind],
      stunned: false,
      burnTicks: 0,
    }));
    m.nextEnemySeq = m.enemies.length + 1;
    w.__ventiscaLoad(m);
  }, board);
}

const hpOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    return Object.fromEntries(s.match.ninjas.map((n) => [n.id, n.hp]));
  });

/** Confirma el turno y espera a que se resuelva y vuelva la planificación. */
async function playTurn(page: Page) {
  const turn = await page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().match.turn);
  await page.keyboard.press('Space');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as TestWindow).__ventisca.getState();
          return s.phase === 'planning' ? s.match.turn : -1;
        }),
      { timeout: 30_000 },
    )
    .toBe(turn + 1);
}

const REVIVE_TIP = (name: string) =>
  `Muévete junto a ${name} para revivirlo. Se levanta al final del turno: protege a quien lo revive.`;

test('R-09: revivir se completa al final del turno, y el aliado vuelve con 1 de vida', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Brasa cayó junto a Marea. El único gólem está lejos: nadie alcanza a Marea este turno.
  await startBoard(page, {
    ninjas: { fire: { at: [2, 2], hp: 0 }, water: { at: [1, 2] }, snow: { at: [0, 4] } },
    golems: [{ kind: 'colossus', at: [8, 0] }],
  });
  const tip = page.locator('.tip-text');
  // Es la primera vez que hay un caído: el paso de moverse dice cómo se le revive.
  expect(await planning(page)).toMatchObject({ active: 'water', step: 'move' });
  await expect(tip).toHaveText(REVIVE_TIP('Brasa'));

  // Marea ya está al lado: se queda, y Brasa es su objetivo.
  await click(page, 1, 2);
  expect(await planning(page)).toMatchObject({ active: 'water', step: 'act' });
  await click(page, 2, 2);
  expect((await planning(page)).plans).toMatchObject({ water: { action: { type: 'revive', targetId: 'fire' } } });

  await playTurn(page);
  // Brasa se levantó al final del turno, después del gólem, y lo dice.
  await expect(page.locator('.toast')).toHaveText('Brasa vuelve con 1 de vida');
  expect(await hpOf(page)).toMatchObject({ fire: 1, water: 40 });
  // El consejo de revivir sale una sola vez: Brasa ya planifica como cualquiera.
  expect(await planning(page)).toMatchObject({ active: 'fire', step: 'move' });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText('Elige a dónde se mueve Brasa. Para quedarse, haz clic en su casilla.');
  expect(errors).toEqual([]);
});

test('R-09: si cae quien revive, la reanimación se interrumpe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Marea cayó junto a Escarcha, a la que le quedan 3 de vida: cualquier disparo de Carámbano la derriba.
  await startBoard(page, {
    ninjas: { fire: { at: [0, 0] }, water: { at: [3, 2], hp: 0 }, snow: { at: [3, 3], hp: 3 } },
    golems: [{ kind: 'sniper', at: [6, 2] }],
  });
  await page.locator('[data-ninja-panel="snow"]').click();
  await click(page, 3, 3);
  await click(page, 3, 2);
  expect((await planning(page)).plans).toMatchObject({ snow: { action: { type: 'revive', targetId: 'water' } } });

  await playTurn(page);
  await expect(page.locator('.toast')).toHaveText('Reanimación interrumpida');
  expect(await hpOf(page)).toMatchObject({ fire: 30, water: 0, snow: 0 });
  expect(errors).toEqual([]);
});

test('R-09: la primera vez que cae un ninja, un consejo dice cómo revivirlo', async ({ page }) => {
  // A Marea le queda 1 de vida y está pegada a Témpano: cae este turno.
  await startBoard(page, {
    ninjas: { fire: { at: [1, 1] }, water: { at: [4, 2], hp: 1 }, snow: { at: [1, 3] } },
    golems: [{ kind: 'colossus', at: [5, 2] }],
  });
  const tip = page.locator('.tip-text');
  await expect(tip).toHaveText('Elige a dónde se mueve Brasa. Para quedarse, haz clic en su casilla.');
  await playTurn(page);
  expect(await hpOf(page)).toMatchObject({ water: 0 });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(REVIVE_TIP('Marea'));
  // Sale una sola vez por partida: al turno siguiente, el paso de moverse dice lo de siempre.
  await playTurn(page);
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText('Elige a dónde se mueve Brasa. Para quedarse, haz clic en su casilla.');
});
