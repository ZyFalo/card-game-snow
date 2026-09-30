import { expect, test } from '@playwright/test';

/* El tablero necesita WebGL: si el navegador no lo tiene, un mensaje claro lo explica. */
test('sin WebGL, un mensaje claro explica por qué no se puede jugar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Simula un navegador sin WebGL: el contexto 2D sigue disponible (el arte se rasteriza con él).
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return /webgl/i.test(type) ? null : Reflect.apply(original, this, [type, ...rest]);
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('no puede mostrar el tablero');
  expect(errors).toEqual([]);
});
