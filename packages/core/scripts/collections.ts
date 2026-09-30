import {
  addToCollection,
  bankFor,
  type Collection,
  type DeckCard,
  ELEMENTS,
  type ElementKind,
  openBox,
  reservesFor,
  rngFrom,
  STARTER_CARDS,
  starterCollection,
} from '../src';

/*
 * Colecciones de ejemplo para simular la progresión (§18.3 del PRD). En el juego,
 * la reserva de cada ninja es la colección del jugador (R-26), así que el balance
 * se mide por etapas: jugador nuevo, tras sus primeras cajas y colección completa.
 */

export const COLLECTION_PRESETS = [
  'fixed',
  'empty',
  'starter-no-path',
  'starter',
  'box',
  'random8',
  'full',
  'top7',
] as const;

export type CollectionPreset = (typeof COLLECTION_PRESETS)[number];

/** Descripción de cada colección, con el nombre de su fila en la tabla del §18.3. */
export const PRESET_LABELS: Record<CollectionPreset, string> = {
  fixed: 'Mazo fijo de v1 (6 cartas de 8 a 12; no es la reserva del juego)',
  empty: '0 cartas',
  'starter-no-path': '1 carta de 9 (inicio de R-30, sin camino)',
  starter: '1 carta de 9 + carta de camino (un 12)',
  box: 'Tras una caja de 3 por elemento',
  random8: '8 cartas al azar del banco',
  full: 'Las 20 (colección completa)',
  top7: 'Solo las 7 más altas (11 y 12)',
};

export const isCollectionPreset = (s: string): s is CollectionPreset =>
  (COLLECTION_PRESETS as readonly string[]).includes(s);

/**
 * Colección de un jugador de ejemplo. Las que tienen azar (`box` y `random8`) usan un
 * RNG propio sembrado con la semilla de la partida, así la simulación es reproducible.
 * Con `fixed` no hay colección: la partida usa el mazo fijo de v1.
 */
export function presetCollection(preset: CollectionPreset, seed: number, path: ElementKind): Collection | null {
  const rng = rngFrom((seed ^ 0x51a7c0de) >>> 0);
  switch (preset) {
    case 'fixed':
      return null;
    case 'empty':
      return {};
    case 'starter-no-path':
      return addToCollection(
        {},
        ELEMENTS.map((el) => ({ id: STARTER_CARDS[el] })),
      );
    case 'starter':
      return starterCollection(path);
    case 'box':
      return ELEMENTS.reduce((c, el) => addToCollection(c, openBox(el, 3, rng)), starterCollection(path));
    case 'random8':
      return addToCollection(
        {},
        ELEMENTS.flatMap((el) => rng.shuffle(bankFor(el)).slice(0, 8)),
      );
    case 'full':
      return addToCollection(
        {},
        ELEMENTS.flatMap((el) => bankFor(el)),
      );
    case 'top7':
      return addToCollection(
        {},
        ELEMENTS.flatMap((el) => bankFor(el).filter((c) => c.value >= 11)),
      );
  }
}

/** Reserva de cada ninja para `createMatch` (R-26), o `undefined` con el mazo fijo. */
export function presetDecks(
  preset: CollectionPreset,
  seed: number,
  path: ElementKind,
): Record<ElementKind, DeckCard[]> | undefined {
  const c = presetCollection(preset, seed, path);
  return c ? reservesFor(c) : undefined;
}
