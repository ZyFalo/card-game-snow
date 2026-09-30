import { expect, type Page, test } from '@playwright/test';
import { startMatch } from './helpers';

/* D-31 (enmienda de R-29): cada ronda se cobra al instante; resultados y logros se guardan al terminar la partida. */

interface CoinState {
  screen: string;
  phase: string;
  paused: boolean;
  view: { round: number | 'bonus'; status: string } | null;
  results: { earned: string[]; reward: { total: number } } | null;
}
type CoinWindow = {
  __ventisca: {
    getState(): CoinState;
    subscribe(listener: (state: CoinState, prev: CoinState) => void): () => void;
  };
};

const state = (page: Page) => page.evaluate(() => (window as unknown as CoinWindow).__ventisca.getState());

const saved = (page: Page) =>
  page.evaluate(() => ({
    coins: (JSON.parse(localStorage.getItem('ventisca:profile:v1') ?? '{}') as { coins?: number }).coins ?? 0,
    achievements: Object.keys(JSON.parse(localStorage.getItem('ventisca:achievements:v1') ?? '{}') as object),
  }));

/** Pausa (como la tecla P) en el mismo instante en que se cumple la condición, sin esperar a un sondeo. */
function pauseWhen(page: Page, moment: 'round2' | 'matchEnd') {
  return page.evaluate((m) => {
    const stop = (window as unknown as CoinWindow).__ventisca.subscribe((s, prev) => {
      const hit =
        m === 'round2'
          ? s.view?.round === 2 && prev.view?.round !== 2
          : s.view?.status !== 'playing' && prev.view?.status === 'playing';
      if (!hit) return;
      stop();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    });
  }, moment);
}

/** Juega turnos con "Sugerir" hasta que se cumpla `done`, la partida se pause o termine. */
async function playUntil(page: Page, done: (s: CoinState) => boolean) {
  for (let turn = 0; turn < 80; turn++) {
    await expect
      .poll(
        async () => {
          const s = await state(page);
          return s.paused || s.screen === 'results' || s.phase === 'planning';
        },
        { timeout: 120_000 },
      )
      .toBe(true);
    const s = await state(page);
    if (done(s) || s.paused || s.screen === 'results') return;
    for (let i = 0; i < 3; i++) await page.keyboard.press('s');
    await page.keyboard.press('Space');
  }
}

async function quitToMenu(page: Page) {
  if (!(await state(page)).paused) await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Salir al menú' }).click();
  await expect(page.getByRole('button', { name: 'Jugar', exact: true })).toBeVisible();
}

test('D-31: ganar la ronda 1 y salir conserva las 60 monedas', async ({ page }) => {
  await startMatch(page, 0.15);
  await pauseWhen(page, 'round2');
  await playUntil(page, () => false);
  expect((await state(page)).view?.round).toBe(2);
  await quitToMenu(page);
  expect((await saved(page)).coins).toBe(60);
});

test('D-31: abandonar en la ronda 2 conserva lo de la ronda 1 y no da logros', async ({ page }) => {
  await startMatch(page, 0.15);
  await playUntil(page, (s) => s.phase === 'planning' && s.view?.round === 2);
  await quitToMenu(page);
  expect(await saved(page)).toEqual({ coins: 60, achievements: [] });
  expect((await state(page)).results).toBeNull();
});

test('D-31: ganar y salir durante la celebración guarda monedas y logros @lento', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  // Colección completa: la victoria y algún combo (logro) son casi seguros.
  await page.addInitScript(() => {
    const collection: Record<string, number> = {};
    for (const el of ['fire', 'water', 'snow'])
      for (let i = 1; i <= 20; i++) collection[`${el}-${String(i).padStart(2, '0')}`] = 1;
    localStorage.setItem(
      'ventisca:profile:v1',
      JSON.stringify({ version: 1, coins: 0, camino: 'fire', boxesOpened: 0, collection }),
    );
  });
  await page.goto('/?speed=0.15');
  await page.getByRole('button', { name: 'Jugar', exact: true }).click();
  await page.getByRole('button', { name: 'Comenzar partida' }).click();
  await pauseWhen(page, 'matchEnd');
  await playUntil(page, () => false);

  // La pausa llegó con la celebración en curso, antes de la pantalla de resultados.
  const atEnd = await state(page);
  expect(atEnd.screen).toBe('battle');
  expect(atEnd.view?.status).toBe('victory');
  await quitToMenu(page);

  const { results } = await state(page);
  expect(results).not.toBeNull();
  const store = await saved(page);
  expect(store.coins).toBe(results?.reward.total);
  expect(store.coins).toBeGreaterThanOrEqual(300);
  expect(results?.earned.length).toBeGreaterThan(0);
  expect(store.achievements).toEqual(expect.arrayContaining(results?.earned ?? []));
});
