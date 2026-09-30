import { BALANCE, difficultyConfig, ELEMENTS, ENEMY_KINDS } from './balance';
import { allTiles } from './grid';
import { isFree } from './queries';
import { type Rng, rngFrom } from './rng';
import type {
  BonusCondition,
  DeckCard,
  Difficulty,
  ElementKind,
  Enemy,
  GameEvent,
  MapId,
  MatchState,
  Ninja,
  Round,
  Vec,
} from './types';

export const MAPS: readonly MapId[] = ['cumbre', 'desfiladero', 'bosque'];
export const BONUS_CONDITIONS: readonly BonusCondition[] = ['noKo', 'fullHealth', 'turnLimit'];

export interface MatchOptions {
  seed: number;
  mapId?: MapId;
  difficulty?: Difficulty;
  bonusCondition?: BonusCondition;
  ownerId?: string;
  /** Reserva de cada ninja (R-26). Si falta un elemento, se usa el mazo fijo de v1. */
  decks?: Partial<Record<ElementKind, readonly DeckCard[]>>;
}

/** Crea una partida nueva (R-02) y devuelve los eventos iniciales (aparición de la ronda 1). */
export function createMatch(opts: MatchOptions): { state: MatchState; events: GameEvent[] } {
  const rng = rngFrom(opts.seed);
  // Se consumen siempre los mismos números aleatorios, aunque las opciones fijen
  // el mapa o la condición del bonus: así la secuencia no depende de las opciones.
  const pickedMap = rng.pick(MAPS);
  const pickedBonus = rng.pick(BONUS_CONDITIONS);
  const mapId = opts.mapId ?? pickedMap;
  const bonusCondition = opts.bonusCondition ?? pickedBonus;
  const rows = rng.shuffle([...BALANCE.spawn.ninjaRows]);
  const ninjas: Ninja[] = ELEMENTS.map((element, i) => {
    const st = BALANCE.ninjas[element];
    return {
      id: element,
      element,
      pos: { x: 0, y: rows[i] ?? i * 2 },
      hp: st.hp,
      maxHp: st.hp,
      meter: 0,
      hand: [],
      deck: (opts.decks?.[element] ?? BALANCE.deckValues.map((value): DeckCard => ({ value }))).map((c, j) => ({
        id: `${element}-${j + 1}`,
        element,
        value: c.value,
        ...(c.bankId ? { bankId: c.bankId } : {}),
      })),
      shield: false,
      boost: false,
      everKo: false,
      ownerId: opts.ownerId ?? 'local',
    };
  });

  const state: MatchState = {
    version: 1,
    seed: opts.seed >>> 0,
    rng: 0,
    mapId,
    difficulty: opts.difficulty ?? 'classic',
    rocks: BALANCE.rocks.map(([x, y]) => ({ x, y })),
    round: 1,
    turn: 0,
    bonusCondition,
    ninjas,
    enemies: [],
    nextEnemySeq: 1,
    status: 'playing',
    bonusOutcome: 'pending',
    stats: {
      turns: 0,
      combos: 0,
      tripleCombos: 0,
      cardsPlayed: 0,
      basicHeals: 0,
      revives: 0,
      ninjaKos: 0,
      fallenNinjas: [],
      enemiesDefeated: 0,
      maxEnemiesHitByCard: 0,
      damageDealt: 0,
      turnsToClearMain: null,
      bonusEntered: false,
    },
  };

  const events: GameEvent[] = [];
  spawnRound(state, rng, 1, events);
  state.rng = rng.state();
  return { state, events };
}

/** R-14. Hace aparecer los enemigos de una ronda. */
export function spawnRound(state: MatchState, rng: Rng, round: Round, events: GameEvent[]): void {
  state.round = round;
  const diff = difficultyConfig(state.difficulty);
  const cfg = diff.enemiesPerRound;
  const count = round === 'bonus' ? cfg.bonus : rng.int(cfg.min, cfg.max);
  const spawned: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    const kinds = ENEMY_KINDS.filter(
      (k) => state.enemies.filter((e) => e.kind === k).length < BALANCE.enemiesPerRound.maxSameKind,
    );
    const pos = pickSpawnTile(state, rng);
    if (!pos || kinds.length === 0) break;
    const kind = rng.pick(kinds);
    // Se redondea al entero más cercano (D-31): truncar convertía 45 × 1,4 = 62,999… en 62.
    const hp = Math.round(BALANCE.enemies[kind].hp * diff.enemyHpMultiplier);
    const enemy: Enemy = {
      id: `e${state.nextEnemySeq++}`,
      kind,
      pos,
      hp,
      maxHp: hp,
      stunned: false,
      burnTicks: 0,
    };
    state.enemies.push(enemy);
    spawned.push(structuredClone(enemy));
  }
  events.push({ t: 'roundStart', round, enemies: spawned });
}

function pickSpawnTile(state: MatchState, rng: Rng): Vec | null {
  const cols = BALANCE.spawn.enemyColumns;
  const preferred = allTiles().filter((v) => cols.includes(v.x) && isFree(state, v));
  if (preferred.length > 0) return rng.pick(preferred);
  // Si la zona de aparición está ocupada, se usa la casilla libre más a la derecha.
  const fallback = allTiles()
    .filter((v) => isFree(state, v))
    .sort((a, b) => b.x - a.x || a.y - b.y);
  return fallback[0] ?? null;
}
