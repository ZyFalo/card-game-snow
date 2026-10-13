import { expect, type Page, test } from '@playwright/test';
import { giveAchievements } from './account-helpers';
import { FULL_TRACE } from './helpers';
import {
  COMBO_FEATS,
  clickTile,
  dropLink,
  gatherRoom,
  LAST_BLOW,
  newPlayer,
  ONE_ROUND,
  online,
  openOnline,
  type Player,
  passUntil,
  passUntilEnd,
  planning,
  progressOf,
  restoreLink,
  returnSeen,
  startRoomMatch,
  TO_BONUS,
  watchReturn,
} from './online-helpers';

/*
 * Una partida en línea de principio a fin, con dos y tres personas a la vez contra el servidor de verdad:
 * el resultado, las monedas que entran al libro, quién cobra cada ronda, y lo que pasa con quien se
 * desconecta, vuelve, no vuelve o sale (R-38 a R-40, R-42 y R-55).
 *
 * Cada partida empieza en un tablero preparado, que el servidor de las pruebas le pone solo a la sala de
 * esa prueba: así termina en pocos turnos, y lo que se cobra no depende del azar.
 */

test.use(FULL_TRACE);

const results = (page: Page) => page.locator('[data-online="results"]');
const panel = (page: Page, ninja: string) => page.locator(`[data-ninja-panel="${ninja}"]`);
/** Un logro en los resultados: su fila, con lo que sumó la partida. */
const gain = (page: Page, id: string) => results(page).locator(`[data-achievement="${id}"]`);
/** Lo que los resultados dicen que sumó cada logro: los que no sumaron no aparecen. */
const gains = (page: Page) =>
  results(page)
    .locator('.ach-gain')
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [el.closest('[data-achievement]')?.getAttribute('data-achievement'), el.textContent]),
      ),
    );

/** Los resultados de esa persona: cómo terminó, cuánto cobró y por cuántas rondas. */
async function expectResults(page: Page, result: 'victory' | 'defeat', coins: number, rounds: string) {
  await expect(results(page)).toBeVisible({ timeout: 60_000 });
  await expect(results(page)).toHaveAttribute('data-result', result);
  await expect(results(page).getByRole('heading', { level: 1 })).toHaveText(
    result === 'victory' ? '¡Ganaron!' : 'Los gólems resistieron',
  );
  await expect(results(page).locator('output')).toHaveAttribute('data-coins', String(coins));
  await expect(results(page).locator('.res-coins .res-small')).toHaveText(rounds);
}

async function closeAll(players: Player[]) {
  for (const p of players) await p.context.close();
}

test('R-33 y R-40: tres personas juegan una partida hasta el final: cada una ve el resultado, cobra sus monedas y vuelve a la sala', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  const caro = await newPlayer(browser, 'snow');
  const all = [ana, beto, caro];
  const errors: string[] = [];
  for (const p of all) p.page.on('pageerror', (e) => errors.push(e.message));

  await gatherRoom(all, LAST_BLOW);
  // Con las tres, el equipo está completo y nadie necesita al bot.
  await expect(ana.page.getByRole('button', { name: 'Empezar partida' })).toBeEnabled();
  await expect(ana.page.getByRole('button', { name: 'Empezar con el bot' })).toHaveCount(0);
  await startRoomMatch(all);

  // Cada persona lleva a su ninja, y ve a las otras dos con su nombre.
  await expect(panel(caro.page, 'snow').locator('.np-who')).toHaveText('Tú');
  await expect(panel(caro.page, 'fire').locator('.np-who')).toHaveText(ana.displayName);
  await expect(panel(caro.page, 'water').locator('.np-who')).toHaveText(beto.displayName);
  // Nadie cobró todavía: las monedas de una ronda entran al terminar la partida.
  expect((await progressOf(ana.page)).coins).toBe(0);

  // Ana ataca al último gólem: las otras dos ven su plan antes de que confirme (R-35).
  await clickTile(ana.page, 5, 2);
  for (const p of [beto, caro]) {
    await expect.poll(async () => (await online(p.page)).plans.fire).toMatchObject({ action: { type: 'attack' } });
  }
  // El turno se resuelve cuando confirman las tres, sin esperar al reloj.
  await ana.page.keyboard.press('Space');
  await beto.page.keyboard.press('Space');
  expect((await online(caro.page)).online.end).toBeNull();
  await caro.page.keyboard.press('Space');

  // Las tres ven el mismo resultado, con lo que calculó el servidor: la ronda 3 paga 120.
  for (const p of all) {
    await expectResults(p.page, 'victory', 120, '1 ronda cobrada');
    await expect(results(p.page)).toContainText('Tienes 120 · te faltan 130.');
    // El avance de los logros: nadie hizo nada de lo que cuentan, así que cada uno dice "sin avance".
    await expect(results(p.page).getByRole('heading', { name: 'Avance de Equipo' })).toBeVisible();
    await expect(results(p.page).locator('.ach-none')).toHaveText(Array(6).fill('sin avance'));
    expect(await gains(p.page)).toEqual({});
    // Y ya están en su cuenta, con sus estadísticas (R-42).
    expect(await progressOf(p.page)).toEqual({
      coins: 120,
      counts: {},
      done: [],
      stats: { matches: 1, rounds: 1, wins: 1 },
    });
  }
  // Cada quien ve el pliegue del ninja con que jugó, y el de equipo.
  await expect(results(ana.page).getByRole('heading', { name: 'Avance de tu pliegue de Fuego' })).toBeVisible();
  await expect(results(beto.page).getByRole('heading', { name: 'Avance de tu pliegue de Agua' })).toBeVisible();
  await expect(results(caro.page).getByRole('heading', { name: 'Avance de tu pliegue de Nieve' })).toBeVisible();

  // "Tu progreso" abre la Libreta ninja, con las estadísticas de su dueña.
  await results(caro.page).getByRole('button', { name: 'Tu progreso' }).click();
  const stats = caro.page.getByRole('region', { name: 'Clásica' });
  await expect(stats.locator('[data-stat="matches"]')).toHaveText('1');
  await expect(stats.locator('[data-stat="rounds"]')).toHaveText('1');
  await expect(stats.locator('[data-stat="wins"]')).toHaveText('1');
  await expect(stats).toContainText('Solo tú las ves');

  // "Listo" lleva de vuelta a la sala, que sigue abierta para jugar otra (R-53).
  for (const p of [ana, beto]) await results(p.page).getByRole('button', { name: 'Listo' }).click();
  await expect(ana.page.getByRole('heading', { name: 'Tu sala' })).toBeVisible();
  await expect(beto.page.getByRole('heading', { name: `Sala de ${ana.displayName}` })).toBeVisible();
  await expect(ana.page.getByRole('button', { name: 'Empezar partida' })).toBeEnabled();
  expect(errors).toEqual([]);
  await closeAll(all);
});

test('R-29 y D-103: quien completa el amuleto en una partida cobra el doble en esa misma partida; a quien le falta un pliegue, no', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  // A Ana solo le falta quemar a un gólem más para "Llamarada": lo demás ya está completo en su tabla.
  giveAchievements(ana.email, { all: true, blaze: -1 });
  // A Beto le falta un combo triple para cerrar el pliegue de equipo, y en esta partida no hay ninguno: su
  // logro está a una vez de la meta, pero sin completar.
  giveAchievements(beto.email, { all: true, combo3: -1 });
  await gatherRoom([ana, beto], COMBO_FEATS);
  await startRoomMatch([ana, beto]);

  // Ana coloca su carta: Beto la ve llegar tapada, sin su valor, y la franja se lo dice a los dos.
  await ana.page.keyboard.press('1');
  await clickTile(ana.page, 4, 2);
  await expect.poll(async () => (await online(beto.page)).plans.fire).toMatchObject({ action: { type: 'card' } });
  // Beto coloca la suya en el mismo turno: es un combo, y cada quien lo lee en su franja.
  await beto.page.keyboard.press('1');
  await clickTile(beto.page, 4, 2);
  await expect(ana.page.locator('.tip-text')).toHaveText(`Combo: ${beto.displayName} y tú juegan carta este turno.`);
  await expect(beto.page.locator('.tip-text')).toHaveText(`Combo: ${ana.displayName} y tú juegan carta este turno.`);
  await ana.page.keyboard.press('Space');
  await beto.page.keyboard.press('Space');

  // Ana quemó al gólem con su combo: completó "Llamarada" y, con él, el amuleto. El servidor ya le pagó
  // el doble: 240 en vez de 120.
  await expectResults(ana.page, 'victory', 240, '1 ronda cobrada');
  await expect(results(ana.page).locator('.res-double')).toHaveText('×2');
  await expect(gain(ana.page, 'blaze')).toHaveClass(/fresh/);
  await expect(gain(ana.page, 'blaze')).toHaveAttribute('data-done', 'true');
  await expect(gain(ana.page, 'blaze')).toContainText('Llamarada');
  // Lo demás ya estaba completo: no vuelve a sumar ni a destacarse.
  expect(await gains(ana.page)).toEqual({ blaze: '+1' });
  await expect(results(ana.page).locator('.ach-line.fresh')).toHaveCount(1);
  // Beto derribó al gólem y les dio Potencia a sus dos compañeros, pero esos logros ya los tenía: su amuleto
  // sigue sin el pliegue de equipo, y cobra lo normal.
  await expectResults(beto.page, 'victory', 120, '1 ronda cobrada');
  await expect(results(beto.page).locator('.res-double')).toHaveCount(0);
  expect(await gains(beto.page)).toEqual({});
  await expect(gain(beto.page, 'combo3')).toHaveAttribute('data-done', 'false');
  expect((await progressOf(ana.page)).coins).toBe(240);
  expect((await progressOf(ana.page)).done).toHaveLength(12);
  expect(await progressOf(beto.page)).toMatchObject({ coins: 120 });
  expect((await progressOf(beto.page)).done).toHaveLength(11);

  // En la Libreta de Ana, el amuleto completo dice que las monedas dobles están activas.
  await results(ana.page).getByRole('button', { name: 'Tu progreso' }).click();
  await expect(ana.page.getByText('Monedas dobles activas')).toBeVisible();
  await expect(ana.page.getByRole('heading', { name: 'Amuleto · 4 de 4 pliegues' })).toBeVisible();
  // En la de Beto faltan el pliegue de equipo y el doble.
  await results(beto.page).getByRole('button', { name: 'Tu progreso' }).click();
  await expect(beto.page.getByRole('heading', { name: 'Amuleto · 3 de 4 pliegues' })).toBeVisible();
  await expect(beto.page.getByText('Monedas dobles activas')).toHaveCount(0);
  await closeAll([ana, beto]);
});

test('R-55: cada quien suma a los logros de su ninja en el turno en que pasa, y el equipo, a los de equipo; el avance se queda aunque abandone', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  const caro = await newPlayer(browser, 'snow');
  const all = [ana, beto, caro];
  await gatherRoom(all, TO_BONUS);
  await startRoomMatch(all);
  // Primer turno: Ana juega una carta sola, que aturde al gólem sin derribarlo. La ronda sigue.
  await ana.page.keyboard.press('1');
  await clickTile(ana.page, 4, 2);
  for (const p of all) await p.page.keyboard.press('Space');
  for (const p of all) await planning(p.page, 2);
  expect((await online(caro.page)).match?.round).toBe(3);
  // Lo que sumó ya está en su cuenta, sin esperar a que termine la ronda ni la partida.
  expect((await progressOf(ana.page)).counts).toEqual({ stunner: 1 });
  expect((await progressOf(beto.page)).counts).toEqual({});

  // Segundo turno: Ana y Beto juegan carta a la vez. Es un combo, y el gólem cae.
  await ana.page.keyboard.press('1');
  await clickTile(ana.page, 4, 2);
  await beto.page.keyboard.press('1');
  await clickTile(beto.page, 4, 2);
  for (const p of all) await p.page.keyboard.press('Space');
  // Con los tres a vida completa, el equipo llega a la ronda bonus: la partida sigue.
  await expect.poll(async () => (await online(caro.page)).match?.round, { timeout: 30_000 }).toBe('bonus');

  // Ana, con Brasa, volvió a aturdir al gólem y lo quemó; Beto, con Marea, lo derribó y les dio Potencia a
  // sus dos compañeros. Caro, con Escarcha, no hizo nada de lo suyo, y lo de Brasa y lo de Marea no se le
  // suma. Lo del equipo, a los tres.
  expect((await progressOf(ana.page)).counts).toEqual({ stunner: 2, blaze: 1, untouched: 1 });
  expect((await progressOf(beto.page)).counts).toEqual({ breakwater: 1, highTide: 2, untouched: 1 });
  expect((await progressOf(caro.page)).counts).toEqual({ untouched: 1 });

  // Ana abandona: pierde las monedas de esa partida, pero su avance se queda (R-39).
  await ana.page.getByRole('button', { name: 'Salir de la partida' }).click();
  await ana.page
    .getByRole('alertdialog', { name: '¿Salir de la partida?' })
    .getByRole('button', { name: 'Salir', exact: true })
    .click();
  await expect(ana.page.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
  expect(await progressOf(ana.page)).toMatchObject({ coins: 0, counts: { stunner: 2, blaze: 1, untouched: 1 } });
  // Y lo ve en su ficha, al pie: el pliegue de su ninja y el de equipo.
  const fold = ana.page.locator('.pick-fold');
  await expect(fold.locator('[data-achievement="stunner"]')).toHaveAttribute('data-count', '2');
  await expect(fold.locator('[data-achievement="untouched"]')).toHaveAttribute('data-count', '1');
  await closeAll(all);
});

test('D-106: con el mazo en 0 y sin cartas en la mano, la mano dice que se acabaron, y el panel lo marca', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  // Beto empieza sin cartas en el mazo; Ana, con las suyas.
  await gatherRoom([ana, beto], { ninjas: { water: { deck: 0 } } });
  await startRoomMatch([ana, beto]);
  await planning(beto.page, 1);
  const note = beto.page.locator('.deck-out');
  await expect(note).toHaveAttribute('data-deck-out', 'online');
  await expect(note).toHaveText(
    'Se acabaron tus cartas de Agua en esta partida.Abre cajas con tus monedas para tener más en las próximas.',
  );
  await expect(beto.page.locator('.hand-empty')).toHaveCount(0);
  // En el panel de Marea, "Mazo 0" y el medidor apagado. Ana también lo ve así.
  for (const p of [beto, ana]) {
    await expect(panel(p.page, 'water').locator('.deck-zero')).toHaveText('Mazo 0');
    await expect(panel(p.page, 'water').locator('.meter')).toHaveClass(/off/);
    await expect(panel(p.page, 'water').locator('.meter')).toHaveAttribute('title', 'El medidor ya no da cartas.');
    await expect(panel(p.page, 'fire').locator('.deck-zero')).toHaveCount(0);
    await expect(panel(p.page, 'fire').locator('.meter')).not.toHaveClass(/off/);
  }
  // A Ana le quedan cartas en el mazo: su mano vacía dice cómo se ganan.
  await expect(ana.page.locator('.hand-empty')).toHaveText('Llena el medidor para ganar cartas');
  await expect(ana.page.locator('.deck-out')).toHaveCount(0);
  await closeAll([ana, beto]);
});

test('R-38: quien pierde la conexión deja a su ninja quieto, y el turno no lo espera; al volver, lo retoma desde el turno siguiente', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water', { track: true });
  // Un tablero tranquilo: el único gólem está lejos, y nadie cae mientras dura la prueba.
  await gatherRoom([ana, beto], {});
  await startRoomMatch([ana, beto]);

  // A Beto se le cae la conexión. Su pantalla lo dice, y Ana ve a Marea quieto.
  await dropLink(beto);
  await expect(beto.page.getByRole('alert')).toHaveText(
    'Se perdió la conexión. Reconectando… Mientras tanto, tu ninja queda quieto.',
  );
  await expect(panel(ana.page, 'water')).toHaveAttribute('data-seat-state', 'away');
  await expect(panel(ana.page, 'water')).toContainText('Desconectado');
  await expect(ana.page.locator('.toast')).toHaveText(
    `${beto.displayName} se desconectó. Marea queda quieto hasta que vuelva.`,
  );

  // Ana confirma: el turno se resuelve sin esperar a Beto, porque un ninja quieto cuenta como confirmado.
  await ana.page.keyboard.press('Space');
  await expect.poll(async () => (await online(ana.page)).match?.turn, { timeout: 30_000 }).toBe(1);

  // Beto recupera la red y vuelve solo a su partida. La franja le dice desde cuándo juega.
  await watchReturn(beto.page);
  await restoreLink(beto);
  await expect(beto.page.locator('.net-strip.back')).toHaveText('Volviste. Retomas a tu ninja desde el próximo turno.');
  await expect(panel(ana.page, 'water')).not.toHaveAttribute('data-seat-state', 'away');

  // Ana sigue confirmando hasta que Beto lleva de nuevo a Marea.
  await passUntil([ana, beto], ([, b]) => b?.online.match?.plays === true);
  const seen = await returnSeen(beto.page);
  // Al volver no lo llevaba: si había un turno en curso, ese turno Marea siguió quieto, y lo retomó después.
  expect(seen).toMatchObject({ plays: false });
  expect(seen?.resumed).toBeGreaterThan(seen?.turn ?? 1);

  // Ya lo lleva: lo mueve a una casilla vecina que esté libre, y Ana ve su plan. Marea sigue donde empezó,
  // en (0, 2); el bot sí se movió, y puede estar o ir a cualquiera de sus vecinas.
  const state = await online(beto.page);
  const taken = new Set([
    ...(state.match?.ninjas ?? []).map((n) => `${n.pos.x},${n.pos.y}`),
    ...Object.values(state.plans).flatMap((plan) => (plan?.moveTo ? [`${plan.moveTo.x},${plan.moveTo.y}`] : [])),
  ]);
  const to = [
    { x: 0, y: 1 },
    { x: 0, y: 3 },
    { x: 1, y: 1 },
    { x: 1, y: 3 },
  ].find((tile) => !taken.has(`${tile.x},${tile.y}`));
  expect(to).toBeDefined();
  await clickTile(beto.page, to?.x ?? 0, to?.y ?? 0);
  await expect.poll(async () => (await online(ana.page)).plans.water?.moveTo).toEqual(to);
  await closeAll([ana, beto]);
});

test('D-48: quien está desconectado cuando el equipo supera una ronda no la cobra, aunque vuelva antes del final', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water', { track: true });
  await gatherRoom([ana, beto], ONE_ROUND);
  await startRoomMatch([ana, beto]);

  // Beto se desconecta, y sin él Ana derriba al gólem: el equipo supera la ronda 1.
  await dropLink(beto);
  await expect(panel(ana.page, 'water')).toHaveAttribute('data-seat-state', 'away');
  await clickTile(ana.page, 7, 2);
  await ana.page.keyboard.press('Space');
  await expect.poll(async () => (await online(ana.page)).match?.turn, { timeout: 30_000 }).toBe(1);

  // Beto vuelve, y está presente hasta el final. El equipo no aguanta la ronda 2.
  await restoreLink(beto);
  await expect(panel(ana.page, 'water')).not.toHaveAttribute('data-seat-state', 'away');
  await passUntilEnd([ana, beto]);

  // Ana cobra la ronda 1. Beto no: no estaba cuando se superó.
  await expectResults(ana.page, 'defeat', 60, '1 ronda cobrada');
  await expectResults(beto.page, 'defeat', 0, '0 rondas cobradas');
  expect(await progressOf(ana.page)).toMatchObject({ coins: 60, stats: { matches: 1, rounds: 1, wins: 0 } });
  // Para Beto fue una partida jugada y perdida, sin rondas. No abandonó: volvió antes del final, y no hay aviso.
  expect(await progressOf(beto.page)).toMatchObject({ coins: 0, stats: { matches: 1, rounds: 0, wins: 0 } });
  await results(beto.page).getByRole('button', { name: 'Listo' }).click();
  await expect(beto.page.getByRole('alertdialog')).toHaveCount(0);
  await closeAll([ana, beto]);
});

test('R-39: quien no vuelve antes del final abandonó: pierde las monedas de esa partida, y se entera una sola vez; quien se quedó las cobra', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  await gatherRoom([ana, beto], ONE_ROUND);
  await startRoomMatch([ana, beto]);

  // Con los dos presentes, el equipo supera la ronda 1: sus 60 monedas quedan pendientes para cada uno.
  await clickTile(ana.page, 7, 2);
  await ana.page.keyboard.press('Space');
  await beto.page.keyboard.press('Space');
  for (const p of [ana, beto]) await planning(p.page, 2);

  // Beto cierra la pestaña a mitad de la partida, y no vuelve. Ana sigue hasta el final.
  await beto.page.close();
  await expect(panel(ana.page, 'water')).toHaveAttribute('data-seat-state', 'away');
  await passUntilEnd([ana]);
  await expectResults(ana.page, 'defeat', 60, '1 ronda cobrada');

  // Beto vuelve a abrir el juego: la partida ya terminó. No cobró la ronda que había superado, y la partida
  // le cuenta como jugada y no ganada (R-42).
  const back = await beto.context.newPage();
  await back.goto('/?speed=0.3');
  expect(await progressOf(back)).toMatchObject({ coins: 0, stats: { matches: 1, rounds: 1, wins: 0 } });
  // Al entrar a jugar en línea, el aviso se lo dice.
  await openOnline(back);
  const notice = back.getByRole('alertdialog', { name: 'La partida terminó sin ti' });
  await expect(notice).toContainText(
    'Como no volviste antes del final, cuenta como abandono y no recibes las monedas de esa partida. Tus logros se mantienen.',
  );
  await notice.getByRole('button', { name: 'Entendido' }).click();
  await expect(notice).toHaveCount(0);
  // El aviso no vuelve a salir.
  await back.reload();
  await openOnline(back);
  await expect(back.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
  await expect(back.getByRole('alertdialog')).toHaveCount(0);
  expect((await progressOf(ana.page)).coins).toBe(60);
  expect((await progressOf(back)).coins).toBe(0);
  await closeAll([ana, beto]);
});

test('R-39: quien sale con «Salir» pierde las monedas de esa partida, también las de la ronda que ya había superado; quien se queda las cobra', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  await gatherRoom([ana, beto], ONE_ROUND);
  await startRoomMatch([ana, beto]);

  // Con los dos presentes, el equipo supera la ronda 1: sus 60 monedas quedan pendientes para cada uno.
  await clickTile(ana.page, 7, 2);
  await ana.page.keyboard.press('Space');
  await beto.page.keyboard.press('Space');
  for (const p of [ana, beto]) await planning(p.page, 2);
  expect((await progressOf(beto.page)).coins).toBe(0);

  // Beto sale: vuelve al inicio en línea, sin monedas y sin aviso. Ya sabe que salió.
  await beto.page.getByRole('button', { name: 'Salir de la partida' }).click();
  await beto.page
    .getByRole('alertdialog', { name: '¿Salir de la partida?' })
    .getByRole('button', { name: 'Salir', exact: true })
    .click();
  await expect(beto.page.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
  await expect(beto.page.getByRole('alertdialog')).toHaveCount(0);
  // Cuenta como jugada y no ganada; la ronda que superó sí cuenta (R-42).
  expect(await progressOf(beto.page)).toMatchObject({ coins: 0, stats: { matches: 1, rounds: 1, wins: 0 } });
  await expect(panel(ana.page, 'water')).toHaveAttribute('data-seat-state', 'left');

  // Ana sigue hasta el final. Pierde, pero cobra la ronda 1: estaba al superarla y no abandonó.
  await passUntilEnd([ana]);
  await expectResults(ana.page, 'defeat', 60, '1 ronda cobrada');
  expect(await progressOf(ana.page)).toMatchObject({ coins: 60, stats: { matches: 1, rounds: 1, wins: 0 } });
  // A Beto la partida no le deja nada, tampoco después de terminar.
  expect((await progressOf(beto.page)).coins).toBe(0);
  await closeAll([ana, beto]);
});
