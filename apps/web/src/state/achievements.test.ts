import {
  ACHIEVEMENT_FOLD_IDS,
  ACHIEVEMENT_FOLDS,
  ACHIEVEMENT_IDS,
  type AchievementId,
  achievementGoal,
} from '@ventisca/core';
import type { Achievements } from '@ventisca/protocol';
import { describe, expect, it } from 'vitest';
import { completeFolds, foldView } from './achievements';

/** El avance de una cuenta: lo que se diga de cada logro, y lo demás en cero. */
const progress = (over: Partial<Record<AchievementId, number | 'done'>> = {}): Achievements =>
  Object.fromEntries(
    ACHIEVEMENT_IDS.map((id) => {
      const have = over[id] ?? 0;
      return [id, have === 'done' ? { count: achievementGoal(id), done: true } : { count: have, done: false }];
    }),
  ) as Achievements;

describe('El avance de los logros en pantalla (D-104 y D-105)', () => {
  it('D-104: cada pliegue muestra sus tres logros, en su orden, con lo que llevan contado y su meta', () => {
    const view = foldView('fire', progress({ stunner: 7, blaze: 'done' }));
    expect(view.rows.map((r) => r.id)).toEqual([...ACHIEVEMENT_FOLDS.fire]);
    expect(view.rows.map((r) => [r.count, r.goal, r.done])).toEqual([
      [0, achievementGoal('perfectSweep'), false],
      [7, achievementGoal('stunner'), false],
      [achievementGoal('blaze'), achievementGoal('blaze'), true],
    ]);
    expect(view).toMatchObject({ fold: 'fire', done: 1, complete: false });
  });

  it('D-105: la barra se llena en proporción a lo contado, y nunca pasa del 100 %', () => {
    const goal = achievementGoal('healer');
    const fill = (count: number) => foldView('snow', progress({ healer: count })).rows[1]?.fill;
    expect(fill(0)).toBe(0);
    expect(fill(goal / 2)).toBe(50);
    expect(fill(goal)).toBe(100);
    // Si llegara más de la cuenta, se muestra hasta la meta.
    expect(foldView('snow', progress({ healer: goal + 9 })).rows[1]).toMatchObject({ count: goal, fill: 100 });
  });

  it('D-104: un logro completo se ve lleno, diga lo que diga su contador', () => {
    const achievements = progress();
    achievements.reviver = { count: 0, done: true };
    expect(foldView('snow', achievements).rows[0]).toMatchObject({
      count: achievementGoal('reviver'),
      done: true,
      fill: 100,
    });
  });

  it('D-104: un pliegue está completo con sus tres logros, y el amuleto, con los cuatro pliegues', () => {
    expect(completeFolds(progress())).toEqual([]);
    const fire = progress({ perfectSweep: 'done', stunner: 'done', blaze: 'done' });
    expect(foldView('fire', fire)).toMatchObject({ done: 3, complete: true });
    expect(completeFolds(fire)).toEqual(['fire']);
    // Con dos de tres, todavía no.
    expect(completeFolds(progress({ combo3: 'done', untouched: 'done' }))).toEqual([]);
    const all = progress(Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, 'done' as const])));
    expect(completeFolds(all)).toEqual([...ACHIEVEMENT_FOLD_IDS]);
    // Lo que cuenta es que el servidor lo dé por completo, no que el contador haya llegado.
    const almost = progress({ combo3: achievementGoal('combo3'), untouched: 'done', noOneLeft: 'done' });
    expect(completeFolds(almost)).toEqual([]);
  });

  it('D-105: en los resultados, cada logro dice cuánto sumó la partida y desde dónde venía su barra', () => {
    const goal = achievementGoal('stunner');
    // "Barrido perfecto" ya estaba completo desde antes; "Llamarada" se completó en esta partida.
    const view = foldView('fire', progress({ perfectSweep: 'done', stunner: 12, blaze: 'done' }), {
      gained: { stunner: 3, blaze: 2 },
      completed: ['blaze'],
    });
    const [sweep, stunner, blaze] = view.rows;
    expect(stunner).toMatchObject({ count: 12, gained: 3, fresh: false });
    expect(stunner?.fillBefore).toBeCloseTo((9 / goal) * 100);
    expect(stunner?.fill).toBeCloseTo((12 / goal) * 100);
    // El que se completó en esa partida se destaca.
    expect(blaze).toMatchObject({ done: true, gained: 2, fresh: true, fill: 100 });
    expect(blaze?.fillBefore).toBeCloseTo(((achievementGoal('blaze') - 2) / achievementGoal('blaze')) * 100);
    // El que venía completo no sumó nada ni se destaca.
    expect(sweep).toMatchObject({ done: true, gained: 0, fresh: false, fill: 100, fillBefore: 100 });
  });

  it('D-105: fuera de los resultados, ningún logro sale con avance nuevo', () => {
    for (const row of foldView('team', progress({ combo3: 2 })).rows) {
      expect(row).toMatchObject({ gained: 0, fresh: false });
      expect(row.fillBefore).toBe(row.fill);
    }
  });

  it('D-105: lo que sumó la partida nunca es más de lo que el logro lleva contado', () => {
    const [row] = foldView('team', progress({ combo3: 2 }), { gained: { combo3: 5 }, completed: [] }).rows;
    expect(row).toMatchObject({ count: 2, gained: 2, fillBefore: 0 });
  });
});
