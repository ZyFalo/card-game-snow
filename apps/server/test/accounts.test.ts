import { PassThrough } from 'node:stream';
import { apiErrorSchema, checkEmailSchema, sessionSchema } from '@ventisca/protocol';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Captcha, missingCaptcha } from '../src/accounts/captcha';
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

  /** Captcha de prueba: acepta el token "ok" y cuenta cuántas veces se consultó. */
  let captchaCalls = 0;
  const captcha: Captcha = {
    available: true,
    async verify(token) {
      captchaCalls += 1;
      return token === 'ok';
    },
  };

  const makeApp = (overrides: Partial<{ mailer: Mailer; appUrl: string; captcha: Captcha }> = {}) => {
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
        captcha,
        secret: 's'.repeat(48),
        appUrl: 'https://ventisca.test',
        now: () => clock,
        ...overrides,
      },
    });
  };
  let app: ReturnType<typeof makeApp>;

  // Una app nueva por prueba: los límites de intentos viven en memoria y no deben pasar de una a otra.
  beforeEach(() => {
    clock = START;
    sent = [];
    captchaCalls = 0;
    app = makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  let n = 0;
  /** Datos nuevos para cada prueba: comparten la base. */
  const fresh = () => {
    n += 1;
    return { email: `copo${n}@example.com`, displayName: `Copo ${n}`, password: 'Tundra7#Oso' };
  };
  const post = (url: string, payload: object, cookie?: string, ip = '203.0.113.1') =>
    app.inject({
      method: 'POST',
      url,
      payload,
      remoteAddress: ip,
      ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    });
  const register = (data: ReturnType<typeof fresh>, extra: object = {}) =>
    post('/api/auth/register', { ...data, acceptPrivacy: true, captchaToken: 'ok', ...extra });
  const lastCode = () => (sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1] ?? '') as string;
  const at = (seconds: number) => {
    clock = new Date(START.getTime() + seconds * 1000);
  };
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

    it('el correo de verificación no lleva el nombre visible: nadie puede meter su texto en el correo de otro', async () => {
      const data = { ...fresh(), displayName: 'Visita Ya' };
      await register(data);
      expect(sent[0]?.text.startsWith('Hola:\n')).toBe(true);
      expect(sent[0]?.text).not.toContain(data.displayName);
      expect(sent[0]?.subject).not.toContain(data.displayName);
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
      // Sin sesión no se dice cuántos intentos quedan (D-59), pero el límite se aplica igual.
      for (let i = 0; i < CODE_ATTEMPTS; i++) {
        const res = await post('/api/auth/verify', { email: data.email, code: wrong });
        expect(errorOf(res)).toEqual({ code: 'invalid_code' });
      }
      const right = await post('/api/auth/verify', { email: data.email, code });
      expect(errorOf(right)).toEqual({ code: 'invalid_code' });
    });

    it('R-43: el código vence a los 15 minutos', async () => {
      const data = fresh();
      await register(data);
      clock = new Date(START.getTime() + 15 * 60_000);
      const res = await post('/api/auth/verify', { email: data.email, code: lastCode() });
      expect(errorOf(res)).toEqual({ code: 'invalid_code' });
    });

    it('D-59: sin sesión, un código que no sirve responde igual exista o no la cuenta', async () => {
      const pending = fresh();
      await register(pending);
      const wrong = lastCode() === '000000' ? '111111' : '000000';
      const { data: verified } = await signUp();
      const bodies = await Promise.all(
        [pending.email, verified.email, 'nadie@example.com'].map(async (email) => {
          const res = await post('/api/auth/verify', { email, code: wrong });
          return [res.statusCode, res.body];
        }),
      );
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
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
        payload: { ...data, acceptPrivacy: true, captchaToken: 'ok' },
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
  describe('Captcha del registro (Turnstile)', () => {
    it('sin un captcha válido no hay registro ni correo', async () => {
      const res = await register(fresh(), { captchaToken: 'malo' });
      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe('captcha_failed');
      expect(sent).toHaveLength(0);
    });

    it('un error del formulario se responde antes del captcha, para no gastar su token', async () => {
      await register({ ...fresh(), password: 'corta1!' });
      expect(captchaCalls).toBe(0);
    });

    it('en producción sin clave de Turnstile no hay registro', async () => {
      const offline = makeApp({ captcha: missingCaptcha });
      const res = await offline.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { ...fresh(), acceptPrivacy: true, captchaToken: 'ok' },
      });
      await offline.close();
      expect(res.statusCode).toBe(503);
      expect(errorOf(res).code).toBe('captcha_unavailable');
    });
  });

  describe('Límites de intentos', () => {
    it('5 intentos fallidos por cuenta cada 15 min: al sexto responde 429, aunque la contraseña sea correcta', async () => {
      const { data } = await signUp();
      for (let i = 0; i < 5; i++) {
        const res = await post(
          '/api/auth/login',
          { email: data.email, password: 'Otra9#Cosa' },
          undefined,
          `198.51.100.${i}`,
        );
        expect(res.statusCode).toBe(401);
      }
      const blocked = await post(
        '/api/auth/login',
        { email: data.email, password: data.password },
        undefined,
        '198.51.100.9',
      );
      expect(blocked.statusCode).toBe(429);
      expect(errorOf(blocked).code).toBe('too_many_requests');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      at(15 * 60 + 1);
      const later = await post(
        '/api/auth/login',
        { email: data.email, password: data.password },
        undefined,
        '198.51.100.9',
      );
      expect(later.statusCode).toBe(200);
    });

    it('D-59: un correo sin cuenta se limita igual que uno con cuenta', async () => {
      for (let i = 0; i < 5; i++) {
        await post(
          '/api/auth/login',
          { email: 'nadie@example.com', password: 'Otra9#Cosa' },
          undefined,
          `192.0.2.${i}`,
        );
      }
      const res = await post(
        '/api/auth/login',
        { email: 'nadie@example.com', password: 'Otra9#Cosa' },
        undefined,
        '192.0.2.9',
      );
      expect(res.statusCode).toBe(429);
    });

    it('5 intentos fallidos por IP cada 15 min, aunque cada uno sea con un correo distinto', async () => {
      for (let i = 0; i < 5; i++) {
        await post(
          '/api/auth/login',
          { email: `x${i}@example.com`, password: 'Otra9#Cosa' },
          undefined,
          '203.0.113.50',
        );
      }
      const same = await post(
        '/api/auth/login',
        { email: 'x9@example.com', password: 'Otra9#Cosa' },
        undefined,
        '203.0.113.50',
      );
      const other = await post(
        '/api/auth/login',
        { email: 'x9@example.com', password: 'Otra9#Cosa' },
        undefined,
        '203.0.113.51',
      );
      expect(same.statusCode).toBe(429);
      expect(other.statusCode).toBe(401);
    });

    it('el límite por IP no se esquiva inventando X-Forwarded-For: cuenta la IP que vio el proxy de Railway', async () => {
      const attempt = (i: number) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: `y${i}@example.com`, password: 'Otra9#Cosa' },
          // El proxy de Railway agrega al final la IP real; lo de antes lo escribe quien pide.
          remoteAddress: '10.0.0.2',
          headers: { 'x-forwarded-for': `1.2.3.${i}, 203.0.113.77` },
        });
      for (let i = 0; i < 5; i++) expect((await attempt(i)).statusCode).toBe(401);
      expect((await attempt(9)).statusCode).toBe(429);
    });

    it('iniciar sesión bien borra los fallos de la cuenta', async () => {
      const { data } = await signUp();
      for (let i = 0; i < 4; i++) {
        await post('/api/auth/login', { email: data.email, password: 'Otra9#Cosa' }, undefined, `198.51.100.${i}`);
      }
      await post('/api/auth/login', { email: data.email, password: data.password }, undefined, '198.51.100.20');
      const again = await post(
        '/api/auth/login',
        { email: data.email, password: 'Otra9#Cosa' },
        undefined,
        '198.51.100.21',
      );
      expect(again.statusCode).toBe(401);
    });

    it('hasta 3 correos por hora por dirección: el cuarto no sale, y la respuesta es la misma (D-59)', async () => {
      const data = fresh();
      await register(data);
      at(60);
      await post('/api/auth/resend', { email: data.email });
      at(120);
      await post('/api/auth/resend', { email: data.email });
      expect(sent).toHaveLength(3);
      at(180);
      const fourth = await post('/api/auth/resend', { email: data.email });
      expect(fourth.statusCode).toBe(202);
      expect(sent).toHaveLength(3);
      at(3600 + 1);
      await post('/api/auth/resend', { email: data.email });
      expect(sent).toHaveLength(4);
    });
  });

  describe('Recuperar la contraseña (R-46)', () => {
    it('R-46: el código llega al correo; con la contraseña nueva se cierran todas las sesiones y se entra con una nueva', async () => {
      const { data, cookie: old } = await signUp();
      sent = [];
      expect((await post('/api/auth/recover/request', { email: data.email })).statusCode).toBe(202);
      expect(sent[0]?.subject).toMatch(/recuperar tu contraseña/);
      const res = await post('/api/auth/recover/confirm', {
        email: data.email,
        code: lastCode(),
        password: 'Glaciar8$Nuevo',
      });
      expect(res.statusCode).toBe(200);
      expect((await me(old)).statusCode).toBe(401);
      expect((await me(cookieOf(res)?.value)).statusCode).toBe(200);
      expect(sent.at(-1)?.subject).toBe('Tu contraseña de Ventisca cambió');
      expect((await post('/api/auth/login', { email: data.email, password: data.password })).statusCode).toBe(401);
      expect((await post('/api/auth/login', { email: data.email, password: 'Glaciar8$Nuevo' })).statusCode).toBe(200);
    });

    it('D-59: pedir la recuperación de un correo sin cuenta responde igual y no manda nada', async () => {
      const { data } = await signUp();
      sent = [];
      const known = await post('/api/auth/recover/request', { email: data.email });
      const unknown = await post('/api/auth/recover/request', { email: 'nadie@example.com' });
      expect(unknown.statusCode).toBe(known.statusCode);
      expect(unknown.json()).toEqual(known.json());
      expect(sent.map((m) => m.to)).toEqual([data.email]);
      const confirm = await post('/api/auth/recover/confirm', {
        email: 'nadie@example.com',
        code: '123456',
        password: 'Glaciar8$Nuevo',
      });
      expect(errorOf(confirm).code).toBe('invalid_code');
    });

    it('una contraseña nueva débil se rechaza sin gastar un intento del código', async () => {
      const { data } = await signUp();
      await post('/api/auth/recover/request', { email: data.email });
      const code = lastCode();
      const weak = await post('/api/auth/recover/confirm', { email: data.email, code, password: 'Password1!' });
      expect(errorOf(weak)).toEqual({ code: 'weak_password', reason: 'common' });
      const ok = await post('/api/auth/recover/confirm', { email: data.email, code, password: 'Glaciar8$Nuevo' });
      expect(ok.statusCode).toBe(200);
    });

    it('recuperar la contraseña de una cuenta sin verificar la verifica: el código prueba que el correo es suyo', async () => {
      const data = fresh();
      await register(data);
      at(60);
      await post('/api/auth/recover/request', { email: data.email });
      const res = await post('/api/auth/recover/confirm', {
        email: data.email,
        code: lastCode(),
        password: 'Glaciar8$Nuevo',
      });
      expect(sessionSchema.parse(res.json()).user.verified).toBe(true);
    });

    it('el aviso "Ya tienes una cuenta" dice que desde ahí puede recuperar la contraseña', async () => {
      const { data } = await signUp();
      sent = [];
      await register({ ...fresh(), email: data.email });
      expect(sent[0]?.text).toMatch(/recupérala/);
    });
  });

  describe('Cambiar la contraseña (R-47)', () => {
    it('R-47: pide la actual; cierra las demás sesiones, deja la actual y avisa al correo', async () => {
      const { data, cookie } = await signUp();
      const other = cookieOf(await post('/api/auth/login', { email: data.email, password: data.password }))?.value;
      sent = [];
      const wrong = await post(
        '/api/auth/password',
        { currentPassword: 'Otra9#Cosa', newPassword: 'Glaciar8$Nuevo' },
        cookie,
      );
      expect(errorOf(wrong).code).toBe('invalid_credentials');
      const res = await post(
        '/api/auth/password',
        { currentPassword: data.password, newPassword: 'Glaciar8$Nuevo' },
        cookie,
      );
      expect(res.statusCode).toBe(204);
      expect((await me(cookie)).statusCode).toBe(200);
      expect((await me(other)).statusCode).toBe(401);
      expect(sent.map((m) => m.subject)).toEqual(['Tu contraseña de Ventisca cambió']);
      expect((await post('/api/auth/login', { email: data.email, password: 'Glaciar8$Nuevo' })).statusCode).toBe(200);
    });

    it('sin sesión no se puede', async () => {
      const res = await post('/api/auth/password', { currentPassword: 'a', newPassword: 'b' });
      expect(errorOf(res).code).toBe('unauthorized');
    });

    it('la contraseña nueva cumple R-45', async () => {
      const { data, cookie } = await signUp();
      const res = await post('/api/auth/password', { currentPassword: data.password, newPassword: 'corta' }, cookie);
      expect(errorOf(res)).toEqual({ code: 'weak_password', reason: 'length' });
    });
  });

  describe('Cambiar el correo (R-48)', () => {
    it('R-48: con la contraseña, el código va al correo nuevo; al confirmarlo cambia y el anterior recibe un aviso', async () => {
      const { data, cookie } = await signUp();
      const newEmail = `nuevo.${data.email}`;
      sent = [];
      const req = await post('/api/auth/email/request', { password: data.password, newEmail }, cookie);
      expect(req.statusCode).toBe(202);
      expect(sent.map((m) => m.to)).toEqual([newEmail]);
      expect(sessionSchema.parse((await me(cookie)).json()).user.email).toBe(data.email);
      const res = await post('/api/auth/email/confirm', { code: lastCode() }, cookie);
      expect(sessionSchema.parse(res.json()).user.email).toBe(newEmail);
      expect(sent.at(-1)).toMatchObject({ to: data.email, subject: 'El correo de tu cuenta de Ventisca cambió' });
      expect(sent.at(-1)?.text).not.toContain(newEmail);
      expect((await post('/api/auth/login', { email: newEmail, password: data.password })).statusCode).toBe(200);
      expect((await post('/api/auth/login', { email: data.email, password: data.password })).statusCode).toBe(401);
    });

    it('con la contraseña equivocada no manda nada', async () => {
      const { cookie } = await signUp();
      sent = [];
      const res = await post(
        '/api/auth/email/request',
        { password: 'Otra9#Cosa', newEmail: 'otro@example.com' },
        cookie,
      );
      expect(errorOf(res).code).toBe('invalid_credentials');
      expect(sent).toHaveLength(0);
    });

    it('D-59: si el correo nuevo ya tiene cuenta, responde igual y no manda nada', async () => {
      const { data: taken } = await signUp();
      const { data, cookie } = await signUp();
      sent = [];
      const res = await post('/api/auth/email/request', { password: data.password, newEmail: taken.email }, cookie);
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ status: 'check_email' });
      expect(sent).toHaveLength(0);
    });

    it('el mismo correo que ya tiene no es un cambio', async () => {
      const { data, cookie } = await signUp();
      const res = await post('/api/auth/email/request', { password: data.password, newEmail: data.email }, cookie);
      expect(errorOf(res)).toEqual({ code: 'bad_request', reason: 'same_email' });
    });
  });

  it('con sesión, confirmar el correo nuevo sí dice cuántos intentos quedan: no hay nada que delatar', async () => {
    const { data, cookie } = await signUp();
    await post('/api/auth/email/request', { password: data.password, newEmail: `nuevo2.${data.email}` }, cookie);
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    const res = await post('/api/auth/email/confirm', { code: wrong }, cookie);
    expect(errorOf(res)).toEqual({ code: 'invalid_code', attemptsLeft: CODE_ATTEMPTS - 1 });
  });

  describe('Borrar la cuenta (R-49)', () => {
    it('R-49: con la contraseña se borran la cuenta, sus sesiones y sus códigos, y la cookie', async () => {
      const { data, cookie } = await signUp();
      const wrong = await post('/api/auth/delete', { password: 'Otra9#Cosa' }, cookie);
      expect(errorOf(wrong).code).toBe('invalid_credentials');
      const [user] = await ctx.database.db.select().from(users).where(eq(users.email, data.email));
      const res = await post('/api/auth/delete', { password: data.password }, cookie);
      expect(res.statusCode).toBe(204);
      expect(cookieOf(res)?.value).toBe('');
      expect(await ctx.database.db.select().from(users).where(eq(users.email, data.email))).toHaveLength(0);
      const uid = user?.id as string;
      expect(await ctx.database.db.select().from(sessions).where(eq(sessions.userId, uid))).toHaveLength(0);
      expect(await ctx.database.db.select().from(emailCodes).where(eq(emailCodes.userId, uid))).toHaveLength(0);
      expect((await me(cookie)).statusCode).toBe(401);
      expect((await post('/api/auth/login', { email: data.email, password: data.password })).statusCode).toBe(401);
    });

    it('sin sesión no se puede', async () => {
      expect(errorOf(await post('/api/auth/delete', { password: 'x' })).code).toBe('unauthorized');
    });
  });
});
