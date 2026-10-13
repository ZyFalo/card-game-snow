import {
  type AchievementCounts,
  type BonusOutcome,
  type ClearedRound,
  type Collection,
  type Difficulty,
  type ElementKind,
  hasDoubleCoins,
} from '@ventisca/core';
import type { Achievements, MatchNotice } from '@ventisca/protocol';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  type AchievementGain,
  addFeats,
  completedAchievements,
  creditRound,
  type Executor,
  readAchievements,
  readProgress,
} from '../progress/store';
import { type LEDGER_ROUNDS, matches, matchPlayers, playerStats, profiles } from '../schema';

/*
 * Lo que el juego en línea lee y deja escrito en Postgres. Las partidas viven en la memoria del servidor;
 * aquí queda quién jugó cada una, cómo terminó y lo que ganó cada persona.
 *
 * Las reglas de las recompensas (R-39, R-40, R-54 y R-55):
 * - Las monedas de cada ronda quedan pendientes en `match_players.rounds`, para quien estaba conectado al
 *   terminarla, y entran al libro cuando la partida termina.
 * - El avance de los logros se suma en el turno en que pasa, y solo a quien estaba conectado.
 * - Quien abandona pierde las monedas de esa partida. Su avance en los logros se mantiene.
 * - Si el servidor se reinicia, se acreditan las rondas ya terminadas, y la partida no cuenta como jugada.
 * - Si las monedas se duplican lo decide el servidor al acreditar, contando los logros completos de su
 *   propia tabla.
 *
 * Una partida sale de `playing` una sola vez, y quien la saca hace las cuentas en la misma transacción.
 * Así no se pagan dos veces, aunque dos procesos del servidor coincidan durante un despliegue.
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
  /** Quienes estaban conectados al final: cobran sus rondas. */
  present: string[];
  /** Quienes se desconectaron y no volvieron antes del final: abandonaron (R-39). */
  away: string[];
}

/** Lo que una persona recibe al terminar una partida. */
export interface Settlement {
  /** Las rondas que cobró, cada una con lo que entró al libro. */
  lines: { round: ClearedRound; coins: number }[];
  /** Su amuleto está completo: las monedas se duplicaron (R-29). */
  doubled: boolean;
  total: number;
  /** Su saldo después de acreditar. */
  balance: number;
  /** Su avance en cada logro, ya con lo de esta partida. */
  achievements: Achievements;
}

export interface PlayStore {
  /** La colección de esa cuenta, o `null` si todavía no eligió su carta de camino (R-30). */
  collectionOf(userId: string): Promise<Collection | null>;
  openMatch(match: OpenMatch): Promise<void>;
  /**
   * El equipo superó esas rondas: quedan por cobrar para quienes estaban conectados (D-48). Devuelve
   * `false` si la partida ya no está viva en la base: otro proceso la dio por interrumpida.
   */
  recordRounds(matchId: string, userIds: string[], rounds: ClearedRound[]): Promise<boolean>;
  /**
   * Suma al avance de cada persona las hazañas de un turno (R-55). Devuelve, por persona, lo que de verdad
   * sumó y los logros que completó con eso; quien no avanzó en nada no aparece.
   */
  addFeats(feats: { userId: string; counts: AchievementCounts }[]): Promise<Map<string, AchievementGain>>;
  /** Esa persona salió de la partida con "Salir": abandonó, y pierde sus monedas pendientes (R-39). */
  abandon(matchId: string, userId: string): Promise<void>;
  /**
   * Cierra la partida y hace las cuentas. Devuelve lo que recibe cada persona presente, o `null` si la
   * partida ya no estaba viva: otro proceso la interrumpió, y las cuentas las hizo él.
   */
  settle(matchId: string, end: MatchEnd): Promise<Map<string, Settlement> | null>;
  /**
   * El servidor se reinicia (R-54): da por interrumpida esa partida, o todas las que quedaron vivas si no
   * se dice cuál. Acredita las rondas ya terminadas. Devuelve cuántas interrumpió.
   */
  interrupt(matchId: string | null): Promise<number>;
  /** El aviso pendiente de la última partida de esa cuenta, si hay uno. */
  notice(userId: string): Promise<MatchNotice | null>;
  noticeSeen(userId: string): Promise<void>;
}

/** El código de Postgres para una fila que apunta a otra que ya no existe. */
const FOREIGN_KEY_VIOLATION = '23503';

const roundOf = (text: string): ClearedRound => (text === 'bonus' ? 'bonus' : (Number(text) as 1 | 2 | 3));
const roundText = (round: ClearedRound) => String(round) as (typeof LEDGER_ROUNDS)[number];

export function dbStore(db: Db, now: () => Date = () => new Date()): PlayStore {
  /** Suma a las estadísticas privadas de esa persona en esa dificultad (R-42). */
  async function addStats(
    tx: Executor,
    userId: string,
    difficulty: Difficulty,
    add: { matches: number; rounds: number; wins: number },
  ): Promise<void> {
    if (add.matches === 0 && add.rounds === 0 && add.wins === 0) return;
    await tx
      .insert(playerStats)
      .values({ userId, difficulty, ...add })
      .onConflictDoUpdate({
        target: [playerStats.userId, playerStats.difficulty],
        set: {
          matches: sql`${playerStats.matches} + ${add.matches}`,
          rounds: sql`${playerStats.rounds} + ${add.rounds}`,
          wins: sql`${playerStats.wins} + ${add.wins}`,
        },
      });
  }

  /**
   * Acredita las rondas pendientes de una persona (R-40). Si su amuleto está completo, valen el doble: se
   * cuentan los logros completos de su tabla en este momento, incluidos los que cerró en esta partida (D-103).
   */
  async function credit(tx: Executor, matchId: string, userId: string, rounds: string[]): Promise<Settlement> {
    const doubled = hasDoubleCoins(await completedAchievements(tx, userId));
    const lines: Settlement['lines'] = [];
    for (const text of rounds) {
      const round = roundOf(text);
      const paid = await creditRound(tx, { userId, matchId, round, doubled }, now());
      // Una ronda que ya estaba en el libro no se paga otra vez, ni se muestra como cobrada ahora.
      if (paid.credited) lines.push({ round, coins: paid.amount });
    }
    const [profile] = await tx.select({ coins: profiles.coins }).from(profiles).where(eq(profiles.userId, userId));
    return {
      lines,
      doubled,
      total: lines.reduce((sum, line) => sum + line.coins, 0),
      balance: profile?.coins ?? 0,
      achievements: await readAchievements(tx, userId),
    };
  }

  /** La fila de esa persona en esa partida, si sigue en ella. Queda bloqueada hasta cerrar la transacción. */
  async function seatOf(tx: Executor, matchId: string, userId: string) {
    const [row] = await tx
      .select({ rounds: matchPlayers.rounds })
      .from(matchPlayers)
      .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId), isNull(matchPlayers.exit)))
      .for('update');
    return row;
  }

  const mine = (matchId: string, userId: string) =>
    and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId), isNull(matchPlayers.exit));

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

    async recordRounds(matchId, userIds, rounds) {
      return db.transaction(async (tx) => {
        // Con la partida bloqueada, nadie más puede cerrarla mientras se anotan sus rondas.
        const [match] = await tx
          .select({ status: matches.status })
          .from(matches)
          .where(eq(matches.id, matchId))
          .for('update');
        if (match?.status !== 'playing') return false;
        for (const round of rounds) {
          const text = roundText(round);
          for (const userId of userIds) {
            await tx
              .update(matchPlayers)
              .set({ rounds: sql`array_append(${matchPlayers.rounds}, ${text})` })
              // Cada ronda se anota una sola vez por persona.
              .where(and(mine(matchId, userId), sql`not (${text} = any(${matchPlayers.rounds}))`));
          }
        }
        return true;
      });
    },

    async addFeats(feats) {
      const gains = new Map<string, AchievementGain>();
      for (const { userId, counts } of feats) {
        try {
          const gain = await addFeats(db, userId, counts, now());
          if (Object.keys(gain.gained).length > 0 || gain.completed.length > 0) gains.set(userId, gain);
        } catch (err) {
          // La cuenta se borró a mitad de la partida: ya no hay a quién sumarle.
          const e = err as { code?: string; cause?: { code?: string } };
          if ((e.cause ?? e).code !== FOREIGN_KEY_VIOLATION) throw err;
        }
      }
      return gains;
    },

    async abandon(matchId, userId) {
      await db.transaction(async (tx) => {
        const [match] = await tx
          .select({ status: matches.status, difficulty: matches.difficulty })
          .from(matches)
          .where(eq(matches.id, matchId))
          .for('update');
        const seat = match?.status === 'playing' ? await seatOf(tx, matchId, userId) : undefined;
        if (!match || !seat) return;
        // Sus rondas quedan anotadas, pero ya nunca se cobran: quien abandonó no entra en las cuentas.
        await tx.update(matchPlayers).set({ exit: 'abandoned', leftAt: now() }).where(mine(matchId, userId));
        // Cuenta como jugada y no ganada; las rondas que superó cuentan (R-42).
        await addStats(tx, userId, match.difficulty, { matches: 1, rounds: seat.rounds.length, wins: 0 });
      });
    },

    async settle(matchId, end) {
      return db.transaction(async (tx) => {
        const [match] = await tx
          .update(matches)
          .set({
            status: end.result === null ? 'abandoned' : 'finished',
            outcome: end.result,
            bonusOutcome: end.bonusOutcome === 'pending' ? null : end.bonusOutcome,
            turns: end.turns,
            endedAt: now(),
          })
          .where(and(eq(matches.id, matchId), eq(matches.status, 'playing')))
          .returning({ difficulty: matches.difficulty });
        if (!match) return null;

        // Quien no volvió antes del final abandonó: pierde sus monedas y se entera la próxima vez (R-39).
        for (const userId of end.away) {
          const seat = await seatOf(tx, matchId, userId);
          if (!seat) continue;
          await tx
            .update(matchPlayers)
            .set({ exit: 'abandoned', notice: 'left_behind', leftAt: now() })
            .where(mine(matchId, userId));
          await addStats(tx, userId, match.difficulty, { matches: 1, rounds: seat.rounds.length, wins: 0 });
        }

        const settled = new Map<string, Settlement>();
        for (const userId of end.present) {
          const seat = await seatOf(tx, matchId, userId);
          // Sin fila, esa cuenta se borró a mitad de la partida: su lugar quedó anónimo (D-56).
          if (!seat) continue;
          settled.set(userId, await credit(tx, matchId, userId, seat.rounds));
          await tx.update(matchPlayers).set({ exit: 'finished', leftAt: now() }).where(mine(matchId, userId));
          await addStats(tx, userId, match.difficulty, {
            matches: 1,
            rounds: seat.rounds.length,
            wins: end.result === 'victory' ? 1 : 0,
          });
        }

        // El asiento del bot y los de las cuentas borradas.
        await tx
          .update(matchPlayers)
          .set({ exit: 'finished', leftAt: now() })
          .where(and(eq(matchPlayers.matchId, matchId), isNull(matchPlayers.exit)));
        return settled;
      });
    },

    async interrupt(matchId) {
      const alive = and(eq(matches.status, 'playing'), ...(matchId ? [eq(matches.id, matchId)] : []));
      const ids = (await db.select({ id: matches.id }).from(matches).where(alive)).map((m) => m.id);
      let interrupted = 0;
      for (const id of ids) {
        const done = await db.transaction(async (tx) => {
          const [match] = await tx
            .update(matches)
            .set({ status: 'interrupted', endedAt: now() })
            .where(and(eq(matches.id, id), eq(matches.status, 'playing')))
            .returning({ difficulty: matches.difficulty });
          if (!match) return false;
          const seats = await tx
            .select({ userId: matchPlayers.userId, rounds: matchPlayers.rounds })
            .from(matchPlayers)
            .where(and(eq(matchPlayers.matchId, id), isNotNull(matchPlayers.userId), isNull(matchPlayers.exit)))
            .for('update');
          for (const seat of seats) {
            const userId = seat.userId as string;
            // Se acreditan las rondas ya terminadas. No cuenta como partida jugada, ganada ni perdida.
            await credit(tx, id, userId, seat.rounds);
            await tx
              .update(matchPlayers)
              .set({ exit: 'interrupted', notice: 'restart', leftAt: now() })
              .where(mine(id, userId));
            await addStats(tx, userId, match.difficulty, { matches: 0, rounds: seat.rounds.length, wins: 0 });
          }
          await tx
            .update(matchPlayers)
            .set({ exit: 'interrupted', leftAt: now() })
            .where(and(eq(matchPlayers.matchId, id), isNull(matchPlayers.exit)));
          return true;
        });
        if (done) interrupted += 1;
      }
      return interrupted;
    },

    async notice(userId) {
      const [row] = await db
        .select({ notice: matchPlayers.notice })
        .from(matchPlayers)
        .where(and(eq(matchPlayers.userId, userId), isNotNull(matchPlayers.notice)))
        .orderBy(desc(matchPlayers.leftAt))
        .limit(1);
      return row?.notice ?? null;
    },

    async noticeSeen(userId) {
      await db
        .update(matchPlayers)
        .set({ notice: null })
        .where(and(eq(matchPlayers.userId, userId), isNotNull(matchPlayers.notice)));
    },
  };
}
