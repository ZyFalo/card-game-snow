import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { apiError, type Health } from '@ventisca/protocol';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { type AccountsOptions, accountsRoutes } from './accounts/routes';

export interface AppOptions {
  /** Comprueba que la base de datos responde. */
  ping: () => Promise<void>;
  /** Carpeta con el build del cliente (apps/web/dist); sin ella solo se sirve la API. */
  webDist: string | null;
  logger: FastifyServerOptions['logger'];
  /** Cuentas (R-43 a R-45). Sin ellas, el servidor solo sirve la salud y el juego. */
  accounts?: AccountsOptions;
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

export function buildApp({ ping, webDist, logger, accounts }: AppOptions) {
  // Railway pone un proxy delante: la IP real llega en X-Forwarded-For (para los límites del PR 6).
  const app = Fastify({ logger, trustProxy: true });

  app.get('/api/health', async (req, reply) => {
    try {
      await ping();
      const health: Health = { ok: true, db: 'ok' };
      return health;
    } catch (err) {
      req.log.error({ err }, 'La base de datos no responde');
      return reply.code(503).send(apiError('db_unavailable'));
    }
  });

  app.register(fastifyCookie);
  if (accounts) app.register(accountsRoutes, accounts);

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
