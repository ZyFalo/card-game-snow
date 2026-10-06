/**
 * Tipos del motor de reglas. Todo es serializable (JSON) para poder
 * guardar repeticiones y, en v2, viajar por la red sin transformaciones.
 */

export type ElementKind = 'fire' | 'water' | 'snow';
export type EnemyKind = 'sniper' | 'artillery' | 'colossus';
export type Round = 1 | 2 | 3 | 'bonus';
export type BonusCondition = 'noKo' | 'fullHealth' | 'turnLimit';
export type MapId = 'cumbre' | 'desfiladero' | 'bosque';
export type MatchStatus = 'playing' | 'victory' | 'defeat';
/** classic: valores del original. storm: más enemigos y más agresivos (D-13). */
export type Difficulty = 'classic' | 'storm';
/** pending: aún no se decide; missed: no se cumplió la condición; won/lost: se jugó la ronda bonus. */
export type BonusOutcome = 'pending' | 'missed' | 'won' | 'lost';
export type StatusKind = 'stun' | 'burn' | 'boost' | 'shield';

export interface Vec {
  x: number;
  y: number;
}

export interface Card {
  id: string;
  element: ElementKind;
  value: number;
  /** Carta del banco de la que proviene (§18); ausente en el mazo fijo de v1. */
  bankId?: string;
}

/** Carta de la reserva que se lleva a una partida (R-26). */
export interface DeckCard {
  value: number;
  bankId?: string;
}

export interface Ninja {
  /** Igual al elemento: 'fire' | 'water' | 'snow'. */
  id: ElementKind;
  element: ElementKind;
  pos: Vec;
  hp: number;
  maxHp: number;
  meter: number;
  hand: Card[];
  deck: Card[];
  shield: boolean;
  boost: boolean;
  everKo: boolean;
  /** En v1 siempre 'local'; en v2, el jugador que lo controla. */
  ownerId: string;
}

export interface Enemy {
  id: string;
  kind: EnemyKind;
  pos: Vec;
  hp: number;
  maxHp: number;
  stunned: boolean;
  burnTicks: number;
}

export type Action =
  | { type: 'attack'; targetId: string }
  | { type: 'heal'; targetId: string }
  | { type: 'revive'; targetId: string }
  | { type: 'card'; cardId: string; at: Vec };

export interface Plan {
  ninjaId: ElementKind;
  moveTo?: Vec;
  action?: Action;
}

export interface MatchStats {
  turns: number;
  combos: number;
  tripleCombos: number;
  cardsPlayed: number;
  basicHeals: number;
  revives: number;
  ninjaKos: number;
  fallenNinjas: ElementKind[];
  enemiesDefeated: number;
  maxEnemiesHitByCard: number;
  damageDealt: number;
  /** Turnos usados para superar las rondas 1 a 3 (null mientras no ocurre). */
  turnsToClearMain: number | null;
  bonusEntered: boolean;
}

export interface MatchState {
  version: 1;
  seed: number;
  /** Estado interno del generador pseudoaleatorio (R-23). */
  rng: number;
  mapId: MapId;
  difficulty: Difficulty;
  rocks: Vec[];
  round: Round;
  /** Turnos ya resueltos. */
  turn: number;
  bonusCondition: BonusCondition;
  ninjas: Ninja[];
  enemies: Enemy[];
  nextEnemySeq: number;
  status: MatchStatus;
  bonusOutcome: BonusOutcome;
  stats: MatchStats;
}

export type DamageCause = 'attack' | 'card' | 'splash' | 'sweep' | 'burn' | 'enemy';
/** basic: la acción de revivir, que se completa al final del turno (R-09). card: una carta de Nieve, en el acto. */
export type ReviveCause = 'basic' | 'card';

export type GameEvent =
  | { t: 'turnStart'; turn: number }
  | { t: 'move'; unitId: string; path: Vec[] }
  | { t: 'attack'; sourceId: ElementKind; targetId: string; boosted: boolean }
  | { t: 'heal'; sourceId: ElementKind | null; targetId: ElementKind; amount: number; hp: number }
  /** Empieza una reanimación (R-09): queda pendiente hasta `revive` o `reviveInterrupted`. */
  | { t: 'reviveStart'; sourceId: ElementKind; targetId: ElementKind }
  | { t: 'revive'; sourceId: ElementKind | null; targetId: ElementKind; hp: number; cause: ReviveCause }
  /** Quien revivía cayó antes de terminar: el aliado no se levanta. */
  | { t: 'reviveInterrupted'; sourceId: ElementKind; targetId: ElementKind }
  | {
      t: 'damage';
      targetId: string;
      amount: number;
      hp: number;
      cause: DamageCause;
      sourceId: string | null;
      blocked: boolean;
    }
  | { t: 'ko'; unitId: string }
  | { t: 'meter'; ninjaId: ElementKind; value: number }
  | { t: 'draw'; ninjaId: ElementKind; card: Card }
  | { t: 'combo'; elements: ElementKind[] }
  | { t: 'card'; ninjaId: ElementKind; card: Card; at: Vec; area: Vec[]; combo: boolean }
  | { t: 'status'; unitId: string; status: StatusKind; on: boolean }
  | { t: 'enemyAttack'; sourceId: string; kind: EnemyKind; targetId: string; area: Vec[] }
  | { t: 'enemySkip'; unitId: string }
  | { t: 'roundEnd'; round: Round }
  | { t: 'roundStart'; round: Round; enemies: Enemy[] }
  | { t: 'bonusCheck'; condition: BonusCondition; met: boolean }
  | { t: 'matchEnd'; status: Exclude<MatchStatus, 'playing'>; bonusOutcome: BonusOutcome };

export interface TurnResult {
  state: MatchState;
  events: GameEvent[];
  hash: string;
}

export interface ReplayData {
  /** Versión de las reglas con que se grabó (REPLAY_VERSION); runReplay rechaza las demás. */
  version: number;
  seed: number;
  mapId: MapId;
  difficulty: Difficulty;
  bonusCondition: BonusCondition;
  /** Reserva de cada ninja (§18). Sin ella se usa el mazo fijo de v1. */
  decks?: Partial<Record<ElementKind, DeckCard[]>>;
  turns: Plan[][];
}
