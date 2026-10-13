import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import { codeOf, lastMail, person } from './account-helpers';
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
      seats: { element: Element; status: string }[];
    } | null;
  };
}

export const online = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState() as unknown as OnlineTestState);

/** Una persona nueva, con su cuenta verificada y su camino, y el juego abierto en la portada. */
export async function newPlayer(browser: Browser, camino: Element, speed = 0.3): Promise<Player> {
  const context = await browser.newContext();
  const page = await context.newPage();
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
