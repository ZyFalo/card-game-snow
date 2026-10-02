import { expect, type Page, test } from '@playwright/test';
import { chooseCamino, giveCoins, logIn, person, signUp } from './account-helpers';
import { clippedElements, FULL_TRACE, smallText } from './helpers';

/*
 * El progreso de la cuenta en el cliente, contra el servidor de verdad (PRD §18 y PRD de v2, D-34): la
 * carta de camino, la colección y la tienda. Las monedas las da un apoyo de pruebas, porque hasta el M8
 * no hay partidas en línea donde ganarlas.
 */

test.use(FULL_TRACE);

const wallet = (page: Page) => page.locator('.wallet');
const buy = (page: Page, size: 1 | 2 | 3) =>
  page.getByRole('button', { name: new RegExp(`^Comprar una caja de ${size} cartas? de`) });

async function openCollection(page: Page) {
  await page.getByRole('button', { name: 'Colección y tienda' }).click();
  await expect(page.getByRole('heading', { name: 'Colección y tienda' })).toBeVisible();
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
    // El mazo inicial: un 9 de cada elemento y el 12 del camino.
    await expect(summary.locator('dl > div')).toHaveText([
      /^Fuego\s*1 de 20\s*1 carta$/,
      /^Agua\s*2 de 20\s*2 cartas$/,
      /^Nieve\s*1 de 20\s*1 carta$/,
      /^Cajas\s*0\s*abiertas$/,
    ]);
    await expect(summary.locator('.coins')).toHaveText('0 monedas');
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

test('R-25: la colección muestra las 20 cartas de cada elemento, y las que faltan como siluetas', async ({ page }) => {
  await signUp(page, person(), 'Fuego');
  await openCollection(page);
  const cards = page.getByRole('tabpanel').getByRole('img');
  const missing = page.getByRole('tabpanel').getByRole('img', { name: /que aún no tienes$/ });
  await expect(page.getByRole('tab', { name: /Fuego/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab')).toHaveText([/Fuego\s*2 de 20/, /Agua\s*1 de 20/, /Nieve\s*1 de 20/]);
  await expect(cards).toHaveCount(20);
  await expect(missing).toHaveCount(18);
  await expect(page.getByRole('img', { name: 'Chispa: carta de Fuego de 9' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Fénix plegado: carta de Fuego de 12' })).toBeVisible();
  await expect(page.getByText('Tienes 2 cartas de Fuego · promedio 10,5 · 2 de 20 distintas')).toBeVisible();

  await page.getByRole('tab', { name: /Agua/ }).click();
  await expect(page.getByRole('tabpanel', { name: /Agua/ })).toBeVisible();
  await expect(cards).toHaveCount(20);
  await expect(missing).toHaveCount(19);
  await expect(page.getByRole('img', { name: 'Gota: carta de Agua de 9' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Caja de Agua' })).toBeVisible();
});

test('R-28: sin monedas no se puede comprar, y la tienda dice que llegarán con las partidas en línea', async ({
  page,
}) => {
  await signUp(page, person(), 'Fuego');
  await openCollection(page);
  await expect(wallet(page)).toHaveText('0 monedas');
  for (const size of [1, 2, 3] as const) await expect(buy(page, size)).toBeDisabled();
  // En futuro y con su marca: las partidas en línea todavía no existen.
  await expect(
    page.getByText(
      'Ganarás monedas en las partidas en línea, por cada ronda superada: 60, 120 y 120, más 120 si ganas el bonus. Próximamente',
    ),
  ).toBeVisible();
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
  await openCollection(page);
  await expect(wallet(page)).toHaveText('420 monedas');
  await expect(page.getByText(/Ganarás monedas/)).toHaveCount(0);
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
  for (const name of drawn) {
    const card = name.slice(0, name.indexOf(':'));
    await expect(
      page.getByRole('tabpanel').getByRole('img', { name: new RegExp(`^${card}: carta de Fuego`) }),
    ).toBeVisible();
  }
  // Con 170 monedas alcanza para la caja de 1 (100), pero no para las de 2 (180) ni 3 (250).
  await expect(buy(page, 1)).toBeEnabled();
  await expect(buy(page, 2)).toBeDisabled();
  await expect(buy(page, 3)).toBeDisabled();

  // Todo quedó en la cuenta: al recargar, el perfil lo muestra.
  await page.reload();
  await page.getByRole('button', { name: 'Mi cuenta' }).click();
  await expect(summary.locator('.coins')).toHaveText('170 monedas');
  await expect(summary.locator('dl > div').last()).toHaveText(/^Cajas\s*1\s*abierta$/);
  await expect(summary.locator('dl > div').first()).toHaveText(/5 cartas$/);
  expect(errors).toEqual([]);
});

test('D-66: mientras espera la respuesta de una compra, los botones quedan deshabilitados', async ({ page }) => {
  const who = await signUp(page, person(), 'Fuego');
  giveCoins(who.email);
  await openCollection(page);
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
  await page.getByRole('tab', { name: /Agua/ }).click();
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
  await openCollection(page);
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
  await openCollection(page);
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
  expect(await page.locator('.shop').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
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
    const primaries = await page.locator('.contents .btn-primary, .screen > .screen-actions .btn-primary').count();
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
  await openCollection(page);
  await check('colección sin monedas');
  giveCoins(who.email, 3);
  await page.getByRole('button', { name: 'Volver' }).click();
  await openCollection(page);
  for (const element of ['Fuego', 'Agua', 'Nieve']) {
    await page.getByRole('tab', { name: new RegExp(element) }).click();
    await check(`colección: ${element}`);
    await buy(page, 3).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(1200); // las tres cartas se voltean una por una
    await check(`caja de ${element}`);
    await page.getByRole('button', { name: 'Seguir' }).click();
    await check(`colección con la caja de ${element}`);
  }
  await page.getByRole('button', { name: 'Volver' }).click();
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
  // Sin pasar por el botón, que traería de nuevo el progreso del servidor.
  await page.evaluate(() => {
    type Store = { setState(update: (s: { account: object }) => object): void };
    (window as unknown as { __ventisca: Store }).__ventisca.setState((s) => ({
      account: { ...s.account, view: 'collection' },
    }));
  });
  for (const element of ['Fuego', 'Agua', 'Nieve']) {
    await page.getByRole('tab', { name: new RegExp(element) }).click();
    await expect(page.getByRole('tabpanel').getByRole('img', { name: /que aún no tienes$/ })).toHaveCount(0);
    await check(`colección completa: ${element}`);
  }
  expect(problems).toEqual({});
});
