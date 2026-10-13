import { randomUUID } from 'node:crypto';
import { ACHIEVEMENT_IDS, type ClearedRound } from '@ventisca/core';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/accounts/session';
import { dbStore, type MatchEnd, type PlayStore } from '../src/play/store';
import { creditRound, readProgress } from '../src/progress/store';
import { achievements, coinLedger, matches, matchPlayers, playerStats, profiles, users } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';
import { APP_ORIGIN, startServer, type TestServer } from './support/play';

/*
 * Las cuentas de una partida en línea, contra un Postgres de verdad (R-39, R-40, R-54 y R-55): qué entra
 * al libro de monedas, cuándo, y que nunca entre dos veces.
 */
describe.skipIf(!adminUrl)('Cuentas de las partidas en línea (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  const NOW = new Date('2026-10-12T15:00:00Z');
  let server: TestServer;
  let store: PlayStore;
  beforeEach(async () => {
    server = await startServer(ctx.database);
    store = dbStore(ctx.database.db, () => NOW);
    // Las pruebas comparten la base: lo que la anterior haya dejado vivo no es de esta.
    await store.interrupt(null);
  });
  afterEach(async () => {
    await server.close();
  });

  const db = () => ctx.database.db;
  const victory = (over: Partial<MatchEnd> = {}): MatchEnd => ({
    result: 'victory',
    bonusOutcome: 'missed',
    turns: 14,
    present: [],
    away: [],
    ...over,
  });

  /** Una partida recién empezada con esas personas en Fuego, Agua y Nieve; lo que falte, para el bot. */
  async function playing(...userIds: string[]) {
    const id = randomUUID();
    await store.openMatch({
      id,
      roomCode: null,
      difficulty: 'classic',
      seed: 4_000_000_000,
      seats: (['fire', 'water', 'snow'] as const).map((element, i) => ({ element, userId: userIds[i] ?? null })),
    });
    return id;
  }
  const trio = async () => {
    const [a, b, c] = [await server.signUp('fire'), await server.signUp('water'), await server.signUp('snow')];
    return { a, b, c, matchId: await playing(a.userId, b.userId, c.userId) };
  };

  const ledger = (userId: string) =>
    db()
      .select({ round: coinLedger.round, amount: coinLedger.amount, matchId: coinLedger.matchId })
      .from(coinLedger)
      .where(eq(coinLedger.userId, userId));
  const coins = async (userId: string) =>
    (await db().select({ coins: profiles.coins }).from(profiles).where(eq(profiles.userId, userId)))[0]?.coins;
  const seat = async (matchId: string, userId: string) =>
    (
      await db()
        .select()
        .from(matchPlayers)
        .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)))
    )[0];
  const status = async (matchId: string) => (await db().select().from(matches).where(eq(matches.id, matchId)))[0];
  const stats = async (userId: string) => (await readProgress(db(), userId)).stats.classic;
  const giveAll = (userId: string, except: string[] = []) =>
    db()
      .insert(achievements)
      .values(ACHIEVEMENT_IDS.filter((id) => !except.includes(id)).map((achievementId) => ({ userId, achievementId })));

  describe('Al empezar', () => {
    it('la partida queda escrita con sus tres asientos; el del bot, sin cuenta', async () => {
      const a = await server.signUp('fire');
      const b = await server.signUp('water');
      const matchId = await playing(a.userId, b.userId);
      expect(await status(matchId)).toMatchObject({
        status: 'playing',
        difficulty: 'classic',
        seed: 4_000_000_000,
        roomCode: null,
        outcome: null,
        endedAt: null,
      });
      const seats = await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
      expect(seats.map((s) => [s.seat, s.userId, s.rounds, s.exit]).sort()).toEqual([
        ['fire', a.userId, [], null],
        ['snow', null, [], null],
        ['water', b.userId, [], null],
      ]);
    });

    it('R-30: sin carta de camino no hay colección con que jugar', async () => {
      const nueva = await server.signUp();
      expect(await store.collectionOf(nueva.userId)).toBeNull();
      const lista = await server.signUp('snow');
      expect(Object.keys((await store.collectionOf(lista.userId)) ?? {})).toHaveLength(4);
    });
  });

  describe('Monedas pendientes (R-40)', () => {
    it('R-40: una ronda superada queda por cobrar, y todavía no entra al libro', async () => {
      const { a, b, c, matchId } = await trio();
      expect(await store.recordRounds(matchId, [a.userId, b.userId, c.userId], [1])).toBe(true);
      for (const who of [a, b, c]) {
        expect((await seat(matchId, who.userId))?.rounds).toEqual(['1']);
        expect(await ledger(who.userId)).toEqual([]);
        expect(await coins(who.userId)).toBe(0);
      }
    });

    it('D-48: la ronda queda por cobrar solo para quienes estaban conectados', async () => {
      const { a, b, c, matchId } = await trio();
      await store.recordRounds(matchId, [a.userId, b.userId], [1]);
      await store.recordRounds(matchId, [a.userId, c.userId], [2]);
      expect((await seat(matchId, a.userId))?.rounds).toEqual(['1', '2']);
      expect((await seat(matchId, b.userId))?.rounds).toEqual(['1']);
      expect((await seat(matchId, c.userId))?.rounds).toEqual(['2']);
    });

    it('R-40: una misma ronda no se anota dos veces', async () => {
      const { a, matchId } = await trio();
      await store.recordRounds(matchId, [a.userId], [1]);
      await store.recordRounds(matchId, [a.userId], [1, 2]);
      expect((await seat(matchId, a.userId))?.rounds).toEqual(['1', '2']);
    });

    it('R-40: al terminar la partida, cada ronda pendiente entra al libro una vez y suma al saldo', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      await store.recordRounds(matchId, all, [2]);
      await store.recordRounds(matchId, all, [3, 'bonus']);
      const settled = await store.settle(matchId, victory({ bonusOutcome: 'won', present: all }));
      for (const who of [a, b, c]) {
        expect(settled?.get(who.userId)).toEqual({
          lines: [
            { round: 1, coins: 60 },
            { round: 2, coins: 120 },
            { round: 3, coins: 120 },
            { round: 'bonus', coins: 120 },
          ],
          doubled: false,
          total: 420,
          balance: 420,
          achievements: [],
        });
        expect(await coins(who.userId)).toBe(420);
        expect((await ledger(who.userId)).map((l) => [l.round, l.amount, l.matchId])).toEqual([
          ['1', 60, matchId],
          ['2', 120, matchId],
          ['3', 120, matchId],
          ['bonus', 120, matchId],
        ]);
        expect(await seat(matchId, who.userId)).toMatchObject({ exit: 'finished', notice: null, leftAt: NOW });
      }
      expect(await status(matchId)).toMatchObject({
        status: 'finished',
        outcome: 'victory',
        bonusOutcome: 'won',
        turns: 14,
        endedAt: NOW,
      });
    });

    it('R-40: el saldo es la suma del libro, también después de varias partidas', async () => {
      const a = await server.signUp('fire');
      const b = await server.signUp('water');
      for (const rounds of [[1, 2], [1], [1, 2, 3]] as ClearedRound[][]) {
        const matchId = await playing(a.userId, b.userId);
        await store.recordRounds(matchId, [a.userId, b.userId], rounds);
        await store.settle(matchId, victory({ present: [a.userId, b.userId] }));
      }
      const sum = (await ledger(a.userId)).reduce((total, l) => total + l.amount, 0);
      expect(sum).toBe(180 + 60 + 300);
      expect(await coins(a.userId)).toBe(sum);
    });

    it('R-40: cerrar dos veces la misma partida no paga dos veces', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2]);
      expect(await store.settle(matchId, victory({ present: all }))).not.toBeNull();
      expect(await store.settle(matchId, victory({ present: all }))).toBeNull();
      expect(await coins(a.userId)).toBe(180);
      expect(await ledger(a.userId)).toHaveLength(2);
    });

    it('R-40: dos cierres a la vez tampoco: solo uno hace las cuentas', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2, 3]);
      const results = await Promise.all([
        store.settle(matchId, victory({ present: all })),
        store.settle(matchId, victory({ present: all })),
        store.interrupt(matchId),
      ]);
      // Uno solo de los tres sacó la partida de `playing`.
      const winners = [results[0] !== null, results[1] !== null, results[2] === 1].filter(Boolean);
      expect(winners).toHaveLength(1);
      for (const who of [a, b, c]) {
        expect(await coins(who.userId)).toBe(300);
        expect(await ledger(who.userId)).toHaveLength(3);
      }
    });

    it('R-40: una ronda que ya estaba en el libro no se paga otra vez, ni se cuenta como cobrada ahora', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2]);
      // La ronda 1 de Ana ya entró al libro, por lo que sea: un reintento, una cuenta a medias.
      await creditRound(db(), { userId: a.userId, matchId, round: 1, doubled: false }, NOW);
      const settled = await store.settle(matchId, victory({ present: all }));
      expect(settled?.get(a.userId)).toMatchObject({ lines: [{ round: 2, coins: 120 }], total: 120, balance: 180 });
      expect(await ledger(a.userId)).toHaveLength(2);
      expect(settled?.get(b.userId)).toMatchObject({ total: 180, balance: 180 });
    });

    it('con la partida ya cerrada, no se anotan más rondas', async () => {
      const { a, b, c, matchId } = await trio();
      await store.settle(matchId, victory({ present: [a.userId, b.userId, c.userId] }));
      expect(await store.recordRounds(matchId, [a.userId], [1])).toBe(false);
      expect((await seat(matchId, a.userId))?.rounds).toEqual([]);
      expect(await store.recordRounds(randomUUID(), [a.userId], [1])).toBe(false);
    });

    it('una derrota no acredita nada si no se superó ninguna ronda', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      const settled = await store.settle(matchId, victory({ result: 'defeat', present: all }));
      expect(settled?.get(a.userId)).toMatchObject({ lines: [], total: 0, balance: 0, doubled: false });
      expect(await status(matchId)).toMatchObject({ status: 'finished', outcome: 'defeat' });
    });
  });

  describe('Abandono (R-39)', () => {
    it('R-39: quien sale pierde las monedas de esa partida: sus rondas no entran al libro', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2]);
      await store.abandon(matchId, c.userId);
      expect(await seat(matchId, c.userId)).toMatchObject({ exit: 'abandoned', notice: null, leftAt: NOW });
      await store.recordRounds(matchId, all, [3]);
      // Ya no se le anotan rondas.
      expect((await seat(matchId, c.userId))?.rounds).toEqual(['1', '2']);
      // Aunque el servidor la cuente entre los presentes, quien abandonó no entra en las cuentas.
      const settled = await store.settle(matchId, victory({ present: all }));
      expect(settled?.has(c.userId)).toBe(false);
      expect(await ledger(c.userId)).toEqual([]);
      expect(await coins(c.userId)).toBe(0);
      expect(await coins(a.userId)).toBe(300);
      expect(await seat(matchId, c.userId)).toMatchObject({ exit: 'abandoned' });
    });

    it('R-39: quien no volvió antes del final abandonó, y le queda el aviso para la próxima vez', async () => {
      const { a, b, c, matchId } = await trio();
      await store.recordRounds(matchId, [a.userId, b.userId, c.userId], [1, 2]);
      const settled = await store.settle(matchId, victory({ present: [a.userId, b.userId], away: [c.userId] }));
      expect(settled?.has(c.userId)).toBe(false);
      expect(await ledger(c.userId)).toEqual([]);
      expect(await seat(matchId, c.userId)).toMatchObject({ exit: 'abandoned', notice: 'left_behind' });
      expect(await store.notice(c.userId)).toBe('left_behind');
      expect(await store.notice(a.userId)).toBeNull();
    });

    it('R-39: el aviso sale una sola vez: después de verlo, ya no está', async () => {
      const { a, b, c, matchId } = await trio();
      await store.settle(matchId, victory({ present: [a.userId, b.userId], away: [c.userId] }));
      await store.noticeSeen(c.userId);
      expect(await store.notice(c.userId)).toBeNull();
      expect((await seat(matchId, c.userId))?.notice).toBeNull();
    });

    it('R-38: si se fueron todas las personas, la partida queda abandonada y nadie cobra', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      const settled = await store.settle(matchId, victory({ result: null, bonusOutcome: 'pending', away: all }));
      expect(settled?.size).toBe(0);
      expect(await status(matchId)).toMatchObject({ status: 'abandoned', outcome: null, bonusOutcome: null });
      for (const who of [a, b, c]) expect(await ledger(who.userId)).toEqual([]);
    });

    it('abandonar una partida que ya terminó no cambia nada', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      await store.settle(matchId, victory({ present: all }));
      await store.abandon(matchId, a.userId);
      expect(await seat(matchId, a.userId)).toMatchObject({ exit: 'finished' });
      expect(await stats(a.userId)).toEqual({ matches: 1, rounds: 1, wins: 1 });
    });
  });

  describe('Reinicio del servidor (R-54)', () => {
    it('R-54: al arrancar, las partidas que quedaron vivas se interrumpen y se acreditan sus rondas terminadas', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2]);
      const other = await playing(a.userId, b.userId);
      expect(await store.interrupt(null)).toBe(2);
      expect(await status(matchId)).toMatchObject({ status: 'interrupted', outcome: null, endedAt: NOW });
      expect(await status(other)).toMatchObject({ status: 'interrupted' });
      for (const who of [a, b, c]) {
        expect((await ledger(who.userId)).map((l) => [l.round, l.amount])).toEqual([
          ['1', 60],
          ['2', 120],
        ]);
        expect(await coins(who.userId)).toBe(180);
        expect(await seat(matchId, who.userId)).toMatchObject({ exit: 'interrupted', notice: 'restart' });
        expect(await store.notice(who.userId)).toBe('restart');
      }
      // No queda ninguna viva: volver a arrancar no hace nada.
      expect(await store.interrupt(null)).toBe(0);
      expect(await coins(a.userId)).toBe(180);
    });

    it('R-54: no toca las partidas que ya habían terminado', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      await store.settle(matchId, victory({ present: all }));
      expect(await store.interrupt(null)).toBe(0);
      expect(await status(matchId)).toMatchObject({ status: 'finished' });
      expect(await store.notice(a.userId)).toBeNull();
      expect(await coins(a.userId)).toBe(60);
    });

    it('R-54: quien ya había abandonado no cobra por el reinicio ni recibe su aviso', async () => {
      const { a, b, c, matchId } = await trio();
      await store.recordRounds(matchId, [a.userId, b.userId, c.userId], [1]);
      await store.abandon(matchId, c.userId);
      await store.interrupt(matchId);
      expect(await ledger(c.userId)).toEqual([]);
      expect(await seat(matchId, c.userId)).toMatchObject({ exit: 'abandoned', notice: null });
      expect(await coins(a.userId)).toBe(60);
    });

    it('R-54: si el proceso viejo intenta cerrar una partida ya interrumpida, no paga de nuevo', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2]);
      expect(await store.interrupt(matchId)).toBe(1);
      // El proceso viejo sigue un momento más durante el despliegue: supera otra ronda y termina la partida.
      expect(await store.recordRounds(matchId, all, [3])).toBe(false);
      expect(await store.settle(matchId, victory({ present: all }))).toBeNull();
      expect(await coins(a.userId)).toBe(180);
      expect(await status(matchId)).toMatchObject({ status: 'interrupted' });
      expect(await seat(matchId, a.userId)).toMatchObject({ exit: 'interrupted', rounds: ['1', '2'] });
    });

    it('R-54: interrumpir una sola partida no toca las demás', async () => {
      const { a, b, matchId } = await trio();
      const other = await playing(a.userId, b.userId);
      expect(await store.interrupt(matchId)).toBe(1);
      expect(await status(other)).toMatchObject({ status: 'playing' });
    });
  });

  describe('Logros y doble de monedas (R-55, R-29)', () => {
    it('R-55: cada logro se guarda una vez, y se dice cuáles eran nuevos', async () => {
      const { a, b, matchId } = await trio();
      const first = await store.grant(matchId, [
        { userId: a.userId, achievements: ['combo2', 'reviver'] },
        { userId: b.userId, achievements: ['combo2'] },
      ]);
      expect(Object.fromEntries(first)).toEqual({ [a.userId]: ['combo2', 'reviver'], [b.userId]: ['combo2'] });
      const second = await store.grant(matchId, [{ userId: a.userId, achievements: ['combo2', 'combo3'] }]);
      expect(Object.fromEntries(second)).toEqual({ [a.userId]: ['combo3'] });
      const rows = await db().select().from(achievements).where(eq(achievements.userId, a.userId));
      expect(rows.map((r) => [r.achievementId, r.matchId, r.unlockedAt]).sort()).toEqual([
        ['combo2', matchId, NOW],
        ['combo3', matchId, NOW],
        ['reviver', matchId, NOW],
      ]);
      expect((await readProgress(db(), a.userId)).achievements).toEqual(['combo2', 'combo3', 'reviver']);
    });

    it('R-55: los logros se mantienen aunque la persona abandone', async () => {
      const { a, matchId } = await trio();
      await store.grant(matchId, [{ userId: a.userId, achievements: ['combo2'] }]);
      await store.abandon(matchId, a.userId);
      expect((await readProgress(db(), a.userId)).achievements).toEqual(['combo2']);
    });

    it('R-29: con los 9 logros en su tabla, cada ronda paga el doble', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await giveAll(a.userId);
      await store.recordRounds(matchId, all, [1, 2, 3, 'bonus']);
      const settled = await store.settle(matchId, victory({ bonusOutcome: 'won', present: all }));
      expect(settled?.get(a.userId)).toMatchObject({ doubled: true, total: 840, balance: 840 });
      expect(settled?.get(a.userId)?.lines.map((l) => l.coins)).toEqual([120, 240, 240, 240]);
      expect(settled?.get(b.userId)).toMatchObject({ doubled: false, total: 420 });
      expect(await coins(a.userId)).toBe(840);
    });

    it('R-29: con 8 logros no hay doble: el servidor cuenta su tabla, y nada más', async () => {
      const { a, b, c, matchId } = await trio();
      await giveAll(a.userId, ['untouched']);
      await store.recordRounds(matchId, [a.userId], [1]);
      const settled = await store.settle(matchId, victory({ present: [a.userId, b.userId, c.userId] }));
      expect(settled?.get(a.userId)).toMatchObject({ doubled: false, total: 60 });
    });

    it('D-103: el logro que completa el amuleto en esa partida ya duplica su pago', async () => {
      const { a, b, c, matchId } = await trio();
      await giveAll(a.userId, ['bonusWon']);
      await store.recordRounds(matchId, [a.userId], [1, 2, 3, 'bonus']);
      await store.grant(matchId, [{ userId: a.userId, achievements: ['bonusWon'] }]);
      const settled = await store.settle(
        matchId,
        victory({ bonusOutcome: 'won', present: [a.userId, b.userId, c.userId] }),
      );
      expect(settled?.get(a.userId)).toMatchObject({ doubled: true, total: 840 });
      expect(settled?.get(a.userId)?.achievements).toEqual([...ACHIEVEMENT_IDS]);
    });

    it('R-54: el doble también vale para lo que se acredita por un reinicio', async () => {
      const { a, matchId } = await trio();
      await giveAll(a.userId);
      await store.recordRounds(matchId, [a.userId], [1]);
      await store.interrupt(matchId);
      expect(await coins(a.userId)).toBe(120);
    });
  });

  describe('Estadísticas privadas (R-42)', () => {
    it('R-42: la victoria suma una partida, una victoria y sus rondas; la derrota, la partida y sus rondas', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1, 2, 3]);
      await store.settle(matchId, victory({ present: all }));
      expect(await stats(a.userId)).toEqual({ matches: 1, rounds: 3, wins: 1 });
      const lost = await playing(a.userId, b.userId);
      await store.recordRounds(lost, [a.userId, b.userId], [1]);
      await store.settle(lost, victory({ result: 'defeat', present: [a.userId, b.userId] }));
      expect(await stats(a.userId)).toEqual({ matches: 2, rounds: 4, wins: 1 });
      expect(await stats(c.userId)).toEqual({ matches: 1, rounds: 3, wins: 1 });
    });

    it('R-42: la abandonada cuenta como jugada y no ganada, y la perdida por un reinicio no cuenta', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      await store.abandon(matchId, a.userId);
      await store.recordRounds(matchId, all, [2]);
      await store.settle(matchId, victory({ present: [b.userId], away: [c.userId] }));
      expect(await stats(a.userId)).toEqual({ matches: 1, rounds: 1, wins: 0 });
      expect(await stats(b.userId)).toEqual({ matches: 1, rounds: 2, wins: 1 });
      expect(await stats(c.userId)).toEqual({ matches: 1, rounds: 2, wins: 0 });
      const cut = await playing(a.userId, b.userId);
      await store.recordRounds(cut, [a.userId, b.userId], [1]);
      await store.interrupt(cut);
      expect(await stats(a.userId)).toEqual({ matches: 1, rounds: 2, wins: 0 });
    });

    it('R-42: las estadísticas viajan con el progreso de su dueño, y solo con el suyo', async () => {
      const { a, b, c, matchId } = await trio();
      await store.recordRounds(matchId, [a.userId], [1]);
      await store.settle(matchId, victory({ present: [a.userId, b.userId, c.userId] }));
      const get = (cookie: string) =>
        server.app.inject({ method: 'GET', url: '/api/progress', cookies: { [SESSION_COOKIE]: cookie } });
      expect((await get(a.cookie)).json()).toMatchObject({
        coins: 60,
        stats: { classic: { matches: 1, rounds: 1, wins: 1 }, storm: { matches: 0, rounds: 0, wins: 0 } },
      });
      expect((await get(b.cookie)).json()).toMatchObject({ coins: 0, stats: { classic: { matches: 1, rounds: 0 } } });
    });
  });

  describe('Cuentas borradas (D-56)', () => {
    const erase = (cookie: string) =>
      server.app.inject({
        method: 'POST',
        url: '/api/auth/delete',
        headers: { origin: APP_ORIGIN },
        cookies: { [SESSION_COOKIE]: cookie },
        payload: { password: 'Tundra7#Oso' },
      });

    it('D-56: si una cuenta se borra a mitad de la partida, las cuentas de los demás se hacen igual', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      expect((await erase(c.cookie)).statusCode).toBe(204);
      // Su lugar quedó anónimo, como el del bot.
      const seats = await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
      expect(seats.find((s) => s.seat === 'snow')).toMatchObject({ userId: null });
      expect(await store.recordRounds(matchId, all, [2])).toBe(true);
      expect(Object.fromEntries(await store.grant(matchId, [{ userId: c.userId, achievements: ['combo2'] }]))).toEqual(
        {},
      );
      const settled = await store.settle(matchId, victory({ present: all }));
      expect([...(settled?.keys() ?? [])].sort()).toEqual([a.userId, b.userId].sort());
      expect(await coins(a.userId)).toBe(180);
      expect(
        (await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId))).every((s) => s.exit),
      ).toBe(true);
    });

    it('D-56: al borrar la cuenta se borran sus logros y sus estadísticas, y su lugar en las partidas queda anónimo', async () => {
      const { a, b, c, matchId } = await trio();
      const all = [a.userId, b.userId, c.userId];
      await store.recordRounds(matchId, all, [1]);
      await store.grant(matchId, [{ userId: a.userId, achievements: ['combo2'] }]);
      await store.settle(matchId, victory({ present: all }));
      await erase(a.cookie);
      expect(await db().select().from(users).where(eq(users.id, a.userId))).toEqual([]);
      expect(await db().select().from(achievements).where(eq(achievements.userId, a.userId))).toEqual([]);
      expect(await db().select().from(playerStats).where(eq(playerStats.userId, a.userId))).toEqual([]);
      expect(await db().select().from(coinLedger).where(eq(coinLedger.userId, a.userId))).toEqual([]);
      // La partida sigue ahí, para quienes la jugaron con esa persona.
      expect(await status(matchId)).toMatchObject({ status: 'finished' });
      const seats = await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
      expect(
        seats
          .map((s) => s.userId)
          .filter(Boolean)
          .sort(),
      ).toEqual([b.userId, c.userId].sort());
    });
  });
});
