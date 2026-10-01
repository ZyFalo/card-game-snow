import { and, eq, gt } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { Db } from '../db';
import { sessions, users } from '../schema';
import { fingerprint } from './tokens';

/* La sesión de una petición (PRD de v2, "Sesiones"). La usan las cuentas y el progreso. */

export const SESSION_COOKIE = 'ventisca_session';

export type UserRow = typeof users.$inferSelect;

/**
 * Devuelve quién hace la petición, o null si no trae una sesión vigente. En la base está la huella
 * HMAC del token de la cookie, nunca el token.
 */
export function sessionReader(db: Db, secret: string, now: () => Date) {
  return async (req: FastifyRequest): Promise<{ sessionId: string; user: UserRow } | null> => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const sessionId = fingerprint(secret, 'session', token);
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now())))
      .limit(1);
    return row ? { sessionId, user: row.user } : null;
  };
}
