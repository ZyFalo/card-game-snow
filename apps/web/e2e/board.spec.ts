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

/* ---------- El foco y los clics ---------- */

/** Lo que importa de la planificación: quién está activo, con qué carta en la mano y con qué planes. */
const planning = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    return { active: s.active, pendingCard: s.pendingCard, plans: s.plans };
  });

/**
 * Una partida con el tablero preparado: los tres ninjas en la columna 1 (Brasa arriba, Marea en medio y
 * Escarcha abajo) y tres gólems delante: Carámbano en (5,1), Témpano en (4,2) y Granizo en (5,3). Sin
 * reloj, para que el turno no se confirme solo a mitad de la prueba.
 */
async function startPrepared(page: Page, hand: number[] = [], settings: Record<string, boolean> = {}) {
  await page.addInitScript(
    (saved) => window.localStorage.setItem('ventisca:settings:v1', saved),
    JSON.stringify({ pace: 'relaxed', ...settings }),
  );
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
    w.__ventisca.setState({ match: m, view: m, plans: {}, active: 'fire', pendingCard: null });
    w.__ventiscaScene.setupMatch(m);
  }, hand);
}

const click = (page: Page, x: number, y: number) => page.mouse.click(tile(x, y).x, tile(x, y).y);

const PLAN_TIP = (name: string) => `Elige a dónde se mueve ${name}, o un objetivo desde donde está.`;

/** Deja a Brasa en (3,1), junto a los gólems: desde ahí alcanza a Témpano y a Carámbano sin moverse. */
const fireNextToGolems = (page: Page) =>
  page.evaluate(() => {
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

test('al planificar valen a la vez las casillas y los objetivos, y el foco pasa al elegir la acción', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startPrepared(page);
  expect(await planning(page)).toEqual({ active: 'fire', pendingCard: null, plans: {} });
  const toast = page.locator('.toast');
  const tip = page.locator('.tip-text');
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));

  // Desde donde está, Brasa no alcanza a Témpano: el clic lo dice y no cambia nada.
  await click(page, 4, 2);
  await expect(toast).toHaveText('Ese gólem está fuera de alcance desde la casilla planeada.');
  expect((await planning(page)).plans).toEqual({});

  // Una casilla de su color la mueve, sin cambiar de ninja. Desde ahí alcanza a dos gólems.
  await click(page, 3, 1);
  expect(await planning(page)).toMatchObject({
    active: 'fire',
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } } },
  });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(
    'Elige qué hace Brasa: un objetivo o una carta. Para cambiar a dónde se mueve, haz clic en otra casilla de su color.',
  );

  // Las casillas siguen valiendo: otro clic en una de su color cambia el movimiento directamente.
  await click(page, 2, 1);
  expect(await planning(page)).toMatchObject({
    active: 'fire',
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } } },
  });
  // Un clic en la casilla de su fantasma lo cancela y la devuelve a su lugar.
  await click(page, 2, 1);
  expect(await planning(page)).toEqual({ active: 'fire', pendingCard: null, plans: {} });
  // Una casilla a la que no llega lo dice.
  await click(page, 8, 4);
  await expect(toast).toHaveText('Brasa no llega hasta ahí este turno.');

  // Vuelve junto a los gólems y elige uno: queda elegido y le toca al siguiente ninja.
  await click(page, 3, 1);
  await click(page, 4, 2);
  expect(await planning(page)).toMatchObject({
    active: 'water',
    plans: { fire: { moveTo: { x: 3, y: 1 }, action: { type: 'attack', targetId: 'e2' } } },
  });
  // Con el ratón sobre un gólem, la franja de arriba habla de él: se aparta para leer el consejo.
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(PLAN_TIP('Marea'));

  // Un clic en su propia casilla deja quieta a Marea: no cambia nada.
  await click(page, 1, 2);
  expect(await planning(page)).toEqual({
    active: 'water',
    pendingCard: null,
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: { type: 'attack', targetId: 'e2' } } },
  });
  // Marea se mueve a donde no alcanza a nadie, y no tiene cartas. El foco no salta: puede elegir otra
  // casilla. La franja dice cómo seguir, y Tab pasa a Escarcha.
  await click(page, 2, 2);
  expect(await planning(page)).toMatchObject({ active: 'water', plans: { water: { moveTo: { x: 2, y: 2 } } } });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText('Tab pasa al siguiente ninja. Falta planear a Escarcha.');
  await page.keyboard.press('Tab');
  expect(await planning(page)).toMatchObject({ active: 'snow' });
  expect(errors).toEqual([]);
});

test('un objetivo a su alcance se elige sin moverse, y si después se aleja, se quita con un aviso', async ({
  page,
}) => {
  await startPrepared(page);
  await fireNextToGolems(page);

  // Un clic en Témpano: Brasa lo ataca desde donde está, y le toca a Marea.
  await click(page, 4, 2);
  expect(await planning(page)).toEqual({
    active: 'water',
    pendingCard: null,
    plans: { fire: { ninjaId: 'fire', action: { type: 'attack', targetId: 'e2' } } },
  });

  // Se vuelve a Brasa y se la mueve a donde Témpano ya no queda a su alcance.
  await page.locator('[data-ninja-panel="fire"]').click();
  await click(page, 2, 1);
  await expect(page.locator('.toast')).toHaveText('La acción anterior ya no alcanza desde aquí: elige otra.');
  expect(await planning(page)).toMatchObject({
    active: 'fire',
    plans: { fire: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } } },
  });
  expect((await planning(page)).plans).not.toHaveProperty('fire.action');
});

test('deshacer va hacia atrás, de a una cosa, y sin nada que deshacer Esc abre la pausa', async ({ page }) => {
  await startPrepared(page);
  await click(page, 3, 1);
  await click(page, 4, 2);
  // Brasa ya tiene su plan y el turno pasó a Marea: se vuelve a Brasa.
  await page.locator('[data-ninja-panel="fire"]').click();
  expect(await planning(page)).toMatchObject({ active: 'fire' });

  // Primero se va la acción; después, la casilla.
  await page.keyboard.press('Escape');
  expect((await planning(page)).plans).toEqual({ fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } } });
  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({ active: 'fire', plans: {} });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pausa' })).toBeVisible();
});

test('un clic en su casilla sin haberse movido no deja nada que deshacer', async ({ page }) => {
  await startPrepared(page);
  await fireNextToGolems(page);
  await click(page, 3, 1);
  expect(await planning(page)).toEqual({ active: 'fire', pendingCard: null, plans: {} });
  // Quedarse ya no es un paso: Esc abre la pausa.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pausa' })).toBeVisible();
});

test('elegir una carta cambia el tablero al modo carta, antes o después de moverse', async ({ page }) => {
  await startPrepared(page, [10]);
  // Antes de moverse: la carta se toma y se suelta.
  await page.keyboard.press('1');
  expect(await planning(page)).toMatchObject({ active: 'fire', pendingCard: 'fire-1', plans: {} });
  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({ active: 'fire', pendingCard: null, plans: {} });

  // Después de moverse. Con una carta en la mano, Brasa tiene con qué actuar desde cualquier casilla.
  await click(page, 2, 1);
  expect(await planning(page)).toMatchObject({ active: 'fire' });
  await page.keyboard.press('1');
  expect(await planning(page)).toMatchObject({ pendingCard: 'fire-1' });
  await expect(page.locator('.tip-text')).toHaveText('Elige dónde colocar la carta de Brasa. Afecta un área de 3×3.');

  // Fuera del alcance de la carta, lo dice; Esc la devuelve a la mano y el tablero vuelve a ofrecer
  // casillas y objetivos.
  await click(page, 8, 4);
  await expect(page.locator('.toast')).toHaveText('Esa casilla queda fuera del alcance de la carta.');
  await page.keyboard.press('Escape');
  expect(await planning(page)).toMatchObject({ pendingCard: null, plans: { fire: { moveTo: { x: 2, y: 1 } } } });

  // A su alcance: la carta queda colocada y el turno pasa al siguiente ninja.
  await page.keyboard.press('1');
  await click(page, 4, 1);
  expect(await planning(page)).toMatchObject({
    active: 'water',
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
  // Es la primera vez que hay un caído: el consejo dice cómo se le revive.
  expect(await planning(page)).toMatchObject({ active: 'water' });
  await expect(tip).toHaveText(REVIVE_TIP('Brasa'));

  // Marea ya está al lado: sin moverse, Brasa es su objetivo.
  await click(page, 2, 2);
  expect((await planning(page)).plans).toEqual({
    water: { ninjaId: 'water', action: { type: 'revive', targetId: 'fire' } },
  });

  await playTurn(page);
  // Brasa se levantó al final del turno, después del gólem, y lo dice.
  await expect(page.locator('.toast')).toHaveText('Brasa vuelve con 1 de vida');
  expect(await hpOf(page)).toMatchObject({ fire: 1, water: 40 });
  // El consejo de revivir sale una sola vez: Brasa ya planifica como cualquiera.
  expect(await planning(page)).toMatchObject({ active: 'fire' });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));
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
  // Escarcha está al lado de Marea: la revive sin moverse.
  await page.locator('[data-ninja-panel="snow"]').click();
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
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));
  await playTurn(page);
  expect(await hpOf(page)).toMatchObject({ water: 0 });
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(REVIVE_TIP('Marea'));
  // Sale una sola vez por partida: al turno siguiente, el consejo dice lo de siempre.
  await playTurn(page);
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));
});

/* ---------- Información a pedido (D-74 y D-78) ---------- */

test('el panel de cada ninja resume su plan sin números, y el resumen más largo cabe', async ({ page }) => {
  await startPrepared(page, [10]);
  const panel = page.locator('[data-ninja-panel="fire"]');
  const pill = panel.locator('.plan-pill');
  await expect(pill).toHaveText('Sin plan');

  // Brasa se mueve y ataca a Carámbano: el resumen dice las dos cosas.
  await click(page, 3, 1);
  await expect(pill).toHaveText('Solo moverse');
  await click(page, 5, 1);
  await expect(pill).toHaveText('Moverse → atacar a Carámbano');
  await expect(panel).toHaveAccessibleName('Brasa, 30 de 30 de vida. Moverse y atacar a Carámbano');

  // Es el más largo que puede salir, y cabe entero, también con los dos estados encendidos.
  await page.evaluate(() => {
    type Ninja = { shield: boolean; boost: boolean };
    const store = (window as unknown as TestWindow).__ventisca as unknown as {
      getState(): { view: { ninjas: Ninja[] } };
      setState(patch: object): void;
    };
    const { view } = store.getState();
    store.setState({ view: { ...view, ninjas: view.ninjas.map((n) => ({ ...n, shield: true, boost: true })) } });
  });
  await expect(panel.locator('.np-status img')).toHaveCount(2);
  expect(await pill.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const status = await panel.locator('.np-status').boundingBox();
  const box = await pill.boundingBox();
  // Los estados van arriba: no comparten renglón con el resumen.
  expect((status?.y ?? 0) + (status?.height ?? 0)).toBeLessThanOrEqual(box?.y ?? 0);

  // Una carta no dice su valor: el resumen no lleva números.
  await panel.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  await click(page, 4, 1);
  await expect(pill).toHaveText('Moverse → jugar carta');
  await expect(pill).not.toHaveText(/\d/);
});

test('con el ratón sobre un gólem, la franja dice su nombre y cómo ataca', async ({ page }) => {
  await startPrepared(page);
  const tip = page.locator('.tip-text');
  await page.mouse.move(tile(4, 2).x, tile(4, 2).y);
  await expect(tip).toHaveText(
    'Témpano. Lento pero brutal: barre tres casillas. No se pongan hombro con hombro frente a él.',
  );
  await page.mouse.move(tile(5, 1).x, tile(5, 1).y);
  await expect(tip).toHaveText('Carámbano. Pega más fuerte de lejos (3 a 5). Acércate para que duela menos.');
  await page.mouse.move(640, 60);
  await expect(tip).toHaveText(PLAN_TIP('Brasa'));
});

type LossWindow = { __ventiscaScene: { units: Map<string, { loss: number }> } };
/** La vida que la barra de un gólem dice que perdería (ayuda de daño). */
const lossOf = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as LossWindow).__ventiscaScene.units.get(id)?.loss ?? null, id);

test('D-78: sin la ayuda, la barra de un gólem no dice cuánto perdería', async ({ page }) => {
  await startPrepared(page);
  await click(page, 3, 1);
  await click(page, 4, 2);
  expect((await planning(page)).plans).toMatchObject({ fire: { action: { type: 'attack', targetId: 'e2' } } });
  expect(await lossOf(page, 'e2')).toBe(0);
});

test('D-78: con "Ver el daño antes de confirmar", la barra muestra lo planeado y lo que se apunta', async ({
  page,
}) => {
  await startPrepared(page, [], { aidDamage: true });
  // Brasa se mueve junto a Témpano. Al apuntarle, su barra muestra los 8 de su ataque.
  await click(page, 3, 1);
  expect(await lossOf(page, 'e2')).toBe(0);
  await page.mouse.move(tile(4, 2).x, tile(4, 2).y);
  await expect.poll(() => lossOf(page, 'e2')).toBe(8);
  await page.mouse.move(640, 60);
  await expect.poll(() => lossOf(page, 'e2')).toBe(0);
  // Elegido, queda en la barra aunque el ratón se vaya.
  await click(page, 4, 2);
  await page.mouse.move(640, 60);
  await expect.poll(() => lossOf(page, 'e2')).toBe(8);
  expect(await lossOf(page, 'e1')).toBe(0);
});

interface Mini {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}
type MiniWindow = {
  __ventiscaScene: {
    children: {
      list: {
        type: string;
        visible: boolean;
        x: number;
        y: number;
        displayWidth: number;
        displayHeight: number;
        depth: number;
        texture?: { key: string };
      }[];
    };
  };
};
/** Las miniaturas de las cartas colocadas que dibuja la escena, de izquierda a derecha. */
const minis = (page: Page): Promise<Mini[]> =>
  page.evaluate(() =>
    (window as unknown as MiniWindow).__ventiscaScene.children.list
      .filter((o) => o.type === 'Image' && o.visible && (o.texture?.key ?? '').startsWith('placed-'))
      .map((o) => ({
        key: o.texture?.key ?? '',
        x: o.x,
        y: o.y,
        w: o.displayWidth,
        h: o.displayHeight,
        depth: o.depth,
      }))
      .sort((a, b) => a.x - b.x),
  );

test('las cartas colocadas dejan su miniatura: cada elemento en su lugar, sin taparse ni moverse', async ({ page }) => {
  await startPrepared(page);
  // Los tres ninjas con una carta en la mano, y las van colocando en la misma casilla, que está vacía.
  const place = (who: string[]) =>
    page.evaluate((who) => {
      type Ninja = { id: string; hand: unknown[] };
      const store = (window as unknown as TestWindow).__ventisca as unknown as {
        getState(): { match: { ninjas: Ninja[] } };
        setState(patch: object): void;
      };
      const m = structuredClone(store.getState().match);
      for (const n of m.ninjas) n.hand = [{ id: `${n.id}-1`, element: n.id, value: 10 }];
      const plans = Object.fromEntries(
        who.map((id) => [id, { ninjaId: id, action: { type: 'card', cardId: `${id}-1`, at: { x: 2, y: 2 } } }]),
      );
      store.setState({ match: m, view: m, plans, active: 'fire', pendingCard: null });
    }, who);
  await page.mouse.move(640, 60);

  await place(['water']);
  const one = await minis(page);
  expect(one.map((m) => m.key)).toEqual(['placed-water']);

  await place(['water', 'snow']);
  const two = await minis(page);
  expect(two.map((m) => m.key)).toEqual(['placed-water', 'placed-snow']);

  await place(['snow', 'fire', 'water']);
  const three = await minis(page);
  // Fuego a la izquierda, Agua al centro y Nieve a la derecha, lado a lado y sin taparse.
  expect(three.map((m) => m.key)).toEqual(['placed-fire', 'placed-water', 'placed-snow']);
  const [fire, water, snow] = three as [Mini, Mini, Mini];
  expect(fire.x + fire.w).toBeLessThanOrEqual(water.x);
  expect(water.x + water.w).toBeLessThanOrEqual(snow.x);
  expect(new Set(three.map((m) => m.y)).size).toBe(1);
  // Ninguna se movió al sumarse otra.
  expect(water).toMatchObject({ x: one[0]?.x, y: one[0]?.y });
  expect(snow).toMatchObject({ x: two[1]?.x, y: two[1]?.y });
  // Van en la franja de arriba de su casilla, que empieza en (390, 270) y mide 100×84.
  for (const m of three) {
    expect(m.x).toBeGreaterThanOrEqual(390);
    expect(m.x + m.w).toBeLessThanOrEqual(490);
    expect(m.y).toBeGreaterThanOrEqual(270);
    expect(m.y + m.h).toBeLessThanOrEqual(270 + 42);
  }

  // En el suelo, bajo las unidades; con el ratón sobre su casilla pasan al frente.
  expect(three.every((m) => m.depth < 0)).toBe(true);
  await page.mouse.move(tile(2, 2).x, tile(2, 2).y);
  await expect.poll(async () => (await minis(page)).every((m) => m.depth > 1000)).toBe(true);
  await page.mouse.move(640, 60);
  await expect.poll(async () => (await minis(page)).every((m) => m.depth < 0)).toBe(true);
});
