import type { Progress, User } from '@ventisca/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_ERRORS, PROGRESS_TEXT } from '../i18n/es';
import { login, logout, pickCamino, showView } from './account';
import { buyBox, chooseCamino, loadProgress } from './progress';
import { initialState, store } from './store';

/*
 * El progreso en el cliente (D-34), contra un servidor simulado: cada petición queda anotada y se
 * responde a mano, en el orden que la prueba quiera. Así se prueba lo que pasa cuando una respuesta se
 * pierde o llega tarde.
 */

const USER: User = {
  id: '6f1c0f0e-8a52-4b0e-9d0b-1d0c5a1b2c3d',
  email: 'ana@example.com',
  displayName: 'Ana',
  verified: true,
};

const progress = (over: Partial<Progress> = {}): Progress => ({
  camino: 'fire',
  coins: 500,
  boxesOpened: 0,
  collection: { 'fire-01': 1, 'water-01': 1, 'snow-01': 1, 'fire-18': 1 },
  ...over,
});

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  /** Responde la petición: con un código y un cuerpo, o `lost` si la respuesta nunca llega. */
  reply(status: number | 'lost', json?: unknown): Promise<void>;
}

let calls: Call[] = [];

/** Deja correr las promesas pendientes, hasta que el estado refleje la última respuesta. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  calls = [];
  store.setState(initialState(), true);
  store.setState((s) => ({ account: { ...s.account, status: 'ready', user: USER } }));
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({
        method: init.method ?? 'GET',
        path,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
        async reply(status, json) {
          if (status === 'lost') reject(new TypeError('Failed to fetch'));
          else resolve(new Response(status === 204 ? null : JSON.stringify(json ?? null), { status }));
          await settle();
        },
      });
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const state = () => store.getState().progress;
const last = () => calls.at(-1) as Call;
const fail = (code: string) => ({ error: { code } });

/** Deja el progreso leído, como al abrir el perfil. */
async function loaded(data = progress()) {
  const reading = loadProgress();
  await last().reply(200, data);
  await reading;
}

describe('Progreso en el cliente (D-34)', () => {
  it('lee el progreso de la cuenta y lo deja tal como lo dio el servidor', async () => {
    const reading = loadProgress();
    expect(state().status).toBe('loading');
    expect(last()).toMatchObject({ method: 'GET', path: '/api/progress', body: null });
    await last().reply(200, progress({ coins: 320 }));
    expect(await reading).toBe(true);
    expect(state()).toMatchObject({ status: 'ready', data: progress({ coins: 320 }) });
  });

  it('sin conexión, la lectura queda en error y se puede reintentar', async () => {
    const reading = loadProgress();
    await last().reply('lost');
    expect(await reading).toBe(false);
    expect(state()).toMatchObject({ status: 'error', data: null });
    await loaded();
    expect(state()).toMatchObject({ status: 'ready', data: progress() });
  });

  it('sin sesión no pide nada', async () => {
    store.setState((s) => ({ account: { ...s.account, user: null } }));
    expect(await loadProgress()).toBe(false);
    await buyBox('fire', 1);
    expect(await chooseCamino('fire')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('una lectura que se cruza con una compra no pisa el progreso que trajo la compra', async () => {
    await loaded();
    const reading = loadProgress();
    const read = last();
    const buying = buyBox('fire', 1);
    const bought = progress({ coins: 400, boxesOpened: 1, collection: { ...progress().collection, 'fire-05': 1 } });
    await last().reply(200, { cards: ['fire-05'], progress: bought });
    await buying;
    // La lectura salió antes de la compra y llega después: trae el saldo viejo.
    await read.reply(200, progress());
    await reading;
    expect(state()).toMatchObject({ status: 'ready', data: bought });
  });

  it('si la sesión venció, vuelve a la entrada y ya no muestra el progreso', async () => {
    await loaded();
    const reading = loadProgress();
    await last().reply(401, fail('unauthorized'));
    await reading;
    expect(state()).toMatchObject({ status: 'idle', data: null });
    expect(store.getState().account).toMatchObject({ user: null, view: 'login', error: ACCOUNT_ERRORS.unauthorized });
  });

  it('una respuesta que llega después de cerrar la sesión se descarta', async () => {
    const reading = loadProgress();
    const read = last();
    const leaving = logout();
    await last().reply(204);
    await leaving;
    await read.reply(200, progress());
    expect(await reading).toBe(false);
    expect(state()).toMatchObject({ status: 'idle', data: null });
  });
});

describe('Carta de camino en el cliente (R-30)', () => {
  it('R-30: elegir el camino deja el progreso que respondió el servidor', async () => {
    await loaded(progress({ camino: null, coins: 0, collection: {} }));
    const choosing = chooseCamino('water');
    expect(state().busy).toBe(true);
    expect(last()).toMatchObject({ method: 'POST', path: '/api/progress/camino', body: { element: 'water' } });
    const chosen = progress({
      camino: 'water',
      coins: 0,
      collection: { 'fire-01': 1, 'water-01': 1, 'snow-01': 1, 'water-18': 1 },
    });
    await last().reply(200, chosen);
    expect(await choosing).toBe(true);
    expect(state()).toMatchObject({ busy: false, error: null, data: chosen });
  });

  it('R-30: si la cuenta ya tenía camino, lo dice y trae el que quedó', async () => {
    await loaded(progress({ camino: null, coins: 0, collection: {} }));
    const choosing = chooseCamino('water');
    await last().reply(409, fail('camino_already_chosen'));
    expect(await choosing).toBe(false);
    expect(state()).toMatchObject({ busy: false, error: ACCOUNT_ERRORS.camino_already_chosen });
    expect(last()).toMatchObject({ method: 'GET', path: '/api/progress' });
    await last().reply(200, progress({ camino: 'fire' }));
    expect(state().data?.camino).toBe('fire');
  });

  it('R-30: mientras espera la respuesta, no sale otra elección', async () => {
    await loaded(progress({ camino: null, coins: 0, collection: {} }));
    const choosing = chooseCamino('water');
    expect(await chooseCamino('fire')).toBe(false);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    await last().reply(200, progress({ camino: 'water' }));
    await choosing;
  });
});

describe('Elegir el camino desde su pantalla (R-30)', () => {
  beforeEach(async () => {
    await loaded(progress({ camino: null, coins: 0, collection: {} }));
    showView('camino');
  });

  it('R-30: al quedar elegido vuelve al perfil, con el aviso', async () => {
    const picking = pickCamino('snow');
    await last().reply(200, progress({ camino: 'snow' }));
    expect(await picking).toBe(true);
    expect(store.getState().account).toMatchObject({
      view: 'profile',
      info: { text: 'Listo: elegiste el Camino de la Nieve y recibiste tu mazo inicial.', tone: 'snow' },
    });
  });

  it('R-30: si el servidor lo rechaza, sigue en la pantalla con el mensaje', async () => {
    const picking = pickCamino('snow');
    await last().reply(500, fail('internal'));
    expect(await picking).toBe(false);
    expect(store.getState().account).toMatchObject({ view: 'camino', info: null });
    expect(state().error).toBe(ACCOUNT_ERRORS.generic);
  });

  it('R-30: si la persona salió de la pantalla mientras esperaba, se queda donde está', async () => {
    const picking = pickCamino('snow');
    showView('privacy');
    await last().reply(200, progress({ camino: 'snow' }));
    expect(await picking).toBe(true);
    expect(store.getState().account).toMatchObject({ view: 'privacy', info: null });
    expect(state().data?.camino).toBe('snow');
  });
});

describe('Compra de cajas en el cliente (R-28, D-66)', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const box = (cards: string[], over: Partial<Progress> = {}) => ({ cards, progress: progress(over) });

  it('R-28: una compra manda la caja con un identificador y deja el resultado del servidor', async () => {
    await loaded();
    const buying = buyBox('fire', 2);
    expect(state().busy).toBe(true);
    expect(last()).toMatchObject({ method: 'POST', path: '/api/progress/boxes', body: { element: 'fire', size: 2 } });
    expect(last().body?.purchaseId).toMatch(UUID);
    const after = { coins: 320, boxesOpened: 1, collection: { ...progress().collection, 'fire-07': 1, 'fire-01': 2 } };
    await last().reply(200, box(['fire-07', 'fire-01'], after));
    await buying;
    expect(state()).toMatchObject({
      busy: false,
      pending: null,
      error: null,
      data: progress(after),
      reveal: { element: 'fire', cards: ['fire-07', 'fire-01'], fresh: [true, false] },
    });
  });

  it('D-66: si la respuesta se pierde, comprar de nuevo la misma caja manda el mismo identificador', async () => {
    await loaded();
    const first = buyBox('snow', 1);
    const id = last().body?.purchaseId;
    await last().reply('lost');
    await first;
    // No se sabe si el servidor cobró: el mensaje dice que reintentar es seguro.
    expect(state()).toMatchObject({ busy: false, error: PROGRESS_TEXT.purchaseUnknown, reveal: null });

    const second = buyBox('snow', 1);
    expect(last().body).toEqual({ purchaseId: id, element: 'snow', size: 1 });
    await last().reply(200, box(['snow-03'], { coins: 400 }));
    await second;
    expect(state()).toMatchObject({ pending: null, error: null, reveal: { cards: ['snow-03'] } });
  });

  it('D-66: un error del servidor tampoco dice si cobró: el reintento conserva el identificador', async () => {
    await loaded();
    const first = buyBox('snow', 1);
    const id = last().body?.purchaseId;
    await last().reply(500, fail('internal'));
    await first;
    expect(state().error).toBe(PROGRESS_TEXT.purchaseUnknown);
    const second = buyBox('snow', 1);
    expect(last().body?.purchaseId).toBe(id);
    await last().reply(200, box(['snow-03']));
    await second;
  });

  it('D-66: después de una compra hecha, la siguiente lleva otro identificador', async () => {
    await loaded();
    const first = buyBox('fire', 1);
    const id = last().body?.purchaseId;
    await last().reply(200, box(['fire-02']));
    await first;
    const second = buyBox('fire', 1);
    expect(last().body?.purchaseId).toMatch(UUID);
    expect(last().body?.purchaseId).not.toBe(id);
    await last().reply(200, box(['fire-03']));
    await second;
  });

  it('D-66: otra caja es otra compra, con su propio identificador', async () => {
    await loaded();
    const first = buyBox('fire', 1);
    const id = last().body?.purchaseId;
    await last().reply('lost');
    await first;
    for (const [element, size] of [
      ['fire', 2],
      ['water', 1],
    ] as const) {
      const other = buyBox(element, size);
      expect(last().body?.purchaseId).not.toBe(id);
      await last().reply('lost');
      await other;
    }
  });

  it('mientras una compra espera, no sale otra', async () => {
    await loaded();
    const first = buyBox('fire', 1);
    await buyBox('fire', 1);
    await buyBox('water', 3);
    expect(calls.filter((c) => c.path === '/api/progress/boxes')).toHaveLength(1);
    expect(state().busy).toBe(true);
    await last().reply(200, box(['fire-02']));
    await first;
    expect(state().busy).toBe(false);
  });

  it('el servidor rechaza la compra: queda su mensaje y no hay revelado', async () => {
    await loaded();
    const buying = buyBox('fire', 3);
    await last().reply(409, fail('not_enough_coins'));
    await buying;
    expect(state()).toMatchObject({
      busy: false,
      error: ACCOUNT_ERRORS.not_enough_coins,
      reveal: null,
      data: progress(),
    });
  });

  it('las cartas nuevas se deciden con la colección que respondió el servidor', async () => {
    await loaded();
    const buying = buyBox('fire', 3);
    // fire-09 es nueva y salió dos veces: solo la primera es nueva. fire-01 ya estaba.
    const collection = { ...progress().collection, 'fire-09': 2, 'fire-01': 2 };
    await last().reply(200, box(['fire-09', 'fire-01', 'fire-09'], { collection }));
    await buying;
    expect(state().reveal).toMatchObject({ cards: ['fire-09', 'fire-01', 'fire-09'], fresh: [true, false, false] });
  });

  it('un reintento que el servidor ya había cobrado muestra igual cuáles eran nuevas', async () => {
    await loaded();
    const first = buyBox('water', 1);
    await last().reply('lost');
    await first;
    // Entre el intento y el reintento se leyó el progreso, que ya incluye la carta.
    const collection = { ...progress().collection, 'water-12': 1 };
    await loaded(progress({ coins: 400, collection }));
    const second = buyBox('water', 1);
    await last().reply(200, box(['water-12'], { coins: 400, collection }));
    await second;
    expect(state().reveal).toMatchObject({ cards: ['water-12'], fresh: [true] });
  });
});

describe('Al entrar (PRD de v2, "Primera vez en línea")', () => {
  beforeEach(() => {
    store.setState((s) => ({ account: { ...s.account, user: null }, screen: 'account' }));
  });

  async function enter(reply: (progressCall: Call) => Promise<void>) {
    const entering = login('ana@example.com', 'Tundra7#Oso');
    await last().reply(200, { user: USER });
    expect(last()).toMatchObject({ method: 'GET', path: '/api/progress' });
    await reply(last());
    await entering;
    return store.getState().account;
  }

  it('quien todavía no eligió su camino va a elegirlo', async () => {
    const account = await enter((call) => call.reply(200, progress({ camino: null, coins: 0, collection: {} })));
    expect(account).toMatchObject({ user: USER, view: 'camino', busy: false });
  });

  it('quien ya lo eligió va a su perfil', async () => {
    const account = await enter((call) => call.reply(200, progress()));
    expect(account).toMatchObject({ user: USER, view: 'profile', busy: false });
  });

  it('si la sesión termina mientras se lee el progreso, vuelve a "Entrar" con el aviso', async () => {
    const account = await enter((call) => call.reply(401, fail('unauthorized')));
    expect(account).toMatchObject({ user: null, view: 'login', busy: false, error: ACCOUNT_ERRORS.unauthorized });
  });

  it('si el progreso no se pudo leer, va a su perfil, donde puede reintentar', async () => {
    const account = await enter((call) => call.reply('lost'));
    expect(account).toMatchObject({ user: USER, view: 'profile', busy: false });
    expect(state().status).toBe('error');
  });
});
