import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_IDS,
  addToCollection,
  BANK,
  bankFor,
  CAMINO_CARDS,
  coinsForMatch,
  coinsForRound,
  collectionSummary,
  createMatch,
  ELEMENTS,
  hasDoubleCoins,
  type MatchState,
  openBox,
  type Plan,
  planTeam,
  reservesFor,
  resolveTurn,
  rngFrom,
  runReplay,
  sanitizeCollection,
  starterCollection,
} from '../src';
import { blank } from './helpers';

const ended = (patch: Partial<MatchState>): MatchState => ({ ...blank(), ...patch });

describe('§18 Progresión: monedas, cajas y colección', () => {
  it('R-25 y R-27: el banco tiene 20 cartas por elemento (7 de 9, 6 de 10, 4 de 11 y 3 de 12)', () => {
    expect(BANK).toHaveLength(60);
    for (const el of ELEMENTS) {
      const values = bankFor(el).map((c) => c.value);
      expect(values.filter((v) => v === 9)).toHaveLength(7);
      expect(values.filter((v) => v === 10)).toHaveLength(6);
      expect(values.filter((v) => v === 11)).toHaveLength(4);
      expect(values.filter((v) => v === 12)).toHaveLength(3);
      expect(new Set(bankFor(el).map((c) => c.name)).size).toBe(20);
    }
  });

  it('R-27 y R-28: cada carta de una caja se sortea con probabilidad pareja entre las 20', () => {
    const rng = rngFrom(2026);
    const counts: Record<number, number> = { 9: 0, 10: 0, 11: 0, 12: 0 };
    const draws = 30_000;
    for (let i = 0; i < draws / 3; i++) {
      const box = openBox('water', 3, rng);
      expect(box).toHaveLength(3);
      for (const c of box) {
        expect(c.element).toBe('water');
        counts[c.value] = (counts[c.value] ?? 0) + 1;
      }
    }
    const share = (v: number) => (counts[v] ?? 0) / draws;
    expect(share(9)).toBeCloseTo(0.35, 1);
    expect(share(10)).toBeCloseTo(0.3, 1);
    expect(share(11)).toBeCloseTo(0.2, 1);
    expect(share(12)).toBeCloseTo(0.15, 1);
    expect(() => openBox('fire', 4, rng)).toThrow();
  });

  it('R-29: paga 60 / 120 / 120 por ronda superada y 120 por ganar el bonus', () => {
    expect(coinsForMatch(ended({ status: 'victory', bonusOutcome: 'won' }), false).total).toBe(420);
    expect(coinsForMatch(ended({ status: 'victory', bonusOutcome: 'missed' }), false).total).toBe(300);
    expect(coinsForMatch(ended({ status: 'victory', bonusOutcome: 'lost' }), false).total).toBe(300);
    expect(coinsForMatch(ended({ status: 'defeat', round: 3 }), false).total).toBe(180);
    expect(coinsForMatch(ended({ status: 'defeat', round: 2 }), false).total).toBe(60);
    expect(coinsForMatch(ended({ status: 'defeat', round: 1 }), false).total).toBe(0);
    const doubled = coinsForMatch(ended({ status: 'victory', bonusOutcome: 'won' }), true);
    expect(doubled.base).toBe(420);
    expect(doubled.total).toBe(840);
    expect(doubled.lines.map((l) => l.round)).toEqual([1, 2, 3, 'bonus']);
  });

  it('R-29 (D-31): cada ronda superada paga al instante lo suyo, el doble con los 9 logros', () => {
    expect([1, 2, 3, 'bonus'].map((r) => coinsForRound(r as 1 | 2 | 3 | 'bonus', false))).toEqual([60, 120, 120, 120]);
    expect(coinsForRound(2, true)).toBe(240);
    // La suma de los pagos por ronda es lo que paga la partida entera.
    expect(coinsForMatch(ended({ status: 'victory', bonusOutcome: 'won' }), false).total).toBe(60 + 120 + 120 + 120);
  });

  it('R-29: las monedas dobles exigen los 9 logros', () => {
    expect(hasDoubleCoins([...ACHIEVEMENT_IDS])).toBe(true);
    expect(hasDoubleCoins(ACHIEVEMENT_IDS.slice(1))).toBe(false);
  });

  it('R-30: el inventario inicial es un 9 por elemento más la carta de camino', () => {
    const c = starterCollection('snow');
    expect(collectionSummary(c, 'fire')).toEqual({ distinct: 1, total: 1, average: 9 });
    expect(collectionSummary(c, 'water')).toEqual({ distinct: 1, total: 1, average: 9 });
    expect(collectionSummary(c, 'snow')).toEqual({ distinct: 2, total: 2, average: 10.5 });
    expect(c[CAMINO_CARDS.snow]).toBe(1);
  });

  it('R-26: la reserva es toda la colección con repetidas y entra a la partida', () => {
    const c = addToCollection(starterCollection('fire'), [{ id: 'fire-20' }, { id: 'fire-20' }, { id: 'fire-08' }]);
    const decks = reservesFor(c);
    expect(decks.fire.map((d) => d.value)).toEqual([9, 10, 12, 12, 12]);
    const m = createMatch({ seed: 7, decks }).state;
    const fire = m.ninjas.find((n) => n.id === 'fire');
    expect(fire?.deck.map((d) => d.value)).toEqual([9, 10, 12, 12, 12]);
    expect(new Set(fire?.deck.map((d) => d.id)).size).toBe(5);
    expect(fire?.deck[0]?.bankId).toBe('fire-01');
    // Sin reserva se mantiene el mazo fijo de v1.
    expect(createMatch({ seed: 7 }).state.ninjas[0]?.deck.map((d) => d.value)).toEqual([8, 9, 10, 10, 11, 12]);
  });

  it('R-23: la repetición guarda la reserva y reproduce los mismos hashes', () => {
    const decks = reservesFor(addToCollection(starterCollection('water'), [{ id: 'water-19' }, { id: 'snow-12' }]));
    const first = createMatch({ seed: 99, decks }).state;
    let state = first;
    const turns: Plan[][] = [];
    const hashes: string[] = [];
    for (let t = 0; t < 40 && state.status === 'playing'; t++) {
      const plans = planTeam(state);
      const r = resolveTurn(state, plans);
      turns.push(plans);
      hashes.push(r.hash);
      state = r.state;
    }
    const replay = runReplay({
      version: 1,
      seed: 99,
      mapId: first.mapId,
      difficulty: first.difficulty,
      bonusCondition: first.bonusCondition,
      decks,
      turns,
    });
    expect(replay.hashes.slice(1)).toEqual(hashes);
  });

  it('la colección guardada se limpia: ids desconocidos y cantidades inválidas se descartan', () => {
    expect(sanitizeCollection({ 'fire-01': 2, 'fire-99': 1, 'water-02': -1, 'snow-03': 1.5, x: 'y' })).toEqual({
      'fire-01': 2,
    });
    expect(sanitizeCollection(null)).toEqual({});
  });
});
