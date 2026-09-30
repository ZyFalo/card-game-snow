import raw from './balance.json';
import type { Difficulty, ElementKind, EnemyKind } from './types';

/**
 * Valores de balance (Apéndice A del PRD). Viven en balance.json para poder
 * ajustarlos sin tocar código; este módulo solo les da tipos.
 */
export interface NinjaStats {
  hp: number;
  attack: number;
  range: number;
  move: number;
  heal: number;
}

export interface EnemyStats {
  hp: number;
  attack: number;
  range: number;
  move: number;
  bonusPerTile?: number;
  maxAttack?: number;
  splash?: number;
  sweep?: number;
}

export interface DifficultyConfig {
  enemiesPerRound: { min: number; max: number; bonus: number };
  /** Multiplica la vida de los enemigos al aparecer (se redondea al entero más cercano, D-31). */
  enemyHpMultiplier: number;
  /** Los enemigos priorizan rematar y a los ninjas más débiles. */
  focusWeakest: boolean;
  /** N de la condición "contra el reloj de turnos" (R-21). */
  bonusTurnLimit: number;
}

export interface Balance {
  grid: { width: number; height: number };
  planSecondsPerNinja: number;
  paceMultiplier: { relaxed: number; normal: number; expert: number };
  ninjas: Record<ElementKind, NinjaStats>;
  enemies: Record<EnemyKind, EnemyStats>;
  enemiesPerRound: { maxSameKind: number };
  difficulty: Record<Difficulty, DifficultyConfig>;
  meter: { perEvent: number; max: number };
  handMax: number;
  deckValues: number[];
  waterCardMultiplier: number;
  boostMultiplier: number;
  burn: { damage: number; ticks: number };
  reviveHp: number;
  rocks: [number, number][];
  spawn: { ninjaRows: number[]; enemyColumns: number[] };
  /** Progresión (§18, R-29): monedas por ronda superada y precios de cajas. */
  economy: {
    coinsPerRound: number[];
    bonusCoins: number;
    doubleCoinsWithAllAchievements: boolean;
    boxes: { size: number; price: number }[];
  };
  /** Banco de cartas (R-27): valores de las 20 cartas de cada elemento, de menor a mayor. */
  bank: { valuesPerElement: number[] };
  /** Inventario inicial (R-30) y recomendación para Tormenta (R-31). */
  starter: { value: number; stormRecommendedPerElement: number };
}

export const BALANCE: Balance = raw as Balance;

export const ELEMENTS: readonly ElementKind[] = ['fire', 'water', 'snow'];
export const ENEMY_KINDS: readonly EnemyKind[] = ['sniper', 'artillery', 'colossus'];

export const DIFFICULTIES: readonly Difficulty[] = ['classic', 'storm'];
export const difficultyConfig = (d: Difficulty): DifficultyConfig => BALANCE.difficulty[d];
