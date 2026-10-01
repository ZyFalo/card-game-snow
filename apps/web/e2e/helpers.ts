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
  await page.getByRole('button', { name: 'Jugar sin cuenta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu equipo' })).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar partida' }).click();
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('planning');
}

/**
 * Lineamientos de diseño, sección 8: los elementos visibles de la pantalla cuyo contenido es más ancho
 * que su caja y que no se pueden desplazar, es decir, texto cortado o que se sale. También los que
 * recortan lo que no les cabe a lo alto, como una carta con un nombre de dos líneas. Devuelve una
 * descripción de cada uno; la prueba espera una lista vacía.
 */
export function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('.screen, .screen *, .modal, .modal *')) {
      if (!(el instanceof HTMLElement)) continue;
      // Los campos de texto se desplazan solos al escribir; los iframes (Turnstile) traen su propia caja.
      if (el instanceof HTMLInputElement || el instanceof HTMLIFrameElement) continue;
      // El texto solo para lectores de pantalla se recorta a propósito.
      if (el.classList.contains('sr-only')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || el.clientWidth === 0) continue;
      const { overflowX, overflowY } = getComputedStyle(el);
      const wide = el.scrollWidth > el.clientWidth + 1 && overflowX !== 'auto' && overflowX !== 'scroll';
      const tall = el.scrollHeight > el.clientHeight + 1 && (overflowY === 'hidden' || overflowY === 'clip');
      if (!wide && !tall) continue;
      const name = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().replace(/\s+/g, '.')}` : ''}`;
      const size = wide ? `${el.scrollWidth} > ${el.clientWidth}` : `alto ${el.scrollHeight} > ${el.clientHeight}`;
      found.push(`${name} (${size}): ${(el.textContent ?? '').trim().slice(0, 60)}`);
    }
    return found;
  });
}

/**
 * Lineamientos de diseño, sección 8: los textos visibles de menos de 13 px. Devuelve una descripción de
 * cada uno; la prueba espera una lista vacía.
 */
export function smallText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('.screen *, .modal *')) {
      if (!(el instanceof HTMLElement)) continue;
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join(' ')
        .trim();
      if (text === '') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size >= 13) continue;
      found.push(
        `${el.tagName.toLowerCase()}.${String(el.className).trim().replace(/\s+/g, '.')} (${size} px): ${text.slice(0, 40)}`,
      );
    }
    return found;
  });
}
