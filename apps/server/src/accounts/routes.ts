import {
  apiError,
  type CheckEmail,
  changeEmailConfirmSchema,
  changeEmailRequestSchema,
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  recoverConfirmSchema,
  recoverRequestSchema,
  registerSchema,
  resendSchema,
  type Session,
  verifySchema,
} from '@ventisca/protocol';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { type EMAIL_CODE_PURPOSES, emailCodes, sessions, users } from '../schema';
import type { Captcha } from './captcha';
import {
  changeEmailCodeMail,
  emailChangedMail,
  existingAccountMail,
  passwordChangedMail,
  recoveryCodeMail,
  verificationMail,
} from './emails';
import { type AccountLimits, accountLimits } from './limits';
import type { Mail, Mailer } from './mailer';
import { checkName, cleanName, nameKey } from './names';
import { checkPassword, decoyHash, hashPassword, verifyPassword } from './passwords';
import { fingerprint, newCode, newSessionToken, sameFingerprint } from './tokens';

/*
 * Cuentas (PRD de v2, R-43 a R-49): registro, verificación con código, sesión, recuperación, cambios de
 * contraseña y de correo, y borrado. Reglas de la casa:
 * - Los datos de cuenta viajan en el cuerpo, nunca en la URL: los registros guardan la URL.
 * - Ninguna respuesta revela si un correo tiene cuenta (D-59): ni registrarse, ni pedir códigos, ni
 *   iniciar sesión, ni los límites de intentos, ni la recuperación.
 * - En la base solo hay huellas de códigos y sesiones, y el hash Argon2id de cada contraseña.
 */

export interface AccountsOptions {
  db: Db;
  mailer: Mailer;
  /** Turnstile en el registro. */
  captcha: Captcha;
  /** SESSION_SECRET. */
  secret: string;
  /** APP_URL: va en los correos, y con https la cookie es Secure. */
  appUrl: string;
  /** Reloj; las pruebas lo mueven. */
  now?: () => Date;
  /** Límites de abuso; las pruebas los inspeccionan. */
  limits?: AccountLimits;
}

type Purpose = (typeof EMAIL_CODE_PURPOSES)[number];

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
  const { db, mailer, captcha, secret, appUrl } = opts;
  const now = opts.now ?? (() => new Date());
  const limits = opts.limits ?? accountLimits(now);
  const secureCookie = appUrl.startsWith('https://');

  /** La base o una transacción abierta. */
  type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

  const findUser = async (email: string) =>
    (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null;

  /* ---------- Correo ---------- */

  /**
   * Hasta 3 correos por hora por dirección. Pasado el límite no se envía, y quien pidió el correo
   * recibe la misma respuesta (D-59). Devuelve si el correo debe salir.
   */
  function allowMail(to: string): boolean {
    if (limits.mailByAddress.blocked(to)) return false;
    limits.mailByAddress.hit(to);
    return true;
  }

  /** Envía sin revelar el resultado: un fallo se registra sin datos de la persona. */
  async function sendQuietly(mail: Mail, req: FastifyRequest) {
    if (!allowMail(mail.to)) return;
    try {
      await mailer.send(mail);
    } catch (err) {
      req.log.error({ err: { message: (err as Error).message } }, 'No se pudo enviar un correo');
    }
  }

  /* ---------- Códigos (R-43) ---------- */

  /** Crea un código nuevo e invalida los anteriores del mismo propósito. */
  async function issueCode(tx: Executor, userId: string, purpose: Purpose, newEmail?: string): Promise<string> {
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
      newEmail: newEmail ?? null,
      expiresAt: new Date(at.getTime() + CODE_MINUTES * MINUTE),
      createdAt: at,
    });
    return code;
  }

  /** Si ya pasaron 60 s desde el último código de ese propósito. */
  async function cooledDown(userId: string, purpose: Purpose): Promise<boolean> {
    const [last] = await db
      .select({ createdAt: emailCodes.createdAt })
      .from(emailCodes)
      .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose)))
      .orderBy(desc(emailCodes.createdAt))
      .limit(1);
    return !last || now().getTime() - last.createdAt.getTime() >= CODE_COOLDOWN_SECONDS * 1000;
  }

  /** Manda un código nuevo si ya pasaron los 60 s; si no, calla (la respuesta es la misma). */
  async function sendCode(
    req: FastifyRequest,
    userId: string,
    purpose: Purpose,
    to: string,
    mail: (to: string, code: string, appUrl: string) => Mail,
  ) {
    if (!(await cooledDown(userId, purpose))) return;
    const code = await issueCode(db, userId, purpose, purpose === 'change_email' ? to : undefined);
    await sendQuietly(mail(to, code, appUrl), req);
  }

  type CodeResult =
    | { ok: true; newEmail: string | null }
    | { ok: false; error: 'invalid_code' | 'code_expired' | 'too_many_attempts'; attemptsLeft?: number };

  /** Comprueba y gasta un código: un solo uso, 15 min y 5 intentos. Bloquea la fila mientras tanto. */
  async function consumeCode(userId: string, purpose: Purpose, code: string): Promise<CodeResult> {
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
        return { ok: true, newEmail: row.newEmail };
      }
      const attempts = row.attempts + 1;
      await tx.update(emailCodes).set({ attempts }).where(eq(emailCodes.id, row.id));
      const attemptsLeft = CODE_ATTEMPTS - attempts;
      return attemptsLeft === 0
        ? { ok: false, error: 'too_many_attempts', attemptsLeft: 0 }
        : { ok: false, error: 'invalid_code', attemptsLeft };
    });
  }

  const codeError = (reply: FastifyReply, result: Exclude<CodeResult, { ok: true }>) =>
    reply
      .code(400)
      .send(apiError(result.error, result.attemptsLeft === undefined ? {} : { attemptsLeft: result.attemptsLeft }));

  /* ---------- Sesiones ---------- */

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

  /* ---------- Contraseña con límite de intentos ---------- */

  /** 429 si la cuenta (el correo escrito) o la IP llegaron al límite de intentos fallidos. */
  function tooManyAttempts(reply: FastifyReply, account: string, ip: string): FastifyReply | null {
    const byAccount = limits.loginByAccount.blocked(account);
    const byIp = limits.loginByIp.blocked(ip);
    if (!byAccount && !byIp) return null;
    const wait = Math.max(limits.loginByAccount.retryAfter(account), limits.loginByIp.retryAfter(ip));
    return reply.code(429).header('retry-after', String(wait)).send(apiError('too_many_requests'));
  }

  /**
   * Comprueba la contraseña de una cuenta contando los fallos por cuenta y por IP (5 cada 15 min).
   * Sin cuenta se verifica igual contra un hash de relleno, para que tarde lo mismo (D-59).
   */
  async function checkPasswordAttempt(account: string, ip: string, user: UserRow | null, password: string) {
    const ok = await verifyPassword(user?.passwordHash ?? (await decoyHash()), password);
    if (user && ok) {
      limits.loginByAccount.reset(account);
      return true;
    }
    limits.loginByAccount.hit(account);
    limits.loginByIp.hit(ip);
    return false;
  }

  /* ---------- R-44: registro ---------- */

  app.post('/api/auth/register', async (req, reply) => {
    if (!mailer.available) return reply.code(503).send(apiError('email_unavailable'));
    if (!captcha.available) return reply.code(503).send(apiError('captcha_unavailable'));
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const body = parsed.data;
    // Primero lo que la persona puede corregir en el formulario: así no gasta el token del captcha.
    if (!body.acceptPrivacy) return reply.code(400).send(apiError('privacy_not_accepted'));
    const email = normalizeEmail(body.email);
    if (!isEmail(email)) return reply.code(400).send(apiError('bad_request', { reason: 'email' }));
    const nameProblem = checkName(body.displayName);
    if (nameProblem) return reply.code(400).send(apiError('name_not_allowed', { reason: nameProblem }));
    const displayName = cleanName(body.displayName);
    const passwordProblem = checkPassword(body.password, { email, displayName });
    if (passwordProblem) return reply.code(400).send(apiError('weak_password', { reason: passwordProblem }));
    if (!(await captcha.verify(body.captchaToken))) return reply.code(400).send(apiError('captcha_failed'));

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
        // Dentro de la transacción: si el correo no sale, la cuenta no queda a medias. Si la dirección
        // ya llegó a su límite, la cuenta se crea igual y el código se pide después.
        if (allowMail(email)) await mailer.send(verificationMail(email, code, appUrl));
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_display_name_key_unique')) return reply.code(409).send(apiError('name_taken'));
      if (isUniqueViolation(err, 'users_email_unique')) return reply.code(202).send(checkEmail);
      throw err;
    }
    return reply.code(202).send(checkEmail);
  });

  /* ---------- R-43 y R-44: verificación ---------- */

  app.post('/api/auth/verify', async (req, reply) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const user = await findUser(normalizeEmail(parsed.data.email));
    // Sin cuenta o ya verificada: el mismo error que un código equivocado (D-59).
    if (!user || user.emailVerifiedAt) return reply.code(400).send(apiError('invalid_code'));
    const result = await consumeCode(user.id, 'verify', parsed.data.code);
    if (!result.ok) return codeError(reply, result);
    const [verified] = await db.update(users).set({ emailVerifiedAt: now() }).where(eq(users.id, user.id)).returning();
    await startSession(reply, user.id);
    const body: Session = { user: publicUser(verified as UserRow) };
    return body;
  });

  app.post('/api/auth/resend', async (req, reply) => {
    if (!mailer.available) return reply.code(503).send(apiError('email_unavailable'));
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const user = await findUser(normalizeEmail(parsed.data.email));
    if (user && !user.emailVerifiedAt) await sendCode(req, user.id, 'verify', user.email, verificationMail);
    return reply.code(202).send(checkEmail);
  });

  /* ---------- Sesión ---------- */

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const email = normalizeEmail(parsed.data.email);
    const limited = tooManyAttempts(reply, email, req.ip);
    if (limited) return limited;
    const user = await findUser(email);
    if (!(await checkPasswordAttempt(email, req.ip, user, parsed.data.password)) || !user) {
      return reply.code(401).send(apiError('invalid_credentials'));
    }
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

  /* ---------- R-46: recuperar la contraseña ---------- */

  app.post('/api/auth/recover/request', async (req, reply) => {
    if (!mailer.available) return reply.code(503).send(apiError('email_unavailable'));
    const parsed = recoverRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const user = await findUser(normalizeEmail(parsed.data.email));
    if (user) await sendCode(req, user.id, 'recover', user.email, recoveryCodeMail);
    return reply.code(202).send(checkEmail);
  });

  app.post('/api/auth/recover/confirm', async (req, reply) => {
    const parsed = recoverConfirmSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const email = normalizeEmail(parsed.data.email);
    const user = await findUser(email);
    // La contraseña se revisa antes que el código, para no gastar un intento por una contraseña débil.
    const problem = checkPassword(parsed.data.password, { email, displayName: user?.displayName ?? '' });
    if (problem) return reply.code(400).send(apiError('weak_password', { reason: problem }));
    if (!user) return reply.code(400).send(apiError('invalid_code'));
    const result = await consumeCode(user.id, 'recover', parsed.data.code);
    if (!result.ok) return codeError(reply, result);

    const passwordHash = await hashPassword(parsed.data.password);
    // El código prueba que el correo es suyo: si la cuenta no estaba verificada, ahora lo está.
    const [updated] = await db
      .update(users)
      .set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now() })
      .where(eq(users.id, user.id))
      .returning();
    // Se cierran todas las sesiones y la persona entra con una nueva.
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await startSession(reply, user.id);
    limits.loginByAccount.reset(user.email);
    await sendQuietly(passwordChangedMail(user.email, appUrl), req);
    const body: Session = { user: publicUser(updated as UserRow) };
    return body;
  });

  /* ---------- R-47: cambiar la contraseña ---------- */

  app.post('/api/auth/password', async (req, reply) => {
    const current = await sessionUser(req);
    if (!current) return reply.code(401).send(apiError('unauthorized'));
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const { user } = current;
    const limited = tooManyAttempts(reply, user.email, req.ip);
    if (limited) return limited;
    if (!(await checkPasswordAttempt(user.email, req.ip, user, parsed.data.currentPassword))) {
      return reply.code(401).send(apiError('invalid_credentials'));
    }
    const problem = checkPassword(parsed.data.newPassword, { email: user.email, displayName: user.displayName });
    if (problem) return reply.code(400).send(apiError('weak_password', { reason: problem }));
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    // Se cierran las demás sesiones; la actual sigue abierta.
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, current.sessionId)));
    await sendQuietly(passwordChangedMail(user.email, appUrl), req);
    return reply.code(204).send();
  });

  /* ---------- R-48: cambiar el correo ---------- */

  app.post('/api/auth/email/request', async (req, reply) => {
    const current = await sessionUser(req);
    if (!current) return reply.code(401).send(apiError('unauthorized'));
    if (!mailer.available) return reply.code(503).send(apiError('email_unavailable'));
    const parsed = changeEmailRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const { user } = current;
    const newEmail = normalizeEmail(parsed.data.newEmail);
    if (!isEmail(newEmail)) return reply.code(400).send(apiError('bad_request', { reason: 'email' }));
    if (newEmail === user.email) return reply.code(400).send(apiError('bad_request', { reason: 'same_email' }));
    const limited = tooManyAttempts(reply, user.email, req.ip);
    if (limited) return limited;
    if (!(await checkPasswordAttempt(user.email, req.ip, user, parsed.data.password))) {
      return reply.code(401).send(apiError('invalid_credentials'));
    }
    // Si el correo nuevo ya tiene cuenta no se manda nada, y la respuesta es la misma (D-59).
    if (!(await findUser(newEmail))) await sendCode(req, user.id, 'change_email', newEmail, changeEmailCodeMail);
    return reply.code(202).send(checkEmail);
  });

  app.post('/api/auth/email/confirm', async (req, reply) => {
    const current = await sessionUser(req);
    if (!current) return reply.code(401).send(apiError('unauthorized'));
    const parsed = changeEmailConfirmSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const { user } = current;
    const result = await consumeCode(user.id, 'change_email', parsed.data.code);
    if (!result.ok) return codeError(reply, result);
    const newEmail = result.newEmail as string;
    let updated: UserRow | undefined;
    try {
      [updated] = await db
        .update(users)
        .set({ email: newEmail, emailVerifiedAt: now() })
        .where(eq(users.id, user.id))
        .returning();
    } catch (err) {
      // Otra cuenta tomó ese correo entre la solicitud y el código. Quien tiene el código controla el
      // correo nuevo, así que decírselo no revela nada.
      if (isUniqueViolation(err, 'users_email_unique')) return reply.code(409).send(apiError('email_taken'));
      throw err;
    }
    // Hasta aquí la cuenta seguía con el correo anterior; ahora ese correo recibe el aviso.
    await sendQuietly(emailChangedMail(user.email, appUrl), req);
    const body: Session = { user: publicUser(updated as UserRow) };
    return body;
  });

  /* ---------- R-49: borrar la cuenta ---------- */

  app.post('/api/auth/delete', async (req, reply) => {
    const current = await sessionUser(req);
    if (!current) return reply.code(401).send(apiError('unauthorized'));
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(apiError('bad_request'));
    const { user } = current;
    const limited = tooManyAttempts(reply, user.email, req.ip);
    if (limited) return limited;
    if (!(await checkPasswordAttempt(user.email, req.ip, user, parsed.data.password))) {
      return reply.code(401).send(apiError('invalid_credentials'));
    }
    // En cascada se borran sus sesiones, sus códigos y, cuando exista, su progreso (D-56).
    await db.delete(users).where(eq(users.id, user.id));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });
}
