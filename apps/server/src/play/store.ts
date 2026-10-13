import type { BonusOutcome, Collection, Difficulty, ElementKind } from '@ventisca/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { readProgress } from '../progress/store';
import { matches, matchPlayers } from '../schema';

/*
 * Lo que el juego en línea lee y deja escrito en Postgres. Las partidas viven en la memoria del servidor;
 * aquí queda quién jugó cada una y cómo terminó.
 */

/** Una partida que empieza: sus asientos, con la cuenta de cada persona o `null` para el bot. */
export interface OpenMatch {
  id: string;
  /** El código de la sala, o `null` si salió de la cola. */
  roomCode: string | null;
  difficulty: Difficulty;
  seed: number;
  seats: { element: ElementKind; userId: string | null }[];
}

/** Cómo terminó una partida. `result` es `null` si se fueron todas las personas antes del final. */
export interface MatchEnd {
  result: 'victory' | 'defeat' | null;
  bonusOutcome: BonusOutcome;
  turns: number;
  /** Quienes la abandonaron: salieron, o no volvieron antes del final (R-39). */
  left: string[];
}

export interface PlayStore {
  /** La colección de esa cuenta, o `null` si todavía no eligió su carta de camino (R-30). */
  collectionOf(userId: string): Promise<Collection | null>;
  openMatch(match: OpenMatch): Promise<void>;
  closeMatch(matchId: string, end: MatchEnd): Promise<void>;
}

export function dbStore(db: Db, now: () => Date = () => new Date()): PlayStore {
  return {
    async collectionOf(userId) {
      const progress = await readProgress(db, userId);
      return progress.camino === null ? null : progress.collection;
    },

    async openMatch(match) {
      await db.transaction(async (tx) => {
        await tx.insert(matches).values({
          id: match.id,
          roomCode: match.roomCode,
          difficulty: match.difficulty,
          seed: match.seed,
          startedAt: now(),
        });
        await tx
          .insert(matchPlayers)
          .values(match.seats.map((s) => ({ matchId: match.id, seat: s.element, userId: s.userId, joinedAt: now() })));
      });
    },

    async closeMatch(matchId, end) {
      await db.transaction(async (tx) => {
        // Una partida sale de `playing` una sola vez: si ya salió, no hay nada que cerrar.
        const closed = await tx
          .update(matches)
          .set({
            status: end.result === null ? 'abandoned' : 'finished',
            outcome: end.result,
            bonusOutcome: end.bonusOutcome === 'pending' ? null : end.bonusOutcome,
            turns: end.turns,
            endedAt: now(),
          })
          .where(and(eq(matches.id, matchId), eq(matches.status, 'playing')))
          .returning({ id: matches.id });
        if (closed.length === 0) return;
        const open = and(eq(matchPlayers.matchId, matchId), isNull(matchPlayers.exit));
        if (end.left.length > 0) {
          await tx
            .update(matchPlayers)
            .set({ exit: 'abandoned', leftAt: now() })
            .where(and(open, inArray(matchPlayers.userId, end.left)));
        }
        await tx.update(matchPlayers).set({ exit: 'finished', leftAt: now() }).where(open);
      });
    },
  };
}
