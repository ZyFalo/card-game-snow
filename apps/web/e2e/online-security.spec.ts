import { expect, type Page, test } from '@playwright/test';
import { FULL_TRACE } from './helpers';
import { createRoom, newPlayer, online, openOnline } from './online-helpers';

/*
 * Quién puede abrir la conexión del juego en línea, desde un navegador de verdad: solo el propio juego
 * (D-65), una pestaña por cuenta, y mientras dure la sesión (D-102).
 */

test.use(FULL_TRACE);

/** El servidor de las pruebas, sin pasar por el cliente: otro origen del mismo sitio que el juego. */
const SERVER = '127.0.0.1:3100';

/** Intenta abrir una conexión de juego desde esa página. `open` si se abrió; si no, el código con que se cerró. */
const tryPlay = (page: Page, url: string) =>
  page.evaluate(
    (url) =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket(url);
        socket.onopen = () => {
          resolve('open');
          socket.close();
        };
        socket.onclose = (event) => resolve(`closed:${event.code}`);
      }),
    url,
  );

test('D-65: solo el propio juego abre la conexión: una página de otro origen no puede, aunque el navegador mande la sesión', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  // Desde el juego, con su sesión, la conexión se abre.
  expect(await tryPlay(ana.page, 'ws://127.0.0.1:5174/api/play')).toBe('open');

  // Otra página del mismo navegador, servida desde otro origen del mismo sitio: las cookies no distinguen
  // puertos, así que la sesión de Ana viaja con lo que esa página pida.
  const other = await ana.context.newPage();
  await other.goto(`http://${SERVER}/api/health`);
  const status = await other.evaluate(async () => (await fetch('/api/play/status')).status);
  expect(status).toBe(200);
  // Aun así no puede abrir la conexión del juego: el servidor mira de dónde viene.
  expect(await tryPlay(other, `ws://${SERVER}/api/play`)).toBe('closed:1006');
  expect(await tryPlay(other, 'ws://127.0.0.1:5174/api/play')).toBe('closed:1006');

  // Sin sesión tampoco se abre, ni desde el propio juego.
  const guest = await browser.newContext();
  const page = await guest.newPage();
  await page.goto('/');
  expect(await tryPlay(page, 'ws://127.0.0.1:5174/api/play')).toBe('closed:1006');
  await guest.close();
  await ana.context.close();
});

test('D-102: una cuenta juega desde una sola pestaña: la segunda desplaza a la primera, que puede volver a tomar la conexión', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  await openOnline(ana.page);

  // Ana abre el juego en otra pestaña y entra a jugar en línea: vale la nueva.
  const second = await ana.context.newPage();
  await second.goto('/?speed=0.3');
  await openOnline(second);
  const replaced = (page: Page) => page.getByRole('alertdialog', { name: 'Abriste el juego en otra pestaña' });
  await expect(replaced(ana.page)).toContainText(
    'Una cuenta juega en línea desde una sola pestaña a la vez. Sigue en la otra, o conéctate aquí.',
  );
  expect((await online(ana.page)).online.link).toBe('replaced');
  expect((await online(second)).online.link).toBe('open');
  // La primera no intenta volver sola: si lo hiciera, las dos pestañas se quitarían la conexión sin parar.
  await ana.page.waitForTimeout(1500);
  expect((await online(second)).online.link).toBe('open');

  // "Conectarme aquí" la recupera, y ahora es la otra pestaña la que se entera.
  await replaced(ana.page).getByRole('button', { name: 'Conectarme aquí' }).click();
  await expect(replaced(ana.page)).toHaveCount(0);
  await expect.poll(async () => (await online(ana.page)).online.link).toBe('open');
  await expect(replaced(second)).toBeVisible();
  await ana.context.close();
});

test('D-102: al cerrar la sesión, la conexión del juego se cierra en el acto, también en otra pestaña', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  await openOnline(ana.page);
  // En una sala, y no en la cola pública: la cola es una sola, y la comparten las pruebas de online.spec.ts.
  await createRoom(ana.page);

  // Desde otra pestaña del mismo navegador, Ana cierra su sesión.
  const second = await ana.context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Mi cuenta' }).click();
  await second.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(second.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();

  // La pestaña que esperaba en su sala se entera sola: su conexión ya no existe.
  const ended = ana.page.getByRole('alertdialog', { name: 'Tu sesión terminó' });
  await expect(ended).toContainText('Entra de nuevo para jugar en línea.');
  expect((await online(ana.page)).online.link).toBe('signedOut');
  await ended.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(ana.page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await ana.context.close();
});
