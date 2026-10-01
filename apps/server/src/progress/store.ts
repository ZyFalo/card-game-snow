import {
  boxPrice,
  type ClearedRound,
  coinsForRound,
  type ElementKind,
  openBox,
  rngFrom,
  starterCollection,
} from '@ventisca/core';
import type { Progress } from '@ventisca/protocol';
import { and, eq, gte, sql } from 'drizzle-orm';
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

export type BoxPurchase =
  | { ok: true; cards: string[]; progress: Progress }
  | { ok: false; error: 'camino_required' | 'not_enough_coins' };

/**
 * R-27 y R-28: compra una caja. El cobro y el sorteo van en la misma transacción, y el cobro solo
 * pasa si alcanzan las monedas: dos compras a la vez no pueden gastar el mismo saldo, porque la
 * segunda espera a la primera y vuelve a mirar cuánto queda. `size` debe ser un tamaño de caja válido.
 */
export async function buyBox(
  db: Db,
  userId: string,
  element: ElementKind,
  size: number,
  seed: number,
): Promise<BoxPurchase> {
  const price = boxPrice(size);
  return db.transaction(async (tx) => {
    const paid = await tx
      .update(profiles)
      .set({ coins: sql`${profiles.coins} - ${price}`, boxesOpened: sql`${profiles.boxesOpened} + 1` })
      .where(and(eq(profiles.userId, userId), gte(profiles.coins, price)))
      .returning({ userId: profiles.userId });
    if (paid.length === 0) {
      const [profile] = await tx
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
      return { ok: false, error: profile ? 'not_enough_coins' : 'camino_required' };
    }
    // El sorteo es del motor (R-27): cada carta sale por separado entre las 20 del elemento.
    const cards = openBox(element, size, rngFrom(seed)).map((c) => c.id);
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
