import { expect, type Page } from '@playwright/test';

/* Utilidades de las pruebas e2e. Leen el store que la app expone en desarrollo (window.__ventisca). */

export interface TestState {
  phase: string;
  screen: string;
  active: string | null;
  pendingCard: string | null;
  boosting: boolean;
  plans: Record<string, unknown>;
  match: { turn: number; ninjas: { id: string; hp: number; pos: { x: number; y: number } }[] };
}

export type TestWindow = {
  __ventisca: {
    getState(): TestState;
    subscribe(listener: (state: TestState, prev: TestState) => void): () => void;
  };
};

/**
 * La traza completa, con el registro de red y el DOM de cada paso: `test.use(FULL_TRACE)` en las
 * pruebas que hablan con la API. Las del tablero se quedan con la traza ligera de playwright.config.ts.
 */
export const FULL_TRACE = { trace: 'retain-on-failure' } as const;

export const phase = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().phase);

/** Abre el juego, entra al sandbox y espera a que empiece la planificación. */
export async function startMatch(page: Page, speed = 0.3) {
  await page.goto(`/?speed=${speed}`);
  await page.getByRole('button', { name: 'Jugar sin cuenta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu equipo' })).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar partida' }).click();
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');
}

/**
 * Pide una jugada sugerida para cada ninja: S para el activo y Tab para pasar al siguiente, porque el foco
 * no salta solo (D-79).
 */
export async function suggestAll(page: Page) {
  await page.keyboard.press('s');
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Tab');
    await page.keyboard.press('s');
  }
}

export type NinjaId = 'fire' | 'water' | 'snow';

/** Un tablero preparado: dónde va cada quien, con cuánta vida y, cada ninja, con qué cartas en la mano. */
export interface Board {
  /** `deck`: cuántas cartas le quedan a ese ninja en el mazo. Sin decirlo, las que trae. */
  ninjas: Record<NinjaId, { at: [number, number]; hp?: number; hand?: number[]; deck?: number }>;
  golems: { kind: 'sniper' | 'artillery' | 'colossus'; at: [number, number] }[];
}

/**
 * Una partida en un tablero preparado, también en el anfitrión (`__ventiscaLoad`): al confirmar, el turno
 * se resuelve de verdad sobre ese tablero. Sin reloj, en Clásica. Los ajustes van con la marca de ya
 * migrados (D-79) y se siembran una sola vez: al recargar vale lo que haya guardado el juego.
 */
export async function startBoard(page: Page, board: Board, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    (saved) => {
      if (sessionStorage.getItem('sembrado')) return;
      sessionStorage.setItem('sembrado', 'sí');
      localStorage.setItem('ventisca:settings:v1', saved);
    },
    JSON.stringify({ pace: 'relaxed', ...settings, version: 2 }),
  );
  await startMatch(page);
  await page.evaluate((board) => {
    type Unit = { id: string; pos: { x: number; y: number }; hp: number; maxHp: number };
    type Match = {
      ninjas: (Unit & { everKo: boolean; hand: unknown[]; deck: unknown[] })[];
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
      n.hand = (spec.hand ?? []).map((value, i) => ({ id: `${n.id}-${i + 1}`, element: n.id, value }));
      if (spec.deck !== undefined) n.deck = n.deck.slice(0, spec.deck);
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

/** Los ajustes tal como quedaron guardados en el navegador. */
export const savedSettings = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ventisca:settings:v1') ?? 'null') as Record<string, unknown>);

/**
 * Lineamientos de diseño, sección 8: los elementos visibles de la pantalla cuyo contenido es más ancho
 * que su caja y que no se pueden desplazar, es decir, texto cortado o que se sale. También los que
 * recortan lo que no les cabe a lo alto, como una carta con un nombre de dos líneas. Devuelve una
 * descripción de cada uno; la prueba espera una lista vacía.
 *
 * No cuenta lo que pasa el ancho de una caja que no se ve (sin borde, fondo ni sombra) y se ve entero,
 * porque nada lo corta: como el nombre del juego en la portada, más ancho que el bloque que lo ordena.
 */
export function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    /** La caja se ve: lo que se sale de ella, se ve salirse. */
    const drawsBox = (style: CSSStyleDeclaration) =>
      ['Top', 'Right', 'Bottom', 'Left'].some(
        (side) => Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0,
      ) ||
      style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      style.backgroundImage !== 'none' ||
      style.boxShadow !== 'none';
    /** Un antepasado que esconde lo que se sale de él lo corta: el contenido pasa su borde derecho. */
    const cutByAncestor = (el: HTMLElement, right: number) => {
      for (let up = el.parentElement; up; up = up.parentElement) {
        const { overflowX } = getComputedStyle(up);
        if (overflowX === 'visible') continue;
        // Si se desplaza, lo que no cabe se alcanza desplazándolo: no está cortado.
        if (overflowX === 'auto' || overflowX === 'scroll') return false;
        return right > up.getBoundingClientRect().right + 1;
      }
      return false;
    };
    for (const el of document.querySelectorAll('.screen, .screen *, .modal, .modal *')) {
      if (!(el instanceof HTMLElement)) continue;
      // Los campos de texto se desplazan solos al escribir; los iframes (Turnstile) traen su propia caja.
      if (el instanceof HTMLInputElement || el instanceof HTMLIFrameElement) continue;
      // El texto solo para lectores de pantalla se recorta a propósito.
      if (el.classList.contains('sr-only')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || el.clientWidth === 0) continue;
      const style = getComputedStyle(el);
      const { overflowX, overflowY } = style;
      const wide = el.scrollWidth > el.clientWidth + 1 && overflowX !== 'auto' && overflowX !== 'scroll';
      const tall = el.scrollHeight > el.clientHeight + 1 && (overflowY === 'hidden' || overflowY === 'clip');
      if (!wide && !tall) continue;
      if (wide && !tall && overflowX === 'visible' && !drawsBox(style)) {
        // Hasta dónde llega el contenido, en la escala en que se dibuja (el escenario puede ir achicado).
        const scale = el.offsetWidth > 0 ? box.width / el.offsetWidth : 1;
        if (!cutByAncestor(el, box.left + (el.clientLeft + el.scrollWidth) * scale)) continue;
      }
      const name = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().replace(/\s+/g, '.')}` : ''}`;
      const size = wide ? `${el.scrollWidth} > ${el.clientWidth}` : `alto ${el.scrollHeight} > ${el.clientHeight}`;
      found.push(`${name} (${size}): ${(el.textContent ?? '').trim().slice(0, 60)}`);
    }
    return found;
  });
}

/**
 * Lineamientos de diseño, sección 8: los textos visibles de menos de 13 px. Devuelve una descripción de
 * cada uno; la prueba espera una lista vacía.
 */
export function smallText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('.screen *, .modal *')) {
      if (!(el instanceof HTMLElement)) continue;
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join(' ')
        .trim();
      if (text === '') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size >= 13) continue;
      found.push(
        `${el.tagName.toLowerCase()}.${String(el.className).trim().replace(/\s+/g, '.')} (${size} px): ${text.slice(0, 40)}`,
      );
    }
    return found;
  });
}
