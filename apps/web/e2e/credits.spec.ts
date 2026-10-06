import { expect, test } from '@playwright/test';
import { clippedElements, smallText } from './helpers';

/* La portada dice qué es el proyecto (D-75) y lleva a los créditos, donde Ventisca reconoce su inspiración (D-76). */

test('el pie de la portada lleva a los créditos y al aviso de privacidad', async ({ page }) => {
  await page.goto('/');
  const foot = page.locator('.title-foot');
  await expect(foot).toHaveText(/^Piloto de un proyecto personal\s*·\s*Créditos\s*·\s*Aviso de privacidad$/);
  await foot.getByRole('button', { name: 'Créditos' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
  // El texto corto de CREDITOS.md, tal cual.
  await expect(
    page.getByText(
      'Ventisca es un homenaje a Card-Jitsu Nieve, de la saga Card-Jitsu de Club Penguin. De ahí viene la idea; los personajes, el arte, la música, los sonidos y el código son propios.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Club Penguin y Card-Jitsu son marcas de Disney, y Ventisca no está afiliado ni respaldado por Disney.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Gracias al equipo de Club Penguin y a su comunidad.')).toBeVisible();
  // La frase que estaba en el pie de la portada vive ahora aquí.
  await expect(page.getByText('Arte, sonido y música generados en código.')).toBeVisible();

  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('heading', { name: 'Ventisca' })).toBeVisible();
  await expect(page.getByText(/generados en código/)).toHaveCount(0);
  await foot.getByRole('button', { name: 'Aviso de privacidad' }).click();
  await expect(page.getByRole('heading', { name: 'Aviso de privacidad de Ventisca' })).toBeVisible();
});

test('lineamientos de diseño, sección 8: la pantalla de créditos no corta texto ni lo achica', async ({ page }) => {
  await page.goto('/?speed=0.2');
  await page.getByRole('button', { name: 'Créditos' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
  await page.waitForTimeout(700); // las entradas escalonadas
  expect(await clippedElements(page)).toEqual([]);
  expect(await smallText(page)).toEqual([]);
  // Una sola acción, abajo a la derecha, y no es primaria: volver.
  await expect(page.locator('.screen-actions .btn')).toHaveText(['Volver']);
  await expect(page.locator('.screen .btn-primary')).toHaveCount(0);
});

test('sin servidor no hay cuentas ni aviso de privacidad, pero los créditos siguen en la portada', async ({ page }) => {
  // Así queda el juego de un solo archivo, que se abre sin servidor.
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Jugar sin cuenta', exact: true })).toBeVisible();
  await expect(page.locator('.title-foot')).toHaveText(/^Piloto de un proyecto personal\s*·\s*Créditos$/);
  await page.getByRole('button', { name: 'Créditos' }).click();
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible();
});
