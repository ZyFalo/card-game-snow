import { type ElementKind, starterCollection } from '@ventisca/core';
import type { Progress } from '@ventisca/protocol';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { collection, profiles } from '../schema';

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
