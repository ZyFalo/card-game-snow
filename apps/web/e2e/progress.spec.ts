import { expect, type Page, test } from '@playwright/test';
import { chooseCamino, giveAchievements, giveCoins, logIn, person, signUp } from './account-helpers';
import { clippedElements, FULL_TRACE, smallText } from './helpers';

/*
 * El progreso de la cuenta en el cliente, contra el servidor de verdad (PRD §18 y PRD de v2, D-34): la
 * carta de camino y la Libreta ninja (D-100), con la colección y la tienda de cajas. Las monedas las da un
 * apoyo de pruebas: ganarlas jugando en línea lo cubren las e2e del juego en línea.
 */

test.use(FULL_TRACE);

const wallet = (page: Page) => page.locator('.note-bar .coins');
const buy = (page: Page, size: 1 | 2 | 3) =>
  page.getByRole('button', { name: new RegExp(`^Comprar una caja de ${size} cartas? de`) });
/** La pestaña de un elemento, en "Abrir cajas". */
const boxTab = (page: Page, element: string) => page.getByRole('tab', { name: new RegExp(`^${element}`) });
/** La cuadrícula de 2 × 5 de "Mis cartas". */
const grid = (page: Page) => page.locator('.note-grid');
/** Qué página de "Mis cartas" se ve: el elemento y cuál de sus dos páginas. */
const pageLine = (page: Page) => page.locator('.note-page');
/** Un pliegue del amuleto, en "Mi progreso", y uno de sus logros. */
const fold = (page: Page, id: string) => page.locator(`.note-fold[data-fold="${id}"]`);
const achievement = (page: Page, id: string) => page.locator(`.note-fold [data-achievement="${id}"]`);

/** Desde el perfil: abre la Libreta ninja en "Mi progreso". */
async function openNotebook(page: Page) {
  await page.getByRole('button', { name: 'Libreta ninja' }).click();
  await expect(page.getByRole('heading', { name: 'Mi progreso' })).toBeVisible();
}

/** Desde el perfil: la Libreta, en "Mis cartas". */
async function openCards(page: Page) {
  await openNotebook(page);
  await page.getByRole('tab', { name: 'Mis cartas' }).click();
  await expect(page.getByRole('heading', { name: 'Mis cartas' })).toBeVisible();
}

/** Desde el perfil: la Libreta, en "Abrir cajas", que es la tienda. */
async function openBoxes(page: Page) {
  await openCards(page);
  await page.getByRole('button', { name: 'Abrir cajas' }).click();
  await expect(page.getByRole('heading', { name: 'Abrir cajas' })).toBeVisible();
}

/** Cierra la Libreta con su ✕ y vuelve al perfil. */
async function closeNotebook(page: Page) {
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();
}

test('R-30: al verificar la cuenta se elige el camino, que queda en el perfil con el mazo inicial', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Sin elegirlo todavía, el perfil lo recuerda y lleva a elegirlo.
  await signUp(page);
  await expect(page.getByRole('heading', { name: 'Todavía no eliges tu camino' })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir mi camino' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu camino' })).toBeVisible();
  // Hasta marcar una carta no hay nada que confirmar.
  await expect(page.getByRole('button', { name: 'Elige una carta' })).toBeDisabled();
  await page.getByRole('button', { name: /Camino del Fuego/, pressed: false }).click();
  await expect(page.getByRole('button', { name: 'Elegir el Camino del Fuego' })).toBeEnabled();
  await chooseCamino(page, 'Agua');
  await expect(page.getByRole('status')).toHaveText('Listo: elegiste el Camino del Agua y recibiste tu mazo inicial.');

  const summary = page.getByRole('region', { name: 'Tu progreso' });
  const check = async () => {
    await expect(summary.getByRole('heading', { name: 'Camino del Agua' })).toBeVisible();
    await expect(summary.locator('.coins')).toHaveText('0 monedas');
    // El mazo inicial, en la Libreta: un 9 de cada elemento y el 12 del camino.
    await openNotebook(page);
    await expect(page.locator('.fold-foot span')).toHaveText(['1/20 cartas', '2/20 cartas', '1/20 cartas']);
    await expect(page.locator('.note-wallet')).toHaveText(/^Cajas: 0 abiertas\s*0 monedas$/);
    await expect(page.locator('.note-camino')).toHaveText('Camino del Agua · Marea');
    // Sin partidas jugadas todavía, y son privadas.
    await expect(page.getByText('Solo tú las ves')).toBeVisible();
    await expect(page.locator('.note-stats dd')).toHaveText(['0', '0', '0']);
    await closeNotebook(page);
  };
  await check();
  // Vive en la cuenta: sigue ahí al recargar.
  await page.reload();
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  await check();
  // El camino es permanente: ya no se ofrece elegirlo.
  await expect(page.getByRole('button', { name: 'Elegir mi camino' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('R-30: quien entra sin haber elegido su camino llega a elegirlo', async ({ page }) => {
  const who = await signUp(page);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('heading', { name: 'Elige tu camino' })).toBeVisible();
  await chooseCamino(page, 'Nieve');
  await expect(page.getByRole('heading', { name: 'Camino de la Nieve' })).toBeVisible();
  // Con el camino elegido, entrar lleva al perfil.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
});

test('D-104 y D-105: "Mi progreso" muestra el amuleto de 4 pliegues y el avance de cada logro, tal como lo guarda el servidor', async ({
  page,
}) => {
  const who = await signUp(page, person(), 'Nieve');
  await openNotebook(page);
  // Una cuenta nueva: los cuatro pliegues sin empezar, cada uno con sus tres logros y con quién se gana.
  await expect(page.getByRole('heading', { name: 'Amuleto · 0 de 4 pliegues' })).toBeVisible();
  await expect(
    page.getByText(
      'Fuego, Agua y Nieve se ganan con su ninja; el centro, Equipo, con cualquiera. Con los cuatro, las monedas de cada partida valen el doble.',
    ),
  ).toBeVisible();
  await expect(page.locator('.note-fold h3')).toHaveText([
    /^Fuego\s*0\/3/,
    /^Agua\s*0\/3/,
    /^Nieve\s*0\/3/,
    /^Equipo\s*0\/3/,
  ]);
  await expect(page.locator('.note-fold > .note-quiet')).toHaveText([
    'con Brasa',
    'con Marea',
    'con Escarcha',
    'con cualquier ninja',
  ]);
  await expect(fold(page, 'fire').locator('.ach-head b')).toHaveText(['Barrido perfecto', 'Aturdidor', 'Llamarada']);
  await expect(fold(page, 'water').locator('.ach-head b')).toHaveText(['Rompeolas', 'Marea alta', 'De pie otra vez']);
  await expect(fold(page, 'snow').locator('.ach-head b')).toHaveText([
    'Reanimador',
    'Mano sanadora',
    'Escudo de nieve',
  ]);
  await expect(fold(page, 'team').locator('.ach-head b')).toHaveText([
    'Combo triple',
    'Sin un rasguño',
    'Nadie se queda atrás',
  ]);
  // La explicación de cada logro está siempre a la vista, no solo al pasar el ratón.
  await expect(fold(page, 'snow').locator('.ach-what')).toHaveText([
    'Compañeros revividos',
    'Curas a compañeros',
    'Golpes que anula tu escudo',
  ]);
  await expect(fold(page, 'team').locator('.ach-what')).toHaveText([
    'Turnos con las tres cartas',
    'Bonus con todos a vida completa',
    'Victorias en que alguien cayó y los tres terminaron de pie',
  ]);
  await expect(page.locator('.ach-what')).toHaveCount(12);
  for (const what of await page.locator('.ach-what').all()) await expect(what).toBeVisible();
  await expect(page.locator('.note-fold [data-count="0"]')).toHaveCount(12);
  await expect(page.locator('.amulet polygon[data-full="true"]')).toHaveCount(0);
  await closeNotebook(page);

  // Con avance: cada contador dice lo que lleva y su barra se llena en esa proporción.
  giveAchievements(who.email, { stunner: 7, healer: 9, combo3: 2, perfectSweep: 999, upAgain: 999 });
  await openNotebook(page);
  await expect(achievement(page, 'stunner')).toHaveAttribute('data-count', '7');
  await expect(achievement(page, 'stunner').locator('.ach-count')).toHaveText(/^7\/\d+$/);
  await expect(achievement(page, 'healer').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '9');
  const bar = await achievement(page, 'stunner')
    .getByRole('progressbar')
    .evaluate((el) => {
      const fill = el.firstElementChild as HTMLElement;
      return {
        fill: fill.getBoundingClientRect().width / el.getBoundingClientRect().width,
        of: Number(el.getAttribute('aria-valuemax')),
      };
    });
  expect(bar.fill).toBeGreaterThan(0);
  expect(Math.abs(bar.fill - 7 / bar.of)).toBeLessThan(0.03);
  // Los que ya llegaron a su meta se ven completos, pero un logro no completa un pliegue.
  await expect(achievement(page, 'perfectSweep')).toHaveAttribute('data-done', 'true');
  await expect(achievement(page, 'upAgain')).toHaveAttribute('data-done', 'true');
  await expect(fold(page, 'fire').locator('h3')).toHaveText(/^Fuego\s*1\/3/);
  await expect(page.getByRole('heading', { name: 'Amuleto · 0 de 4 pliegues' })).toBeVisible();
  await closeNotebook(page);

  // Un pliegue completo se colorea, también en el amuleto; los otros siguen punteados.
  giveAchievements(who.email, { perfectSweep: 999, stunner: 999, blaze: 999, combo3: 999, untouched: 999 });
  await openNotebook(page);
  await expect(page.getByRole('heading', { name: 'Amuleto · 1 de 4 pliegues' })).toBeVisible();
  await expect(fold(page, 'fire')).toHaveClass(/full/);
  await expect(fold(page, 'team')).not.toHaveClass(/full/);
  await expect(page.locator('.amulet polygon[data-full="true"]')).toHaveAttribute('data-fold', 'fire');
  await expect(page.getByText('Monedas dobles activas')).toHaveCount(0);
  await closeNotebook(page);

  // Con los cuatro, el amuleto está completo y dice que las monedas dobles están activas.
  giveAchievements(who.email);
  await openNotebook(page);
  await expect(page.getByRole('heading', { name: 'Amuleto · 4 de 4 pliegues' })).toBeVisible();
  await expect(page.getByText('Monedas dobles activas')).toBeVisible();
  await expect(page.locator('.amulet')).toHaveClass(/complete/);
  await expect(page.locator('.amulet polygon[data-full="true"]')).toHaveCount(4);
  await expect(page.locator('.note-fold.full')).toHaveCount(4);
});

test('R-25 y D-105: "Mis cartas" muestra las cartas de un elemento a la vez, en dos páginas de 2 × 5, y las que faltan como siluetas', async ({
  page,
}) => {
  await signUp(page, person(), 'Fuego');
  await openCards(page);
  const cards = grid(page).getByRole('img');
  const missing = grid(page).getByRole('img', { name: /que aún no tienes$/ });
  const next = page.getByRole('button', { name: 'Página siguiente' });
  const previous = page.getByRole('button', { name: 'Página anterior' });
  // Una pestaña por elemento, con cuántas de sus 20 cartas tiene.
  await expect(page.getByRole('tab')).toHaveText([
    'Mi progreso',
    'Mis cartas',
    /Fuego\s*2\/20/,
    /Agua\s*1\/20/,
    /Nieve\s*1\/20/,
  ]);
  await expect(boxTab(page, 'Fuego')).toHaveAttribute('aria-selected', 'true');
  // Fuego, sus dos páginas: el 9 del mazo inicial en la primera y el 12 del camino en la segunda.
  await expect(pageLine(page)).toHaveText('Fuego · página 1/2');
  await expect(cards).toHaveCount(10);
  await expect(missing).toHaveCount(9);
  await expect(page.getByRole('img', { name: 'Chispa: carta de Fuego de 9' })).toBeVisible();
  await next.click();
  await expect(pageLine(page)).toHaveText('Fuego · página 2/2');
  await expect(cards).toHaveCount(10);
  await expect(missing).toHaveCount(9);
  await expect(page.getByRole('img', { name: 'Fénix plegado: carta de Fuego de 12' })).toBeVisible();
  // Las flechas dan la vuelta dentro del mismo elemento: no pasan al siguiente.
  await next.click();
  await expect(pageLine(page)).toHaveText('Fuego · página 1/2');
  await previous.click();
  await expect(pageLine(page)).toHaveText('Fuego · página 2/2');
  await expect(boxTab(page, 'Fuego')).toHaveAttribute('aria-selected', 'true');
  // El botón abre las cajas de ese mismo elemento.
  await expect(page.getByRole('button', { name: /^Abrir cajas/ })).toHaveText('Abrir cajas de Fuego');

  // Agua, desde su pestaña: empieza en su primera página, con solo el 9 del mazo inicial.
  await boxTab(page, 'Agua').click();
  await expect(pageLine(page)).toHaveText('Agua · página 1/2');
  await expect(boxTab(page, 'Agua')).toHaveAttribute('aria-selected', 'true');
  await expect(missing).toHaveCount(9);
  await expect(page.getByRole('img', { name: 'Gota: carta de Agua de 9' })).toBeVisible();
  await next.click();
  await expect(pageLine(page)).toHaveText('Agua · página 2/2');
  await expect(missing).toHaveCount(10);

  // "Abrir cajas de Nieve" lleva a las cajas de Nieve, que es el elemento que se estaba viendo.
  await boxTab(page, 'Nieve').click();
  await expect(pageLine(page)).toHaveText('Nieve · página 1/2');
  await page.getByRole('button', { name: 'Abrir cajas de Nieve' }).click();
  await expect(page.getByRole('heading', { name: 'Caja de Nieve' })).toBeVisible();
  await expect(boxTab(page, 'Nieve')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab')).toHaveText([
    'Mi progreso',
    'Mis cartas',
    /Fuego\s*2 de 20/,
    /Agua\s*1 de 20/,
    /Nieve\s*1 de 20/,
  ]);
  await boxTab(page, 'Fuego').click();
  await expect(page.getByText('Tienes 2 cartas de Fuego · promedio 10,5 · 2 de 20 distintas')).toBeVisible();
  await boxTab(page, 'Agua').click();
  await expect(page.getByRole('heading', { name: 'Caja de Agua' })).toBeVisible();
  // Y de vuelta a las cartas de ese elemento.
  await page.getByRole('button', { name: 'Volver a Mis cartas' }).click();
  await expect(pageLine(page)).toHaveText('Agua · página 1/2');
  await expect(page.getByRole('button', { name: /^Abrir cajas/ })).toHaveText('Abrir cajas de Agua');

  // Desde "Mi progreso", el enlace de cada pliegue lleva a las cartas de su elemento.
  await page.getByRole('tab', { name: 'Mi progreso' }).click();
  await page.getByRole('button', { name: 'Mis cartas de Nieve' }).click();
  await expect(pageLine(page)).toHaveText('Nieve · página 1/2');
});

test('R-28: sin monedas no se puede comprar, y la tienda dice que se ganan en las partidas en línea', async ({
  page,
}) => {
  await signUp(page, person(), 'Fuego');
  await openBoxes(page);
  await expect(wallet(page)).toHaveText('0 monedas');
  for (const size of [1, 2, 3] as const) await expect(buy(page, size)).toBeDisabled();
  // En presente y sin marca: las partidas en línea ya existen.
  await expect(
    page.getByText(
      'Ganas monedas en las partidas en línea, por cada ronda superada: 60, 120 y 120, más 120 si ganas el bonus.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Próximamente')).toHaveCount(0);
});

test('R-28: comprar una caja descuenta las monedas, revela las cartas y las suma a la colección', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const who = await signUp(page, person(), 'Fuego');
  const summary = page.getByRole('region', { name: 'Tu progreso' });
  await expect(summary.locator('.coins')).toHaveText('0 monedas');
  // Las monedas llegan mientras el juego está abierto en la portada: el perfil las trae al abrirlo.
  await page.getByRole('button', { name: 'Volver' }).click();
  giveCoins(who.email);
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  await expect(summary.locator('.coins')).toHaveText('420 monedas');
  await openBoxes(page);
  await expect(wallet(page)).toHaveText('420 monedas');
  await expect(page.getByText(/Ganas monedas/)).toHaveCount(0);
  await expect(buy(page, 3)).toHaveAccessibleName('Comprar una caja de 3 cartas de Fuego por 250 monedas');
  await buy(page, 3).click();

  const dialog = page.getByRole('dialog', { name: 'Tu caja de Fuego' });
  await expect(dialog.getByRole('img')).toHaveCount(3);
  const drawn = await dialog
    .getByRole('img')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  for (const name of drawn)
    expect(name).toMatch(/^.+: carta de Fuego de (9|10|11|12)(, tienes \d+)?\. (Nueva|Repetida)$/);
  // El foco queda en "Seguir", y Escape también cierra.
  await expect(dialog.getByRole('button', { name: 'Seguir' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await expect(wallet(page)).toHaveText('170 monedas');
  await expect(page.getByText(/^Tienes 5 cartas de Fuego/)).toBeVisible();
  // Con 170 monedas alcanza para la caja de 1 (100), pero no para las de 2 (180) ni 3 (250).
  await expect(buy(page, 1)).toBeEnabled();
  await expect(buy(page, 2)).toBeDisabled();
  await expect(buy(page, 3)).toBeDisabled();
  // Las cartas de la caja están en "Mis cartas", en alguna de las dos páginas de Fuego.
  await page.getByRole('button', { name: 'Volver a Mis cartas' }).click();
  const owned: string[] = [];
  for (const title of ['Fuego · página 1/2', 'Fuego · página 2/2']) {
    await expect(pageLine(page)).toHaveText(title);
    owned.push(
      ...(await grid(page)
        .getByRole('img')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))),
    );
    await page.getByRole('button', { name: 'Página siguiente' }).click();
  }
  for (const name of drawn) {
    const card = name.slice(0, name.indexOf(':'));
    expect(owned.some((label) => label.startsWith(`${card}: carta de Fuego`))).toBe(true);
  }

  // Todo quedó en la cuenta: al recargar, el perfil y la Libreta lo muestran.
  await page.reload();
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  await expect(summary.locator('.coins')).toHaveText('170 monedas');
  await openNotebook(page);
  await expect(page.locator('.note-wallet')).toHaveText(/^Cajas: 1 abierta\s*170 monedas$/);
  expect(errors).toEqual([]);
});

test('D-66: mientras espera la respuesta de una compra, los botones quedan deshabilitados', async ({ page }) => {
  const who = await signUp(page, person(), 'Fuego');
  giveCoins(who.email);
  await openBoxes(page);
  let sent = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/progress/boxes', async (route) => {
    sent += 1;
    await held;
    await route.continue();
  });
  await buy(page, 1).click();
  // El botón de la compra en curso lo dice, a la vista y para los lectores de pantalla, y ninguno se
  // puede volver a pulsar.
  const waiting = page.getByRole('button', { name: 'Comprando…' });
  await expect(waiting).toBeDisabled();
  await expect(waiting).toHaveText(/^Comprando…\s*100 monedas$/);
  await expect(buy(page, 2)).toBeDisabled();
  await expect(buy(page, 3)).toBeDisabled();
  await waiting.click({ force: true });
  await boxTab(page, 'Agua').click();
  for (const size of [1, 2, 3] as const) await expect(buy(page, size)).toBeDisabled();
  expect(sent).toBe(1);

  release();
  await expect(page.getByRole('dialog', { name: 'Tu caja de Fuego' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir' }).click();
  await expect(wallet(page)).toHaveText('320 monedas');
  await expect(buy(page, 1)).toBeEnabled();
  expect(sent).toBe(1);
});

test('D-66: si la respuesta de una compra se pierde, comprar de nuevo no cobra dos veces', async ({ page }) => {
  const who = await signUp(page, person(), 'Fuego');
  giveCoins(who.email);
  await openBoxes(page);
  const ids: string[] = [];
  let lose = true;
  await page.route('**/api/progress/boxes', async (route) => {
    ids.push((route.request().postDataJSON() as { purchaseId: string }).purchaseId);
    if (!lose) return route.continue();
    lose = false;
    // El servidor recibe la compra y la cobra, pero su respuesta no llega al cliente.
    await route.fetch();
    await route.abort();
  });
  await buy(page, 1).click();
  await expect(page.getByRole('alert')).toHaveText(
    'No llegó la respuesta. Compra de nuevo esa caja: no se cobra dos veces.',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // D-68: el cliente volvió a leer el progreso, así que el saldo es el real, con la caja ya cobrada.
  await expect(wallet(page)).toHaveText('320 monedas');
  await expect(page.getByText(/^Tienes 3 cartas de Fuego/)).toBeVisible();
  expect(await clippedElements(page)).toEqual([]);

  await buy(page, 1).click();
  const dialog = page.getByRole('dialog', { name: 'Tu caja de Fuego' });
  await expect(dialog.getByRole('img')).toHaveCount(1);
  // El reintento llevó el mismo identificador, y el servidor devolvió la caja original sin cobrar otra.
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  await page.getByRole('button', { name: 'Seguir' }).click();
  await expect(wallet(page)).toHaveText('320 monedas');
  const progress = await page.evaluate(() => fetch('/api/progress').then((r) => r.json()));
  expect(progress).toMatchObject({ coins: 320, boxesOpened: 1 });
  await expect(page.getByText(/^Tienes 3 cartas de Fuego/)).toBeVisible();
});

test('D-68: la caja que quedó sin respuesta se puede reintentar aunque el saldo real ya no alcance', async ({
  page,
}) => {
  const who = await signUp(page, person(), 'Fuego');
  giveCoins(who.email);
  await openBoxes(page);
  // De las 420 monedas, una caja de 3 deja 170.
  await buy(page, 3).click();
  await page.getByRole('button', { name: 'Seguir' }).click();
  await expect(wallet(page)).toHaveText('170 monedas');
  let lose = true;
  await page.route('**/api/progress/boxes', async (route) => {
    if (!lose) return route.continue();
    lose = false;
    // El servidor recibe la compra y la cobra, pero su respuesta no llega al cliente.
    await route.fetch();
    await route.abort();
  });
  await buy(page, 1).click();
  await expect(page.getByRole('alert')).toHaveText(
    'No llegó la respuesta. Compra de nuevo esa caja: no se cobra dos veces.',
  );
  // El saldo real: la caja de 1 ya está cobrada, y con 70 monedas no alcanza para ninguna otra.
  await expect(wallet(page)).toHaveText('70 monedas');
  await expect(page.getByText(/^Tienes 6 cartas de Fuego/)).toBeVisible();
  await expect(buy(page, 2)).toBeDisabled();
  await expect(buy(page, 3)).toBeDisabled();
  expect(await clippedElements(page)).toEqual([]);
  // Con el aviso a la vista, todo cabe en el panel de la tienda sin tener que desplazarlo.
  expect(await page.locator('.note-shop').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  // La que quedó sin respuesta sí se puede comprar de nuevo, como dice el aviso.
  await expect(buy(page, 1)).toBeEnabled();
  await buy(page, 1).click();
  await expect(page.getByRole('dialog', { name: 'Tu caja de Fuego' }).getByRole('img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Seguir' }).click();
  // El servidor devolvió esa caja sin cobrar otra, y ya no queda nada por reintentar.
  await expect(wallet(page)).toHaveText('70 monedas');
  await expect(page.getByRole('alert')).toHaveCount(0);
  for (const size of [1, 2, 3] as const) await expect(buy(page, size)).toBeDisabled();
  const progress = await page.evaluate(() => fetch('/api/progress').then((r) => r.json()));
  expect(progress).toMatchObject({ coins: 70, boxesOpened: 2 });
});

test('si el progreso no se puede leer, el perfil lo dice y deja reintentar', async ({ page }) => {
  const who = await signUp(page, person(), 'Nieve');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.route('**/api/progress', (route) => route.abort());
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('heading', { name: `Hola, ${who.displayName}` })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(
    'No se pudo cargar tu progreso. Revisa tu conexión e inténtalo de nuevo.',
  );
  expect(await clippedElements(page)).toEqual([]);
  await page.unroute('**/api/progress');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Camino de la Nieve' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('lineamientos de diseño, sección 8: las pantallas del progreso no cortan texto ni lo achican', async ({
  page,
}) => {
  const problems: Record<string, string[]> = {};
  const check = async (name: string) => {
    await page.waitForTimeout(700); // las entradas escalonadas
    const found = [...(await clippedElements(page)), ...(await smallText(page))];
    // Un solo primario por vista; el de una caja abierta es el de su ventana.
    const primaries = await page.locator('.notebook .btn-primary, .screen > .screen-actions .btn-primary').count();
    if (primaries > 1) found.push(`${primaries} botones primarios`);
    if (found.length) problems[name] = found;
  };
  // El nombre más largo que admite una cuenta: 16 caracteres.
  const base = person();
  const who = { ...base, displayName: `Nevada ${base.displayName.slice(-6)} mm` };
  await signUp(page, who);
  await check('perfil sin camino');
  await page.getByRole('button', { name: 'Elegir mi camino' }).click();
  await check('elegir el camino');
  await page.getByRole('button', { name: /Camino de la Nieve/, pressed: false }).click();
  await check('camino marcado');
  // Sin conexión, la pantalla lo dice y deja intentarlo de nuevo.
  await page.route('**/api/progress/camino', (route) => route.abort());
  await page.getByRole('button', { name: 'Elegir el Camino de la Nieve' }).click();
  await expect(page.getByRole('alert')).toHaveText('No hay conexión con el servidor. Inténtalo de nuevo en un rato.');
  await check('camino con error');
  await page.unroute('**/api/progress/camino');
  await page.getByRole('button', { name: 'Elegir el Camino de la Nieve' }).click();
  await expect(page.getByRole('heading', { name: 'Camino de la Nieve' })).toBeVisible();
  await check('perfil con el camino recién elegido');
  await openNotebook(page);
  await check('libreta: mi progreso');
  await page.getByRole('tab', { name: 'Mis cartas' }).click();
  await check('libreta: mis cartas');
  await page.getByRole('button', { name: 'Abrir cajas' }).click();
  await check('cajas sin monedas');
  giveCoins(who.email, 3);
  await closeNotebook(page);
  await openBoxes(page);
  for (const element of ['Fuego', 'Agua', 'Nieve']) {
    await boxTab(page, element).click();
    await check(`cajas: ${element}`);
    await buy(page, 3).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(1200); // las tres cartas se voltean una por una
    await check(`caja de ${element}`);
    await page.getByRole('button', { name: 'Seguir' }).click();
    await check(`cajas con la caja de ${element}`);
  }
  await closeNotebook(page);
  await check('perfil con progreso');

  // Lo más ancho que puede llegar a mostrarse: las 60 cartas, con sus nombres más largos, muchas copias
  // y mucho saldo. Comprarlo carta por carta tardaría demasiado: se pone directo en el estado del cliente.
  await page.evaluate(() => {
    const collection: Record<string, number> = {};
    for (const element of ['fire', 'water', 'snow']) {
      for (let i = 1; i <= 20; i++) collection[`${element}-${String(i).padStart(2, '0')}`] = 12;
    }
    type Store = { setState(update: (s: { progress: { data: object } }) => object): void };
    (window as unknown as { __ventisca: Store }).__ventisca.setState((s) => ({
      progress: { ...s.progress, data: { ...s.progress.data, coins: 123456, boxesOpened: 1234, collection } },
    }));
  });
  await check('perfil con la colección completa');
  // Sin pasar por el botón, que traería de nuevo el progreso del servidor. Con los 12 logros completos y
  // contadores de tres cifras, el amuleto queda completo y dice "Monedas dobles activas".
  await page.evaluate(() => {
    type Data = { achievements: Record<string, object> };
    type Store = { setState(update: (s: { progress: { data: Data } }) => object): void };
    (window as unknown as { __ventisca: Store }).__ventisca.setState((s) => ({
      screen: 'notebook',
      notebook: { tab: 'progress', page: 0, from: 'account' },
      progress: {
        ...s.progress,
        data: {
          ...s.progress.data,
          achievements: Object.fromEntries(
            Object.keys(s.progress.data.achievements).map((id) => [id, { count: 999, done: true }]),
          ),
          stats: { classic: { matches: 9999, rounds: 99999, wins: 9999 }, storm: { matches: 0, rounds: 0, wins: 0 } },
        },
      },
    }));
  });
  await expect(page.getByText('Monedas dobles activas')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Amuleto de cuatro pliegues. Amuleto · 4 de 4 pliegues' })).toBeVisible();
  await check('libreta completa: mi progreso');
  await page.getByRole('tab', { name: 'Mis cartas' }).click();
  for (const element of ['Fuego', 'Agua', 'Nieve']) {
    await boxTab(page, element).click();
    for (const n of [1, 2]) {
      await expect(pageLine(page)).toHaveText(`${element} · página ${n}/2`);
      await expect(grid(page).getByRole('img', { name: /que aún no tienes$/ })).toHaveCount(0);
      await check(`colección completa: ${element}, página ${n}`);
      await page.getByRole('button', { name: 'Página siguiente' }).click();
    }
  }
  await page.getByRole('button', { name: /^Abrir cajas/ }).click();
  await check('cajas con la colección completa');
  expect(problems).toEqual({});
});
