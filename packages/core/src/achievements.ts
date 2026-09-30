import type { MatchState } from './types';

/** Logros locales (§9.6 del PRD). Solo se otorgan al terminar la partida. */
export const ACHIEVEMENT_IDS = [
  'combo2',
  'combo3',
  'reviver',
  'upAgain',
  'noOneLeft',
  'healer15',
  'perfectStorm',
  'bonusWon',
  'untouched',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export function earnedAchievements(s: MatchState): AchievementId[] {
  const st = s.stats;
  const won = s.status === 'victory';
  const out: AchievementId[] = [];
  if (st.combos >= 1) out.push('combo2');
  if (st.tripleCombos >= 1) out.push('combo3');
  if (st.revives >= 1) out.push('reviver');
  if (won && s.ninjas.some((n) => n.everKo && n.hp > 0)) out.push('upAgain');
  if (won && st.fallenNinjas.length === s.ninjas.length) out.push('noOneLeft');
  if (st.basicHeals >= 15) out.push('healer15');
  if (st.maxEnemiesHitByCard >= 3) out.push('perfectStorm');
  if (s.bonusOutcome === 'won') out.push('bonusWon');
  if (s.bonusCondition === 'fullHealth' && st.bonusEntered) out.push('untouched');
  return out;
}
