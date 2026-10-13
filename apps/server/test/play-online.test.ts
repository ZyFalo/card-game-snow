import { CLOSE, playStatusSchema } from '@ventisca/protocol';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/accounts/session';
import { matches, matchPlayers } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';
import { APP_ORIGIN, startServer, type TestClient, type TestServer } from './support/play';
import { board } from './support/world';

/*
 * El juego en línea de punta a punta, contra el servidor de verdad: cuentas con sesión, conexiones
 * WebSocket y Postgres. Los plazos van acortados para que las pruebas no esperen.
 */
describe.skipIf(!adminUrl)('Juego en línea, de punta a punta (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
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
      expect(await client.next('match.end')).toMatchObject({ result: 'victory', room: code });
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
    expect(players.map((p) => [p.seat, p.userId !== null, p.exit]).sort()).toEqual([
      ['fire', true, 'finished'],
      ['snow', false, 'finished'],
      ['water', true, 'finished'],
    ]);
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
