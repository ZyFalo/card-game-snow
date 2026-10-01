import { bankFor, CAMINO_CARDS, STARTER_CARDS } from '@ventisca/core';
import { apiErrorSchema, type Progress, progressSchema, sessionSchema } from '@ventisca/protocol';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Captcha } from '../src/accounts/captcha';
import type { Mail, Mailer } from '../src/accounts/mailer';
import { SESSION_COOKIE } from '../src/accounts/session';
import { fingerprint } from '../src/accounts/tokens';
import { buildApp } from '../src/app';
import { profiles, sessions, users } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';

/*
 * Progreso en la cuenta (PRD de v2, D-34): la carta de camino y la colección, con la regla R-30 resuelta
 * en el servidor y contra un Postgres de verdad.
 */
describe.skipIf(!adminUrl)('Progreso en la cuenta (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase({ migrate: true });
  const SECRET = 's'.repeat(48);
  const NOW = new Date('2026-10-01T12:00:00Z');
  let sent: Mail[] = [];
  const mailer: Mailer = {
    available: true,
    async send(mail) {
      sent.push(mail);
    },
  };
  const captcha: Captcha = { available: true, verify: async () => true };

  const makeApp = () =>
    buildApp({
      ping: async () => {},
      webDist: null,
      logger: false,
      accounts: {
        db: ctx.database.db,
        mailer,
        captcha,
        secret: SECRET,
        appUrl: 'https://ventisca.test',
        now: () => NOW,
      },
    });
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    sent = [];
    app = makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  const db = () => ctx.database.db;
  const post = (url: string, payload: object, cookie?: string) =>
    app.inject({ method: 'POST', url, payload, ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}) });
  const get = (url: string, cookie?: string) =>
    app.inject({ method: 'GET', url, ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}) });
  const errorOf = (res: Awaited<ReturnType<typeof post>>) => apiErrorSchema.parse(res.json()).error.code;

  let n = 0;
  /** Registra y verifica una cuenta nueva; devuelve su cookie y su id. */
  async function signUp() {
    n += 1;
    const email = `camino${n}@example.com`;
    await post('/api/auth/register', {
      email,
      displayName: `Camino ${n}`,
      password: 'Tundra7#Oso',
      acceptPrivacy: true,
      captchaToken: 'ok',
    });
    const code = (sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1] ?? '') as string;
    const res = await post('/api/auth/verify', { email, code });
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string;
    return { cookie, userId: sessionSchema.parse(res.json()).user.id, email };
  }
  const progress = async (cookie: string): Promise<Progress> =>
    progressSchema.parse((await get('/api/progress', cookie)).json());
  const choose = (cookie: string, element: string) => post('/api/progress/camino', { element }, cookie);

  /** Una cuenta con su camino ya elegido. */
  async function player(element = 'fire') {
    const who = await signUp();
    await choose(who.cookie, element);
    return who;
  }
  const totalCards = (p: Progress) => Object.values(p.collection).reduce((a, b) => a + b, 0);

  /**
   * Abre todas las conexiones del pool antes de una prueba de concurrencia. Sin esto, la primera
   * transacción usa la única conexión abierta y termina mientras las demás todavía se conectan, y
   * nada llega a cruzarse: una implementación ingenua pasaría la prueba.
   */
  const warmPool = () => Promise.all(Array.from({ length: 10 }, () => db().execute(sql`select pg_sleep(0.05)`)));

  describe('Leer el progreso', () => {
    it('sin sesión, nada del progreso responde', async () => {
      expect((await get('/api/progress')).statusCode).toBe(401);
      expect((await post('/api/progress/camino', { element: 'fire' })).statusCode).toBe(401);
    });

    it('D-34: una cuenta nueva todavía no tiene camino, monedas ni cartas', async () => {
      const { cookie } = await signUp();
      expect(await progress(cookie)).toEqual({ camino: null, coins: 0, boxesOpened: 0, collection: {} });
    });

    it('R-44: sin verificar el correo no hay progreso, aunque exista una sesión', async () => {
      const [user] = await db()
        .insert(users)
        .values({
          email: 'sin-verificar@example.com',
          passwordHash: 'x',
          displayName: 'Nadie',
          displayNameKey: 'nadie',
        })
        .returning();
      const token = 'token-de-prueba';
      await db()
        .insert(sessions)
        .values({
          id: fingerprint(SECRET, 'session', token),
          userId: user?.id as string,
          expiresAt: new Date(NOW.getTime() + 60_000),
        });
      const res = await get('/api/progress', token);
      expect(res.statusCode).toBe(403);
      expect(errorOf(res)).toBe('email_not_verified');
    });
  });

  describe('Carta de camino (R-30)', () => {
    it('R-30: elegir el camino da el inventario inicial: un 9 por elemento y el 12 del camino', async () => {
      const { cookie } = await signUp();
      const res = await choose(cookie, 'snow');
      expect(res.statusCode).toBe(200);
      const expected = {
        camino: 'snow',
        coins: 0,
        boxesOpened: 0,
        collection: {
          [STARTER_CARDS.fire]: 1,
          [STARTER_CARDS.water]: 1,
          [STARTER_CARDS.snow]: 1,
          [CAMINO_CARDS.snow]: 1,
        },
      };
      expect(progressSchema.parse(res.json())).toEqual(expected);
      expect(await progress(cookie)).toEqual(expected);
      // Las cartas son las del banco: tres de valor 9 y una de valor 12.
      expect(bankFor('snow').find((c) => c.id === CAMINO_CARDS.snow)?.value).toBe(12);
      expect(bankFor('fire').find((c) => c.id === STARTER_CARDS.fire)?.value).toBe(9);
    });

    it('R-30: la elección es permanente: otro elemento se rechaza y no cambia nada', async () => {
      const { cookie } = await player('fire');
      const before = await progress(cookie);
      const res = await choose(cookie, 'water');
      expect(res.statusCode).toBe(409);
      expect(errorOf(res)).toBe('camino_already_chosen');
      expect(await progress(cookie)).toEqual(before);
    });

    it('R-30: repetir la misma elección responde igual y no duplica el inventario', async () => {
      const { cookie } = await player('water');
      const before = await progress(cookie);
      const res = await choose(cookie, 'water');
      expect(res.statusCode).toBe(200);
      expect(progressSchema.parse(res.json())).toEqual(before);
      expect(totalCards(await progress(cookie))).toBe(4);
    });

    it('R-30: elegir los tres caminos a la vez deja uno solo, con un solo inventario', async () => {
      const { cookie, userId } = await signUp();
      await warmPool();
      const results = await Promise.all(
        ['fire', 'water', 'snow', 'fire', 'water', 'snow'].map((el) => choose(cookie, el)),
      );
      const now = await progress(cookie);
      expect(now.camino).not.toBeNull();
      // Ganó un elemento: sus dos peticiones responden 200 y las otras cuatro, 409.
      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2);
      expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
      expect(totalCards(now)).toBe(4);
      expect(await db().select().from(profiles).where(eq(profiles.userId, userId))).toHaveLength(1);
    });

    it('un elemento que no existe es una petición inválida', async () => {
      const { cookie } = await signUp();
      const res = await choose(cookie, 'tierra');
      expect(res.statusCode).toBe(400);
      expect(errorOf(res)).toBe('bad_request');
      expect((await progress(cookie)).camino).toBeNull();
    });
  });
});
