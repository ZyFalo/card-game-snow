import {
  ACHIEVEMENT_IDS,
  type AchievementCounts,
  type AchievementId,
  achievementGoal,
  advance,
  type ClearedRound,
  type Collection,
  coinsForRound,
  type ElementKind,
  hasDoubleCoins,
  starterCollection,
} from '@ventisca/core';
import type { Achievements, MatchNotice } from '@ventisca/protocol';
import type { MatchEnd, OpenMatch, PlayStore, Settlement } from '../../src/play/store';
import type { AchievementGain } from '../../src/progress/store';

/*
 * Un almacén en memoria, para probar el centro del juego sin Postgres. Sigue las mismas reglas que el de
 * verdad (`dbStore`), que tiene sus propias pruebas contra una base: aquí importa que las partidas le
 * pidan lo correcto, en el momento correcto.
 */

interface Seat {
  rounds: ClearedRound[];
  exit: 'finished' | 'abandoned' | 'interrupted' | null;
  notice: MatchNotice | null;
}

interface Stored {
  open: OpenMatch;
  status: 'playing' | 'finished' | 'abandoned' | 'interrupted';
  seats: Map<string, Seat>;
}

export class MemoryStore implements PlayStore {
  /** La colección de cada cuenta. Quien no aparece aquí todavía no eligió su carta de camino. */
  readonly collections = new Map<string, Collection>();
  readonly coins = new Map<string, number>();
  /** El avance de cada cuenta en sus logros. */
  readonly progress = new Map<string, Achievements>();
  /** Las veces que se le pidió sumar hazañas: una por turno que dejó alguna. */
  featsAsked = 0;
  readonly stats = new Map<string, { matches: number; rounds: number; wins: number }>();
  readonly matches = new Map<string, Stored>();
  /** Lo que se le pidió, en orden, para comprobarlo. */
  readonly opened: OpenMatch[] = [];
  readonly closed: ({ matchId: string } & MatchEnd)[] = [];
  readonly abandoned: { matchId: string; userId: string }[] = [];
  /** Los cobros que entraron al libro: una vez por persona, partida y ronda. */
  readonly ledger: { userId: string; matchId: string; round: ClearedRound; coins: number }[] = [];

  /** Le da a esa cuenta la colección de alguien que acaba de elegir ese camino (R-30). */
  give(userId: string, camino: ElementKind = 'fire'): void {
    this.collections.set(userId, starterCollection(camino));
  }

  /** El avance de esa cuenta en cada logro. */
  achievementsOf(userId: string): Achievements {
    const have = this.progress.get(userId);
    if (have) return have;
    const fresh = Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, { count: 0, done: false }])) as Achievements;
    this.progress.set(userId, fresh);
    return fresh;
  }

  /** Le da a esa cuenta esos logros completos, como si los hubiera cerrado en partidas anteriores. */
  giveAchievements(userId: string, ids: readonly AchievementId[]): void {
    const have = this.achievementsOf(userId);
    for (const id of ids) have[id] = { count: achievementGoal(id), done: true };
  }

  /** Deja a esa cuenta con ese avance en esos logros, sin completarlos. */
  giveProgress(userId: string, counts: AchievementCounts): void {
    const have = this.achievementsOf(userId);
    for (const [id, count] of Object.entries(counts) as [AchievementId, number][]) have[id] = { count, done: false };
  }

  /** Los logros que esa cuenta ya completó. */
  completedOf(userId: string): AchievementId[] {
    const have = this.achievementsOf(userId);
    return ACHIEVEMENT_IDS.filter((id) => have[id].done);
  }

  /** Lo que esa cuenta lleva contado en los logros en que avanzó. */
  countsOf(userId: string): AchievementCounts {
    const have = this.achievementsOf(userId);
    return Object.fromEntries(ACHIEVEMENT_IDS.filter((id) => have[id].count > 0).map((id) => [id, have[id].count]));
  }

  statsOf(userId: string) {
    return this.stats.get(userId) ?? { matches: 0, rounds: 0, wins: 0 };
  }

  private addStats(userId: string, add: { matches: number; rounds: number; wins: number }): void {
    const now = this.statsOf(userId);
    this.stats.set(userId, {
      matches: now.matches + add.matches,
      rounds: now.rounds + add.rounds,
      wins: now.wins + add.wins,
    });
  }

  private credit(matchId: string, userId: string, rounds: ClearedRound[]): Settlement {
    const doubled = hasDoubleCoins(this.completedOf(userId));
    const lines: Settlement['lines'] = [];
    for (const round of rounds) {
      if (this.ledger.some((l) => l.userId === userId && l.matchId === matchId && l.round === round)) continue;
      const coins = coinsForRound(round, doubled);
      this.ledger.push({ userId, matchId, round, coins });
      this.coins.set(userId, (this.coins.get(userId) ?? 0) + coins);
      lines.push({ round, coins });
    }
    return {
      lines,
      doubled,
      total: lines.reduce((sum, l) => sum + l.coins, 0),
      balance: this.coins.get(userId) ?? 0,
      achievements: structuredClone(this.achievementsOf(userId)),
    };
  }

  async collectionOf(userId: string): Promise<Collection | null> {
    return this.collections.get(userId) ?? null;
  }

  async openMatch(match: OpenMatch): Promise<void> {
    this.opened.push(structuredClone(match));
    const seats = new Map<string, Seat>();
    for (const seat of match.seats) if (seat.userId) seats.set(seat.userId, { rounds: [], exit: null, notice: null });
    this.matches.set(match.id, { open: structuredClone(match), status: 'playing', seats });
  }

  async recordRounds(matchId: string, userIds: string[], rounds: ClearedRound[]): Promise<boolean> {
    const match = this.matches.get(matchId);
    if (match?.status !== 'playing') return false;
    for (const userId of userIds) {
      const seat = match.seats.get(userId);
      if (!seat || seat.exit !== null) continue;
      for (const round of rounds) if (!seat.rounds.includes(round)) seat.rounds.push(round);
    }
    return true;
  }

  async addFeats(feats: { userId: string; counts: AchievementCounts }[]): Promise<Map<string, AchievementGain>> {
    this.featsAsked += 1;
    const gains = new Map<string, AchievementGain>();
    for (const { userId, counts } of feats) {
      const have = this.achievementsOf(userId);
      const gain: AchievementGain = { gained: {}, completed: [] };
      for (const [id, n] of Object.entries(counts) as [AchievementId, number][]) {
        if (have[id].done) continue;
        const next = advance(id, have[id], n);
        have[id] = { count: next.count, done: next.done };
        if (next.gained > 0) gain.gained[id] = next.gained;
        if (next.done) gain.completed.push(id);
      }
      if (Object.keys(gain.gained).length > 0 || gain.completed.length > 0) gains.set(userId, gain);
    }
    return gains;
  }

  async abandon(matchId: string, userId: string): Promise<void> {
    const match = this.matches.get(matchId);
    const seat = match?.seats.get(userId);
    if (match?.status !== 'playing' || !seat || seat.exit !== null) return;
    this.abandoned.push({ matchId, userId });
    seat.exit = 'abandoned';
    this.addStats(userId, { matches: 1, rounds: seat.rounds.length, wins: 0 });
  }

  async settle(matchId: string, end: MatchEnd): Promise<Map<string, Settlement> | null> {
    const match = this.matches.get(matchId);
    if (match?.status !== 'playing') return null;
    match.status = end.result === null ? 'abandoned' : 'finished';
    this.closed.push({ matchId, ...structuredClone(end) });
    for (const userId of end.away) {
      const seat = match.seats.get(userId);
      if (!seat || seat.exit !== null) continue;
      seat.exit = 'abandoned';
      seat.notice = 'left_behind';
      this.addStats(userId, { matches: 1, rounds: seat.rounds.length, wins: 0 });
    }
    const settled = new Map<string, Settlement>();
    for (const userId of end.present) {
      const seat = match.seats.get(userId);
      if (!seat || seat.exit !== null) continue;
      settled.set(userId, this.credit(matchId, userId, seat.rounds));
      seat.exit = 'finished';
      this.addStats(userId, { matches: 1, rounds: seat.rounds.length, wins: end.result === 'victory' ? 1 : 0 });
    }
    return settled;
  }

  async interrupt(matchId: string | null): Promise<number> {
    let interrupted = 0;
    for (const [id, match] of this.matches) {
      if (match.status !== 'playing' || (matchId !== null && id !== matchId)) continue;
      match.status = 'interrupted';
      interrupted += 1;
      for (const [userId, seat] of match.seats) {
        if (seat.exit !== null) continue;
        this.credit(id, userId, seat.rounds);
        seat.exit = 'interrupted';
        seat.notice = 'restart';
        this.addStats(userId, { matches: 0, rounds: seat.rounds.length, wins: 0 });
      }
    }
    return interrupted;
  }

  async notice(userId: string): Promise<MatchNotice | null> {
    let last: MatchNotice | null = null;
    for (const match of this.matches.values()) last = match.seats.get(userId)?.notice ?? last;
    return last;
  }

  async noticeSeen(userId: string): Promise<void> {
    for (const match of this.matches.values()) {
      const seat = match.seats.get(userId);
      if (seat) seat.notice = null;
    }
  }
}
