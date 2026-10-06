import { expect, type Page, test } from '@playwright/test';
import { HUD_BAND_Y } from '../src/art/scenery';
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

test('la mano muestra solo las cartas que hay, sin casillas vacías', async ({ page }) => {
  await startMatch(page);
  const hand = page.locator('.hand');
  await expect(hand).toBeVisible();
  // Al empezar nadie tiene cartas: la mano queda con su título y la frase que dice cómo se ganan.
  await expect(hand.locator('.card')).toHaveCount(0);
  await expect(hand.getByText('Llena el medidor para ganar cartas')).toBeVisible();
  const title = await hand.locator('.hand-head').boundingBox();
  // El título va dentro de la franja que el fondo deja lisa: ninguna línea del fondo lo cruza.
  expect(title?.y ?? 0).toBeGreaterThan(HUD_BAND_Y + 2);

  // Con dos cartas en la mano del ninja activo se ven esas dos.
  await page.evaluate(() => {
    type Ninja = { id: string; hand: { id: string; element: string; value: number }[] };
    const store = (window as unknown as TestWindow).__ventisca as unknown as {
      getState(): { active: string; view: { ninjas: Ninja[] } };
      setState(patch: object): void;
    };
    const { active, view } = store.getState();
    const cards = [9, 11].map((value, i) => ({ id: `${active}-${i + 1}`, element: active, value }));
    store.setState({
      view: { ...view, ninjas: view.ninjas.map((n) => (n.id === active ? { ...n, hand: cards } : n)) },
    });
  });
  await expect(hand.locator('.card')).toHaveCount(2);
  await expect(hand.getByRole('button', { name: /^Carta de/ })).toHaveCount(2);
  await expect(hand.getByText('Llena el medidor para ganar cartas')).toHaveCount(0);
  // El título no se mueve al llegar las cartas: la mano guarda su alto.
  expect(await hand.locator('.hand-head').boundingBox()).toEqual(title);
});

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
