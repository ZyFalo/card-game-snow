import { randomUUID } from 'node:crypto';
import { bankFor, CAMINO_CARDS, openBox, rngFrom, STARTER_CARDS } from '@ventisca/core';
import { apiErrorSchema, boxResultSchema, type Progress, progressSchema, sessionSchema } from '@ventisca/protocol';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Captcha } from '../src/accounts/captcha';
import type { Mail, Mailer } from '../src/accounts/mailer';
import { SESSION_COOKIE } from '../src/accounts/session';
import { fingerprint } from '../src/accounts/tokens';
import { buildApp } from '../src/app';
import { creditRound } from '../src/progress/store';
import { coinLedger, collection, profiles, sessions, users } from '../src/schema';
import { adminUrl, useTempDatabase } from './support/database';

/*
 * Progreso en la cuenta (PRD de v2, D-34): carta de camino, libro de monedas, cajas y colección, con
 * las reglas R-25 a R-30 resueltas en el servidor y contra un Postgres de verdad.
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

  /** Semilla de las cajas: fija cuando una prueba quiere saber qué cartas salen. */
  let seed: (() => number) | undefined;
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
      ...(seed ? { boxSeed: seed } : {}),
    });
  let app: ReturnType<typeof makeApp>;
  beforeEach(() => {
    sent = [];
    seed = undefined;
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
  /** Compra una caja. Cada compra lleva su identificador, que genera el cliente (D-66). */
  const buy = (cookie: string, element: string, size: number, purchaseId: string = randomUUID()) =>
    post('/api/progress/boxes', { element, size, purchaseId }, cookie);

  /** Una cuenta con su camino elegido y, si se pide, monedas cobradas por rondas de una partida. */
  async function player(element = 'fire', rounds: (1 | 2 | 3 | 'bonus')[] = []) {
    const who = await signUp();
    await choose(who.cookie, element);
    const matchId = randomUUID();
    for (const round of rounds) await creditRound(db(), { userId: who.userId, matchId, round, doubled: false }, NOW);
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
      expect((await post('/api/progress/boxes', { element: 'fire', size: 1 })).statusCode).toBe(401);
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

  describe('Libro de monedas (R-29, D-31)', () => {
    const pay = (userId: string, matchId: string, round: 1 | 2 | 3 | 'bonus', doubled = false) =>
      creditRound(db(), { userId, matchId, round, doubled }, NOW);

    it('R-29: cada ronda paga lo suyo: 60, 120 y 120, y 120 por el bonus', async () => {
      const { cookie, userId } = await player();
      const matchId = randomUUID();
      expect(await pay(userId, matchId, 1)).toEqual({ credited: true, amount: 60 });
      expect(await pay(userId, matchId, 2)).toEqual({ credited: true, amount: 120 });
      expect(await pay(userId, matchId, 3)).toEqual({ credited: true, amount: 120 });
      expect(await pay(userId, matchId, 'bonus')).toEqual({ credited: true, amount: 120 });
      expect((await progress(cookie)).coins).toBe(420);
      expect(await db().select().from(coinLedger).where(eq(coinLedger.userId, userId))).toHaveLength(4);
    });

    it('D-31: una ronda no se cobra dos veces, aunque el cobro llegue repetido', async () => {
      const { cookie, userId } = await player();
      const matchId = randomUUID();
      expect(await pay(userId, matchId, 1)).toEqual({ credited: true, amount: 60 });
      expect(await pay(userId, matchId, 1)).toEqual({ credited: false, amount: 0 });
      expect((await progress(cookie)).coins).toBe(60);
      expect(await db().select().from(coinLedger).where(eq(coinLedger.userId, userId))).toHaveLength(1);
    });

    it('D-31: veinte cobros simultáneos de la misma ronda pagan una sola vez', async () => {
      const { cookie, userId } = await player();
      const matchId = randomUUID();
      await warmPool();
      const results = await Promise.all(Array.from({ length: 20 }, () => pay(userId, matchId, 2)));
      expect(results.filter((r) => r.credited)).toHaveLength(1);
      expect((await progress(cookie)).coins).toBe(120);
    });

    it('D-31: la misma ronda de otra partida sí se cobra', async () => {
      const { cookie, userId } = await player();
      await pay(userId, randomUUID(), 1);
      await pay(userId, randomUUID(), 1);
      expect((await progress(cookie)).coins).toBe(120);
    });

    it('R-29: con los 9 logros, la ronda paga el doble', async () => {
      const { cookie, userId } = await player();
      expect(await pay(userId, randomUUID(), 1, true)).toEqual({ credited: true, amount: 120 });
      expect((await progress(cookie)).coins).toBe(120);
    });

    it('D-31: el cobro de una persona no toca el saldo de otra', async () => {
      const a = await player();
      const b = await player();
      const matchId = randomUUID();
      await pay(a.userId, matchId, 1);
      expect((await progress(a.cookie)).coins).toBe(60);
      expect((await progress(b.cookie)).coins).toBe(0);
      // La misma partida y la misma ronda sí se le pagan a la otra persona (D-48).
      expect(await pay(b.userId, matchId, 1)).toEqual({ credited: true, amount: 60 });
    });

    it('sin carta de camino no hay perfil donde cobrar', async () => {
      const { userId } = await signUp();
      await expect(pay(userId, randomUUID(), 1)).rejects.toThrow();
      expect(await db().select().from(coinLedger).where(eq(coinLedger.userId, userId))).toHaveLength(0);
    });
  });

  describe('Cajas (R-27, R-28)', () => {
    it('R-28: sin carta de camino no se puede comprar', async () => {
      const { cookie } = await signUp();
      const res = await buy(cookie, 'fire', 1);
      expect(res.statusCode).toBe(409);
      expect(errorOf(res)).toBe('camino_required');
    });

    it('R-28: sin monedas suficientes la compra se rechaza y no cambia nada', async () => {
      const { cookie } = await player('fire', [1]); // 60 monedas; la caja más barata cuesta 100.
      const before = await progress(cookie);
      const res = await buy(cookie, 'fire', 1);
      expect(res.statusCode).toBe(409);
      expect(errorOf(res)).toBe('not_enough_coins');
      expect(await progress(cookie)).toEqual(before);
    });

    it('R-28: una caja cobra su precio y suma sus cartas, del elemento elegido, a la colección', async () => {
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']); // 420 monedas
      const before = await progress(cookie);
      const res = await buy(cookie, 'water', 2);
      expect(res.statusCode).toBe(200);
      const { cards, progress: after } = boxResultSchema.parse(res.json());
      expect(cards).toHaveLength(2);
      const water = new Set(bankFor('water').map((c) => c.id));
      expect(cards.every((id) => water.has(id))).toBe(true);
      expect(after.coins).toBe(420 - 180);
      expect(after.boxesOpened).toBe(1);
      expect(totalCards(after)).toBe(totalCards(before) + 2);
      for (const id of new Set(cards)) {
        expect(after.collection[id]).toBe((before.collection[id] ?? 0) + cards.filter((c) => c === id).length);
      }
      expect(await progress(cookie)).toEqual(after);
    });

    it('R-28: las cajas de 1, 2 y 3 cartas cuestan 100, 180 y 250 monedas', async () => {
      const who = await player('snow', [1, 2, 3, 'bonus']);
      await creditRound(db(), { userId: who.userId, matchId: randomUUID(), round: 2, doubled: false }, NOW);
      await buy(who.cookie, 'snow', 1); // 540 monedas
      expect((await progress(who.cookie)).coins).toBe(440);
      await buy(who.cookie, 'snow', 2);
      expect((await progress(who.cookie)).coins).toBe(260);
      await buy(who.cookie, 'snow', 3);
      const after = await progress(who.cookie);
      expect(after.coins).toBe(10);
      expect(after.boxesOpened).toBe(3);
      expect(totalCards(after)).toBe(4 + 1 + 2 + 3);
    });

    it('R-27: las cartas las sortea el servidor con el motor: la misma semilla da las mismas cartas', async () => {
      await app.close();
      seed = () => 20261001;
      app = makeApp();
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']);
      const { cards } = boxResultSchema.parse((await buy(cookie, 'fire', 3)).json());
      expect(cards).toEqual(openBox('fire', 3, rngFrom(20261001)).map((c) => c.id));
    });

    it('R-25: una carta repetida suma copias a las que ya había', async () => {
      await app.close();
      seed = () => 7; // La misma semilla en las dos compras: sale la misma carta.
      app = makeApp();
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']);
      const before = await progress(cookie);
      const first = boxResultSchema.parse((await buy(cookie, 'water', 1)).json());
      const second = boxResultSchema.parse((await buy(cookie, 'water', 1)).json());
      expect(second.cards).toEqual(first.cards);
      const card = first.cards[0] as string;
      const had = before.collection[card] ?? 0;
      expect(first.progress.collection[card]).toBe(had + 1);
      expect(second.progress.collection[card]).toBe(had + 2);
      // Sigue siendo una sola carta distinta más, o ninguna si ya la tenía.
      expect(Object.keys(second.progress.collection)).toHaveLength(
        Object.keys(before.collection).length + (had ? 0 : 1),
      );
    });

    it('R-28: compras simultáneas no gastan de más: con 300 monedas solo se compra una caja de 250', async () => {
      const { cookie } = await player('fire', [1, 2, 3]); // 300 monedas
      await warmPool();
      const results = await Promise.all(Array.from({ length: 8 }, () => buy(cookie, 'fire', 3)));
      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
      expect(results.filter((r) => r.statusCode === 409).map(errorOf)).toEqual(Array(7).fill('not_enough_coins'));
      const after = await progress(cookie);
      expect(after.coins).toBe(50);
      expect(after.boxesOpened).toBe(1);
      expect(totalCards(after)).toBe(4 + 3);
    });

    it('R-28: con 420 monedas, diez compras simultáneas de 100 dejan cuatro cajas y 20 monedas', async () => {
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']);
      await warmPool();
      const results = await Promise.all(Array.from({ length: 10 }, () => buy(cookie, 'snow', 1)));
      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(4);
      expect(results.filter((r) => r.statusCode === 409).map(errorOf)).toEqual(Array(6).fill('not_enough_coins'));
      const after = await progress(cookie);
      expect(after.coins).toBe(20);
      expect(after.boxesOpened).toBe(4);
      expect(totalCards(after)).toBe(4 + 4);
    });

    it('R-28: la base tampoco deja un saldo negativo, pase lo que pase en el servidor', async () => {
      const { userId } = await player('fire', [1]);
      await expect(db().update(profiles).set({ coins: -1 }).where(eq(profiles.userId, userId))).rejects.toThrow();
    });

    it('una caja de un tamaño que no existe es una petición inválida', async () => {
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']);
      for (const size of [0, 4, 1.5, '2']) {
        const res = await post('/api/progress/boxes', { element: 'fire', size, purchaseId: randomUUID() }, cookie);
        expect(res.statusCode).toBe(400);
        expect(errorOf(res)).toBe('bad_request');
      }
      expect((await progress(cookie)).coins).toBe(420);
    });
  });

  describe('El libro registra las compras (D-66)', () => {
    const ledger = (userId: string) => db().select().from(coinLedger).where(eq(coinLedger.userId, userId));
    const purchases = async (userId: string) => (await ledger(userId)).filter((r) => r.purchaseId !== null);

    it('D-66: una compra deja en el libro un movimiento negativo, con su identificador y sus cartas', async () => {
      const { cookie, userId } = await player('fire', [1, 2, 3, 'bonus']);
      const purchaseId = randomUUID();
      const { cards } = boxResultSchema.parse((await buy(cookie, 'fire', 2, purchaseId)).json());
      const rows = await ledger(userId);
      expect(rows.find((r) => r.purchaseId === purchaseId)).toMatchObject({
        amount: -180,
        cards,
        matchId: null,
        round: null,
      });
      // Con los gastos en el libro, el saldo es siempre la suma de sus movimientos.
      expect((await progress(cookie)).coins).toBe(rows.reduce((sum, r) => sum + r.amount, 0));
    });

    it('D-66: un reintento con el mismo identificador devuelve el resultado original y no cobra de nuevo', async () => {
      const { cookie, userId } = await player('fire', [1, 2, 3, 'bonus']);
      const purchaseId = randomUUID();
      const first = boxResultSchema.parse((await buy(cookie, 'water', 3, purchaseId)).json());
      const retry = await buy(cookie, 'water', 3, purchaseId);
      expect(retry.statusCode).toBe(200);
      expect(boxResultSchema.parse(retry.json())).toEqual(first);
      const after = await progress(cookie);
      expect(after.coins).toBe(420 - 250);
      expect(after.boxesOpened).toBe(1);
      expect(totalCards(after)).toBe(4 + 3);
      expect(await purchases(userId)).toHaveLength(1);
    });

    it('D-66: ocho reintentos simultáneos del mismo identificador compran una sola caja', async () => {
      const { cookie, userId } = await player('fire', [1, 2, 3, 'bonus']);
      const purchaseId = randomUUID();
      await warmPool();
      const results = await Promise.all(Array.from({ length: 8 }, () => buy(cookie, 'snow', 1, purchaseId)));
      expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
      const drawn = results.map((r) => boxResultSchema.parse(r.json()).cards.join());
      expect(new Set(drawn).size).toBe(1);
      const after = await progress(cookie);
      expect(after.coins).toBe(320);
      expect(after.boxesOpened).toBe(1);
      expect(totalCards(after)).toBe(4 + 1);
      expect(await purchases(userId)).toHaveLength(1);
    });

    it('D-66: el reintento se reconoce aunque ya no alcancen las monedas', async () => {
      const { cookie } = await player('fire', [1, 2]); // 180 monedas: justo una caja de 2.
      const purchaseId = randomUUID();
      const first = boxResultSchema.parse((await buy(cookie, 'fire', 2, purchaseId)).json());
      expect(first.progress.coins).toBe(0);
      const retry = await buy(cookie, 'fire', 2, purchaseId);
      expect(retry.statusCode).toBe(200);
      expect(boxResultSchema.parse(retry.json()).cards).toEqual(first.cards);
      // Otra compra, con otro identificador, sí se rechaza.
      expect(errorOf(await buy(cookie, 'fire', 2))).toBe('not_enough_coins');
    });

    it('D-66: el mismo identificador con otra caja devuelve la compra original, sin cobrar otra', async () => {
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']);
      const purchaseId = randomUUID();
      const first = boxResultSchema.parse((await buy(cookie, 'fire', 1, purchaseId)).json());
      const other = boxResultSchema.parse((await buy(cookie, 'water', 3, purchaseId)).json());
      expect(other.cards).toEqual(first.cards);
      expect(other.progress.coins).toBe(320);
    });

    it('D-66: el identificador es único por cuenta: el mismo en otra cuenta es otra compra', async () => {
      const a = await player('fire', [1, 2, 3, 'bonus']);
      const b = await player('fire', [1, 2, 3, 'bonus']);
      const purchaseId = randomUUID();
      expect((await buy(a.cookie, 'fire', 1, purchaseId)).statusCode).toBe(200);
      expect((await buy(b.cookie, 'fire', 1, purchaseId)).statusCode).toBe(200);
      expect((await progress(a.cookie)).coins).toBe(320);
      expect((await progress(b.cookie)).coins).toBe(320);
    });

    it('D-66: una compra rechazada no deja nada en el libro, y su identificador sirve después', async () => {
      const { cookie, userId } = await player('fire', [1]); // 60 monedas
      const purchaseId = randomUUID();
      expect(errorOf(await buy(cookie, 'fire', 1, purchaseId))).toBe('not_enough_coins');
      expect(await purchases(userId)).toHaveLength(0);
      await creditRound(db(), { userId, matchId: randomUUID(), round: 2, doubled: false }, NOW); // 180 monedas
      expect((await buy(cookie, 'fire', 1, purchaseId)).statusCode).toBe(200);
      expect((await progress(cookie)).coins).toBe(80);
    });

    it('el identificador de la compra debe ser un UUID', async () => {
      const { cookie } = await player('fire', [1, 2, 3, 'bonus']);
      for (const purchaseId of [undefined, '', 'mi-compra', 12345]) {
        const res = await post('/api/progress/boxes', { element: 'fire', size: 1, purchaseId }, cookie);
        expect(res.statusCode).toBe(400);
        expect(errorOf(res)).toBe('bad_request');
      }
      expect((await progress(cookie)).coins).toBe(420);
    });

    it('D-66: en el libro, un renglón es un cobro de ronda o una compra, nunca las dos cosas ni ninguna', async () => {
      const { userId } = await player('fire');
      const insert = (row: Partial<typeof coinLedger.$inferInsert>) =>
        db()
          .insert(coinLedger)
          .values({ userId, amount: 60, ...row });
      // Un cobro de ronda no lleva identificador de compra, y es positivo.
      await expect(
        insert({ matchId: randomUUID(), round: '1', purchaseId: randomUUID(), cards: [] }),
      ).rejects.toThrow();
      await expect(insert({ matchId: randomUUID(), round: '1', amount: -60 })).rejects.toThrow();
      // Una compra lleva sus cartas, y es negativa.
      await expect(insert({ purchaseId: randomUUID(), cards: ['fire-01'], amount: 100 })).rejects.toThrow();
      await expect(insert({ purchaseId: randomUUID(), amount: -100 })).rejects.toThrow();
      // Un movimiento suelto, sin ronda ni compra, tampoco entra.
      await expect(insert({})).rejects.toThrow();
    });
  });

  describe('Borrar la cuenta (D-56)', () => {
    it('D-56: borrar la cuenta borra su perfil, su colección y su libro de monedas', async () => {
      const { cookie, userId } = await player('fire', [1, 2, 3, 'bonus']);
      await buy(cookie, 'fire', 1);
      expect(await db().select().from(collection).where(eq(collection.userId, userId))).not.toHaveLength(0);
      const res = await post('/api/auth/delete', { password: 'Tundra7#Oso' }, cookie);
      expect(res.statusCode).toBe(204);
      expect(await db().select().from(profiles).where(eq(profiles.userId, userId))).toHaveLength(0);
      expect(await db().select().from(collection).where(eq(collection.userId, userId))).toHaveLength(0);
      expect(await db().select().from(coinLedger).where(eq(coinLedger.userId, userId))).toHaveLength(0);
    });
  });
});
