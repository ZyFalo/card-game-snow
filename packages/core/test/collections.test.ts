import { describe, expect, it } from 'vitest';
import { COLLECTION_PRESETS, presetCollection, presetDecks } from '../scripts/collections';
import { CAMINO_CARDS, collectionSummary, createMatch, ELEMENTS } from '../src';

/* Colecciones de ejemplo que usa `pnpm sim` para medir el balance por etapa (§18.3). */
describe('Colecciones para simular la progresión (§18.3)', () => {
  it('R-30: el inicio es un 9 por elemento más la carta de camino; sin camino, solo los 9', () => {
    const starter = presetCollection('starter', 1, 'water');
    expect(starter?.[CAMINO_CARDS.water]).toBe(1);
    for (const el of ELEMENTS) {
      const s = collectionSummary(starter ?? {}, el);
      expect(s.total).toBe(el === 'water' ? 2 : 1);
      expect(collectionSummary(presetCollection('starter-no-path', 1, 'water') ?? {}, el)).toEqual({
        distinct: 1,
        total: 1,
        average: 9,
      });
    }
  });

  it('R-28: tras una caja, cada elemento suma 3 cartas sorteadas y el sorteo depende de la semilla', () => {
    const a = presetCollection('box', 7, 'fire') ?? {};
    for (const el of ELEMENTS) expect(collectionSummary(a, el).total).toBe(el === 'fire' ? 5 : 4);
    expect(presetCollection('box', 7, 'fire')).toEqual(a);
    const others = [8, 9, 10, 11].map((seed) => JSON.stringify(presetCollection('box', seed, 'fire')));
    expect(others.some((o) => o !== JSON.stringify(a))).toBe(true);
  });

  it('R-25: la colección completa tiene las 20 cartas de cada elemento; las más altas son siete 11 y 12', () => {
    for (const el of ELEMENTS) {
      expect(collectionSummary(presetCollection('full', 1, 'fire') ?? {}, el)).toMatchObject({
        distinct: 20,
        total: 20,
      });
      const top = presetDecks('top7', 1, 'fire')?.[el] ?? [];
      expect(top.map((c) => c.value).sort()).toEqual([11, 11, 11, 11, 12, 12, 12]);
      expect(collectionSummary(presetCollection('random8', 3, 'fire') ?? {}, el)).toMatchObject({
        distinct: 8,
        total: 8,
      });
    }
  });

  it('R-26: las colecciones entran a la partida como reserva; el mazo fijo no da colección', () => {
    expect(presetDecks('fixed', 1, 'fire')).toBeUndefined();
    expect(presetDecks('empty', 1, 'fire')).toEqual({ fire: [], water: [], snow: [] });
    for (const preset of COLLECTION_PRESETS) {
      const decks = presetDecks(preset, 5, 'snow');
      const match = createMatch({ seed: 5, ...(decks ? { decks } : {}) }).state;
      for (const n of match.ninjas) expect(n.deck.length).toBe(decks ? decks[n.id].length : 6);
    }
  });
});
