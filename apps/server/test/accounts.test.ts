import { PassThrough } from 'node:stream';
import { apiErrorSchema, checkEmailSchema, sessionSchema } from '@ventisca/protocol';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Mail, Mailer } from '../src/accounts/mailer';
import { noMailer } from '../src/accounts/mailer';
import { CODE_ATTEMPTS, SESSION_COOKIE } from '../src/accounts/routes';
import { buildApp, privateLogger } from '../src/app';
import { emailCodes, sessions, users } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';

/* Cuentas en el servidor (PRD de v2, R-43 a R-45 y D-59), contra un Postgres de verdad. */
describe.skipIf(!adminUrl)('Cuentas (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  const START = new Date('2026-10-01T12:00:00Z');
  let clock = START;
  let sent: Mail[] = [];
  let logs = '';
  const mailer: Mailer = {
    available: true,
    async send(mail) {
      sent.push(mail);
    },
  };

  const makeApp = (overrides: Partial<{ mailer: Mailer; appUrl: string }> = {}) => {
    const stream = new PassThrough();
    stream.on('data', (chunk) => {
      logs += chunk.toString();
    });
    return buildApp({
      ping: async () => {},
      webDist: null,
      logger: privateLogger('info', stream),
      accounts: {
        db: ctx.database.db,
        mailer,
        secret: 's'.repeat(48),
        appUrl: 'https://ventisca.test',
        now: () => clock,
        ...overrides,
      },
    });
  };
  let app: ReturnType<typeof makeApp>;

  beforeAll(() => {
    app = makeApp();
  });
  beforeEach(() => {
    clock = START;
    sent = [];
  });

  let n = 0;
  /** Datos nuevos para cada prueba: comparten la base. */
  const fresh = () => {
    n += 1;
    return { email: `copo${n}@example.com`, displayName: `Copo ${n}`, password: 'Tundra7#Oso' };
  };
  const post = (url: string, payload: object, cookie?: string) =>
    app.inject({ method: 'POST', url, payload, ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}) });
  const register = (data: ReturnType<typeof fresh>, extra: object = {}) =>
    post('/api/auth/register', { ...data, acceptPrivacy: true, ...extra });
  const lastCode = () => (sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1] ?? '') as string;
  const cookieOf = (res: Awaited<ReturnType<typeof post>>) => res.cookies.find((c) => c.name === SESSION_COOKIE);
  const errorOf = (res: Awaited<ReturnType<typeof post>>) => apiErrorSchema.parse(res.json()).error;
  const me = (cookie?: string) =>
    app.inject({ method: 'GET', url: '/api/auth/me', ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}) });

  /** Registra y verifica; devuelve la cookie de sesión. */
  async function signUp(data = fresh()) {
    await register(data);
    const res = await post('/api/auth/verify', { email: data.email, code: lastCode() });
    return { data, cookie: cookieOf(res)?.value as string };
  }

  describe('Registro y verificación (R-43, R-44)', () => {
    it('R-44: registrarse manda un código de 6 dígitos al correo y todavía no abre sesión', async () => {
      const data = fresh();
      const res = await register(data);
      expect(res.statusCode).toBe(202);
      expect(checkEmailSchema.parse(res.json())).toEqual({ status: 'check_email' });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe(data.email);
      expect(lastCode()).toMatch(/^\d{6}$/);
      expect(cookieOf(res)).toBeUndefined();
    });

    it('R-44: el código verifica la cuenta y abre una sesión con cookie HttpOnly, Secure y SameSite=Lax de 30 días', async () => {
      const data = fresh();
      await register(data);
      const res = await post('/api/auth/verify', { email: data.email, code: lastCode() });
      expect(res.statusCode).toBe(200);
      expect(sessionSchema.parse(res.json()).user).toMatchObject({
        email: data.email,
        displayName: data.displayName,
        verified: true,
      });
      const cookie = cookieOf(res);
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 86400 });
      const who = await me(cookie?.value);
      expect(who.statusCode).toBe(200);
      expect(sessionSchema.parse(who.json()).user.email).toBe(data.email);
    });

    it('R-43: el código sirve una sola vez', async () => {
      const data = fresh();
      await register(data);
      const code = lastCode();
      await post('/api/auth/verify', { email: data.email, code });
      const again = await post('/api/auth/verify', { email: data.email, code });
      expect(errorOf(again).code).toBe('invalid_code');
    });

    it('R-43: admite 5 intentos; después, ni el código correcto sirve', async () => {
      const data = fresh();
      await register(data);
      const code = lastCode();
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 1; i < CODE_ATTEMPTS; i++) {
        const res = await post('/api/auth/verify', { email: data.email, code: wrong });
        expect(errorOf(res)).toEqual({ code: 'invalid_code', attemptsLeft: CODE_ATTEMPTS - i });
      }
      const last = await post('/api/auth/verify', { email: data.email, code: wrong });
      expect(errorOf(last)).toEqual({ code: 'too_many_attempts', attemptsLeft: 0 });
      const right = await post('/api/auth/verify', { email: data.email, code });
      expect(errorOf(right).code).toBe('too_many_attempts');
    });

    it('R-43: el código vence a los 15 minutos', async () => {
      const data = fresh();
      await register(data);
      clock = new Date(START.getTime() + 15 * 60_000);
      const res = await post('/api/auth/verify', { email: data.email, code: lastCode() });
      expect(errorOf(res).code).toBe('code_expired');
    });

    it('R-43: pedir otro código antes de 60 s no manda nada; después, el nuevo invalida el anterior', async () => {
      const data = fresh();
      await register(data);
      const first = lastCode();
      clock = new Date(START.getTime() + 59_000);
      await post('/api/auth/resend', { email: data.email });
      expect(sent).toHaveLength(1);
      clock = new Date(START.getTime() + 60_000);
      const res = await post('/api/auth/resend', { email: data.email });
      expect(res.statusCode).toBe(202);
      expect(sent).toHaveLength(2);
      const second = lastCode();
      if (first !== second) {
        expect(errorOf(await post('/api/auth/verify', { email: data.email, code: first })).code).toBe('invalid_code');
      }
      expect((await post('/api/auth/verify', { email: data.email, code: second })).statusCode).toBe(200);
    });

    it('R-43: en la base solo queda la huella del código, nunca el código', async () => {
      const data = fresh();
      await register(data);
      const rows = await ctx.database.db
        .select({ codeHash: emailCodes.codeHash })
        .from(emailCodes)
        .innerJoin(users, eq(users.id, emailCodes.userId))
        .where(eq(users.email, data.email));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]?.codeHash).not.toContain(lastCode());
    });

    it('D-54: la contraseña se guarda con Argon2id', async () => {
      const data = fresh();
      await register(data);
      const [row] = await ctx.database.db.select().from(users).where(eq(users.email, data.email));
      expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('el correo no distingue mayúsculas ni espacios de los bordes', async () => {
      const data = fresh();
      await register({ ...data, email: `  ${data.email.toUpperCase()} ` });
      expect(sent[0]?.to).toBe(data.email);
      expect((await post('/api/auth/verify', { email: data.email, code: lastCode() })).statusCode).toBe(200);
    });
  });

  describe('Reglas del registro', () => {
    it('R-44: sin aceptar el aviso de privacidad no hay registro', async () => {
      const res = await register(fresh(), { acceptPrivacy: false });
      expect(errorOf(res).code).toBe('privacy_not_accepted');
      expect(sent).toHaveLength(0);
    });

    it('R-45: una contraseña débil se rechaza con su motivo', async () => {
      const data = fresh();
      expect(errorOf(await register({ ...data, password: 'corta1!' }))).toEqual({
        code: 'weak_password',
        reason: 'length',
      });
      expect(errorOf(await register({ ...data, password: 'Password1!' }))).toEqual({
        code: 'weak_password',
        reason: 'common',
      });
      expect(errorOf(await register({ ...data, password: `${data.displayName}#9` }))).toEqual({
        code: 'weak_password',
        reason: 'personal',
      });
    });

    it('el filtro de nombres rechaza con su motivo', async () => {
      expect(errorOf(await register({ ...fresh(), displayName: 'LaPerra' }))).toEqual({
        code: 'name_not_allowed',
        reason: 'offensive',
      });
      expect(errorOf(await register({ ...fresh(), displayName: 'Admin' }))).toEqual({
        code: 'name_not_allowed',
        reason: 'reserved',
      });
    });

    it('el nombre visible es único sin distinguir mayúsculas ni tildes', async () => {
      const first = fresh();
      await register({ ...first, displayName: 'Nieve Azul' });
      const res = await register({ ...fresh(), displayName: 'níeve azul' });
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('name_taken');
    });

    it('D-59: registrarse con un correo que ya existe responde igual y avisa a ese correo, sin crear otra cuenta', async () => {
      const { data } = await signUp();
      sent = [];
      const res = await register({ ...fresh(), email: data.email });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ status: 'check_email' });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe(data.email);
      expect(sent[0]?.subject).toMatch(/Ya tienes una cuenta/);
      const rows = await ctx.database.db.select().from(users).where(eq(users.email, data.email));
      expect(rows).toHaveLength(1);
    });

    it('D-59: un nombre ocupado responde igual exista o no el correo, para no delatarlo', async () => {
      const { data } = await signUp();
      const withKnownEmail = await register({ ...fresh(), email: data.email, displayName: data.displayName });
      const withNewEmail = await register({ ...fresh(), displayName: data.displayName });
      expect(withKnownEmail.statusCode).toBe(409);
      expect(withNewEmail.statusCode).toBe(409);
      expect(withKnownEmail.json()).toEqual(withNewEmail.json());
    });

    it('D-59: pedir un código para un correo sin cuenta responde igual y no manda nada', async () => {
      const res = await post('/api/auth/resend', { email: 'nadie@example.com' });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ status: 'check_email' });
      expect(sent).toHaveLength(0);
    });

    it('sin envío de correo (producción antes del PR 6) no hay registro y no queda nada a medias', async () => {
      const offline = makeApp({ mailer: noMailer });
      const data = fresh();
      const res = await offline.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { ...data, acceptPrivacy: true },
      });
      await offline.close();
      expect(res.statusCode).toBe(503);
      expect(errorOf(res).code).toBe('email_unavailable');
      expect(await ctx.database.db.select().from(users).where(eq(users.email, data.email))).toHaveLength(0);
    });
  });

  describe('Inicio y cierre de sesión', () => {
    it('con la contraseña correcta abre sesión', async () => {
      const { data } = await signUp();
      const res = await post('/api/auth/login', { email: data.email, password: data.password });
      expect(res.statusCode).toBe(200);
      expect((await me(cookieOf(res)?.value)).statusCode).toBe(200);
    });

    it('la contraseña equivocada y el correo sin cuenta dan el mismo error (D-59)', async () => {
      const { data } = await signUp();
      const wrong = await post('/api/auth/login', { email: data.email, password: 'Otra9#Cosa' });
      const unknown = await post('/api/auth/login', { email: 'nadie@example.com', password: data.password });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
      expect(errorOf(wrong).code).toBe('invalid_credentials');
    });

    it('R-44: sin verificar no se entra', async () => {
      const data = fresh();
      await register(data);
      const res = await post('/api/auth/login', { email: data.email, password: data.password });
      expect(res.statusCode).toBe(403);
      expect(errorOf(res).code).toBe('email_not_verified');
    });

    it('la contraseña coincide aunque llegue en otra forma Unicode (NFD)', async () => {
      const data = { ...fresh(), password: 'Ñandú corre 9!' };
      await signUp(data);
      const res = await post('/api/auth/login', { email: data.email, password: data.password.normalize('NFD') });
      expect(res.statusCode).toBe(200);
    });

    it('cerrar sesión borra la sesión de la base y la cookie', async () => {
      const { cookie } = await signUp();
      const res = await post('/api/auth/logout', {}, cookie);
      expect(res.statusCode).toBe(204);
      expect(cookieOf(res)?.value).toBe('');
      expect((await me(cookie)).statusCode).toBe(401);
    });

    it('la sesión vence a los 30 días', async () => {
      const { cookie } = await signUp();
      clock = new Date(START.getTime() + 30 * 86_400_000);
      expect((await me(cookie)).statusCode).toBe(401);
    });

    it('sin cookie, o con una inventada, no hay sesión', async () => {
      expect((await me()).statusCode).toBe(401);
      expect(errorOf(await me('inventada')).code).toBe('unauthorized');
    });

    it('en la base la sesión se guarda como huella, no como el token de la cookie', async () => {
      const { cookie } = await signUp();
      const rows = await ctx.database.db.select({ id: sessions.id }).from(sessions);
      expect(rows.some((r) => r.id === cookie)).toBe(false);
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id))).toBe(true);
    });
  });

  it('los registros no guardan correos, nombres, contraseñas ni códigos, que solo viajan en el cuerpo', async () => {
    logs = '';
    const data = fresh();
    await register(data);
    const code = lastCode();
    await post('/api/auth/verify', { email: data.email, code });
    await post('/api/auth/login', { email: data.email, password: data.password });
    await register(data); // correo repetido: ruta de D-59
    expect(logs).toContain('/api/auth/register');
    for (const secret of [data.email, data.displayName, data.password, code]) expect(logs).not.toContain(secret);
  });
});
