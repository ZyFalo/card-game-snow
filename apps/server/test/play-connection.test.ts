import { PassThrough } from 'node:stream';
import { CLOSE, PLAY_LIMITS, PLAY_PATH, PROTOCOL_VERSION } from '@ventisca/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fingerprint } from '../src/accounts/tokens';
import { privateLogger } from '../src/app';
import { sessions, users } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';
import { APP_ORIGIN, SECRET, startServer, type TestServer } from './support/play';

/*
 * La conexión del juego en línea (D-102): quién puede abrirla y qué la cierra. Contra el servidor de
 * verdad, escuchando en un puerto, y con un Postgres de verdad para las sesiones.
 */
describe.skipIf(!adminUrl)('Conexión del juego en línea (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  let server: TestServer;
  beforeEach(async () => {
    server = await startServer(ctx.database);
  });
  afterEach(async () => {
    await server.close();
  });

  describe('Quién puede abrirla', () => {
    it('D-65: sin Origin no se abre, aunque traiga una sesión válida', async () => {
      const { cookie } = await server.signUp();
      expect(await server.refused(cookie, {})).toEqual({ status: 403, body: { error: { code: 'bad_origin' } } });
    });

    it('D-65: desde otro sitio, otro subdominio, otro puerto u otro esquema no se abre', async () => {
      const { cookie } = await server.signUp();
      for (const origin of [
        'https://sitio-ajeno.example',
        'https://portafolio.ventisca.test',
        'https://ventisca.test:8443',
        'http://ventisca.test',
        'null',
      ]) {
        expect(await server.refused(cookie, { origin }), origin).toEqual({
          status: 403,
          body: { error: { code: 'bad_origin' } },
        });
      }
    });

    it('D-65: el origen se comprueba antes que la sesión: a otro sitio no se le dice si hay sesión', async () => {
      const refused = await server.refused(null, { origin: 'https://sitio-ajeno.example' });
      expect(refused).toEqual({ status: 403, body: { error: { code: 'bad_origin' } } });
    });

    it('sin sesión no se abre', async () => {
      expect(await server.refused(null)).toEqual({ status: 401, body: { error: { code: 'unauthorized' } } });
      expect(await server.refused('una-cookie-inventada')).toEqual({
        status: 401,
        body: { error: { code: 'unauthorized' } },
      });
    });

    it('con una sesión vencida no se abre', async () => {
      const { cookie, userId } = await server.signUp();
      await ctx.database.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
      expect((await server.refused(cookie)).status).toBe(401);
      expect(userId).toBeTruthy();
    });

    it('R-44: sin verificar el correo no se abre', async () => {
      const [user] = await ctx.database.db
        .insert(users)
        .values({
          email: 'sin-verificar@example.com',
          passwordHash: 'x',
          displayName: 'Sin verificar',
          displayNameKey: 'sin verificar',
        })
        .returning();
      const token = 'token-de-prueba';
      await ctx.database.db.insert(sessions).values({
        id: fingerprint(SECRET, 'session', token),
        userId: user?.id as string,
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await server.refused(token)).toEqual({ status: 403, body: { error: { code: 'email_not_verified' } } });
    });

    it('con sesión, correo verificado y el origen del juego, se abre y saluda', async () => {
      const { cookie, name } = await server.signUp();
      const client = await server.connect(cookie);
      expect(await client.next('welcome')).toMatchObject({ v: PROTOCOL_VERSION, seq: 0, name });
      // Enseguida dice dónde está la persona: en el inicio en línea.
      expect(await client.next('idle')).toMatchObject({ seq: 1, reason: null, notice: null });
    });

    it('en desarrollo también vale el origen del cliente de Vite', async () => {
      await server.close();
      server = await startServer(ctx.database, { devOrigin: 'http://localhost:5173' });
      const { cookie } = await server.signUp();
      const client = await server.connect(cookie, { origin: 'http://localhost:5173' });
      expect((await client.next('welcome')).type).toBe('welcome');
    });

    it('una petición normal a esa ruta, sin pedir un WebSocket, no encuentra nada', async () => {
      const { cookie } = await server.signUp();
      const res = await server.app.inject({
        method: 'GET',
        url: PLAY_PATH,
        headers: { origin: APP_ORIGIN },
        cookies: { ventisca_session: cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Una conexión por cuenta', () => {
    it('D-102: una conexión nueva de la misma cuenta cierra la anterior', async () => {
      const { cookie } = await server.signUp();
      const first = await server.connect(cookie);
      await first.next('idle');
      const second = await server.connect(cookie);
      expect(await first.closed).toBe(CLOSE.replaced);
      expect((await second.next('welcome')).type).toBe('welcome');
      // La que se cerró no deja a la cuenta sin conexión: la nueva sigue respondiendo.
      const seq = second.send({ type: 'queue.leave' });
      expect(await second.next('error')).toMatchObject({ re: seq });
    });

    it('dos cuentas distintas no se estorban', async () => {
      const a = await server.connect((await server.signUp()).cookie);
      const b = await server.connect((await server.signUp()).cookie);
      await a.next('idle');
      await b.next('idle');
      expect(a.socket.readyState).toBe(a.socket.OPEN);
      expect(b.socket.readyState).toBe(b.socket.OPEN);
    });
  });

  describe('Límites y mensajes mal hechos', () => {
    const connected = async () => {
      const client = await server.connect((await server.signUp()).cookie);
      await client.next('idle');
      return client;
    };

    it('D-102: un mensaje más grande que el límite cierra la conexión', async () => {
      const client = await connected();
      client.raw(JSON.stringify({ v: PROTOCOL_VERSION, seq: 0, type: 'queue.leave', relleno: 'x'.repeat(4096) }));
      // 1009: "mensaje demasiado grande" (RFC 6455).
      expect(await client.closed).toBe(1009);
    });

    it('D-102: una ráfaga corta pasa entera, y cada mensaje tiene su respuesta', async () => {
      const client = await connected();
      for (let i = 0; i < PLAY_LIMITS.burst; i++) client.send({ type: 'queue.leave' });
      for (let i = 0; i < PLAY_LIMITS.burst; i++) expect(await client.next('error')).toMatchObject({ re: i });
      expect(client.socket.readyState).toBe(client.socket.OPEN);
    });

    it('D-102: quien manda más mensajes que el límite recibe el aviso y se queda sin conexión', async () => {
      const client = await connected();
      for (let i = 0; i < PLAY_LIMITS.burst + 5; i++) client.send({ type: 'queue.leave' });
      expect(await client.closed).toBe(CLOSE.rateLimited);
      expect(client.received.at(-1)).toMatchObject({ type: 'error', code: 'rate_limited' });
    });

    it('un mensaje que no cumple el protocolo cierra la conexión', async () => {
      for (const bad of [
        'esto no es JSON',
        '{}',
        JSON.stringify({ v: PROTOCOL_VERSION, seq: 0, type: 'hacer.trampa' }),
        JSON.stringify({ v: PROTOCOL_VERSION, seq: 0, type: 'queue.join', element: 'tierra' }),
        JSON.stringify({ v: PROTOCOL_VERSION, seq: 0, type: 'queue.leave', extra: true }),
      ]) {
        const client = await connected();
        client.raw(bad);
        expect(await client.closed, bad).toBe(CLOSE.protocol);
        expect(client.received.at(-1), bad).toMatchObject({ type: 'error', code: 'bad_message' });
      }
    });

    it('un mensaje binario tampoco vale, aunque por dentro sea un mensaje bien hecho', async () => {
      const client = await connected();
      client.socket.send(Buffer.from(JSON.stringify({ v: PROTOCOL_VERSION, seq: 0, type: 'queue.leave' })), {
        binary: true,
      });
      expect(await client.closed).toBe(CLOSE.protocol);
      expect(client.received.at(-1)).toMatchObject({ type: 'error', code: 'bad_message' });
    });

    it('a un cliente de otra versión del protocolo se le dice que es de otra versión', async () => {
      const client = await connected();
      client.raw(JSON.stringify({ v: PROTOCOL_VERSION + 1, seq: 0, type: 'queue.leave' }));
      expect(await client.closed).toBe(CLOSE.protocol);
      expect(client.received.at(-1)).toMatchObject({ type: 'error', code: 'protocol_version' });
    });

    it('cada respuesta lleva la versión, su número de secuencia y a qué mensaje responde', async () => {
      const client = await connected();
      const seq = client.send({ type: 'room.leave' });
      const error = await client.next('error');
      expect(error).toMatchObject({ v: PROTOCOL_VERSION, re: seq, code: 'not_now' });
      expect(client.received.map((m) => m.seq)).toEqual([0, 1, 2]);
    });
  });

  describe('Registros sin datos personales', () => {
    it('al abrir y al rechazar una conexión no queda ni el nombre, ni el correo, ni la cookie, ni la IP', async () => {
      await server.close();
      const lines: string[] = [];
      const stream = new PassThrough();
      stream.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
      server = await startServer(ctx.database, { logger: privateLogger('info', stream) });
      const { cookie, name, email, userId } = await server.signUp();
      const client = await server.connect(cookie);
      await client.next('idle');
      await server.refused(cookie, { origin: 'https://sitio-ajeno.example' });
      await client.close();
      // La dirección en la que escucha el propio servidor no es un dato de nadie.
      const log = lines
        .join('')
        .split('\n')
        .filter((line) => !line.includes('Server listening'))
        .join('\n');
      expect(log).toContain(PLAY_PATH);
      for (const secret of [name, email, cookie, userId, '127.0.0.1']) expect(log, secret).not.toContain(secret);
    });
  });
});
