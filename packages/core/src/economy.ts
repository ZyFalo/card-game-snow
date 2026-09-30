import { ACHIEVEMENT_IDS, type AchievementId } from './achievements';
import { BALANCE, ELEMENTS } from './balance';
import { BANK, type BankCard, bankFor, CAMINO_CARDS, STARTER_CARDS } from './cards';
import type { Rng } from './rng';
import type { DeckCard, ElementKind, MatchState } from './types';

/*
 * Progresión (§18): monedas, cajas y colección. Todo es puro: la interfaz
 * decide cuándo guardar y de dónde sale el RNG de las cajas.
 */

/** Cantidad de copias de cada carta del banco que tiene el jugador (R-25). */
export type Collection = Record<string, number>;

export type ClearedRound = 1 | 2 | 3 | 'bonus';

export interface CoinReward {
  lines: { round: ClearedRound; coins: number }[];
  base: number;
  doubled: boolean;
  total: number;
}

/** Rondas superadas en una partida terminada (R-29). La ronda en la que se cae no cuenta. */
export function roundsCleared(s: MatchState): ClearedRound[] {
  if (s.status === 'victory') return s.bonusOutcome === 'won' ? [1, 2, 3, 'bonus'] : [1, 2, 3];
  if (s.status !== 'defeat' || s.round === 'bonus') return [];
  return ([1, 2, 3] as const).filter((r) => r < (s.round as number));
}

/** ¿Están completos los 9 logros? Entonces las monedas se duplican (R-29). */
export function hasDoubleCoins(unlocked: readonly AchievementId[]): boolean {
  return BALANCE.economy.doubleCoinsWithAllAchievements && ACHIEVEMENT_IDS.every((id) => unlocked.includes(id));
}

/**
 * Monedas de una ronda superada (R-29): 60 / 120 / 120 y 120 por el bonus, el doble con
 * los 9 logros. Se acreditan al instante, en el momento de superar la ronda (D-31).
 */
export function coinsForRound(round: ClearedRound, doubled: boolean): number {
  const eco = BALANCE.economy;
  const base = round === 'bonus' ? eco.bonusCoins : (eco.coinsPerRound[round - 1] ?? 0);
  return doubled ? base * 2 : base;
}

/** Monedas que paga una partida terminada (R-29): la suma de sus rondas superadas. */
export function coinsForMatch(s: MatchState, doubled: boolean): CoinReward {
  const lines = roundsCleared(s).map((round) => ({ round, coins: coinsForRound(round, false) }));
  const base = lines.reduce((sum, l) => sum + l.coins, 0);
  return { lines, base, doubled, total: doubled ? base * 2 : base };
}

export const BOX_SIZES = BALANCE.economy.boxes.map((b) => b.size);

export function boxPrice(size: number): number {
  const box = BALANCE.economy.boxes.find((b) => b.size === size);
  if (!box) throw new Error(`No existe una caja de ${size} cartas.`);
  return box.price;
}

/**
 * Abre una caja (R-27, R-28): cada carta se sortea por separado entre las 20 del
 * elemento, todas con la misma probabilidad. Puede salir repetida.
 */
export function openBox(element: ElementKind, size: number, rng: Rng): BankCard[] {
  boxPrice(size);
  const pool = bankFor(element);
  return Array.from({ length: size }, () => rng.pick(pool));
}

export function addToCollection(c: Collection, cards: readonly { id: string }[]): Collection {
  const next = { ...c };
  for (const card of cards) next[card.id] = (next[card.id] ?? 0) + 1;
  return next;
}

/** Inventario inicial (R-30): una carta de 9 por elemento más la carta de camino elegida. */
export function starterCollection(camino: ElementKind): Collection {
  let c: Collection = {};
  for (const el of ELEMENTS) c = addToCollection(c, [{ id: STARTER_CARDS[el] }]);
  return addToCollection(c, [{ id: CAMINO_CARDS[camino] }]);
}

/** Reserva de batalla de un elemento (R-26): toda la colección, con repetidas, en orden estable. */
export function reserveFor(c: Collection, element: ElementKind): DeckCard[] {
  const out: DeckCard[] = [];
  for (const card of bankFor(element)) {
    const qty = c[card.id] ?? 0;
    for (let i = 0; i < qty; i++) out.push({ value: card.value, bankId: card.id });
  }
  return out;
}

export function reservesFor(c: Collection): Record<ElementKind, DeckCard[]> {
  return Object.fromEntries(ELEMENTS.map((el) => [el, reserveFor(c, el)])) as Record<ElementKind, DeckCard[]>;
}

export interface CollectionSummary {
  distinct: number;
  total: number;
  average: number;
}

export function collectionSummary(c: Collection, element: ElementKind): CollectionSummary {
  const reserve = reserveFor(c, element);
  const distinct = bankFor(element).filter((card) => (c[card.id] ?? 0) > 0).length;
  const total = reserve.length;
  const average = total ? reserve.reduce((s, r) => s + r.value, 0) / total : 0;
  return { distinct, total, average };
}

/** Limpia una colección leída de almacenamiento: solo ids del banco y cantidades enteras. */
export function sanitizeCollection(raw: unknown): Collection {
  const out: Collection = {};
  if (!raw || typeof raw !== 'object') return out;
  const valid = new Set(BANK.map((b) => b.id));
  for (const [id, qty] of Object.entries(raw as Record<string, unknown>)) {
    if (valid.has(id) && typeof qty === 'number' && Number.isInteger(qty) && qty > 0) out[id] = Math.min(qty, 999);
  }
  return out;
}
