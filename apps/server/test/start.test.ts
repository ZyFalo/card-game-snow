import { randomUUID } from 'node:crypto';
import { type AddressInfo, createServer } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { dbStore } from '../src/play/store';
import { coinLedger, matches, matchPlayers } from '../src/schema';
import { type Running, start } from '../src/start';
import { adminUrl, useTempDatabase } from './support/database';
import { APP_ORIGIN, SECRET, startServer } from './support/play';

/*
 * El arranque del servidor (`start.ts`), contra un Postgres de verdad: lo que hace al levantarse con
 * partidas que un reinicio dejó a medias (R-54), y que se apaga del todo, para poder arrancarlo otra vez.
 */
describe.skipIf(!adminUrl)('Arranque del servidor (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  let running: Running | null = null;
  afterEach(async () => {
    await running?.stop();
    running = null;
  });

  /** Un puerto libre: el arranque exige uno de verdad. */
  async function freePort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return port;
  }

  const env = (port: number) => ({
    NODE_ENV: 'test',
    DATABASE_URL: ctx.url,
    SESSION_SECRET: SECRET,
    APP_URL: APP_ORIGIN,
    HOST: '127.0.0.1',
    PORT: String(port),
    LOG_LEVEL: 'silent',
  });

  const health = (port: number) => fetch(`http://127.0.0.1:${port}/api/health`);

  /** Una cuenta con su camino, creada con un servidor de paso, y una partida suya que quedó viva. */
  async function leftAlive() {
    const server = await startServer(ctx.database);
    const who = await server.signUp('fire');
    // Se suelta sin apagarlo en orden, como un proceso que muere: la partida queda viva en la base.
    await server.app.close();
    const store = dbStore(ctx.database.db);
    const matchId = randomUUID();
    await store.openMatch({
      id: matchId,
      roomCode: null,
      difficulty: 'classic',
      seed: 7,
      seats: (['fire', 'water', 'snow'] as const).map((element, i) => ({
        element,
        userId: i === 0 ? who.userId : null,
      })),
    });
    await store.recordRounds(matchId, [who.userId], [1]);
    return { who, matchId, store };
  }

  it('R-54: al arrancar, da por interrumpidas las partidas que quedaron vivas y acredita sus rondas terminadas', async () => {
    const { who, matchId, store } = await leftAlive();
    const db = ctx.database.db;
    expect(await db.select().from(coinLedger).where(eq(coinLedger.userId, who.userId))).toEqual([]);

    const port = await freePort();
    running = await start({}, env(port));

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    expect(match).toMatchObject({ status: 'interrupted', outcome: null });
    const ledger = await db.select().from(coinLedger).where(eq(coinLedger.userId, who.userId));
    expect(ledger.map((l) => [l.round, l.amount])).toEqual([['1', 60]]);
    const seats = await db.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    expect(seats.find((s) => s.userId === who.userId)).toMatchObject({ exit: 'interrupted', notice: 'restart' });
    expect(await store.notice(who.userId)).toBe('restart');
  });

  it('atiende en su puerto, y al apagarse deja de atender; apagarlo dos veces no falla', async () => {
    const port = await freePort();
    running = await start({}, env(port));
    const res = await health(port);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: 'ok' });

    await running.stop();
    await running.stop();
    await expect(health(port)).rejects.toThrow();
  });

  it('se puede arrancar otra vez en el mismo puerto, y las señales del proceso no se acumulan', async () => {
    const port = await freePort();
    const before = process.listenerCount('SIGTERM');
    running = await start({}, env(port));
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    await running.stop();
    expect(process.listenerCount('SIGTERM')).toBe(before);

    running = await start({}, env(port));
    expect((await health(port)).status).toBe(200);
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    expect(process.listenerCount('SIGINT')).toBe(process.listenerCount('SIGTERM'));
  });
});
