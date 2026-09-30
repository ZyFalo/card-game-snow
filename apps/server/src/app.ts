import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { apiError, type Health } from '@ventisca/protocol';
import Fastify, { type FastifyServerOptions } from 'fastify';

export interface AppOptions {
  /** Comprueba que la base de datos responde. */
  ping: () => Promise<void>;
  /** Carpeta con el build del cliente (apps/web/dist); sin ella solo se sirve la API. */
  webDist: string | null;
  logger: FastifyServerOptions['logger'];
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

export function buildApp({ ping, webDist, logger }: AppOptions) {
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

  if (webDist && existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
  } else {
    app.log.warn({ webDist }, 'No está el build del cliente: solo se sirve la API (corre pnpm build)');
  }

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(apiError('not_found')));
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'Error sin manejar');
    return reply.code(500).send(apiError('internal'));
  });

  return app;
}
