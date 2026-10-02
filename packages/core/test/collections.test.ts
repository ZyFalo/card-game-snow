import { describe, expect, it } from 'vitest';
import {
  arrangements,
  COLLECTION_PRESETS,
  parseTeam,
  presetCollection,
  presetDecks,
  SEAT_PRESETS,
  seatDeck,
  teamDecks,
} from '../scripts/collections';
import { BALANCE, bankFor, CAMINO_CARDS, collectionSummary, createMatch, ELEMENTS, STARTER_CARDS } from '../src';

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

/* Asientos del modo en línea: cada ninja lo lleva una persona con su colección, o el bot (P-20). */
describe('Asientos para simular equipos de colecciones mezcladas (P-20 del PRD de v2)', () => {
  const values = (deck: readonly { value: number }[] | undefined) => (deck ?? []).map((c) => c.value).sort();

  it('R-34: una persona nueva lleva su 9 y su carta de camino con el ninja de su camino, y solo su 9 con otro', () => {
    for (const el of ELEMENTS) {
      const own = seatDeck('new', el, 1) ?? [];
      expect(own.map((c) => c.bankId).sort()).toEqual([STARTER_CARDS[el], CAMINO_CARDS[el]].sort());
      expect(values(own)).toEqual([12, 9]);
      expect(seatDeck('new-off', el, 1)?.map((c) => c.bankId)).toEqual([STARTER_CARDS[el]]);
    }
  });

  it('R-28: las cajas de un asiento son de su elemento: una caja suma 3 cartas, y tres cajas, 9', () => {
    for (const el of ELEMENTS) {
      const bank = new Set(bankFor(el).map((c) => c.id));
      const one = seatDeck('box', el, 7) ?? [];
      const three = seatDeck('box3', el, 7) ?? [];
      expect(one).toHaveLength(5);
      expect(three).toHaveLength(11);
      for (const deck of [one, three]) {
        expect(deck.every((c) => c.bankId !== undefined && bank.has(c.bankId))).toBe(true);
        // Las cajas se suman a lo que ya tenía: su 9 y su carta de camino.
        expect(deck.some((c) => c.bankId === STARTER_CARDS[el])).toBe(true);
        expect(deck.some((c) => c.bankId === CAMINO_CARDS[el])).toBe(true);
      }
    }
  });

  it('el sorteo de las cajas de un asiento depende de la semilla y del asiento, y se puede reproducir', () => {
    const draw = (el: (typeof ELEMENTS)[number], seed: number) =>
      (seatDeck('box3', el, seed) ?? []).map((c) => c.bankId?.split('-')[1]).join(',');
    expect(draw('fire', 7)).toBe(draw('fire', 7));
    expect([8, 9, 10, 11].some((seed) => draw('fire', seed) !== draw('fire', 7))).toBe(true);
    // Dos personas en la misma etapa no abren las mismas cajas.
    expect([7, 8, 9, 10].some((seed) => draw('fire', seed) !== draw('water', seed))).toBe(true);
  });

  it('R-25: la colección completa de un asiento son las 20 cartas de su elemento', () => {
    for (const el of ELEMENTS) {
      expect(seatDeck('full', el, 1)?.map((c) => c.bankId)).toEqual(bankFor(el).map((c) => c.id));
    }
  });

  it('D-47: el asiento del bot no lleva reserva propia, y la partida le da el mazo de referencia', () => {
    for (const el of ELEMENTS) expect(seatDeck('bot', el, 1)).toBeUndefined();
    const decks = teamDecks({ fire: 'bot', water: 'full', snow: 'new' }, 5);
    expect(Object.keys(decks).sort()).toEqual(['snow', 'water']);
    const { ninjas } = createMatch({ seed: 5, decks }).state;
    expect(values(ninjas.find((n) => n.id === 'fire')?.deck)).toEqual([...BALANCE.deckValues].sort());
    expect(ninjas.find((n) => n.id === 'water')?.deck).toHaveLength(20);
    expect(values(ninjas.find((n) => n.id === 'snow')?.deck)).toEqual([12, 9]);
  });

  it('R-26: cada etapa entra a la partida como la reserva de su ninja', () => {
    for (const seat of SEAT_PRESETS) {
      const decks = teamDecks({ fire: seat, water: seat, snow: seat }, 3);
      const { ninjas } = createMatch({ seed: 3, decks }).state;
      for (const n of ninjas) expect(n.deck.length).toBe(decks[n.element]?.length ?? BALANCE.deckValues.length);
    }
  });

  it('un equipo se escribe ninja por ninja, y lo que no se entiende se rechaza con su motivo', () => {
    expect(parseTeam('fire=new,water=full,snow=bot')).toEqual({ fire: 'new', water: 'full', snow: 'bot' });
    expect(parseTeam(' snow=box , fire=box3,water=new-off ')).toEqual({ fire: 'box3', water: 'new-off', snow: 'box' });
    expect(() => parseTeam('fire=new,water=full')).toThrow(/Falta el asiento de snow/);
    expect(() => parseTeam('fire=new,water=full,snow=experta')).toThrow(/Asiento desconocido: experta/);
    expect(() => parseTeam('fire=new,water=full,hielo=bot')).toThrow(/Ninja desconocido: hielo/);
    expect(() => parseTeam('fire=new,fire=box,water=full,snow=bot')).toThrow(/fire aparece dos veces/);
  });

  it('las formas de repartir tres etapas entre los tres ninjas no se repiten', () => {
    expect(arrangements(['full', 'full', 'full'])).toEqual([{ fire: 'full', water: 'full', snow: 'full' }]);
    expect(arrangements(['new', 'new', 'full'])).toEqual([
      { fire: 'new', water: 'new', snow: 'full' },
      { fire: 'new', water: 'full', snow: 'new' },
      { fire: 'full', water: 'new', snow: 'new' },
    ]);
    const six = arrangements(['new', 'box', 'full']);
    expect(six).toHaveLength(6);
    expect(new Set(six.map((t) => JSON.stringify(t))).size).toBe(6);
  });
});
