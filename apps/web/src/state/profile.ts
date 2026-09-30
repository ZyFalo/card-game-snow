import { type Collection, ELEMENTS, type ElementKind, sanitizeCollection } from '@ventisca/core';

/* Perfil del jugador (§18, R-32): monedas, colección y camino, en el navegador. */

export interface Profile {
  version: 1;
  coins: number;
  collection: Collection;
  camino: ElementKind | null;
  boxesOpened: number;
}

const KEY = 'ventisca:profile:v1';

export const emptyProfile = (): Profile => ({ version: 1, coins: 0, collection: {}, camino: null, boxesOpened: 0 });

export function loadProfile(): Profile {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw) as Partial<Profile>;
    const coins = typeof p.coins === 'number' && Number.isInteger(p.coins) && p.coins >= 0 ? p.coins : 0;
    const camino = ELEMENTS.includes(p.camino as ElementKind) ? (p.camino as ElementKind) : null;
    const boxesOpened = typeof p.boxesOpened === 'number' && p.boxesOpened >= 0 ? Math.floor(p.boxesOpened) : 0;
    return { version: 1, coins, collection: sanitizeCollection(p.collection), camino, boxesOpened };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(p: Profile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: el progreso vive solo en esta sesión */
  }
}
