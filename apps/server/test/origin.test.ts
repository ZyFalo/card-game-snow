import { apiErrorSchema } from '@ventisca/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import type { Captcha } from '../src/accounts/captcha';
import type { Mail, Mailer } from '../src/accounts/mailer';
import { buildApp } from '../src/app';
import { users } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';

/*
 * D-65: una petición que cambia estado solo vale si viene del propio juego. La cookie es SameSite=Lax,
 * pero para SameSite todo wpena.dev es el mismo sitio, así que viaja en peticiones desde cualquier
 * otro subdominio. El navegador siempre dice de dónde viene una petición así, y una página no puede
 * falsificarlo.
 */
describe.skipIf(!adminUrl)('D-65: comprobación de origen (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  const APP = 'https://ventisca.test';
  let sent: Mail[] = [];
  const mailer: Mailer = {
    available: true,
    async send(mail) {
      sent.push(mail);
    },
  };
  const captcha: Captcha = { available: true, verify: async () => true };

  const apps: ReturnType<typeof buildApp>[] = [];
  const make = (extra: Partial<Parameters<typeof buildApp>[0]> = {}) => {
    const app = buildApp({
      ping: async () => {},
      webDist: null,
      logger: false,
      accounts: { db: ctx.database.db, mailer, captcha, secret: 's'.repeat(48), appUrl: APP },
      ...extra,
    });
    apps.push(app);
    return app;
  };
  afterEach(async () => {
    sent = [];
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  /** Cerrar sesión sin cookie: una petición que cambia estado y siempre responde 204 si llega. */
  const logout = (app: ReturnType<typeof make>, headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/api/auth/logout', headers });
  const rejected = (res: Awaited<ReturnType<typeof logout>>) => {
    expect(res.statusCode).toBe(403);
    expect(apiErrorSchema.parse(res.json())).toEqual({ error: { code: 'bad_origin' } });
  };

  it('D-65: una petición que cambia estado desde el propio juego pasa', async () => {
    expect((await logout(make(), { origin: APP })).statusCode).toBe(204);
  });

  it('D-65: desde otro sitio, otro subdominio, otro puerto u otro esquema se rechaza', async () => {
    const app = make();
    for (const origin of [
      'https://sitio-ajeno.example',
      'https://portafolio.ventisca.test',
      'https://ventisca.test.example',
      'https://ventisca.test:8443',
      'http://ventisca.test',
    ]) {
      rejected(await logout(app, { origin }));
    }
  });

  it('D-65: "Origin: null" (un marco aislado o una redirección) se rechaza', async () => {
    rejected(await logout(make(), { origin: 'null' }));
  });

  it('D-65: sin Origin decide Sec-Fetch-Site: del mismo origen pasa; del mismo sitio o de otro, no', async () => {
    const app = make();
    expect((await logout(app, { 'sec-fetch-site': 'same-origin' })).statusCode).toBe(204);
    expect((await logout(app, { 'sec-fetch-site': 'none' })).statusCode).toBe(204);
    rejected(await logout(app, { 'sec-fetch-site': 'same-site' }));
    rejected(await logout(app, { 'sec-fetch-site': 'cross-site' }));
  });

  it('D-65: sin ninguna de las dos cabeceras pasa: no es un navegador y no lleva la cookie de nadie', async () => {
    expect((await logout(make(), {})).statusCode).toBe(204);
  });

  it('D-65: las lecturas no se comprueban', async () => {
    const res = await make().inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { origin: 'https://sitio-ajeno.example' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('D-65: el origen de desarrollo (Vite) solo vale si se configura', async () => {
    const vite = 'http://localhost:5173';
    rejected(await logout(make(), { origin: vite }));
    expect((await logout(make({ devOrigin: vite }), { origin: vite })).statusCode).toBe(204);
  });

  it('D-65: una petición rechazada no llega a hacer nada: ni crea la cuenta ni manda el correo', async () => {
    const res = await make().inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: 'https://sitio-ajeno.example' },
      payload: {
        email: 'origen@example.com',
        password: 'Tundra7#Oso',
        displayName: 'Origen',
        acceptPrivacy: true,
        captchaToken: 'ok',
      },
    });
    rejected(res);
    expect(sent).toHaveLength(0);
    expect(await ctx.database.db.select().from(users)).toHaveLength(0);
  });
});
