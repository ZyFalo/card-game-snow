import { expect, type Locator, type Page, test } from '@playwright/test';
import { type Board, startBoard, type TestState, type TestWindow } from './helpers';

/*
 * Demostraciones de las cartas (D-81): un ▶ junto al título de la mano abre un tablero en miniatura donde
 * la carta se juega en bucle, con el selector "Sin combo | Con combo". La juega el propio motor.
 */

/* Casilla del tablero -> coordenadas de página con el escenario a 1280×720 (escala 1). */
const tile = (x: number, y: number) => ({ x: 240 + 100 * x, y: 144 + 84 * y });

const hands = (fire: number[], water: number[] = [], snow: number[] = []): Board => ({
  ninjas: {
    fire: { at: [1, 1], hand: fire },
    water: { at: [1, 2], hand: water },
    snow: { at: [1, 3], hand: snow },
  },
  golems: [{ kind: 'colossus', at: [8, 0] }],
});
/** Los consejos en el momento ya se cerraron: aquí solo se mira la demostración. */
const LEARNED = { learnedTips: ['firstFall', 'firstCard', 'combo', 'switchNinja'] };

const demo = (page: Page) => page.getByRole('dialog', { name: /^Carta de / });
const opener = (page: Page, name: string) => page.getByRole('button', { name: `Ver qué hacen las cartas de ${name}` });
const labels = (page: Page) => page.locator('.demo-label').allTextContents();
const caption = (page: Page) => page.locator('.demo-caption');
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState() as TestState & { demo: unknown };
    return {
      phase: s.phase,
      active: s.active,
      pendingCard: s.pendingCard,
      plans: s.plans,
      demo: s.demo,
      turn: s.match.turn,
    };
  });
const beat = (page: Page, name: string) => expect(page.locator('.demo')).toHaveAttribute('data-beat', name);

interface Moment {
  beat: string;
  labels: string[];
  combo: string | null;
  stunned: (boolean | null)[];
  minis: string[];
  /** La escena tiene casillas pintadas: las de lo planeado o las que golpea un gólem. */
  tinted: boolean;
  /** Los números flotantes del daño que siguen a la vista. */
  floats: number;
}

/**
 * Lo que se ve en el tablero en miniatura en ese momento del bucle. El bucle no espera a la prueba, y un
 * momento puede durar menos que un cuadro de un equipo lento: en vez de preguntar una y otra vez, la página
 * anota lo que se ve cada vez que la burbuja cambia de momento, en ese mismo instante. Devuelve la
 * siguiente vez que llega a ese momento.
 */
async function at(page: Page, name: 'before' | 'combo' | 'after'): Promise<Moment> {
  const from = await page.evaluate(() => {
    type Img = { type: string; visible: boolean; alpha: number; depth: number; texture?: { key: string } };
    type Scene = {
      units: Map<string, { stunned: boolean }>;
      children: { list: Img[] };
      hl?: { commandBuffer: unknown[] };
    };
    const w = window as unknown as { __beats?: Moment[]; __watched?: Element; __ventiscaDemo?: Scene };
    const bubble = document.querySelector('.demo');
    if (bubble && w.__watched !== bubble) {
      const beats: Moment[] = [];
      w.__beats = beats;
      w.__watched = bubble;
      new MutationObserver(() => {
        const scene = w.__ventiscaDemo;
        if (!scene) return;
        beats.push({
          beat: bubble.getAttribute('data-beat') ?? '',
          labels: [...bubble.querySelectorAll('.demo-label')].map((l) => l.textContent ?? ''),
          combo: bubble.querySelector('.demo-combo')?.textContent ?? null,
          stunned: ['e1', 'e2'].map((id) => scene.units.get(id)?.stunned ?? null),
          tinted: (scene.hl?.commandBuffer.length ?? 0) > 0,
          floats: scene.children.list.filter((o) => o.type === 'Text' && o.depth === 3000 && o.alpha > 0).length,
          minis: scene.children.list
            .filter((o) => o.type === 'Image' && o.visible && (o.texture?.key ?? '').startsWith('placed-'))
            .map((o) => o.texture?.key ?? '')
            .sort(),
        });
      }).observe(bubble, { attributes: true, attributeFilter: ['data-beat'] });
    }
    return w.__beats?.length ?? 0;
  });
  const handle = await page.waitForFunction(
    ({ name, from }) =>
      (window as unknown as { __beats?: Moment[] }).__beats?.slice(from).find((m) => m.beat === name) ?? false,
    { name, from },
    { timeout: 60_000 },
  );
  return (await handle.jsonValue()) as Moment;
}

async function boxOf(el: Locator) {
  const box = await el.boundingBox();
  if (!box) throw new Error('el elemento no está a la vista');
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

type DemoWindow = {
  __ventiscaDemo: { units: Map<string, { container: { x: number; y: number }; ko: boolean; stunned: boolean }> };
};

/**
 * Lo que se lee sobre cada unidad, en el último tablero en miniatura que se ve, no se sale por los lados,
 * no pisa otra etiqueta y no tapa a ninguna unidad. `view` es la parte del tablero que muestra, en casillas.
 */
async function expectLabelsClear(page: Page, what: string, view: { x: number; y: number; w: number; h: number }) {
  await expect(page.locator('.demo-label').first()).toBeVisible();
  const found = await page.evaluate(() => {
    const board = [...document.querySelectorAll('.demo-board')].at(-1) as HTMLElement;
    const area = board.getBoundingClientRect();
    const boxes = [...board.querySelectorAll('.demo-label')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent ?? '', left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return {
      area: { left: area.left, right: area.right, top: area.top, width: area.width, height: area.height },
      boxes,
    };
  });
  expect(found.boxes.length).toBeGreaterThan(0);
  // Ninguna etiqueta se sale del tablero en miniatura por los lados.
  for (const b of found.boxes) {
    expect(b.left, `${what}: ${b.text}`).toBeGreaterThanOrEqual(found.area.left - 1);
    expect(b.right, `${what}: ${b.text}`).toBeLessThanOrEqual(found.area.right + 1);
  }
  // Ni pisa a otra.
  for (const [i, a] of found.boxes.entries()) {
    for (const b of found.boxes.slice(i + 1)) {
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `${what}: "${a.text}" pisa "${b.text}"`).toBe(true);
    }
  }
  // Ni tapa a una unidad: cada una está en su casilla, y la etiqueta va sobre la de arriba, que está libre.
  const units = await page.evaluate(() => {
    const scenes = (window as unknown as DemoWindow).__ventiscaDemo;
    return [...scenes.units.values()].map((u) => ({ x: u.container.x, y: u.container.y }));
  });
  const cell = { w: found.area.width / view.w, h: found.area.height / view.h };
  for (const u of units) {
    // Del escenario (casillas de 100×84 desde (190, 102)) a las casillas del tablero en miniatura.
    const col = Math.floor((u.x - 190) / 100) - view.x;
    const row = Math.floor((u.y - 102) / 84) - view.y;
    if (col < 0 || col >= view.w || row < 0 || row >= view.h) continue;
    const box = {
      left: found.area.left + col * cell.w,
      right: found.area.left + (col + 1) * cell.w,
      top: found.area.top + row * cell.h + 6,
      bottom: found.area.top + (row + 1) * cell.h,
    };
    for (const b of found.boxes) {
      const apart = b.right <= box.left || box.right <= b.left || b.bottom <= box.top || box.bottom <= b.top;
      expect(apart, `${what}: "${b.text}" tapa a la unidad de (${col}, ${row})`).toBe(true);
    }
  }
}

test('D-81: el ▶ junto al título de la mano abre la demostración de la carta, que juega el motor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startBoard(page, hands([9, 12]), LEARNED);
  // Un solo ▶ para toda la mano, junto a su título. Nada abierto todavía.
  await expect(page.locator('.hand .demo-open')).toHaveCount(1);
  await expect(demo(page)).toHaveCount(0);
  const title = await boxOf(page.locator('.hand-title'));
  const button = await boxOf(opener(page, 'Brasa'));
  expect(button.left).toBeGreaterThanOrEqual(title.left);
  expect(button.right).toBeLessThanOrEqual(title.right + 1);

  await opener(page, 'Brasa').click();
  // Usa el valor de la primera carta de la mano, y empieza sin combo.
  await expect(demo(page)).toBeVisible();
  await expect(demo(page).getByRole('heading')).toHaveText('Carta de Fuego · 9');
  await expect(demo(page).getByRole('button', { name: 'Sin combo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(caption(page)).toHaveText('Daña y aturde a los gólems del área: pierden su próximo turno.');
  // La burbuja va sobre la mano, dentro de la pantalla, y su tablero en miniatura tiene un lienzo propio.
  const bubble = await boxOf(page.locator('.demo'));
  const hand = await boxOf(page.locator('.hand'));
  expect(bubble.bottom).toBeLessThanOrEqual(hand.top);
  expect(hand.top - bubble.bottom).toBeLessThanOrEqual(16);
  expect(bubble.top).toBeGreaterThanOrEqual(0);
  expect(bubble.right).toBeLessThanOrEqual(1280);
  await expect(page.locator('.demo-stage canvas')).toHaveCount(1);

  // Se juega en bucle: lo planeado, el turno, el resultado, y otra vez.
  // Antes de jugar se ve lo planeado: la carta de Brasa colocada, y nada que leer todavía.
  expect(await at(page, 'before')).toMatchObject({ labels: [], stunned: [false, false], minis: ['placed-fire'] });
  // El resultado lo resolvió el motor: 9 de daño a cada gólem del área, y aturdidos. Lo planeado ya no se ve.
  expect(await at(page, 'after')).toMatchObject({
    labels: ['−9 · aturdido', '−9 · aturdido'],
    stunned: [true, true],
    minis: [],
    tinted: false,
    floats: 0,
  });
  // Y vuelve a empezar, con el tablero como al principio.
  expect(await at(page, 'before')).toMatchObject({ labels: [], stunned: [false, false], minis: ['placed-fire'] });

  // No toca la partida: ni el turno, ni los planes, ni la carta elegida.
  expect(await state(page)).toMatchObject({ phase: 'planning', active: 'fire', pendingCard: null, plans: {}, turn: 0 });
  expect(errors).toEqual([]);
});

test('D-81: con combo se ve también la carta de otro ninja, y la demostración dice qué suma', async ({ page }) => {
  await startBoard(page, hands([9]), LEARNED);
  await opener(page, 'Brasa').click();
  await demo(page).getByRole('button', { name: 'Con combo' }).click();
  await expect(demo(page).getByRole('button', { name: 'Con combo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(caption(page)).toHaveText(
    'Con combo, si otro ninja también juega carta este turno: además los quema, 3 de daño por turno durante 3 turnos.',
  );
  // Antes de jugar se ven las dos cartas colocadas: la de Brasa y la de otro ninja.
  await expect.poll(async () => (await at(page, 'before')).minis).toEqual(['placed-fire', 'placed-water']);
  // El tablero en miniatura dice "¡Combo!" un momento.
  expect((await at(page, 'combo')).combo).toBe('¡Combo!');
  // El cartel del combo de la partida no sale: la demostración no toca su interfaz.
  await expect(page.locator('.combo')).toHaveCount(0);
  // Al final los gólems quedan, además, quemados.
  expect((await at(page, 'after')).labels).toEqual(['−9 · aturdido · quema', '−9 · aturdido · quema']);
  // De vuelta a "Sin combo", una sola carta.
  await demo(page).getByRole('button', { name: 'Sin combo' }).click();
  await expect(caption(page)).toHaveText('Daña y aturde a los gólems del área: pierden su próximo turno.');
  await expect.poll(async () => (await at(page, 'before')).minis).toEqual(['placed-fire']);
});

test('D-81: usa el valor de la carta elegida o de la primera; con la mano vacía, sin números', async ({ page }) => {
  await startBoard(page, hands([9, 12], [10]), LEARNED);
  // Con la segunda carta elegida, la demostración es la de esa carta.
  await page.keyboard.press('2');
  expect((await state(page)).pendingCard).toBe('fire-2');
  await opener(page, 'Brasa').click();
  await expect(demo(page).getByRole('heading')).toHaveText('Carta de Fuego · 12');
  expect((await at(page, 'after')).labels).toEqual(['−12 · aturdido', '−12 · aturdido']);
  await page.keyboard.press('Escape');
  await expect(demo(page)).toHaveCount(0);
  // Sigue elegida: la demostración no la soltó.
  expect((await state(page)).pendingCard).toBe('fire-2');

  // La de Marea, con su carta de 10: el doble a cada gólem.
  await page.locator('[data-ninja-panel="water"]').click();
  await opener(page, 'Marea').click();
  await expect(demo(page).getByRole('heading')).toHaveText('Carta de Agua · 10');
  await expect(caption(page)).toHaveText('Hace el doble del valor de la carta a los gólems del área.');
  expect((await at(page, 'after')).labels).toEqual(['−20', '−20']);
  await demo(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(demo(page)).toHaveCount(0);

  // Escarcha no tiene cartas: se ve el efecto, sin números.
  await page.locator('[data-ninja-panel="snow"]').click();
  await expect(page.locator('.hand .hand-empty')).toBeVisible();
  await opener(page, 'Escarcha').click();
  await expect(demo(page).getByRole('heading')).toHaveText('Carta de Nieve');
  expect((await at(page, 'after')).labels).toEqual(['revive']);
});

test('D-81: una a la vez; Esc, un clic fuera o cambiar de ninja la cierran, y no pausa el reloj', async ({ page }) => {
  // En ritmo Normal: el reloj corre.
  await startBoard(page, hands([9], [10]), { ...LEARNED, pace: 'normal' });
  const deadline = () =>
    page.evaluate(() => {
      const s = (window as unknown as TestWindow).__ventisca.getState() as unknown as {
        timer: { deadline: number | null; remaining: number | null };
        paused: boolean;
      };
      return { running: s.timer.deadline !== null, paused: s.paused };
    });
  expect(await deadline()).toEqual({ running: true, paused: false });
  await opener(page, 'Brasa').click();
  await expect(demo(page)).toHaveCount(1);
  expect(await deadline()).toEqual({ running: true, paused: false });

  // Con la demostración abierta, las teclas del juego esperan: ni cambian de ninja ni confirman el turno.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  expect(await state(page)).toMatchObject({ phase: 'planning', active: 'fire', pendingCard: null, turn: 0 });
  await expect(demo(page)).toHaveCount(1);

  // Un clic fuera la cierra, y ese clic no llega al tablero: Brasa no se movió.
  await page.mouse.click(tile(2, 1).x, tile(2, 1).y);
  await expect(demo(page)).toHaveCount(0);
  expect(await state(page)).toMatchObject({ plans: {}, demo: null });
  // Ya cerrada, el tablero responde.
  await page.mouse.click(tile(2, 1).x, tile(2, 1).y);
  expect((await state(page)).plans).toMatchObject({ fire: { moveTo: { x: 2, y: 1 } } });

  // Esc la cierra sin deshacer nada del plan ni abrir la pausa.
  await opener(page, 'Brasa').click();
  await expect(demo(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(demo(page)).toHaveCount(0);
  expect(await state(page)).toMatchObject({ plans: { fire: { moveTo: { x: 2, y: 1 } } } });
  expect((await deadline()).paused).toBe(false);

  // El ▶ también la cierra, y al abrir la de otro ninja solo queda esa.
  await opener(page, 'Brasa').click();
  await expect(demo(page)).toHaveCount(1);
  await opener(page, 'Brasa').click({ force: true });
  await expect(demo(page)).toHaveCount(0);
  await page.keyboard.press('Tab');
  await opener(page, 'Marea').click();
  await expect(demo(page)).toHaveCount(1);
  await expect(demo(page).getByRole('heading')).toHaveText('Carta de Agua · 10');
  await expect(page.locator('.demo-stage canvas')).toHaveCount(1);
  // Si la mano pasa a otro ninja, como al empezar un turno, la demostración de Marea se cierra.
  await page.evaluate(() => {
    const store = (window as unknown as TestWindow).__ventisca as unknown as { setState(patch: object): void };
    store.setState({ active: 'fire' });
  });
  await expect(demo(page)).toHaveCount(0);
  expect((await state(page)).demo).toBeNull();
});

test('D-81: con animaciones reducidas se ven el antes y el después, como dos imágenes fijas', async ({ page }) => {
  await startBoard(page, hands([9]), { ...LEARNED, reducedMotion: true });
  await opener(page, 'Brasa').click();
  await expect(demo(page)).toBeVisible();
  await beat(page, 'still');
  // Dos tableros, uno al lado del otro, con su nombre, y la línea de texto de la carta.
  await expect(page.locator('.demo-stage canvas')).toHaveCount(2);
  await expect(page.locator('.demo-stills figcaption')).toHaveText(['Antes', 'Después']);
  await expect(caption(page)).toHaveText('Daña y aturde a los gólems del área: pierden su próximo turno.');
  const [before, after] = await Promise.all([0, 1].map((i) => boxOf(page.locator('.demo-stills .demo-board').nth(i))));
  expect(before && after && before.right <= after.left && before.top === after.top).toBe(true);
  // Lo que cambió se lee en el de después, y no cambia con el tiempo: no hay bucle.
  expect(await labels(page)).toEqual(['−9 · aturdido', '−9 · aturdido']);
  await page.waitForTimeout(1500);
  await beat(page, 'still');
  expect(await labels(page)).toEqual(['−9 · aturdido', '−9 · aturdido']);
  const bubble = await boxOf(page.locator('.demo'));
  expect(bubble.top).toBeGreaterThanOrEqual(0);
  expect(bubble.left).toBeGreaterThanOrEqual(0);
});

test('D-81: lo que se lee sobre cada unidad no tapa a otra unidad ni a otra etiqueta', async ({ page }) => {
  // Con animaciones reducidas el resultado se ve enseguida y el tablero es el más chico: el caso más justo.
  await startBoard(page, hands([9], [9], [9]), { ...LEARNED, reducedMotion: true });
  const names = { fire: 'Brasa', water: 'Marea', snow: 'Escarcha' } as const;
  for (const id of ['fire', 'water', 'snow'] as const) {
    await page.locator(`[data-ninja-panel="${id}"]`).click();
    await opener(page, names[id]).click();
    for (const mode of ['Sin combo', 'Con combo']) {
      await demo(page).getByRole('button', { name: mode }).click();
      await expectLabelsClear(page, `${names[id]}, ${mode}`, { x: 2, y: 1, w: 4, h: 3 });
    }
    await page.keyboard.press('Escape');
  }
});

test('D-81: el consejo de la primera carta dice que el ▶ muestra qué hace, y espera mientras se mira', async ({
  page,
}) => {
  await startBoard(page, hands([9]));
  const tip = page.locator('.bubble');
  await expect(tip.locator('p')).toHaveText(
    'Tu primera carta. Elígela con un clic (o la tecla 1) y colócala en una casilla roja. El ▶ junto al título muestra qué hace.',
  );
  // Una burbuja a la vez: con la demostración abierta, el consejo espera; al cerrarla, vuelve.
  await opener(page, 'Brasa').click();
  await expect(demo(page)).toHaveCount(1);
  await expect(tip).toHaveCount(0);
  await expect(page.locator('.tip-mark')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(1);
});

/* ---------- Demostraciones de los gólems (D-82) ---------- */

/** Los tres ninjas en la columna 1 y un gólem de cada tipo delante: ninguno al alcance de Brasa. */
const GOLEMS: Board = {
  ninjas: { fire: { at: [1, 1] }, water: { at: [1, 2] }, snow: { at: [1, 3] } },
  golems: [
    { kind: 'sniper', at: [5, 1] },
    { kind: 'colossus', at: [4, 2] },
    { kind: 'artillery', at: [5, 3] },
  ],
};
const GOLEM_AT = { sniper: [5, 1], colossus: [4, 2], artillery: [5, 3] } as const;
type GolemKind = keyof typeof GOLEM_AT;
const look = (page: Page, kind: GolemKind) => {
  const [x, y] = GOLEM_AT[kind];
  return page.mouse.move(tile(x, y).x, tile(x, y).y);
};
const franja = (page: Page) => page.locator('.tip-text');
const show = (page: Page) => page.getByRole('button', { name: 'Ver cómo ataca' });
const attack = (page: Page) => page.getByRole('dialog', { name: /, cómo ataca$/ });
const PLAN_BRASA = 'Elige a dónde se mueve Brasa, o un objetivo desde donde está.';

test('D-82: al mirar a un gólem, la franja lo nombra sin números y ofrece "Ver cómo ataca"', async ({ page }) => {
  await startBoard(page, GOLEMS, LEARNED);
  await expect(franja(page)).toHaveText(PLAN_BRASA);
  await expect(show(page)).toHaveCount(0);

  await look(page, 'sniper');
  await expect(franja(page)).toHaveText('Carámbano. Pega más fuerte de lejos. Acércate para que duela menos.');
  await expect(show(page)).toBeVisible();
  // La franja, con su botón, sigue arriba del tablero: no lo pisa, y su texto se ve entero.
  const bar = await boxOf(page.locator('.tip'));
  expect(bar.bottom).toBeLessThanOrEqual(90);
  const button = await boxOf(show(page));
  expect(button.left).toBeGreaterThanOrEqual(bar.left);
  expect(button.right).toBeLessThanOrEqual(bar.right);
  expect(await franja(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  await look(page, 'artillery');
  await expect(franja(page)).toHaveText('Granizo. Su granizo salpica a los vecinos del objetivo. No se amontonen.');
  await look(page, 'colossus');
  await expect(franja(page)).toHaveText('Témpano. Lento pero brutal: barre tres casillas.');

  // Del gólem a una casilla vacía: la franja lo sigue nombrando un momento, y luego vuelve al estado del turno.
  await page.mouse.move(tile(7, 4).x, tile(7, 4).y);
  await expect(franja(page)).toHaveText('Témpano. Lento pero brutal: barre tres casillas.');
  await expect(franja(page)).toHaveText(PLAN_BRASA, { timeout: 6000 });
  await expect(show(page)).toHaveCount(0);

  // Para llegar al botón hay que sacar el ratón del gólem: la franja lo sigue nombrando mientras el ratón
  // está sobre ella, más de lo que tarda en soltarlo.
  await look(page, 'colossus');
  await show(page).hover();
  await page.waitForTimeout(3200);
  await expect(franja(page)).toHaveText('Témpano. Lento pero brutal: barre tres casillas.');
  await expect(show(page)).toBeVisible();

  // Al salir de la franja sin volver al tablero, también lo suelta al rato.
  await page.mouse.move(100, 300);
  await expect(franja(page)).toHaveText('Témpano. Lento pero brutal: barre tres casillas.');
  await expect(franja(page)).toHaveText(PLAN_BRASA, { timeout: 6000 });
  await expect(show(page)).toHaveCount(0);

  // Si quien juega hace algo, vuelve enseguida, aunque el ratón siga sobre el gólem: aquí, un clic en uno
  // que Brasa no alcanza.
  await look(page, 'sniper');
  await expect(show(page)).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.toast')).toBeVisible();
  await expect(franja(page)).toHaveText(PLAN_BRASA, { timeout: 1500 });
  await expect(show(page)).toHaveCount(0);

  // Con su demostración abierta, la franja sigue nombrando a ese gólem aunque el ratón ya no esté, y su
  // botón queda marcado. Al cerrarla, vuelve al estado del turno.
  await look(page, 'artillery');
  await show(page).click();
  await expect(attack(page)).toBeVisible();
  await page.mouse.move(100, 300);
  await page.waitForTimeout(3200);
  await expect(franja(page)).toHaveText('Granizo. Su granizo salpica a los vecinos del objetivo. No se amontonen.');
  await expect(show(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(attack(page)).toHaveCount(0);
  await expect(franja(page)).toHaveText(PLAN_BRASA);
  await expect(show(page)).toHaveCount(0);
});

test('D-82: "Ver cómo ataca" abre la demostración de cada gólem, con los números del motor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startBoard(page, GOLEMS, LEARNED);
  const expected = {
    sniper: {
      title: 'Carámbano, cómo ataca',
      caption:
        'Dispara a un solo ninja a hasta 3 casillas. Cuanto más lejos, más duele: 3 de cerca, 4 a dos casillas y 5 a tres.',
      labels: ['−5', 'a salvo', '−3'],
    },
    artillery: {
      title: 'Granizo, cómo ataca',
      caption:
        'Lanza a hasta 2 casillas: 8 al objetivo y 4 a cualquier ninja en las 8 casillas que lo rodean, también en diagonal.',
      labels: ['−4', 'a salvo', '−8'],
    },
    colossus: {
      title: 'Témpano, cómo ataca',
      caption:
        'Golpea a quien tenga al lado y barre las dos casillas a los costados de su objetivo: 10 a cada una. No se pongan hombro con hombro frente a él.',
      labels: ['a salvo', '−10', '−10'],
    },
  } as const;
  for (const kind of ['sniper', 'artillery', 'colossus'] as const) {
    await look(page, kind);
    await show(page).click();
    await expect(attack(page)).toBeVisible();
    await expect(attack(page).getByRole('heading')).toHaveText(expected[kind].title);
    await expect(caption(page)).toHaveText(expected[kind].caption);
    // Es la misma burbuja de las cartas, sobre la mano, sin el selector del combo.
    await expect(attack(page).getByRole('button', { name: 'Sin combo' })).toHaveCount(0);
    await expect(page.locator('.demo-stage canvas')).toHaveCount(1);
    const bubble = await boxOf(page.locator('.demo'));
    const hand = await boxOf(page.locator('.hand'));
    expect(bubble.bottom).toBeLessThanOrEqual(hand.top);
    expect(bubble.top).toBeGreaterThanOrEqual(0);
    // Antes del ataque no hay nada que leer; después, el daño de cada golpe y quién queda a salvo. Las
    // casillas que golpea se ven teñidas todo el bucle.
    const before = await at(page, 'before');
    expect(before.labels).toEqual([]);
    expect(before.tinted).toBe(true);
    const after = await at(page, 'after');
    expect(after.labels).toEqual(expected[kind].labels);
    expect(after.tinted).toBe(true);
    // El resultado se lee cuando ya se fue el número flotante del golpe: si no, quedaría bajo su etiqueta.
    expect(after.floats).toBe(0);
    await page.keyboard.press('Escape');
    await expect(attack(page)).toHaveCount(0);
  }
  // No toca la partida.
  expect(await state(page)).toMatchObject({ phase: 'planning', active: 'fire', plans: {}, turn: 0, demo: null });
  expect(errors).toEqual([]);
});

test('D-82: con animaciones reducidas, cada gólem muestra el antes y el después; nada tapa a una unidad', async ({
  page,
}) => {
  await startBoard(page, GOLEMS, { ...LEARNED, reducedMotion: true });
  const views = {
    sniper: { x: 2, y: 1, w: 5, h: 2 },
    artillery: { x: 2, y: 1, w: 4, h: 3 },
    colossus: { x: 3, y: 1, w: 3, h: 3 },
  } as const;
  for (const kind of ['sniper', 'artillery', 'colossus'] as const) {
    await look(page, kind);
    await show(page).click();
    await beat(page, 'still');
    await expect(page.locator('.demo-stage canvas')).toHaveCount(2);
    await expect(page.locator('.demo-stills figcaption')).toHaveText(['Antes', 'Después']);
    const [before, after] = await Promise.all(
      [0, 1].map((i) => boxOf(page.locator('.demo-stills .demo-board').nth(i))),
    );
    if (!before || !after) throw new Error('faltan los tableros');
    // El de Carámbano es ancho y bajo: sus dos imágenes van una sobre otra. Los otros, lado a lado.
    if (kind === 'sniper') expect(before.bottom).toBeLessThanOrEqual(after.top);
    else expect(before.right).toBeLessThanOrEqual(after.left);
    const bubble = await boxOf(page.locator('.demo'));
    expect(bubble.top).toBeGreaterThanOrEqual(0);
    expect(bubble.left).toBeGreaterThanOrEqual(0);
    await expectLabelsClear(page, kind, views[kind]);
    await page.keyboard.press('Escape');
    await expect(attack(page)).toHaveCount(0);
  }
});

test('D-82: con una carta en la mano, la franja no nombra al gólem ni ofrece su demostración', async ({ page }) => {
  await startBoard(page, { ...GOLEMS, ninjas: { ...GOLEMS.ninjas, fire: { at: [1, 1], hand: [9] } } }, LEARNED);
  await page.keyboard.press('1');
  await look(page, 'colossus');
  await expect(franja(page)).toHaveText('Elige dónde colocar la carta de Brasa. Afecta un área de 3×3.');
  await expect(show(page)).toHaveCount(0);
});
