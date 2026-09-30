import { expect, type Page, test } from '@playwright/test';
import { phase, startMatch } from './helpers';

/* Ciclo de vida de la escena de Phaser (window.__ventiscaScene, expuesta en desarrollo). */

interface DisplayObject {
  type: string;
  texture?: { key: string };
}
interface SceneHandle {
  children: { list: DisplayObject[] };
  currentGeneration(): number;
  isCurrent(gen: number): boolean;
  playEvents(events: unknown[], apply: (e: { t: string }) => void, gen: number): Promise<void>;
}
type SceneWindow = { __ventiscaScene: SceneHandle };
type ApplyLog = { t: string; current: boolean }[];

/** Efectos sueltos en la escena (fuera de las unidades): partículas, imágenes fx-*, números y gráficos. */
const leftovers = (page: Page) =>
  page.evaluate(() => {
    const list = (window as unknown as SceneWindow).__ventiscaScene.children.list;
    return {
      emitters: list.filter((o) => o.type === 'ParticleEmitter').length,
      fxImages: list.filter((o) => o.type === 'Image' && o.texture?.key.startsWith('fx-')).length,
      texts: list.filter((o) => o.type === 'Text').length,
      graphics: list.filter((o) => o.type === 'Graphics').length,
    };
  });

/** Lanza, sin esperarla, la cinemática de una carta de Nieve sobre el centro del tablero. */
const castSnowCard = (page: Page) =>
  page.evaluate(() => {
    const scene = (window as unknown as SceneWindow).__ventiscaScene;
    const at = { x: 4, y: 2 };
    const area: { x: number; y: number }[] = [];
    for (let y = 1; y <= 3; y++) for (let x = 3; x <= 5; x++) area.push({ x, y });
    const card = {
      t: 'card',
      ninjaId: 'snow',
      card: { id: 'prueba', element: 'snow', value: 10 },
      at,
      area,
      combo: false,
    };
    void scene.playEvents([card], () => undefined, scene.currentGeneration());
  });

test('reiniciar a mitad de una carta no deja efectos vivos en la partida nueva', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startMatch(page);
  // Que terminen los efectos de la aparición de los gólems.
  await page.waitForTimeout(3000);
  const clean = await leftovers(page);
  expect(clean.emitters).toBe(0);

  await castSnowCard(page);
  // En plena cinemática: la ventisca ya cae.
  await expect.poll(async () => (await leftovers(page)).emitters).toBeGreaterThan(0);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Reiniciar partida' }).click();

  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');
  await page.waitForTimeout(4000);
  expect(await leftovers(page)).toEqual(clean);
  expect(errors).toEqual([]);
});

test('una animación interrumpida no aplica sus eventos a la partida nueva', async ({ page }) => {
  await startMatch(page);
  // Cartel de combo y luego un medidor: cada evento se aplica al terminar su animación.
  await page.evaluate(() => {
    const w = window as unknown as SceneWindow & { __applied: ApplyLog };
    const scene = w.__ventiscaScene;
    const gen = scene.currentGeneration();
    w.__applied = [];
    const events = [
      { t: 'combo', elements: ['fire', 'water'] },
      { t: 'meter', ninjaId: 'fire', value: 4 },
    ];
    void scene.playEvents(events, (e) => w.__applied.push({ t: e.t, current: scene.isCurrent(gen) }), gen);
  });
  // Se pausa en pleno cartel (la escena se congela) y se reinicia la partida.
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Reiniciar partida' }).click();
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');

  const applied = await page.evaluate(() => (window as unknown as { __applied: ApplyLog }).__applied);
  expect(applied.filter((a) => !a.current)).toEqual([]);
});
