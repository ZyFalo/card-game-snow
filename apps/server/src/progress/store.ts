import { type ClearedRound, coinsForRound, type ElementKind, starterCollection } from '@ventisca/core';
import type { Progress } from '@ventisca/protocol';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { coinLedger, collection, type LEDGER_ROUNDS, profiles } from '../schema';

/*
 * Progreso en la cuenta (D-34): las reglas R-25 a R-30 las resuelve el servidor con `packages/core`, y
 * aquí solo se guarda el resultado. Cada operación es una transacción: o pasa completa, o no pasa.
 */

/** La base o una transacción abierta. */
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** El progreso de una cuenta. Sin perfil, la persona todavía no eligió su carta de camino (R-30). */
export async function readProgress(db: Executor, userId: string): Promise<Progress> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) return { camino: null, coins: 0, boxesOpened: 0, collection: {} };
  const cards = await db
    .select({ cardId: collection.cardId, count: collection.count })
    .from(collection)
    .where(eq(collection.userId, userId));
  return {
    camino: profile.caminoElement,
    coins: profile.coins,
    boxesOpened: profile.boxesOpened,
    collection: Object.fromEntries(cards.map((c) => [c.cardId, c.count])),
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

/**
 * R-29 y D-31: acredita las monedas de una ronda superada. El libro tiene una sola fila por persona,
 * partida y ronda, así que un cobro repetido (una reconexión, un reinicio del servidor) no paga otra
 * vez: devuelve `credited: false`. `doubled`: la persona ya tiene los 9 logros. Sin perfil, falla.
 */
export async function creditRound(
  db: Db,
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
