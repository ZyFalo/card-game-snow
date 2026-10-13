import { expect, test } from '@playwright/test';
import { FULL_TRACE } from './helpers';
import {
  clickTile,
  createRoom,
  joinRoom,
  loadingSeen,
  newPlayer,
  online,
  openOnline,
  planning,
  watchLoading,
} from './online-helpers';

/*
 * El juego en línea (Beta), con dos personas a la vez contra el servidor de verdad: la ficha, la cola, una
 * sala con código y los primeros turnos de una partida con el bot.
 */

test.use(FULL_TRACE);

test('D-87: la ficha ofrece el ninja del camino, con sus datos, y sus flechas lo cambian', async ({ browser }) => {
  const ana = await newPlayer(browser, 'water');
  const { page } = ana;
  await openOnline(page);
  const card = page.getByRole('region', { name: 'Elige tu ninja' });
  await expect(card.getByRole('heading', { name: 'Marea' })).toBeVisible();
  await expect(card.getByText('Beta')).toBeVisible();
  // El mazo inicial: el 9 de cada elemento, y además el 12 del camino.
  await expect(card.getByText('2 cartas de Agua')).toBeVisible();
  await expect(page.getByText('Tu camino')).toBeVisible();
  // Las barras salen de los valores del motor: Marea da el paso corto, el menor alcance y el mayor daño.
  await expect(card.getByRole('img', { name: 'Paso: 2 de 3' })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Alcance: 1 de 3' })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Daño: 10 de 10' })).toBeVisible();
  await page.getByRole('button', { name: 'Ninja siguiente' }).click();
  await expect(card.getByRole('heading', { name: 'Escarcha' })).toBeVisible();
  await expect(card.getByText('1 carta de Nieve')).toBeVisible();
  await expect(page.getByText('Tu camino')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ninja anterior' }).click();
  await page.getByRole('button', { name: 'Ninja anterior' }).click();
  await expect(card.getByRole('heading', { name: 'Brasa' })).toBeVisible();
  // El ▶ de la carta abre su demostración, y se cierra.
  await page.getByRole('button', { name: 'Ver qué hace la carta de Brasa', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Carta de Fuego' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Carta de Fuego' }).getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // El del combo abre la misma demostración, con combo; Esc la cierra.
  await page.getByRole('button', { name: 'Ver qué hace la carta de Brasa en combo' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Carta de Fuego' }).getByRole('button', { name: 'Con combo' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // La ✕ vuelve a la portada.
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ventisca' })).toBeVisible();
  await ana.context.close();
});

test('R-52 y D-88: en la cola cada persona ve a la otra en el lugar de su elemento; a las dos se les ofrece el bot, y la partida empieza cuando ambas aceptan', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'snow');
  await openOnline(ana.page);
  await ana.page.getByRole('button', { name: 'Jugar', exact: true }).click();
  await expect(ana.page.getByRole('heading', { name: 'Buscando equipo' })).toBeVisible();
  await expect(ana.page.getByText(/^Clásica · Se busca: Agua y Nieve · \d+:\d\d$/)).toBeVisible();
  const seat = (page: typeof ana.page, element: string) => page.locator(`[data-seat="${element}"]`);
  await expect(seat(ana.page, 'fire')).toHaveText('Brasa · Tú');
  await expect(seat(ana.page, 'water')).toHaveText('Se busca: Agua');
  // Una persona sola nunca juega en línea: ni partida, ni oferta del bot (D-35).
  await expect(ana.page.getByRole('button', { name: 'Jugar con el bot' })).toHaveCount(0);

  await openOnline(beto.page);
  await beto.page.getByRole('button', { name: 'Jugar', exact: true }).click();
  await expect(seat(ana.page, 'snow')).toHaveText(`Escarcha · ${beto.displayName}`);
  await expect(seat(beto.page, 'fire')).toHaveText(`Brasa · ${ana.displayName}`);
  await expect(seat(beto.page, 'snow')).toHaveText('Escarcha · Tú');
  await expect(beto.page.getByText(/^Clásica · Se busca: Agua · \d+:\d\d$/)).toBeVisible();

  // La ✕ cancela la búsqueda: quien se queda vuelve a ver ese lugar libre, y a esperar sola.
  await beto.page.getByRole('button', { name: 'Cancelar la búsqueda' }).click();
  await expect(beto.page.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
  await expect(seat(ana.page, 'snow')).toHaveText('Se busca: Nieve');

  // De nuevo juntas. Tras el plazo (30 s; el servidor de las pruebas lo acorta), el bot se les ofrece a las
  // dos, en el ninja que falta.
  await beto.page.getByRole('button', { name: 'Jugar', exact: true }).click();
  const offer = '¿Juegan con el bot como Marea? No gana monedas.';
  await expect(ana.page.getByText(offer)).toBeVisible();
  await expect(beto.page.getByText(offer)).toBeVisible();
  await ana.page.getByRole('button', { name: 'Jugar con el bot' }).click();
  await expect(ana.page.getByText(`Aceptaste · esperando a ${beto.displayName}`)).toBeVisible();
  // Con una sola aceptación la partida no empieza, y la otra persona sigue viendo la oferta.
  await expect(beto.page.getByRole('button', { name: 'Jugar con el bot' })).toBeVisible();
  expect((await online(ana.page)).online.match).toBeNull();
  await beto.page.getByRole('button', { name: 'Jugar con el bot' }).click();

  // Aceptaron las dos: empieza la partida, con el bot como Marea.
  for (const p of [ana, beto])
    await expect.poll(async () => (await online(p.page)).phase, { timeout: 60_000 }).toBe('planning');
  await expect(ana.page.locator('[data-ninja-panel="water"] .np-who')).toHaveText('Bot');
  await expect(ana.page.locator('[data-ninja-panel="snow"] .np-who')).toHaveText(beto.displayName);
  expect((await online(beto.page)).online.match).toMatchObject({ you: 'snow', turn: 1, plays: true });
  await ana.context.close();
  await beto.context.close();
});

test('R-52: tres personas con un ninja de cada elemento forman equipo en la cola, y su partida empieza sin bot', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  const caro = await newPlayer(browser, 'snow');
  const all = [ana, beto, caro];
  for (const p of [ana, beto]) {
    await openOnline(p.page);
    await p.page.getByRole('button', { name: 'Jugar', exact: true }).click();
  }
  await expect(ana.page.getByText(/^Clásica · Se busca: Nieve · \d+:\d\d$/)).toBeVisible();
  // Con dos no hay partida: falta Nieve.
  expect((await online(ana.page)).online.match).toBeNull();

  // Llega Caro con el ninja que faltaba: el equipo se arma solo y la partida empieza para las tres.
  await openOnline(caro.page);
  await caro.page.getByRole('button', { name: 'Jugar', exact: true }).click();
  for (const p of all) await planning(p.page, 1);
  for (const p of all) {
    const seats = (await online(p.page)).online.match?.seats ?? [];
    expect(seats.map((s) => s.kind)).toEqual(['human', 'human', 'human']);
  }
  const who = (ninja: string) => beto.page.locator(`[data-ninja-panel="${ninja}"] .np-who`);
  await expect(who('fire')).toHaveText(ana.displayName);
  await expect(who('water')).toHaveText('Tú');
  await expect(who('snow')).toHaveText(caro.displayName);
  expect((await online(caro.page)).online.match).toMatchObject({ you: 'snow', plays: true });
  for (const p of all) await p.context.close();
});

test('R-53: una sala con código: unirse con el ninja ocupado, elegir otro y empezar con el bot una partida en la que cada quien ve los planes del otro', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'fire');
  const errors: string[] = [];
  for (const p of [ana, beto]) p.page.on('pageerror', (e) => errors.push(e.message));
  await openOnline(ana.page);
  await openOnline(beto.page);

  // Un código que no existe, y uno vacío.
  await beto.page.getByRole('button', { name: 'Sala con código' }).click();
  await beto.page.getByRole('button', { name: 'Unirse', exact: true }).click();
  await expect(beto.page.getByRole('alert')).toHaveText('Escribe el código de la sala.');
  await beto.page.getByLabel('Código de la sala').fill('ZZZZZZ');
  await beto.page.getByRole('button', { name: 'Unirse', exact: true }).click();
  await expect(beto.page.getByRole('alert')).toHaveText('No existe una sala con ese código.');
  await beto.page.getByRole('button', { name: 'Volver', exact: true }).click();

  const code = await createRoom(ana.page);
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(ana.page.getByRole('status').filter({ hasText: 'Para empezar' })).toHaveText(
    'Para empezar hace falta otra persona.',
  );
  await expect(ana.page.getByRole('button', { name: 'Empezar con el bot' })).toBeDisabled();

  // Beto llega con Brasa, que ya es de Ana: elige un ninja libre para esta partida.
  await joinRoom(beto.page, `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`);
  await expect(beto.page.getByRole('heading', { name: `Sala de ${ana.displayName}` })).toBeVisible();
  await expect(
    beto.page.getByText('Brasa, tu ninja del camino, ya está ocupado. Elige un ninja libre para esta partida.'),
  ).toBeVisible();
  await expect(ana.page.getByRole('button', { name: 'Empezar con el bot' })).toBeDisabled();
  await beto.page.getByRole('button', { name: 'Escarcha', exact: true }).click();
  await expect(beto.page.getByText(`Esperando a que ${ana.displayName} empiece la partida.`)).toBeVisible();
  await expect(beto.page.locator('[data-seat="fire"]')).toHaveText(`Brasa · ${ana.displayName} · Creó la sala`);
  await expect(ana.page.getByText('El bot jugará como Marea y no gana monedas.')).toBeVisible();

  // Solo quien creó la sala puede empezar.
  await expect(beto.page.getByRole('button', { name: /^Empezar/ })).toHaveCount(0);
  // La carga dura poco: lo que muestra se anota desde la propia página, para no depender de verla a tiempo.
  await watchLoading(beto.page);
  await ana.page.getByRole('button', { name: 'Empezar con el bot' }).click();
  for (const p of [ana, beto])
    await expect.poll(async () => (await online(p.page)).phase, { timeout: 60_000 }).toBe('planning');

  // La carga trajo el consejo del ninja de cada quien, con su nombre delante.
  expect((await loadingSeen(beto.page))[0]).toMatch(/^Consejo ninjaEscarcha .{20,}/);

  // El combate: cada quien lleva a un ninja, y el del bot ya está listo.
  const panel = (page: typeof ana.page, id: string) => page.locator(`[data-ninja-panel="${id}"]`);
  await expect(panel(beto.page, 'snow')).toHaveAttribute('data-seat-state', 'planning');
  await expect(panel(beto.page, 'snow').locator('.np-who')).toHaveText('Tú');
  await expect(panel(beto.page, 'fire').locator('.np-who')).toHaveText(ana.displayName);
  await expect(panel(beto.page, 'water').locator('.np-who')).toHaveText('Bot');
  await expect(panel(beto.page, 'water')).toHaveAttribute('data-seat-state', 'ready');
  await expect(beto.page.getByRole('timer')).toHaveAccessibleName(/^Quedan? \d+ segundos?$/);
  // No hay pausa ni "Sugerir jugada": la ✕ es salir.
  await expect(beto.page.getByRole('button', { name: /Pausa/ })).toHaveCount(0);
  await expect(beto.page.getByRole('button', { name: /Sugerir jugada/ })).toHaveCount(0);
  // La ayuda trae las reglas en línea, con el reloj del servidor, y se cierra sin pasar por una pausa.
  await beto.page.getByRole('button', { name: 'Cómo jugar' }).click();
  const help = beto.page.getByRole('dialog', { name: 'Cómo jugar' });
  await expect(help.getByRole('heading', { name: 'En línea' })).toBeVisible();
  await expect(help).toContainText('El reloj da 10 s por turno a todo el equipo, y no hay pausa.');
  await expect(help.locator('.btn-primary')).toHaveText('Cerrar');
  await help.locator('.btn-primary').click();
  await expect(help).toHaveCount(0);
  const before = await online(beto.page);
  expect(before.local).toBe(false);
  expect(before.online.match).toMatchObject({ you: 'snow', turn: 1, plays: true });

  // Beto mueve a Escarcha: Ana ve su plan en el tablero sin que él confirme (R-35).
  const me = before.match?.ninjas.find((n) => n.id === 'snow');
  const to = { x: (me?.pos.x ?? 0) + 1, y: me?.pos.y ?? 0 };
  await clickTile(beto.page, to.x, to.y);
  await expect.poll(async () => (await online(ana.page)).plans.snow?.moveTo).toEqual(to);
  // Ana no puede mover a Escarcha: un clic en el ninja de otro no cambia nada.
  await clickTile(ana.page, me?.pos.x ?? 0, me?.pos.y ?? 0);
  expect((await online(ana.page)).plans.snow?.moveTo).toEqual(to);

  // Ana confirma: queda "Listo" para ella y para Beto, y espera.
  await ana.page.keyboard.press('Space');
  await expect(ana.page.getByRole('button', { name: 'Listo' })).toBeDisabled();
  await expect(
    ana.page.getByText(
      `Listo. Esperando a ${beto.displayName}: el turno se resuelve al confirmar todos o al llegar a cero.`,
    ),
  ).toBeVisible();
  await expect(panel(beto.page, 'fire')).toHaveAttribute('data-seat-state', 'ready');
  expect((await online(ana.page)).match?.turn).toBe(0);

  // Al confirmar Beto, el turno se resuelve sin esperar al reloj, y Escarcha quedó donde él dijo.
  await beto.page.getByRole('button', { name: /^Confirmar/ }).click();
  await expect.poll(async () => (await online(beto.page)).match?.turn, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await online(ana.page)).match?.turn, { timeout: 30_000 }).toBe(1);
  expect((await online(ana.page)).match?.ninjas.find((n) => n.id === 'snow')?.pos).toEqual(to);
  for (const p of [ana, beto])
    await expect.poll(async () => (await online(p.page)).online.match?.turn, { timeout: 60_000 }).toBe(2);

  // "Salir" pregunta antes; "Seguir jugando" lo deja en la partida.
  await beto.page.getByRole('button', { name: 'Salir de la partida' }).click();
  const dialog = beto.page.getByRole('alertdialog', { name: '¿Salir de la partida?' });
  await expect(dialog).toContainText(
    'Pierdes las monedas de esta partida. Tu ninja quedará quieto y tu equipo seguirá sin ti.',
  );
  await expect(dialog.getByRole('button', { name: 'Seguir jugando' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Seguir jugando' }).click();
  await expect(dialog).toHaveCount(0);
  // Al salir de verdad, vuelve al inicio en línea, y Ana ve que su ninja quedó quieto (R-39).
  await beto.page.getByRole('button', { name: 'Salir de la partida' }).click();
  await dialog.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(beto.page.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
  await expect(panel(ana.page, 'snow')).toHaveAttribute('data-seat-state', 'left');
  await expect(panel(ana.page, 'snow')).toContainText('Salió');
  expect(errors).toEqual([]);
  await ana.context.close();
  await beto.context.close();
});
