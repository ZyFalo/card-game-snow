import { createMatch, type Difficulty, planTeam, resolveTurn, rngFrom } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { estimateEventsMs, FAST_FACTOR, isCombatTurn, TIMING } from './timing';

/* Metas de ritmo (fase 3): el bot juega partidas completas y se estima la animación de cada turno. */
function medians(difficulty: Difficulty, matches = 80) {
  const plain: number[] = [];
  const combo: number[] = [];
  for (let m = 0; m < matches; m++) {
    const seed = (777 + m * 2654435761) >>> 0;
    let state = createMatch({ seed, difficulty }).state;
    const rng = rngFrom(seed ^ 0x51ed);
    while (state.status === 'playing' && state.turn < 200) {
      const r = resolveTurn(state, planTeam(state, { skill: 0.8, rng }));
      if (isCombatTurn(r.events))
        (r.events.some((e) => e.t === 'combo') ? combo : plain).push(estimateEventsMs(r.events, TIMING, true));
      state = r.state;
    }
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  return { plain: med(plain), combo: med(combo) };
}

describe('Coreografía del turno (fase 3)', () => {
  it('Clásica: turno sin combo ≤ 3,2 s y con combo ≤ 7 s (mediana, velocidad normal)', () => {
    const m = medians('classic');
    expect(m.plain).toBeLessThanOrEqual(3200);
    expect(m.combo).toBeLessThanOrEqual(7000);
  });

  it('Tormenta: turno sin combo ≤ 3,8 s y con combo ≤ 7 s', () => {
    const m = medians('storm');
    expect(m.plain).toBeLessThanOrEqual(3800);
    expect(m.combo).toBeLessThanOrEqual(7000);
  });

  it('las animaciones rápidas recortan el turno a 0,6 del tiempo', () => {
    expect(FAST_FACTOR).toBeCloseTo(0.6);
  });

  it('R-09: una reanimación cuenta al empezar y al terminar, se complete o se interrumpa', () => {
    const start = { t: 'reviveStart', sourceId: 'water', targetId: 'fire' } as const;
    const begun = estimateEventsMs([start]);
    expect(begun).toBe(TIMING.reviveStart);
    const done = estimateEventsMs([start, { t: 'revive', sourceId: 'water', targetId: 'fire', hp: 1, cause: 'basic' }]);
    expect(done).toBeGreaterThan(begun);
    const cut = estimateEventsMs([start, { t: 'reviveInterrupted', sourceId: 'water', targetId: 'fire' }]);
    expect(cut).toBe(begun + TIMING.reviveInterrupted);
  });
});
