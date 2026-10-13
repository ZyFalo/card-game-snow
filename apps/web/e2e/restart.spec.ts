import { expect, test } from '@playwright/test';
import { restartServer } from './control';
import { FULL_TRACE } from './helpers';
import {
  clickTile,
  createRoom,
  gatherRoom,
  joinRoom,
  newPlayer,
  ONE_ROUND,
  openOnline,
  planning,
  progressOf,
  startRoomMatch,
} from './online-helpers';

/*
 * El reinicio del servidor a mitad de una partida (R-54), como en un despliegue. Esta prueba apaga el
 * servidor de las pruebas y lo vuelve a arrancar, lo que corta a todo el que esté conectado: por eso corre
 * sola, después de todas las demás (el proyecto "reinicio" de playwright.config.ts).
 */

test.use(FULL_TRACE);

test('R-54: si el servidor se reinicia a mitad de una partida, cada persona conserva las rondas terminadas, se entera una sola vez y puede volver a jugar', async ({
  browser,
}) => {
  const ana = await newPlayer(browser, 'fire');
  const beto = await newPlayer(browser, 'water');
  const both = [ana, beto];
  await gatherRoom(both, ONE_ROUND);
  await startRoomMatch(both);

  // El equipo supera la ronda 1: sus 60 monedas quedan pendientes hasta que termine la partida.
  await clickTile(ana.page, 7, 2);
  await ana.page.keyboard.press('Space');
  await beto.page.keyboard.press('Space');
  for (const p of both) {
    await planning(p.page, 2);
    expect((await progressOf(p.page)).coins).toBe(0);
  }

  await restartServer();

  // Cada quien vuelve solo al inicio en línea, con el aviso encima.
  for (const p of both) {
    const notice = p.page.getByRole('alertdialog', { name: 'La partida terminó', exact: true });
    await expect(notice).toContainText(
      'El servidor se reinició y la partida terminó. Conservas lo ganado en las rondas completas. No cuenta como derrota.',
    );
    await expect(p.page.getByRole('region', { name: 'Elige tu ninja' })).toBeVisible();
    // La ronda terminada ya está en su cuenta. La partida no cuenta como jugada, ganada ni perdida (R-42).
    expect(await progressOf(p.page)).toMatchObject({ coins: 60, stats: { matches: 0, rounds: 1, wins: 0 } });
    await notice.getByRole('button', { name: 'Entendido' }).click();
    await expect(notice).toHaveCount(0);
  }

  // El aviso no vuelve a salir, y el saldo no cambia al volver a entrar.
  await ana.page.reload();
  await openOnline(ana.page);
  await expect(ana.page.getByRole('alertdialog')).toHaveCount(0);
  expect((await progressOf(ana.page)).coins).toBe(60);

  // El servidor que arrancó atiende como siempre: una sala nueva, con las dos personas dentro.
  const code = await createRoom(ana.page);
  await joinRoom(beto.page, code);
  await expect(beto.page.getByText(`Esperando a que ${ana.displayName} empiece la partida.`)).toBeVisible();
  await expect(ana.page.getByRole('button', { name: 'Empezar con el bot' })).toBeEnabled();
  for (const p of both) await p.context.close();
});
