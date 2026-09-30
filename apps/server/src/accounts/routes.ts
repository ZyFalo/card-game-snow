import {
  apiError,
  type CheckEmail,
  loginSchema,
  registerSchema,
  resendSchema,
  type Session,
  verifySchema,
} from '@ventisca/protocol';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { emailCodes, sessions, users } from '../schema';
import { existingAccountMail, verificationMail } from './emails';
import type { Mailer } from './mailer';
import { checkName, cleanName, nameKey } from './names';
import { checkPassword, decoyHash, hashPassword, verifyPassword } from './passwords';
import { fingerprint, newCode, newSessionToken, sameFingerprint } from './tokens';

/*
 * Cuentas (PRD de v2, R-43 a R-45), primera parte: registro, verificación con código, inicio y cierre
 * de sesión. Reglas de la casa:
 * - Los datos de cuenta viajan en el cuerpo, nunca en la URL: los registros guardan la URL.
 * - Registrar y pedir un código responden igual exista o no la cuenta (D-59).
 * - En la base solo hay huellas de códigos y sesiones, y el hash Argon2id de cada contraseña.
 */

export interface AccountsOptions {
  db: Db;
  mailer: Mailer;
  /** SESSION_SECRET. */
  secret: string;
  /** APP_URL: va en los correos, y con https la cookie es Secure. */
  appUrl: string;
  /** Reloj; las pruebas lo mueven. */
  now?: () => Date;
}

export const SESSION_COOKIE = 'ventisca_session';
const SESSION_DAYS = 30;
/** R-43: el código vence a los 15 min, admite 5 intentos y solo se puede pedir otro tras 60 s. */
export const CODE_MINUTES = 15;
export const CODE_ATTEMPTS = 5;
export const CODE_COOLDOWN_SECONDS = 60;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** En minúsculas y NFC: dos formas de escribir el mismo correo son la misma cuenta. */
export const normalizeEmail = (email: string) => email.trim().normalize('NFC').toLowerCase();
const isEmail = (email: string) => z.email().safeParse(email).success;

const checkEmail: CheckEmail = { status: 'check_email' };

type UserRow = typeof users.$inferSelect;
const publicUser = (u: UserRow): Session['user'] => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  verified: u.emailVerifiedAt !== null,
});

/** Código de Postgres para una fila que viola una restricción única. */
const isUniqueViolation = (err: unknown, constraint: string) => {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.cause ?? e;
  return pg.code === '23505' && pg.constraint === constraint;
};

export async function accountsRoutes(app: FastifyInstance, opts: AccountsOptions) {
  const { db, mailer, secret, appUrl } = opts;
  const now = opts.now ?? (() => new Date());
  const secureCookie = appUrl.startsWith('https://');

  /** La base o una transacción abierta. */
  type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

  const findUser = async (email: string) =>
    (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null;

  /** Crea un código nuevo e invalida los anteriores del mismo propósito (R-43). */
  async function issueCode(tx: Executor, userId: string, purpose: 'verify'): Promise<string> {
    const at = now();
    await tx
      .update(emailCodes)
      .set({ usedAt: at })
      .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose), isNull(emailCodes.usedAt)));
    const code = newCode();
    await tx.insert(emailCodes).values({
      userId,
      purpose,
      codeHash: fingerprint(secret, `code:${purpose}:${userId}`, code),
      expiresAt: new Date(at.getTime() + CODE_MINUTES * MINUTE),
      createdAt: at,
    });
    return code;
  }

  type CodeResult =
    | { ok: true }
    | { ok: false; error: 'invalid_code' | 'code_expired' | 'too_many_attempts'; attemptsLeft?: number };

  /** Comprueba y gasta un código (R-43): un solo uso, 15 min y 5 intentos. */
  async function consumeCode(userId: string, purpose: 'verify', code: string): Promise<CodeResult> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(emailCodes)
        .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose), isNull(emailCodes.usedAt)))
        .orderBy(desc(emailCodes.createdAt))
        .limit(1)
        .for('update');
      if (!row) return { ok: false, error: 'invalid_code' };
      if (row.attempts >= CODE_ATTEMPTS) return { ok: false, error: 'too_many_attempts', attemptsLeft: 0 };
      if (row.expiresAt.getTime() <= now().getTime()) return { ok: false, error: 'code_expired' };
      if (sameFingerprint(row.codeHash, fingerprint(secret, `code:${purpose}:${userId}`, code))) {
        await tx.update(emailCodes).set({ usedAt: now() }).where(eq(emailCodes.id, row.id));
        return { ok: true };
      }
      const attempts = row.attempts + 1;
      await tx.update(emailCodes).set({ attempts }).where(eq(emailCodes.id, row.id));
      const attemptsLeft = CODE_ATTEMPTS - attempts;
      return attemptsLeft === 0
        ? { ok: false, error: 'too_many_attempts', attemptsLeft: 0 }
        : { ok: false, error: 'invalid_code', attemptsLeft };
    });
  }

  async function startSession(reply: FastifyReply, userId: string) {
    const token = newSessionToken();
    await db.insert(sessions).values({
      id: fingerprint(secret, 'session', token),
      userId,
      expiresAt: new Date(now().getTime() + SESSION_DAYS * DAY),
      createdAt: now(),
    });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  }

  async function sessionUser(req: FastifyRequest): Promise<{ sessionId: string; user: UserRow } | null> {
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
  }

  /** Envía sin revelar el resultado: un fallo se registra sin datos de la persona. */
  async function sendQuietly(mail: Parameters<Mailer['send']>[0], req: FastifyRequest) {
    try {
      await mailer.send(mail);
    } catch (err) {
      req.log.error({ err: { message: (err as Error).message } }, 'No se pudo enviar un correo');
    }
  }

  /* R-44: registro. */
  app.post('/api/auth/register', async (req, reply) => {
    if (!mailer.available) return reply.code(503).send(apiError('email_unavailable'));
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const body = parsed.data;
    if (!body.acceptPrivacy) return reply.code(400).send(apiError('privacy_not_accepted'));
    const email = normalizeEmail(body.email);
    if (!isEmail(email)) return reply.code(400).send(apiError('bad_request', { reason: 'email' }));
    const nameProblem = checkName(body.displayName);
    if (nameProblem) return reply.code(400).send(apiError('name_not_allowed', { reason: nameProblem }));
    const displayName = cleanName(body.displayName);
    const passwordProblem = checkPassword(body.password, { email, displayName });
    if (passwordProblem) return reply.code(400).send(apiError('weak_password', { reason: passwordProblem }));

    // El hash se calcula siempre, también si el correo ya existe: así la respuesta tarda lo mismo (D-59).
    const passwordHash = await hashPassword(body.password);
    const key = nameKey(displayName);
    // El nombre se revisa antes que el correo: si no, un nombre ocupado delataría si el correo existe.
    const nameTaken = await db.select({ id: users.id }).from(users).where(eq(users.displayNameKey, key)).limit(1);
    if (nameTaken.length) return reply.code(409).send(apiError('name_taken'));

    if (await findUser(email)) {
      await sendQuietly(existingAccountMail(email, appUrl), req);
      return reply.code(202).send(checkEmail);
    }

    try {
      await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash, displayName, displayNameKey: key, createdAt: now() })
          .returning({ id: users.id });
        const code = await issueCode(tx, (user as { id: string }).id, 'verify');
        // Dentro de la transacción: si el correo no sale, la cuenta no queda a medias.
        await mailer.send(verificationMail(email, displayName, code, appUrl));
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_display_name_key_unique')) return reply.code(409).send(apiError('name_taken'));
      if (isUniqueViolation(err, 'users_email_unique')) return reply.code(202).send(checkEmail);
      throw err;
    }
    return reply.code(202).send(checkEmail);
  });

  /* R-43 y R-44: el código verifica la cuenta y abre la sesión. */
  app.post('/api/auth/verify', async (req, reply) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const user = await findUser(normalizeEmail(parsed.data.email));
    // Sin cuenta o ya verificada: el mismo error que un código equivocado (D-59).
    if (!user || user.emailVerifiedAt) return reply.code(400).send(apiError('invalid_code'));
    const result = await consumeCode(user.id, 'verify', parsed.data.code);
    if (!result.ok) {
      const extra = result.attemptsLeft === undefined ? {} : { attemptsLeft: result.attemptsLeft };
      return reply.code(400).send(apiError(result.error, extra));
    }
    const [verified] = await db.update(users).set({ emailVerifiedAt: now() }).where(eq(users.id, user.id)).returning();
    await startSession(reply, user.id);
    const body: Session = { user: publicUser(verified as UserRow) };
    return body;
  });

  /* R-43: pedir un código nuevo invalida el anterior, y solo se puede tras 60 s. */
  app.post('/api/auth/resend', async (req, reply) => {
    if (!mailer.available) return reply.code(503).send(apiError('email_unavailable'));
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const user = await findUser(normalizeEmail(parsed.data.email));
    if (user && !user.emailVerifiedAt) {
      const [last] = await db
        .select({ createdAt: emailCodes.createdAt })
        .from(emailCodes)
        .where(and(eq(emailCodes.userId, user.id), eq(emailCodes.purpose, 'verify')))
        .orderBy(desc(emailCodes.createdAt))
        .limit(1);
      const waited = !last || now().getTime() - last.createdAt.getTime() >= CODE_COOLDOWN_SECONDS * 1000;
      if (waited) {
        const code = await issueCode(db, user.id, 'verify');
        await sendQuietly(verificationMail(user.email, user.displayName, code, appUrl), req);
      }
    }
    return reply.code(202).send(checkEmail);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const user = await findUser(normalizeEmail(parsed.data.email));
    // Sin cuenta, se verifica igual contra un hash de relleno: la respuesta tarda lo mismo (D-59).
    const ok = await verifyPassword(user?.passwordHash ?? (await decoyHash()), parsed.data.password);
    if (!user || !ok) return reply.code(401).send(apiError('invalid_credentials'));
    if (!user.emailVerifiedAt) return reply.code(403).send(apiError('email_not_verified'));
    await startSession(reply, user.id);
    const body: Session = { user: publicUser(user) };
    return body;
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const current = await sessionUser(req);
    if (current) await db.delete(sessions).where(eq(sessions.id, current.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req, reply) => {
    const current = await sessionUser(req);
    if (!current) return reply.code(401).send(apiError('unauthorized'));
    const body: Session = { user: publicUser(current.user) };
    return body;
  });
}
