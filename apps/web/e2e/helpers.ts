import { expect, type Page } from '@playwright/test';

/* Utilidades de las pruebas e2e. Leen el store que la app expone en desarrollo (window.__ventisca). */

export interface TestState {
  phase: string;
  screen: string;
  active: string | null;
  boosting: boolean;
  plans: Record<string, unknown>;
  match: { turn: number; ninjas: { id: string; pos: { x: number; y: number } }[] };
}

export type TestWindow = {
  __ventisca: {
    getState(): TestState;
    subscribe(listener: (state: TestState, prev: TestState) => void): () => void;
  };
};

export const phase = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__ventisca.getState().phase);

/** Abre el juego, entra al sandbox y espera a que empiece la planificación. */
export async function startMatch(page: Page, speed = 0.3) {
  await page.goto(`/?speed=${speed}`);
  await page.getByRole('button', { name: 'Jugar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu equipo' })).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar partida' }).click();
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');
}
