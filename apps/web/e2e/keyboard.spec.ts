import { expect, type Page, test } from '@playwright/test';
import { phase, startMatch, type TestWindow } from './helpers';

/*
 * Estas pruebas mantienen una tecla pulsada, con unas 25 acciones por segundo, y miden lo que pasa
 * mientras tanto. La traza anota cada acción y las frena (con la traza completa, el turno ya no termina
 * de resolverse a tiempo), así que aquí va apagada. Si una falla, quedan igual su captura y el estado
 * de la pantalla.
 */
test.use({ trace: 'off' });

type LogWindow = TestWindow & { __confirms: number[] };

const boosting = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().boosting);

/** Cantidad de ninjas con plan en cada turno confirmado desde que se llamó a `watchConfirms`. */
const confirms = (page: Page) => page.evaluate(() => (window as unknown as LogWindow).__confirms);

function watchConfirms(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as LogWindow;
    w.__confirms = [];
    w.__ventisca.subscribe((s, prev) => {
      if (prev.phase === 'planning' && s.phase === 'resolving') w.__confirms.push(Object.keys(prev.plans).length);
    });
  });
}

test('mantener Espacio acelera la resolución, pero no confirma el turno siguiente hasta soltarlo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startMatch(page);
  await watchConfirms(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('s');
  // No siempre son tres: una sugerencia puede ser quedarse quieto sin acción, y un plan vacío no se guarda.
  const planned = await page.evaluate(
    () => Object.keys((window as unknown as TestWindow).__ventisca.getState().plans).length,
  );

  // Espacio confirma y se queda pulsado: cada keydown siguiente llega con repeat = true,
  // como la autorrepetición del teclado.
  await page.keyboard.down('Space');
  await expect.poll(() => phase(page)).toBe('resolving');
  let sawBoost = false;
  const deadline = Date.now() + 30_000;
  while ((await phase(page)) === 'resolving' && Date.now() < deadline) {
    await page.keyboard.down('Space');
    sawBoost ||= await boosting(page);
    await page.waitForTimeout(40);
  }
  // Sigue pulsado ya en la planificación del turno siguiente.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(40);
  }

  expect(sawBoost).toBe(true);
  expect(await phase(page)).toBe('planning');
  expect(await confirms(page)).toEqual([planned]);

  // Al soltarlo, una pulsación nueva sí confirma.
  await page.keyboard.up('Space');
  await page.keyboard.press('Space');
  // Se mira el registro de confirmaciones y no la fase: un turno sin combate se resuelve tan
  // rápido que, con la máquina cargada, el sondeo puede no llegar a ver "resolving".
  await expect.poll(() => confirms(page)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('las teclas de planificación no se repiten al mantenerlas', async ({ page }) => {
  await startMatch(page);
  await watchConfirms(page);
  const active = () => page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().active);
  const first = await active();

  // Mantener Tab cambia de ninja una sola vez.
  await page.keyboard.down('Tab');
  const second = await active();
  for (let i = 0; i < 5; i++) await page.keyboard.down('Tab');
  await page.keyboard.up('Tab');
  expect(second).not.toBe(first);
  expect(await active()).toBe(second);

  // Mantener Enter confirma una sola vez.
  await page.keyboard.down('Enter');
  await expect.poll(() => confirms(page)).toHaveLength(1);
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');
  for (let i = 0; i < 20; i++) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(40);
  }
  await page.keyboard.up('Enter');
  expect(await phase(page)).toBe('planning');
  expect(await confirms(page)).toHaveLength(1);
});

test('deshacer la única acción no deja un plan vacío: el siguiente Esc abre la pausa', async ({ page }) => {
  await startMatch(page);
  // Un ninja que solo ataca, sin moverse (no es fácil de lograr al empezar, así que se prepara el plan).
  await page.evaluate(() => {
    const store = (window as unknown as TestWindow).__ventisca as unknown as {
      getState(): { active: string; match: { enemies: { id: string }[] } };
      setState(patch: object): void;
    };
    const { active, match } = store.getState();
    const target = match.enemies[0]?.id ?? 'e1';
    store.setState({ plans: { [active]: { ninjaId: active, action: { type: 'attack', targetId: target } } } });
  });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().plans)).toEqual({});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pausa' })).toBeVisible();
});
