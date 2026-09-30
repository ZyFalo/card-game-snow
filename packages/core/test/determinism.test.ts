import { describe, expect, it } from 'vitest';
import { createMatch, earnedAchievements, type Plan, planTeam, resolveTurn, runReplay, sanitizePlans } from '../src';

function playWithBot(seed: number, maxTurns = 80) {
  let { state } = createMatch({ seed });
  const turns: Plan[][] = [];
  const hashes: string[] = [];
  while (state.status === 'playing' && turns.length < maxTurns) {
    const plans = planTeam(state);
    turns.push(plans);
    const r = resolveTurn(state, plans);
    hashes.push(r.hash);
    state = r.state;
  }
  return { state, turns, hashes };
}

describe('Determinismo (R-23)', () => {
  it('misma semilla + mismos planes = mismos hashes', () => {
    const a = playWithBot(2026);
    const replay = runReplay({
      version: 1,
      seed: 2026,
      mapId: a.state.mapId,
      difficulty: a.state.difficulty,
      bonusCondition: a.state.bonusCondition,
      turns: a.turns,
    });
    expect(replay.hashes.slice(1)).toEqual(a.hashes);
    expect(replay.state).toEqual(a.state);
  });

  it('semillas distintas producen partidas distintas', () => {
    expect(playWithBot(1).hashes[0]).not.toBe(playWithBot(2).hashes[0]);
  });
});

describe('Bot de ninjas (§8)', () => {
  it('sus planes siempre son válidos (el saneamiento no descarta nada)', () => {
    for (let seed = 1; seed <= 15; seed++) {
      let { state } = createMatch({ seed });
      for (let turn = 0; turn < 40 && state.status === 'playing'; turn++) {
        const plans = planTeam(state);
        expect(sanitizePlans(state, plans)).toEqual(plans);
        state = resolveTurn(state, plans).state;
      }
    }
  });

  it('termina partidas y logra victorias', () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = playWithBot(seed * 7919);
      expect(state.status).not.toBe('playing');
      if (state.status === 'victory') wins++;
      expect(Array.isArray(earnedAchievements(state))).toBe(true);
    }
    expect(wins).toBeGreaterThan(15);
  });
});
