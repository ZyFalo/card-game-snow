import { ACHIEVEMENT_IDS } from '@ventisca/core';
import { CLOSE, playStatusSchema, progressSchema } from '@ventisca/protocol';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '../src/accounts/session';
import { dbStore } from '../src/play/store';
import { coinLedger, matches, matchPlayers } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';
import { APP_ORIGIN, startServer, type TestClient, type TestServer } from './support/play';
import { board } from './support/world';

/*
 * El juego en línea de punta a punta, contra el servidor de verdad: cuentas con sesión, conexiones
 * WebSocket y Postgres. Los plazos van acortados para que las pruebas no esperen.
 */
describe.skipIf(!adminUrl)('Juego en línea, de punta a punta (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  // Con sockets y relojes de verdad, cada prueba puede tardar más que las demás.
  vi.setConfig({ testTimeout: 30_000 });
  const timings = { turnMs: 600, graceMs: 50, watchMs: 400, offerMs: 150, emptyMs: 500 };
  /** La última ronda, con un gólem a punto de caer junto a Brasa: un golpe y la partida se gana. */
  const lastBlow = board({
    round: 3,
    ninjas: { fire: { at: [3, 2] }, snow: { everKo: true } },
    golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
  });
  let server: TestServer;
  beforeEach(async () => {
    server = await startServer(ctx.database, { playTimings: timings, matchPrepare: lastBlow, matchSeed: () => 7 });
  });
  afterEach(async () => {
    await server.close();
  });

  const db = () => ctx.database.db;
  const status = async (cookie: string | null) => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/play/status',
      ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    });
    return { code: res.statusCode, body: res.json() as unknown };
  };

  /** Dos personas en una sala, con la partida empezada: Ana con Fuego, Beto con Agua y el bot con Nieve. */
  async function started() {
    const a = await server.signUp('fire');
    const b = await server.signUp('water');
    const ana = await server.connect(a.cookie);
    const beto = await server.connect(b.cookie);
    // El saludo y el inicio en línea: así lo que llegue después es de la sala o de la partida.
    for (const client of [ana, beto]) await client.next('idle');
    ana.send({ type: 'room.create', element: 'fire' });
    const { code } = await ana.next('room.state');
    beto.send({ type: 'room.join', code, element: 'water' });
    await beto.next('room.state');
    ana.send({ type: 'room.start' });
    const start = await ana.next('match.start');
    await beto.next('match.start');
    return { a, b, ana, beto, code, matchId: start.matchId };
  }

  const ready = (clients: TestClient[], turn: number) => {
    for (const c of clients) c.send({ type: 'turn.ready', turn });
  };
  const progress = async (cookie: string) =>
    progressSchema.parse(
      (await server.app.inject({ method: 'GET', url: '/api/progress', cookies: { [SESSION_COOKIE]: cookie } })).json(),
    );

  it('dos personas juegan una partida completa desde una sala, con el bot en el ninja libre', async () => {
    const { ana, beto, code, matchId } = await started();
    ready([ana, beto], 0);
    const turn = await ana.next('turn.start');
    expect(turn).toMatchObject({ turn: 1, endsInMs: 600 });
    expect(turn.seats.map((s) => s.kind)).toEqual(['human', 'human', 'bot']);
    ana.send({ type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    expect(await beto.next('team.plan')).toMatchObject({ ninja: 'fire', ready: true });
    beto.send({ type: 'plan.confirm', turn: 1, plan: {} });
    for (const client of [ana, beto]) {
      expect((await client.next('turn.result')).state).toMatchObject({ status: 'victory', seed: 0, rng: 0 });
      // El resultado trae las monedas de la ronda, ya acreditadas, y el avance de sus logros: esta vez, nada.
      const end = await client.next('match.end');
      expect(end).toMatchObject({
        result: 'victory',
        coins: { lines: [{ round: 3, coins: 120 }], doubled: false, total: 120 },
        gained: {},
        completed: [],
        balance: 120,
        room: code,
      });
      expect(Object.values(end.achievements)).toEqual(ACHIEVEMENT_IDS.map(() => ({ count: 0, done: false })));
      // De vuelta en la sala, lista para otra partida.
      expect(await client.next('room.state')).toMatchObject({ code, start: 'bot' });
    }
    const [match] = await db().select().from(matches).where(eq(matches.id, matchId));
    expect(match).toMatchObject({
      roomCode: code,
      difficulty: 'classic',
      seed: 7,
      status: 'finished',
      outcome: 'victory',
      bonusOutcome: 'missed',
      turns: 1,
    });
    expect(match?.endedAt).not.toBeNull();
    const players = await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    expect(players.map((p) => [p.seat, p.userId !== null, p.exit, p.rounds]).sort()).toEqual([
      ['fire', true, 'finished', ['3']],
      ['snow', false, 'finished', []],
      ['water', true, 'finished', ['3']],
    ]);
  });

  it('R-40: al terminar la partida, las monedas ya están en la cuenta de cada persona, una sola vez', async () => {
    const { a, b, ana, beto, matchId } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    ana.send({ type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    beto.send({ type: 'plan.confirm', turn: 1, plan: {} });
    await ana.next('match.end');
    await beto.next('match.end');
    for (const who of [a, b]) {
      expect(await progress(who.cookie)).toMatchObject({
        coins: 120,
        stats: { classic: { matches: 1, rounds: 1, wins: 1 } },
      });
    }
    const rows = await db().select().from(coinLedger).where(eq(coinLedger.matchId, matchId));
    expect(rows.map((r) => [r.round, r.amount])).toEqual([
      ['3', 120],
      ['3', 120],
    ]);
  });

  it('R-55: el avance de los logros se guarda cuando ocurre y llega con el progreso de cada quien', async () => {
    await server.close();
    server = await startServer(ctx.database, {
      playTimings: timings,
      matchPrepare: board({
        ninjas: { fire: { at: [3, 1], hand: [10] }, water: { at: [3, 3], hand: [9] } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { a, b, ana, beto } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    const at = { x: 4, y: 2 };
    ana.send({ type: 'plan.confirm', turn: 1, plan: { action: { type: 'card', cardId: 'fire-m1', at } } });
    beto.send({ type: 'plan.confirm', turn: 1, plan: { action: { type: 'card', cardId: 'water-m1', at } } });
    expect((await ana.next('turn.result')).events.some((e) => e.t === 'combo')).toBe(true);
    // La partida sigue, y el avance ya está en la cuenta de cada quien: Ana, con Brasa, aturdió y quemó al
    // coloso; Beto, con Marea, les dio Potencia a sus dos compañeros.
    const mine = (await progress(a.cookie)).achievements;
    expect(mine.stunner).toEqual({ count: 1, done: false });
    expect(mine.blaze).toEqual({ count: 1, done: false });
    expect(mine.highTide).toEqual({ count: 0, done: false });
    const his = (await progress(b.cookie)).achievements;
    expect(his.highTide).toEqual({ count: 2, done: false });
    expect(his.stunner).toEqual({ count: 0, done: false });
  });

  it('R-54: si el servidor se apaga a mitad de una partida, se acreditan las rondas terminadas y cada quien se entera al volver', async () => {
    await server.close();
    const round2 = board({
      round: 2,
      ninjas: { fire: { at: [3, 2] }, snow: { everKo: true } },
      golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
    });
    server = await startServer(ctx.database, { playTimings: timings, matchPrepare: round2 });
    const { a, ana, beto, matchId } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    ana.send({ type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    beto.send({ type: 'plan.confirm', turn: 1, plan: {} });
    expect((await ana.next('turn.result')).state).toMatchObject({ status: 'playing', round: 3 });
    // Todavía no cobró: las monedas de la ronda 2 están pendientes.
    expect((await progress(a.cookie)).coins).toBe(0);

    await server.close();
    expect(await ana.closed).toBe(CLOSE.restart);
    const [match] = await db().select().from(matches).where(eq(matches.id, matchId));
    expect(match).toMatchObject({ status: 'interrupted', outcome: null });

    // El servidor vuelve a arrancar, con la misma base.
    server = await startServer(ctx.database, { playTimings: timings });
    expect(await dbStore(db()).interrupt(null)).toBe(0);
    expect(await progress(a.cookie)).toMatchObject({
      coins: 120,
      stats: { classic: { matches: 0, rounds: 1, wins: 0 } },
    });
    const back = await server.connect(a.cookie);
    expect(await back.next('idle')).toMatchObject({ reason: null, notice: 'restart' });
    // El aviso sale una sola vez.
    back.send({ type: 'notice.seen' });
    await back.close();
    const again = await server.connect(a.cookie);
    expect(await again.next('idle')).toMatchObject({ notice: null });
  });

  it('R-39: quien sale con «Salir» pierde las monedas pendientes de esa partida', async () => {
    await server.close();
    const round2 = board({
      round: 2,
      ninjas: { fire: { at: [3, 2] }, snow: { everKo: true } },
      golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
    });
    server = await startServer(ctx.database, { playTimings: timings, matchPrepare: round2 });
    const { a, b, ana, beto } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    ana.send({ type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    beto.send({ type: 'plan.confirm', turn: 1, plan: {} });
    await ana.next('turn.result');
    ana.send({ type: 'match.leave' });
    await ana.next('idle');
    // El servidor se apaga: a Beto se le acredita la ronda; a Ana, que abandonó, no.
    await server.close();
    server = await startServer(ctx.database, { playTimings: timings });
    expect((await progress(a.cookie)).coins).toBe(0);
    expect((await progress(b.cookie)).coins).toBe(120);
    expect((await progress(a.cookie)).stats.classic).toEqual({ matches: 1, rounds: 1, wins: 0 });
  });

  it('R-36: sin confirmar, el turno se resuelve solo al vencer el reloj del servidor', async () => {
    const { ana, beto } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    const before = Date.now();
    const result = await ana.next('turn.result');
    expect(Date.now() - before).toBeGreaterThanOrEqual(timings.turnMs - 100);
    expect(result.turn).toBe(1);
  });

  it('D-88: la cola ofrece el bot a dos personas, y la partida empieza cuando aceptan las dos', async () => {
    const ana = await server.connect((await server.signUp('fire')).cookie);
    const beto = await server.connect((await server.signUp('water')).cookie);
    ana.send({ type: 'queue.join', element: 'fire' });
    beto.send({ type: 'queue.join', element: 'water' });
    const offered = async (client: TestClient) => {
      for (;;) {
        const state = await client.next('queue.state');
        if (state.offer) return state;
      }
    };
    expect((await offered(ana)).offer).toMatchObject({ bot: 'snow', accepted: false });
    await offered(beto);
    ana.send({ type: 'queue.acceptBot' });
    beto.send({ type: 'queue.acceptBot' });
    expect(await ana.next('match.start')).toMatchObject({ you: 'fire', room: null });
    expect(await beto.next('match.start')).toMatchObject({ you: 'water', room: null });
  });

  it('R-38: quien pierde la conexión queda como desconectado, y al volver recibe su partida', async () => {
    const { a, ana, beto } = await started();
    ready([ana, beto], 0);
    await beto.next('turn.start');
    expect(await status(a.cookie)).toEqual({ code: 200, body: { match: 'here' } });
    await ana.close();
    expect(await beto.next('player.status')).toMatchObject({ ninja: 'fire', status: 'away' });
    expect(playStatusSchema.parse((await status(a.cookie)).body)).toEqual({ match: 'away' });
    const again = await server.connect(a.cookie);
    expect(await again.next('match.resume')).toMatchObject({ you: 'fire' });
    expect(await beto.next('player.status')).toMatchObject({ ninja: 'fire', status: 'here' });
    expect((await status(a.cookie)).body).toEqual({ match: 'here' });
  });

  it('R-38: si se van las dos, la partida termina sola a los 2 minutos y queda como abandonada', async () => {
    const { ana, beto, matchId, a } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    await ana.close();
    await beto.close();
    await expect
      .poll(async () => (await db().select().from(matches).where(eq(matches.id, matchId)))[0]?.status, {
        timeout: 5000,
      })
      .toBe('abandoned');
    const players = await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    expect(players.filter((p) => p.userId !== null).map((p) => p.exit)).toEqual(['abandoned', 'abandoned']);
    expect((await status(a.cookie)).body).toEqual({ match: null });
  });

  it('R-39: quien sale con «Salir» queda libre, y su lugar en la partida queda como abandono', async () => {
    const { a, ana, beto, matchId } = await started();
    ready([ana, beto], 0);
    await ana.next('turn.start');
    ana.send({ type: 'match.leave' });
    expect(await ana.next('idle')).toMatchObject({ reason: null });
    expect(await beto.next('player.status')).toMatchObject({ ninja: 'fire', status: 'left' });
    expect((await status(a.cookie)).body).toEqual({ match: null });
    // Beto termina la partida solo: el gólem sigue ahí, así que deja pasar turnos hasta salir también.
    beto.send({ type: 'match.leave' });
    await expect
      .poll(async () => (await db().select().from(matches).where(eq(matches.id, matchId)))[0]?.status, {
        timeout: 5000,
      })
      .toBe('abandoned');
  });

  it('el estado de la partida solo se le dice a quien tiene sesión', async () => {
    expect(await status(null)).toEqual({ code: 401, body: { error: { code: 'unauthorized' } } });
    const { cookie } = await server.signUp('fire');
    expect(await status(cookie)).toEqual({ code: 200, body: { match: null } });
  });

  it('D-102: al cerrar la sesión, se cierra también la conexión de juego', async () => {
    const { cookie } = await server.signUp('fire');
    const client = await server.connect(cookie);
    await client.next('idle');
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: APP_ORIGIN },
      cookies: { [SESSION_COOKIE]: cookie },
    });
    expect(res.statusCode).toBe(204);
    expect(await client.closed).toBe(CLOSE.sessionEnded);
    // Con esa cookie ya no se abre otra.
    expect((await server.refused(cookie)).status).toBe(401);
  });

  it('D-56: al borrar la cuenta, su conexión se cierra y su lugar en la partida queda anónimo', async () => {
    const { a, ana, beto, matchId } = await started();
    ready([ana, beto], 0);
    await beto.next('turn.start');
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/auth/delete',
      headers: { origin: APP_ORIGIN },
      cookies: { [SESSION_COOKIE]: a.cookie },
      payload: { password: 'Tundra7#Oso' },
    });
    expect(res.statusCode).toBe(204);
    expect(await ana.closed).toBe(CLOSE.sessionEnded);
    expect(await beto.next('player.status')).toMatchObject({ ninja: 'fire', status: 'away' });
    const players = await db().select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    expect(players.find((p) => p.seat === 'fire')?.userId).toBeNull();
    // La partida sigue para Beto, y termina sin fallar aunque esa cuenta ya no exista.
    beto.send({ type: 'match.leave' });
    await expect
      .poll(async () => (await db().select().from(matches).where(eq(matches.id, matchId)))[0]?.status, {
        timeout: 5000,
      })
      .toBe('abandoned');
  });
});
