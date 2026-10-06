import { expect, type Page, test } from '@playwright/test';
import { startMatch, type TestWindow } from './helpers';

/* El tablero durante la planificación (lineamientos de diseño, sección "Tablero"). */

/* Casilla del tablero -> coordenadas de página con el escenario a 1280×720 (escala 1). */
const tile = (x: number, y: number) => ({ x: 240 + 100 * x, y: 144 + 84 * y });

interface SceneImage {
  type: string;
  visible: boolean;
  texture?: { key: string };
}
type SceneWindow = { __ventiscaScene: { children: { list: SceneImage[] } } };

/** Las siluetas de los destinos planeados que están a la vista. */
const ghosts = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as SceneWindow).__ventiscaScene.children.list
      .filter((o) => o.type === 'Image' && o.visible && (o.texture?.key ?? '').endsWith('-outline'))
      .map((o) => o.texture?.key),
  );

test('el destino planeado se marca con la silueta del ninja', async ({ page }) => {
  await startMatch(page);
  expect(await ghosts(page)).toEqual([]);
  const { active, pos } = await page.evaluate(() => {
    const s = (window as unknown as TestWindow).__ventisca.getState();
    return { active: s.active, pos: s.match.ninjas.find((n) => n.id === s.active)?.pos ?? { x: 0, y: 0 } };
  });
  // Una casilla alcanzable: la de al lado, en la columna 1.
  const to = tile(1, pos.y);
  await page.mouse.click(to.x, to.y);
  await expect.poll(() => ghosts(page)).toEqual([`ninja-${active}-outline`]);

  // Deshacer el movimiento se lleva la silueta.
  await page.keyboard.press('Escape');
  await expect.poll(() => ghosts(page)).toEqual([]);
});
