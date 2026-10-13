import {
  ACHIEVEMENT_FOLD_IDS,
  ACHIEVEMENT_FOLDS,
  ACHIEVEMENT_IDS,
  type AchievementCounts,
  type AchievementFold,
  type AchievementId,
  achievementGoal,
} from '@ventisca/core';
import type { Achievements } from '@ventisca/protocol';

/*
 * El avance de los logros tal como se muestra (R-55, D-104 y D-105): en la Libreta, en la ficha de "Jugar en
 * línea" y en los resultados. Aquí solo se ordena lo que dijo el servidor: lo que lleva contado cada logro
 * y si ya está completo. La meta de cada uno es pública y viene del motor.
 */

/** Un logro en pantalla: lo que lleva contado, su meta y cuánto llena su barra. */
export interface AchievementRow {
  id: AchievementId;
  count: number;
  goal: number;
  done: boolean;
  /** Cuánto de la barra está lleno, de 0 a 100. */
  fill: number;
  /** Lo que sumó en la partida que acaba de terminar. Fuera de los resultados, 0. */
  gained: number;
  /** De la barra, lo que ya estaba lleno antes de esa partida. */
  fillBefore: number;
  /** Lo completó en esa partida. */
  fresh: boolean;
}

/** Un pliegue del amuleto en pantalla: sus tres logros y cuántos están completos. */
export interface FoldView {
  fold: AchievementFold;
  rows: AchievementRow[];
  done: number;
  complete: boolean;
}

/** Lo que una partida le sumó a una persona: llega con el final de la partida. */
export interface MatchGains {
  gained: AchievementCounts;
  completed: readonly AchievementId[];
}

const NO_GAINS: MatchGains = { gained: {}, completed: [] };
/** Lo que llena de su barra un contador, que nunca pasa de su meta. */
const percent = (n: number, goal: number): number => (n / goal) * 100;

/** Ese pliegue, con lo que el servidor dice de cada uno de sus logros. `gains`: lo que sumó la última partida. */
export function foldView(fold: AchievementFold, achievements: Achievements, gains: MatchGains = NO_GAINS): FoldView {
  const rows = ACHIEVEMENT_FOLDS[fold].map((id): AchievementRow => {
    const goal = achievementGoal(id);
    const { done } = achievements[id];
    // Un logro completo se muestra lleno, aunque su meta haya cambiado después.
    const count = done ? goal : Math.min(achievements[id].count, goal);
    const gained = Math.min(gains.gained[id] ?? 0, count);
    return {
      id,
      count,
      goal,
      done,
      fill: percent(count, goal),
      gained,
      fillBefore: percent(count - gained, goal),
      fresh: gains.completed.includes(id),
    };
  });
  const done = rows.filter((row) => row.done).length;
  return { fold, rows, done, complete: done === rows.length };
}

/** Sin avance en ningún logro: así empieza una cuenta. */
export const noAchievements = (): Achievements =>
  Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, { count: 0, done: false }])) as Achievements;

/** Los pliegues del amuleto que ya están completos, en su orden. Con los cuatro, las monedas valen el doble. */
export function completeFolds(achievements: Achievements): AchievementFold[] {
  return ACHIEVEMENT_FOLD_IDS.filter((fold) => foldView(fold, achievements).complete);
}
