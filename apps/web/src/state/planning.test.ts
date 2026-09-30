import { createMatch, type Difficulty, difficultyConfig } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { bonusProgress } from './planning';

/* R-21: la ficha del bonus contra el reloj cuenta el turno que se planifica y los que quedan. */
describe('Bonus contra el reloj en la planificación (R-21)', () => {
  /** Estado en la planificación del turno `t` (ya se resolvieron t − 1 turnos). */
  const planningTurn = (t: number, difficulty: Difficulty) => {
    const s = createMatch({ seed: 1, difficulty, bonusCondition: 'turnLimit' }).state;
    s.turn = t - 1;
    return s;
  };

  for (const difficulty of ['classic', 'storm'] as const) {
    const n = difficultyConfig(difficulty).bonusTurnLimit;
    it(`R-21 (${difficulty}): en el primer turno dice "Turno 1 de ${n} · quedan ${n}"`, () => {
      expect(bonusProgress(planningTurn(1, difficulty)).text).toBe(`Turno 1 de ${n} · quedan ${n}`);
    });
    it(`R-21 (${difficulty}): en el último turno dice "Turno ${n} de ${n} · quedan 1"`, () => {
      expect(bonusProgress(planningTurn(n, difficulty)).text).toBe(`Turno ${n} de ${n} · quedan 1`);
    });
  }

  it('R-21: pasado el límite ya no quedan turnos para el bonus', () => {
    const n = difficultyConfig('classic').bonusTurnLimit;
    expect(bonusProgress(planningTurn(n + 1, 'classic'))).toEqual({
      text: `Turno ${n + 1} de ${n} · límite superado`,
      cls: 'bad',
    });
  });
});
