import { apiError, chooseCaminoSchema } from '@ventisca/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sessionReader, type UserRow } from '../accounts/session';
import type { Db } from '../db';
import { chooseCamino, readProgress } from './store';

/*
 * Progreso en la cuenta (PRD de v2, D-34): perfil y colección. Todo pide la sesión iniciada, y el
 * servidor decide: el cliente solo dice qué camino elige.
 * El cobro de las rondas no tiene ruta: lo hará el servidor al resolver las partidas en línea (M8).
 */

export interface ProgressOptions {
  db: Db;
  /** SESSION_SECRET. */
  secret: string;
  /** Reloj; las pruebas lo fijan. */
  now?: () => Date;
}

export async function progressRoutes(app: FastifyInstance, opts: ProgressOptions) {
  const { db, secret } = opts;
  const now = opts.now ?? (() => new Date());
  const sessionUser = sessionReader(db, secret, now);

  /** Quien hace la petición, con el correo verificado (R-44). Si no, responde y devuelve null. */
  async function player(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | null> {
    const current = await sessionUser(req);
    if (!current) {
      reply.code(401).send(apiError('unauthorized'));
      return null;
    }
    if (current.user.emailVerifiedAt === null) {
      reply.code(403).send(apiError('email_not_verified'));
      return null;
    }
    return current.user;
  }

  app.get('/api/progress', async (req, reply) => {
    const user = await player(req, reply);
    if (!user) return reply;
    return readProgress(db, user.id);
  });

  /* ---------- R-30: la carta de camino ---------- */

  app.post('/api/progress/camino', async (req, reply) => {
    const user = await player(req, reply);
    if (!user) return reply;
    const parsed = chooseCaminoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const progress = await chooseCamino(db, user.id, parsed.data.element, now());
    if (!progress) return reply.code(409).send(apiError('camino_already_chosen'));
    return progress;
  });
}
