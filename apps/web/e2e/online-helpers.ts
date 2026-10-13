import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import { codeOf, lastMail, person } from './account-helpers';
import { type Board, prepareBoard } from './control';
import type { TestWindow } from './helpers';

/*
 * Utilidades de las e2e del juego en línea, contra el servidor de verdad: varias personas a la vez, cada
 * una con su navegador y su cuenta. Las cuentas se crean por la API, que es más rápido que por la
 * interfaz: el registro, la verificación y el camino por la interfaz ya los cubren las e2e de cuentas.
 */

export type Element = 'fire' | 'water' | 'snow';

export interface Player {
  context: BrowserContext;
  page: Page;
  email: string;
  displayName: string;
}

/** Lo que estas pruebas leen del estado del juego en línea. */
export interface OnlineTestState {
  screen: string;
  phase: string;
  local: boolean;
  plans: Record<string, { moveTo?: { x: number; y: number } } | undefined>;
  match: { turn: number; ninjas: { id: string; hp: number; pos: { x: number; y: number } }[] } | null;
  online: {
    link: string;
    place: string | null;
    element: Element;
    room: { code: string; start: string } | null;
    match: {
      you: Element;
      turn: number | null;
      ready: Element[];
      plays: boolean;
      seats: { element: Element; kind: string; status: string }[];
    } | null;
    /** El resultado de la partida, cuando ya terminó. */
    end: { result: string } | null;
  };
}

export const online = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState() as unknown as OnlineTestState);

/**
 * Una persona nueva, con su cuenta verificada y su camino, y el juego abierto en la portada. Con `track`,
 * la prueba puede cortarle la conexión (`dropLink`).
 */
export async function newPlayer(browser: Browser, camino: Element, { track = false } = {}): Promise<Player> {
  const speed = 0.3;
  const context = await browser.newContext();
  const page = await context.newPage();
  if (track) await trackLink(page);
  const who = person();
  await page.goto(`/?speed=${speed}`);
  const post = (path: string, body: object) =>
    page.evaluate(
      async ([p, b]) => {
        const res = await fetch(p as string, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(b),
        });
        return res.status;
      },
      [path, body] as const,
    );
  // El registro responde lo mismo exista o no la cuenta (D-59): basta con que no falle.
  const ok = async (status: Promise<number>) => expect(await status).toBeLessThan(300);
  await ok(post('/api/auth/register', { ...who, acceptPrivacy: true, captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' }));
  const code = codeOf(await lastMail(who.email, /Tu código para Ventisca/));
  await ok(post('/api/auth/verify', { email: who.email, code }));
  await ok(post('/api/progress/camino', { element: camino }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible();
  return { context, page, email: who.email, displayName: who.displayName };
}

/** Desde la portada: "Jugar en línea", hasta la ficha con la conexión abierta. */
export async function openOnline(page: Page) {
  await page.getByRole('button', { name: /^Jugar en línea/ }).click();
  await expect(page.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
  await expect.poll(async () => (await online(page)).online.link).toBe('open');
}

/** Quien llega crea una sala; devuelve su código. */
export async function createRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Sala con código' }).click();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page.getByRole('heading', { name: 'Tu sala' })).toBeVisible();
  return (await online(page)).online.room?.code ?? '';
}

export async function joinRoom(page: Page, code: string) {
  await page.getByRole('button', { name: 'Sala con código' }).click();
  await page.getByLabel('Código de la sala').fill(code);
  await page.getByRole('button', { name: 'Unirse', exact: true }).click();
}

/* ---------- Tableros preparados ---------- */

/** La última ronda, con un gólem a punto de caer al alcance de Brasa. Sin bonus: Escarcha no está a vida completa. */
export const LAST_BLOW: Board = {
  round: 3,
  bonus: 'fullHealth',
  ninjas: { fire: { at: [3, 2] }, snow: { hp: 20 } },
  golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
};

/** La misma ronda, con una carta en la mano de Brasa y otra en la de Marea, y el gólem al alcance de las dos. */
export const COMBO: Board = {
  round: 3,
  bonus: 'fullHealth',
  ninjas: { fire: { at: [3, 1], hand: [10] }, water: { at: [3, 3], hand: [9] }, snow: { hp: 20 } },
  golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
};

/**
 * La primera ronda, con un gólem a punto de caer al alcance de Brasa. Después el equipo no aguanta: Brasa y
 * Marea tienen 1 de vida y Escarcha ya cayó, así que los gólems de la ronda 2 ganan en pocos turnos.
 */
export const ONE_ROUND: Board = {
  round: 1,
  ninjas: { fire: { at: [5, 2], hp: 1 }, water: { at: [5, 3], hp: 1 }, snow: { hp: 0 } },
  golems: [{ kind: 'sniper', at: [7, 2], hp: 1 }],
};

/* ---------- Salas y partidas ---------- */

/**
 * Una sala con esas personas dentro, cada una con el ninja de su camino, lista para empezar. La crea la
 * primera. Con `board`, su próxima partida empieza en ese tablero preparado.
 */
export async function gatherRoom(players: Player[], board?: Board): Promise<string> {
  const [host, ...guests] = players as [Player, ...Player[]];
  for (const p of players) await openOnline(p.page);
  const code = await createRoom(host.page);
  if (board) await prepareBoard(code, board);
  for (const guest of guests) {
    await joinRoom(guest.page, code);
    await expect(guest.page.getByText(`Esperando a que ${host.displayName} empiece la partida.`)).toBeVisible();
  }
  return code;
}

/** Quien creó la sala empieza la partida, y se espera a que todas las personas estén planeando su primer turno. */
export async function startRoomMatch(players: Player[]): Promise<void> {
  const [host] = players as [Player, ...Player[]];
  await host.page.getByRole('button', { name: /^Empezar (partida|con el bot)$/ }).click();
  for (const p of players) await planning(p.page, 1);
}

/** Espera a que esa persona esté planeando ese turno. */
export async function planning(page: Page, turn: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const s = await online(page);
        return s.phase === 'planning' ? s.online.match?.turn : null;
      },
      { timeout: 60_000 },
    )
    .toBe(turn);
}

/**
 * Esas personas confirman sin planear nada, turno tras turno, hasta que `done` dice que ya está. Cada una
 * confirma solo cuando le toca: con su ninja en pie y sin haber confirmado ese turno. Así el turno se
 * resuelve en el acto, sin esperar al reloj.
 */
export async function passUntil(
  players: Player[],
  done: (states: OnlineTestState[]) => boolean,
  maxMs = 90_000,
): Promise<void> {
  const until = Date.now() + maxMs;
  const confirmed = new Map<Player, number>();
  for (;;) {
    const states = await Promise.all(players.map((p) => online(p.page)));
    if (done(states)) return;
    for (const [i, player] of players.entries()) {
      const match = (states[i] as OnlineTestState).online.match;
      if (!match || match.turn === null || (states[i] as OnlineTestState).phase !== 'planning') continue;
      if (!match.plays || match.ready.includes(match.you) || match.turn <= (confirmed.get(player) ?? 0)) continue;
      await player.page.keyboard.press('Space');
      confirmed.set(player, match.turn);
    }
    if (Date.now() > until) {
      const turns = states.map((s) => s.online.match?.turn ?? 'sin partida').join(', ');
      throw new Error(`La partida no llegó a donde la prueba esperaba: va en el turno ${turns}.`);
    }
    await (players[0] as Player).page.waitForTimeout(120);
  }
}

/** Lo mismo, hasta que la partida termina para todas esas personas. */
export const passUntilEnd = (players: Player[], maxMs?: number) =>
  passUntil(players, (states) => states.every((s) => s.online.end !== null || s.online.match === null), maxMs);

/** El progreso de esa persona tal como lo guarda el servidor: sus monedas, sus estadísticas y sus logros. */
export function progressOf(page: Page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/progress');
    const body = (await res.json()) as {
      coins: number;
      achievements: string[];
      stats: { classic: { matches: number; rounds: number; wins: number } };
    };
    return { coins: body.coins, achievements: body.achievements, stats: body.stats.classic };
  });
}

/**
 * Anota las conexiones del juego que abra esa página, para poder cortarlas desde la prueba. Va antes de
 * cargar el juego.
 */
export async function trackLink(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __links: WebSocket[] };
    w.__links = [];
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).includes('/api/play')) w.__links.push(this);
      }
    };
  });
}

/**
 * Deja a esa persona sin red: corta su conexión del juego y no deja abrir otra, hasta `restoreLink`. Cortar
 * la red del navegador no cierra un WebSocket ya abierto, así que la conexión se cierra desde la página; para
 * el servidor es lo mismo: la conexión se cerró sin que la persona saliera.
 */
export async function dropLink(player: Player): Promise<void> {
  await player.context.setOffline(true);
  await player.page.evaluate(() => {
    for (const link of (window as unknown as { __links: WebSocket[] }).__links) link.close();
  });
  await expect.poll(async () => (await online(player.page)).online.link).toBe('reconnecting');
}

/** Le devuelve la red: el juego vuelve a conectarse solo, en su siguiente intento. */
export async function restoreLink(player: Player): Promise<void> {
  await player.context.setOffline(false);
  await expect.poll(async () => (await online(player.page)).online.link, { timeout: 30_000 }).toBe('open');
}

/** Un clic en una casilla del tablero, que se dibuja en un escenario de 1280×720 a escala. */
export async function clickTile(page: Page, x: number, y: number) {
  const box = await page.locator('.stage-frame').boundingBox();
  if (!box) throw new Error('No se ve el escenario.');
  const scale = box.width / 1280;
  await page.mouse.click(box.x + (190 + x * 100 + 50) * scale, box.y + (102 + y * 84 + 42) * scale);
}

/**
 * La pantalla de carga se ve un momento: para saber qué mostró sin depender de alcanzarla, la propia página
 * anota el texto de su consejo en cuanto aparece.
 */
export async function watchLoading(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as TestWindow & { __loading: string[] };
    w.__loading = [];
    const read = () => {
      const tip = document.querySelector('.load-tip');
      if (tip) w.__loading.push(tip.textContent ?? '');
    };
    w.__ventisca.subscribe((s) => {
      if (s.screen === 'loading') requestAnimationFrame(read);
    });
  });
}

/** Lo que mostró la pantalla de carga desde `watchLoading`. */
export const loadingSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __loading: string[] }).__loading);
