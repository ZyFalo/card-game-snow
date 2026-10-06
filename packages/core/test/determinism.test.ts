import { describe, expect, it } from 'vitest';
import {
  createMatch,
  earnedAchievements,
  type Plan,
  planTeam,
  REPLAY_VERSION,
  resolveTurn,
  runReplay,
  sanitizePlans,
} from '../src';
import { blank, place } from './helpers';

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
      version: REPLAY_VERSION,
      seed: 2026,
      mapId: a.state.mapId,
      difficulty: a.state.difficulty,
      bonusCondition: a.state.bonusCondition,
      turns: a.turns,
    });
    expect(replay.hashes.slice(1)).toEqual(a.hashes);
    expect(replay.state).toEqual(a.state);
  });

  it('R-23: una repetición grabada con otra versión de las reglas se rechaza con un mensaje claro', () => {
    const a = playWithBot(2026, 5);
    const replay = {
      version: REPLAY_VERSION,
      seed: 2026,
      mapId: a.state.mapId,
      difficulty: a.state.difficulty,
      bonusCondition: a.state.bonusCondition,
      turns: a.turns,
    };
    // Las de la versión 1 son de antes de D-33: en Tormenta ya no se reproducirían igual.
    expect(() => runReplay({ ...replay, version: 1 })).toThrow(/versión 1 de las reglas.*la actual es la 3/);
    expect(() => runReplay(replay)).not.toThrow();
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

  it('R-09 no manda a dos ninjas a revivir al mismo caído', () => {
    const s = blank();
    place(s, 'fire', 1, 2, { hp: 0, everKo: true });
    place(s, 'water', 0, 1);
    place(s, 'snow', 0, 3);
    const revivers = planTeam(s).filter((p) => p.action?.type === 'revive');
    expect(revivers.map((p) => p.ninjaId)).toEqual(['water']);
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
