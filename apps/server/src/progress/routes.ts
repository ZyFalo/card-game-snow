import { randomInt } from 'node:crypto';
import { BOX_SIZES } from '@ventisca/core';
import { apiError, type BoxResult, buyBoxSchema, chooseCaminoSchema } from '@ventisca/protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sessionReader, type UserRow } from '../accounts/session';
import type { Db } from '../db';
import { buyBox, chooseCamino, readProgress } from './store';

/*
 * Progreso en la cuenta (PRD de v2, D-34): perfil, colección y compra de cajas. Todo pide la sesión
 * iniciada, y el servidor decide: el cliente solo dice qué camino elige y qué caja quiere.
 * El cobro de las rondas no tiene ruta: lo hará el servidor al resolver las partidas en línea (M8).
 */

export interface ProgressOptions {
  db: Db;
  /** SESSION_SECRET. */
  secret: string;
  /** Reloj; las pruebas lo fijan. */
  now?: () => Date;
  /** Semilla del sorteo de cada caja; las pruebas la fijan. */
  seed?: () => number;
}

export async function progressRoutes(app: FastifyInstance, opts: ProgressOptions) {
  const { db, secret } = opts;
  const now = opts.now ?? (() => new Date());
  // Una semilla nueva e impredecible por caja: el sorteo lo hace el motor, pero nadie puede adivinarlo.
  const seed = opts.seed ?? (() => randomInt(0, 2 ** 32));
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

  /* ---------- R-27 y R-28: las cajas ---------- */

  app.post('/api/progress/boxes', async (req, reply) => {
    const user = await player(req, reply);
    if (!user) return reply;
    const parsed = buyBoxSchema.safeParse(req.body);
    if (!parsed.success || !BOX_SIZES.includes(parsed.data.size)) return reply.code(400).send(apiError('bad_request'));
    const { element, size, purchaseId } = parsed.data;
    const result = await buyBox(db, { userId: user.id, purchaseId, element, size }, seed(), now());
    if (!result.ok) return reply.code(409).send(apiError(result.error));
    const body: BoxResult = { cards: result.cards, progress: result.progress };
    return body;
  });
}
