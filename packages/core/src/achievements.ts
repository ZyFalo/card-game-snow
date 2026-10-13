import { BALANCE, ELEMENTS } from './balance';
import type { ElementKind, GameEvent, MatchState } from './types';

/*
 * Logros (R-55 del PRD de v2). Son 12, en los cuatro pliegues del amuleto de papel (D-104): tres por
 * ninja, que solo gana quien juega con él, y tres de equipo, que se ganan con cualquiera. Cada logro pide
 * repetir su hazaña varias veces: su meta está en `balance.json`. Con los cuatro pliegues completos, las
 * monedas valen el doble (R-29).
 *
 * Aquí solo se cuenta qué hazañas deja un turno para quien lleva a cada ninja. El avance lo acumula el
 * servidor, entre partidas, y solo en línea.
 */
export const ACHIEVEMENT_IDS = [
  // "Barrido perfecto" (D-98): se llamaba "Tormenta perfecta".
  'perfectSweep',
  'stunner',
  'blaze',
  'breakwater',
  'highTide',
  'upAgain',
  'reviver',
  'healer',
  'snowShield',
  'combo3',
  'untouched',
  'noOneLeft',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Los pliegues del amuleto: uno por ninja y, en el centro, el de equipo. */
export const ACHIEVEMENT_FOLD_IDS = ['fire', 'water', 'snow', 'team'] as const;

export type AchievementFold = (typeof ACHIEVEMENT_FOLD_IDS)[number];

/**
 * Los cuatro pliegues del amuleto de papel (R-55, D-104), cada uno con sus tres logros. Los de un ninja
 * solo los gana quien juega con él; los de `team`, todas las personas conectadas cuando ocurren.
 */
export const ACHIEVEMENT_FOLDS: Record<AchievementFold, readonly [AchievementId, AchievementId, AchievementId]> = {
  fire: ['perfectSweep', 'stunner', 'blaze'],
  water: ['breakwater', 'highTide', 'upAgain'],
  snow: ['reviver', 'healer', 'snowShield'],
  team: ['combo3', 'untouched', 'noOneLeft'],
};

/** El pliegue de cada logro. */
export const foldOf = (id: AchievementId): AchievementFold =>
  ACHIEVEMENT_FOLD_IDS.find((fold) => ACHIEVEMENT_FOLDS[fold].includes(id)) as AchievementFold;

/** Las veces que hay que repetir la hazaña de ese logro para completarlo. Se calibran con el simulador. */
export const achievementGoal = (id: AchievementId): number => BALANCE.achievements.goals[id];

/** A cuántos gólems tiene que alcanzar una carta para contar en "Barrido perfecto". */
export const SWEEP_GOAL = 3;

/** Cuánto suma un turno al avance de cada logro. Los que no suman no aparecen. */
export type AchievementCounts = Partial<Record<AchievementId, number>>;

/** El avance de una persona en un logro: las veces que lleva contadas y si ya lo completó. */
export interface AchievementState {
  count: number;
  done: boolean;
}

/**
 * R-55: suma `n` hazañas al avance de un logro. El avance no pasa de la meta; al llegar, el logro queda
 * completo y ya no cambia. Devuelve cómo queda y cuánto sumó de verdad.
 */
export function advance(id: AchievementId, from: AchievementState, n: number): AchievementState & { gained: number } {
  if (from.done) return { count: from.count, done: true, gained: 0 };
  const goal = achievementGoal(id);
  const start = Math.min(from.count, goal);
  const count = Math.min(goal, start + Math.max(0, Math.trunc(n)));
  return { count, done: count >= goal, gained: count - start };
}

/** Un turno resuelto: lo que pasó y el estado que dejó. */
export interface TurnRecord {
  after: MatchState;
  events: readonly GameEvent[];
}

/**
 * Lo que dejó la carta de ese ninja: desde que la juega hasta la carta siguiente. Las cartas son lo último
 * que hacen los ninjas en un turno (R-11), y cada uno juega una sola.
 */
function cardEffects(events: readonly GameEvent[], ninjaId: ElementKind): readonly GameEvent[] {
  const from = events.findIndex((e) => e.t === 'card' && e.ninjaId === ninjaId);
  if (from < 0) return [];
  const next = events.findIndex((e, i) => i > from && e.t === 'card');
  return events.slice(from + 1, next < 0 ? events.length : next);
}

/** Los gólems que cayeron en ese turno por un golpe de ese ninja: el último daño que recibieron fue suyo. */
function golemsDownedBy(events: readonly GameEvent[], ninjaId: ElementKind): number {
  let downed = 0;
  const lastHit = new Map<string, string | null>();
  for (const e of events) {
    if (e.t === 'damage') lastHit.set(e.targetId, e.sourceId);
    else if (e.t === 'ko' && lastHit.get(e.unitId) === ninjaId) downed += 1;
  }
  return downed;
}

/**
 * R-55: lo que ese turno suma al avance de quien lleva a ese ninja. Los logros de su pliegue miran lo que
 * hizo su ninja; los de equipo, lo que logró el equipo, y valen igual para los tres. Los que piden ganar se
 * cuentan en el turno que termina la partida.
 */
export function countFeats(turn: TurnRecord, ninjaId: ElementKind): AchievementCounts {
  const { after, events } = turn;
  const out: AchievementCounts = {};
  const add = (id: AchievementId, n: number) => {
    if (n > 0) out[id] = n;
  };
  // Un turno solo se resuelve con la partida en curso: si queda ganada, se ganó en este turno.
  const won = after.status === 'victory';
  /** Cayó en la partida y está de pie: alguien lo levantó. */
  const backUp = (id: ElementKind) => after.ninjas.some((n) => n.id === id && n.everKo && n.hp > 0);
  /** Alguien cayó en la partida, y los tres están de pie: nadie se quedó en el suelo. */
  const noOneLeft = after.ninjas.some((n) => n.everKo) && after.ninjas.every((n) => n.hp > 0);
  const card = cardEffects(events, ninjaId);
  /** Las unidades a las que su carta les puso ese estado, sin contarse a sí mismo. */
  const statusOn = (kind: 'stun' | 'burn' | 'boost') =>
    card.filter((e) => e.t === 'status' && e.status === kind && e.on && e.unitId !== ninjaId).length;

  switch (ninjaId) {
    case 'fire': {
      // Su carta alcanza a 3 gólems o más, aturde a los que siguen en pie (R-17) y, en combo, los quema (R-18).
      const reached = card.filter((e) => e.t === 'damage' && e.cause === 'card').length;
      add('perfectSweep', reached >= SWEEP_GOAL ? 1 : 0);
      add('stunner', statusOn('stun'));
      add('blaze', statusOn('burn'));
      break;
    }
    case 'water':
      add('breakwater', golemsDownedBy(events, ninjaId));
      // En combo, su carta da Potencia al equipo (R-18): cuentan sus compañeros, no ella.
      add('highTide', statusOn('boost'));
      add('upAgain', won && backUp(ninjaId) ? 1 : 0);
      break;
    case 'snow':
      // Con su acción o con su carta (R-09 y R-17). Una reanimación interrumpida no levanta a nadie.
      add('reviver', events.filter((e) => e.t === 'revive' && e.sourceId === ninjaId).length);
      add('healer', events.filter((e) => e.t === 'heal' && e.sourceId === ninjaId && e.targetId !== ninjaId).length);
      // El Escudo solo lo da su carta en combo (R-18), y anula un golpe en ese turno o en uno posterior.
      add('snowShield', events.filter((e) => e.t === 'damage' && e.blocked).length);
      break;
  }

  // Lo que logró el equipo.
  add('combo3', events.some((e) => e.t === 'combo' && e.elements.length >= ELEMENTS.length) ? 1 : 0);
  // Se llega al bonus por cualquiera de sus condiciones (R-21), con los tres a vida completa.
  const reachedBonus = events.some((e) => e.t === 'bonusCheck' && e.met);
  add('untouched', reachedBonus && after.ninjas.every((n) => n.hp === n.maxHp) ? 1 : 0);
  add('noOneLeft', won && noOneLeft ? 1 : 0);
  return out;
}
