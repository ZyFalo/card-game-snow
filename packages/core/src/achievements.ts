import type { ElementKind, GameEvent, MatchState } from './types';

/*
 * Logros (§9.6 del PRD). Son 9, y con todos se duplican las monedas (R-29).
 *
 * En línea se ganan por persona, en el turno en que ocurren (R-55 del PRD de v2): los personales miran lo
 * que hizo su ninja, y los de equipo son para quien esté jugando cuando pasan.
 */
export const ACHIEVEMENT_IDS = [
  'combo2',
  'combo3',
  'reviver',
  'upAgain',
  'noOneLeft',
  'healer15',
  // "Barrido perfecto" (D-98): una carta alcanza a 3 gólems. Se llamaba "Tormenta perfecta".
  'perfectSweep',
  'bonusWon',
  'untouched',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/**
 * Los tres pliegues del amuleto de papel (R-55, D-100): cada uno agrupa tres logros y se colorea al
 * completarlos. No dicen con qué ninja se gana cada logro: cualquiera puede ganar los de cualquier pliegue.
 */
export const ACHIEVEMENT_FOLDS: Record<ElementKind, readonly [AchievementId, AchievementId, AchievementId]> = {
  fire: ['combo2', 'combo3', 'perfectSweep'],
  water: ['upAgain', 'bonusWon', 'untouched'],
  snow: ['reviver', 'healer15', 'noOneLeft'],
};

/** "Mano sanadora": curar esta cantidad de veces en una partida. */
export const HEALER_GOAL = 15;

/** A cuántos gólems tiene que alcanzar una carta para "Barrido perfecto". */
export const SWEEP_GOAL = 3;

/** Los logros de una partida ya terminada, mirando a todo el equipo: los de quien controla a los tres ninjas. */
export function earnedAchievements(s: MatchState): AchievementId[] {
  const st = s.stats;
  const won = s.status === 'victory';
  const out: AchievementId[] = [];
  if (st.combos >= 1) out.push('combo2');
  if (st.tripleCombos >= 1) out.push('combo3');
  if (st.revives >= 1) out.push('reviver');
  if (won && s.ninjas.some((n) => n.everKo && n.hp > 0)) out.push('upAgain');
  if (won && st.fallenNinjas.length === s.ninjas.length) out.push('noOneLeft');
  if (st.basicHeals >= HEALER_GOAL) out.push('healer15');
  if (st.maxEnemiesHitByCard >= SWEEP_GOAL) out.push('perfectSweep');
  if (s.bonusOutcome === 'won') out.push('bonusWon');
  if (s.bonusCondition === 'fullHealth' && st.bonusEntered) out.push('untouched');
  return out;
}

/** Un turno resuelto: el estado de antes, el de después y lo que pasó. */
export interface TurnRecord {
  before: MatchState;
  after: MatchState;
  events: readonly GameEvent[];
}

/**
 * Las veces que ese ninja curó con su acción básica en un turno (R-08). Las acciones básicas se resuelven
 * antes que las cartas (R-11): desde la primera carta, las curas que siguen son de cartas de Nieve, y no
 * cuentan.
 */
export function basicHealsBy(events: readonly GameEvent[], ninjaId: ElementKind): number {
  let heals = 0;
  for (const e of events) {
    if (e.t === 'card') break;
    if (e.t === 'heal' && e.sourceId === ninjaId) heals += 1;
  }
  return heals;
}

/**
 * R-55: los logros que gana en ese turno quien lleva a ese ninja. `healsBefore` son las curaciones básicas
 * que ya llevaba en la partida, para "Mano sanadora". Los logros que piden ganar se dan en el turno que
 * termina la partida.
 */
export function personalAchievements(turn: TurnRecord, ninjaId: ElementKind, healsBefore = 0): AchievementId[] {
  const { before, after, events } = turn;
  const out: AchievementId[] = [];

  // Lo que hizo su ninja.
  const combo = events.find((e) => e.t === 'combo');
  if (combo?.t === 'combo' && combo.elements.includes(ninjaId)) {
    out.push('combo2');
    if (combo.elements.length >= 3) out.push('combo3');
  }
  if (events.some((e) => e.t === 'revive' && e.sourceId === ninjaId)) out.push('reviver');
  if (healsBefore < HEALER_GOAL && healsBefore + basicHealsBy(events, ninjaId) >= HEALER_GOAL) out.push('healer15');
  const hitByCard = events.filter((e) => e.t === 'damage' && e.cause === 'card' && e.sourceId === ninjaId).length;
  if (hitByCard >= SWEEP_GOAL) out.push('perfectSweep');

  // Lo que logró el equipo.
  if (!before.stats.bonusEntered && after.stats.bonusEntered && after.bonusCondition === 'fullHealth') {
    out.push('untouched');
  }
  const won = before.status === 'playing' && after.status === 'victory';
  const me = after.ninjas.find((n) => n.id === ninjaId);
  if (won && me?.everKo && me.hp > 0) out.push('upAgain');
  if (won && after.stats.fallenNinjas.length === after.ninjas.length) out.push('noOneLeft');
  if (won && after.bonusOutcome === 'won') out.push('bonusWon');
  return out;
}
