import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { apiError, type Health, type PublicConfig } from '@ventisca/protocol';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { type AccountsOptions, accountsRoutes } from './accounts/routes';
import { originGuard } from './origin';
import { progressRoutes } from './progress/routes';

export interface AppOptions {
  /** Comprueba que la base de datos responde. */
  ping: () => Promise<void>;
  /** Commit desplegado, o null (desarrollo). */
  commit?: string | null;
  /** Lo público que el cliente necesita saber (GET /api/config). */
  publicConfig?: PublicConfig;
  /** Carpeta con el build del cliente (apps/web/dist); sin ella solo se sirve la API. */
  webDist: string | null;
  logger: FastifyServerOptions['logger'];
  /** Cuentas (R-43 a R-50) y, con ellas, el progreso. Sin ellas, el servidor solo sirve la salud y el juego. */
  accounts?: AccountsOptions;
  /**
   * Solo desarrollo: el origen del cliente de Vite, que pasa /api al servidor. Se suma al del juego
   * (`accounts.appUrl`) como origen válido de las peticiones que cambian estado (D-65).
   */
  devOrigin?: string | null;
  /** Semilla del sorteo de cada caja (R-27); las pruebas la fijan. Por defecto, una aleatoria por caja. */
  boxSeed?: () => number;
}

/**
 * Registros sin datos personales: de cada petición solo el método y la ruta, nunca la IP
 * (compromiso del aviso de privacidad).
 */
export const privateLogger = (level: string, stream?: NodeJS.WritableStream) => ({
  level,
  serializers: { req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }) },
  ...(stream ? { stream } : {}),
});

export function buildApp(options: AppOptions) {
  const { ping, webDist, logger, accounts, commit = null, publicConfig, devOrigin, boxSeed } = options;
  // Railway pone un solo proxy delante: la IP real es la última de X-Forwarded-For. Confiar en más de un
  // salto dejaría que cualquiera inventara su IP y esquivara los límites por IP.
  // Se confía solo en el salto 0 (el proxy de Railway, conectado directo); equivale a un salto.
  const app = Fastify({ logger, trustProxy: (_address: string, hop: number) => hop === 0 });

  // Antes que cualquier ruta: lo que cambia estado solo se acepta desde el propio juego (D-65).
  if (accounts) originGuard(app, [new URL(accounts.appUrl).origin, ...(devOrigin ? [devOrigin] : [])]);

  app.get('/api/health', async (req, reply) => {
    try {
      await ping();
      const health: Health = { ok: true, db: 'ok', commit };
      return health;
    } catch (err) {
      req.log.error({ err }, 'La base de datos no responde');
      return reply.code(503).send(apiError('db_unavailable'));
    }
  });

  // Solo una lista explícita de valores públicos, campo por campo: nunca el entorno ni un objeto de
  // configuración entero, aunque llegue uno con más campos.
  app.get('/api/config', async () => {
    const body: PublicConfig = { turnstileSiteKey: publicConfig?.turnstileSiteKey ?? null };
    return body;
  });

  app.register(fastifyCookie);
  if (accounts) {
    app.register(accountsRoutes, accounts);
    // El progreso vive en la cuenta (D-34): usa la misma base, el mismo secreto y el mismo reloj.
    app.register(progressRoutes, { db: accounts.db, secret: accounts.secret, now: accounts.now, seed: boxSeed });
  }

  if (webDist && existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
  } else {
    app.log.warn({ webDist }, 'No está el build del cliente: solo se sirve la API (corre pnpm build)');
  }

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(apiError('not_found')));
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    // Errores de la petición (JSON mal formado, tipo de contenido no admitido): 4xx con su código.
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send(apiError(err.statusCode === 404 ? 'not_found' : 'bad_request'));
    }
    // Sin el error completo: el detalle de Postgres puede traer valores de la fila, como un correo.
    req.log.error({ err: { type: err.name, code: err.code, message: err.message } }, 'Error sin manejar');
    return reply.code(500).send(apiError('internal'));
  });

  return app;
}
