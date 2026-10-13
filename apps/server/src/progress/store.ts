import {
  ACHIEVEMENT_IDS,
  type AchievementCounts,
  type AchievementId,
  advance,
  boxPrice,
  type ClearedRound,
  coinsForRound,
  type ElementKind,
  openBox,
  rngFrom,
  starterCollection,
} from '@ventisca/core';
import type { Achievements, Progress, StatsLine } from '@ventisca/protocol';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { achievements, coinLedger, collection, type LEDGER_ROUNDS, playerStats, profiles } from '../schema';

/*
 * Progreso en la cuenta (D-34): las reglas R-25 a R-30 las resuelve el servidor con `packages/core`, y
 * aquí solo se guarda el resultado. Cada operación es una transacción: o pasa completa, o no pasa.
 */

/** La base o una transacción abierta. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const NO_STATS: StatsLine = { matches: 0, rounds: 0, wins: 0 };

/** Sin avance en ningún logro: así empieza una cuenta. */
const noAchievements = (): Achievements =>
  Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, { count: 0, done: false }])) as Achievements;

/** El avance de esa cuenta en cada logro (R-55): lo que lleva contado y si ya lo completó. */
export async function readAchievements(db: Executor, userId: string): Promise<Achievements> {
  const rows = await db
    .select({ id: achievements.achievementId, progress: achievements.progress, unlockedAt: achievements.unlockedAt })
    .from(achievements)
    .where(eq(achievements.userId, userId));
  const out = noAchievements();
  for (const row of rows) {
    // Una fila de un logro que ya no existe no se muestra ni cuenta.
    if (!(ACHIEVEMENT_IDS as readonly string[]).includes(row.id)) continue;
    out[row.id as AchievementId] = { count: row.progress, done: row.unlockedAt !== null };
  }
  return out;
}

/** Los logros que esa cuenta ya completó. Con los 12, las monedas valen el doble (R-29). */
export async function completedAchievements(db: Executor, userId: string): Promise<AchievementId[]> {
  const rows = await db
    .select({ id: achievements.achievementId })
    .from(achievements)
    .where(and(eq(achievements.userId, userId), isNotNull(achievements.unlockedAt)));
  const have = new Set(rows.map((r) => r.id));
  return ACHIEVEMENT_IDS.filter((id) => have.has(id));
}

/** Lo que cambió en los logros de una persona al sumarle unas hazañas. */
export interface AchievementGain {
  /** Lo que de verdad sumó cada logro: el avance no pasa de la meta. */
  gained: AchievementCounts;
  /** Los que llegaron a su meta con esto. */
  completed: AchievementId[];
}

/**
 * R-55: suma esas hazañas al avance de una persona. Cada logro avanza hasta su meta y ahí se queda; al
 * llegar, queda completo desde ese momento, y ya no se pierde. Devuelve lo que cambió.
 */
export async function addFeats(
  db: Executor,
  userId: string,
  counts: AchievementCounts,
  now: Date,
): Promise<AchievementGain> {
  const gain: AchievementGain = { gained: {}, completed: [] };
  const feats = ACHIEVEMENT_IDS.flatMap((id) => {
    const n = counts[id] ?? 0;
    return Number.isInteger(n) && n > 0 ? [{ id, n }] : [];
  });
  if (feats.length === 0) return gain;
  return db.transaction(async (tx) => {
    // Con sus filas bloqueadas, nadie más mueve su avance mientras se hacen las cuentas.
    const rows = await tx
      .select({ id: achievements.achievementId, progress: achievements.progress, unlockedAt: achievements.unlockedAt })
      .from(achievements)
      .where(eq(achievements.userId, userId))
      .for('update');
    for (const { id, n } of feats) {
      const row = rows.find((r) => r.id === id);
      // Un logro completo ya no cambia.
      if (row?.unlockedAt) continue;
      const next = advance(id, { count: row?.progress ?? 0, done: false }, n);
      const unlockedAt = next.done ? now : null;
      await tx
        .insert(achievements)
        .values({ userId, achievementId: id, progress: next.count, unlockedAt })
        .onConflictDoUpdate({
          target: [achievements.userId, achievements.achievementId],
          set: { progress: next.count, unlockedAt },
        });
      if (next.gained > 0) gain.gained[id] = next.gained;
      if (next.done) gain.completed.push(id);
    }
    return gain;
  });
}

/** El progreso de una cuenta. Sin perfil, la persona todavía no eligió su carta de camino (R-30). */
export async function readProgress(db: Executor, userId: string): Promise<Progress> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const stats = { classic: { ...NO_STATS }, storm: { ...NO_STATS } };
  if (!profile) {
    return { camino: null, coins: 0, boxesOpened: 0, collection: {}, achievements: noAchievements(), stats };
  }
  const cards = await db
    .select({ cardId: collection.cardId, count: collection.count })
    .from(collection)
    .where(eq(collection.userId, userId));
  for (const row of await db.select().from(playerStats).where(eq(playerStats.userId, userId))) {
    stats[row.difficulty] = { matches: row.matches, rounds: row.rounds, wins: row.wins };
  }
  return {
    camino: profile.caminoElement,
    coins: profile.coins,
    boxesOpened: profile.boxesOpened,
    collection: Object.fromEntries(cards.map((c) => [c.cardId, c.count])),
    achievements: await readAchievements(db, userId),
    stats,
  };
}

/**
 * R-30: elegir la carta de camino crea el perfil y da el inventario inicial. La elección es
 * permanente: devuelve el progreso si el camino es el pedido (recién elegido o ya elegido antes), y
 * null si la persona ya había elegido otro.
 */
export async function chooseCamino(db: Db, userId: string, element: ElementKind, now: Date): Promise<Progress | null> {
  return db.transaction(async (tx) => {
    // Si dos peticiones llegan a la vez, la segunda espera a la primera y no inserta nada.
    const created = await tx
      .insert(profiles)
      .values({ userId, caminoElement: element, createdAt: now })
      .onConflictDoNothing()
      .returning({ userId: profiles.userId });
    if (created.length > 0) {
      const starter = Object.entries(starterCollection(element));
      await tx.insert(collection).values(starter.map(([cardId, count]) => ({ userId, cardId, count })));
    }
    const progress = await readProgress(tx, userId);
    return progress.camino === element ? progress : null;
  });
}

export type BoxPurchase =
  | { ok: true; cards: string[]; progress: Progress }
  | { ok: false; error: 'camino_required' | 'not_enough_coins' };

/**
 * R-27, R-28 y D-66: compra una caja. `size` debe ser un tamaño de caja válido.
 *
 * La compra bloquea el perfil, así que las compras de una misma cuenta pasan de una en una: dos a la
 * vez no pueden gastar el mismo saldo, porque la segunda espera a la primera y mira cuánto quedó.
 *
 * Cada compra deja en el libro un movimiento negativo con el identificador que generó el cliente y
 * las cartas que salieron. Si llega un reintento con el mismo identificador, se devuelve ese resultado
 * y no se cobra de nuevo: la respuesta de la primera vez pudo perderse en el camino.
 */
export async function buyBox(
  db: Db,
  purchase: { userId: string; purchaseId: string; element: ElementKind; size: number },
  seed: number,
  now: Date,
): Promise<BoxPurchase> {
  const { userId, purchaseId, element, size } = purchase;
  const price = boxPrice(size);
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ coins: profiles.coins })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for('update');
    if (!profile) return { ok: false, error: 'camino_required' };

    const [original] = await tx
      .select({ cards: coinLedger.cards })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, userId), eq(coinLedger.purchaseId, purchaseId)))
      .limit(1);
    if (original) return { ok: true, cards: original.cards ?? [], progress: await readProgress(tx, userId) };

    if (profile.coins < price) return { ok: false, error: 'not_enough_coins' };

    // El sorteo es del motor (R-27): cada carta sale por separado entre las 20 del elemento.
    const cards = openBox(element, size, rngFrom(seed)).map((c) => c.id);
    await tx
      .update(profiles)
      .set({ coins: sql`${profiles.coins} - ${price}`, boxesOpened: sql`${profiles.boxesOpened} + 1` })
      .where(eq(profiles.userId, userId));
    await tx.insert(coinLedger).values({ userId, purchaseId, amount: -price, cards, createdAt: now });
    const copies = new Map<string, number>();
    for (const id of cards) copies.set(id, (copies.get(id) ?? 0) + 1);
    await tx
      .insert(collection)
      .values([...copies].map(([cardId, count]) => ({ userId, cardId, count })))
      .onConflictDoUpdate({
        target: [collection.userId, collection.cardId],
        set: { count: sql`${collection.count} + excluded."count"` },
      });
    return { ok: true, cards, progress: await readProgress(tx, userId) };
  });
}

/**
 * R-29: acredita las monedas de una ronda superada. El libro tiene una sola fila por persona, partida y
 * ronda, así que un cobro repetido (un reintento, un reinicio del servidor) no paga otra vez: devuelve
 * `credited: false`. Sin perfil, falla. Las de una partida se acreditan cuando termina (D-93).
 *
 * `doubled`: la persona ya completó los cuatro pliegues del amuleto, con sus 12 logros. Lo decide el servidor
 * contando su propia tabla de logros, al hacer las cuentas de la partida (`play/store.ts`); nunca llega del
 * cliente.
 */
export async function creditRound(
  db: Executor,
  payment: { userId: string; matchId: string; round: ClearedRound; doubled: boolean },
  now: Date,
): Promise<{ credited: boolean; amount: number }> {
  const { userId, matchId } = payment;
  const amount = coinsForRound(payment.round, payment.doubled);
  const round = String(payment.round) as (typeof LEDGER_ROUNDS)[number];
  return db.transaction(async (tx) => {
    const entered = await tx
      .insert(coinLedger)
      .values({ userId, matchId, round, amount, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: coinLedger.id });
    if (entered.length === 0) return { credited: false, amount: 0 };
    await tx
      .update(profiles)
      .set({ coins: sql`${profiles.coins} + ${amount}` })
      .where(eq(profiles.userId, userId));
    return { credited: true, amount };
  });
}
