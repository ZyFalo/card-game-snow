import fastifyWebsocket from '@fastify/websocket';
import {
  apiError,
  CLOSE,
  clientMessageSchema,
  PLAY_LIMITS,
  PLAY_PATH,
  type PlayStatus,
  PROTOCOL_VERSION,
} from '@ventisca/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sessionReader } from '../accounts/session';
import type { Db } from '../db';
import type { Hub } from './hub';
import { Bucket, type Player, SocketLink } from './link';

/*
 * La conexión del juego en línea (PRD de v2, "Protocolo de mensajes"): un WebSocket en `PLAY_PATH`.
 *
 * Antes de abrirla, el servidor comprueba tres cosas, en este orden:
 * 1. Que viene del propio juego. La guarda de D-65 no revisa las lecturas, y una conexión WebSocket
 *    empieza con una (`GET`): aquí la comprobación es propia, y más estricta. Un navegador siempre dice
 *    desde qué página abre un WebSocket, y una página no puede falsificarlo. Sin `Origin`, o con otro, no
 *    se abre: así una página de otro sitio no puede jugar con la cookie de quien la visita.
 * 2. Que trae una sesión vigente, con la misma cookie de la API.
 * 3. Que la cuenta verificó su correo (R-44).
 *
 * Si algo falla, la conexión no llega a abrirse: se responde con un error HTTP.
 */

export interface PlayOptions {
  db: Db;
  /** SESSION_SECRET. */
  secret: string;
  /** Los orígenes exactos desde los que se sirve el juego: `APP_URL` y, en desarrollo, el de Vite. */
  origins: readonly string[];
  hub: Hub;
  /** Reloj; las pruebas lo fijan. */
  now?: () => Date;
  /** Cada cuánto se comprueba que cada conexión sigue viva. */
  heartbeatMs?: number;
}

/** Por defecto, cada 20 s: también mantiene abierta la conexión ante los proxies que cierran las ociosas. */
const HEARTBEAT_MS = 20_000;

export async function playRoutes(app: FastifyInstance, opts: PlayOptions) {
  const { db, secret, hub } = opts;
  const now = opts.now ?? (() => new Date());
  const allowed = new Set(opts.origins);
  const sessionUser = sessionReader(db, secret, now);
  /** Quién abre cada conexión: lo dejó la comprobación previa. */
  const players = new WeakMap<FastifyRequest['raw'], Player>();
  /** Las conexiones abiertas y si respondieron al último latido. */
  const alive = new Map<{ ping(): void; terminate(): void }, boolean>();

  await app.register(fastifyWebsocket, {
    // `maxPayload`: un mensaje más grande cierra la conexión (código 1009) sin llegar a leerse entero.
    options: { maxPayload: PLAY_LIMITS.maxMessageBytes },
    // Al apagarse el servidor, antes de soltar las conexiones: las partidas en curso se interrumpen, con
    // sus cuentas (R-54), y a cada cliente se le dice por qué se cierra, para que vuelva a conectarse.
    preClose: async () => {
      await hub.shutdown();
      for (const client of app.websocketServer.clients) client.close(CLOSE.restart);
      await new Promise<void>((resolve) => app.websocketServer.close(() => resolve()));
    },
  });

  const heartbeat = setInterval(() => {
    for (const [socket, answered] of alive) {
      if (!answered) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, opts.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
  });

  /** ¿Tiene esta cuenta una partida en curso? Para volver a ella al abrir el juego (R-38). */
  app.get(`${PLAY_PATH}/status`, async (req, reply) => {
    const current = await sessionUser(req);
    if (!current) return reply.code(401).send(apiError('unauthorized'));
    const status = hub.statusOf(current.user.id);
    const body: PlayStatus = { match: status === 'left' ? null : status };
    return body;
  });

  app.get(
    PLAY_PATH,
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const origin = req.headers.origin;
        if (origin === undefined || !allowed.has(origin)) {
          req.log.warn({ origin: origin ?? null }, 'Conexión de juego rechazada: viene de otro origen');
          return reply.code(403).send(apiError('bad_origin'));
        }
        const current = await sessionUser(req);
        if (!current) return reply.code(401).send(apiError('unauthorized'));
        if (current.user.emailVerifiedAt === null) return reply.code(403).send(apiError('email_not_verified'));
        players.set(req.raw, { userId: current.user.id, name: current.user.displayName });
      },
    },
    (socket, req) => {
      const player = players.get(req.raw);
      // Sin la comprobación previa no hay conexión: no debería pasar, y si pasa, se cierra.
      if (!player) {
        socket.close(CLOSE.sessionEnded);
        return;
      }
      const link = new SocketLink(socket, player);
      const bucket = new Bucket(Date.now());
      alive.set(socket, true);
      socket.on('pong', () => alive.set(socket, true));
      socket.on('close', () => {
        alive.delete(socket);
        void hub.disconnect(link);
      });
      // Un error del socket termina en su cierre: no hace falta más que no dejarlo sin manejar.
      socket.on('error', () => undefined);

      socket.on('message', (data, isBinary) => {
        if (!bucket.take(Date.now())) {
          link.send({ type: 'error', code: 'rate_limited' });
          socket.close(CLOSE.rateLimited);
          return;
        }
        let json: unknown = null;
        if (!isBinary) {
          try {
            json = JSON.parse(data.toString());
          } catch {
            json = null;
          }
        }
        const parsed = clientMessageSchema.safeParse(json);
        if (!parsed.success) {
          // Un cliente de otra versión se entera de que tiene que recargar; lo demás es un mensaje mal hecho.
          const version = (json as { v?: unknown } | null)?.v;
          const outdated = typeof version === 'number' && version !== PROTOCOL_VERSION;
          link.send({ type: 'error', code: outdated ? 'protocol_version' : 'bad_message' });
          socket.close(CLOSE.protocol);
          return;
        }
        void hub.receive(link, parsed.data);
      });

      void hub.connect(link);
    },
  );
}
