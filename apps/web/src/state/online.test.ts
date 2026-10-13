import { createMatch } from '@ventisca/core';
import {
  CLOSE,
  type MatchSeat,
  PROTOCOL_VERSION,
  type Progress,
  type ServerPayload,
  type User,
} from '@ventisca/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostMessage } from '../host/GameHost';
import type { SocketLike } from '../net/socket';
import { noAchievements } from './achievements';
import { staleBehind } from './actions';
import {
  firstPageOf,
  openNotebook,
  PAGES_PER_ELEMENT,
  pageElement,
  pageWithin,
  showCardsOf,
  turnPage,
} from './notebook';
import {
  acceptBot,
  askLeave,
  closeOnline,
  createRoom,
  cyclePick,
  dismissNotice,
  finishResults,
  joinQueue,
  joinRoom,
  leaveMatch,
  leaveQueue,
  onlineDeps,
  openOnline,
  pickSeat,
  resumeIfPlaying,
  startRoom,
} from './online';
import { initialState, store } from './store';

/*
 * El juego en línea fuera del tablero, contra un servidor simulado: una conexión de mentira que anota lo
 * que el cliente manda y a la que la prueba le hace decir lo que quiera.
 */

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code?: number): void {
    this.closedWith = code ?? 1005;
  }
  /** El servidor manda un mensaje. */
  say(payload: ServerPayload): void {
    this.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, seq: 0, ...payload }) });
  }
  /** Lo que el cliente mandó, sin la versión ni el número. */
  get payloads(): Record<string, unknown>[] {
    return this.sent.map(({ v: _v, seq: _seq, ...rest }) => rest);
  }
}

const USER: User = {
  id: '6f1c0f0e-8a52-4b0e-9d0b-1d0c5a1b2c3d',
  email: 'ana@example.com',
  displayName: 'Ana',
  verified: true,
};

const progress = (over: Partial<Progress> = {}): Progress => ({
  camino: 'water',
  coins: 0,
  boxesOpened: 0,
  collection: { 'fire-01': 1, 'water-01': 1, 'snow-01': 1, 'water-18': 1 },
  achievements: noAchievements(),
  stats: { classic: { matches: 0, rounds: 0, wins: 0 }, storm: { matches: 0, rounds: 0, wins: 0 } },
  ...over,
});

const SEATS: MatchSeat[] = [
  { element: 'fire', kind: 'human', name: 'Beto', status: 'here' },
  { element: 'water', kind: 'human', name: 'Ana', status: 'here' },
  { element: 'snow', kind: 'bot', name: null, status: 'here' },
];

let sockets: FakeSocket[] = [];
let timers: (() => void)[] = [];
/** Lo que responde `GET /api/play/status`. */
let playStatus: { status: number; body: unknown } = { status: 200, body: { match: null } };
/** Lo que responde `GET /api/progress`: el progreso de la cuenta tal como lo tiene el servidor. */
let served: Progress = progress();

const last = () => sockets[sockets.length - 1] as FakeSocket;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const online = () => store.getState().online;

/** Abre el juego en línea con sesión y camino, y deja la conexión abierta en el inicio. */
function enter(): FakeSocket {
  openOnline();
  const socket = last();
  socket.onopen?.();
  socket.say({ type: 'welcome', name: 'Ana' });
  socket.say({ type: 'idle', reason: null, notice: null });
  return socket;
}

beforeEach(() => {
  sockets = [];
  timers = [];
  playStatus = { status: 200, body: { match: null } };
  served = progress();
  closeOnline();
  store.setState(initialState(), true);
  store.setState((s) => ({
    account: { ...s.account, status: 'ready', user: USER },
    progress: { ...s.progress, status: 'ready', data: progress() },
  }));
  onlineDeps.url = () => 'ws://juego.test/api/play';
  onlineDeps.open = () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  onlineDeps.later = (task) => {
    timers.push(task);
    return () => {
      timers = timers.filter((t) => t !== task);
    };
  };
  vi.stubGlobal('fetch', async (path: string) => {
    if (path === '/api/play/status')
      return new Response(JSON.stringify(playStatus.body), { status: playStatus.status });
    return new Response(JSON.stringify(served), { status: 200 });
  });
});

afterEach(() => {
  closeOnline();
  vi.unstubAllGlobals();
});

describe('Entrar a jugar en línea (D-83 y D-87)', () => {
  it('sin sesión lleva a "Entrar", y no abre ninguna conexión', () => {
    store.setState((s) => ({ account: { ...s.account, user: null } }));
    openOnline();
    expect(store.getState().screen).toBe('account');
    expect(store.getState().account.view).toBe('login');
    expect(sockets).toHaveLength(0);
  });

  it('sin carta de camino lleva a elegirla: sin ella no hay colección con que jugar (R-30)', () => {
    store.setState((s) => ({ progress: { ...s.progress, data: progress({ camino: null }) } }));
    openOnline();
    expect(store.getState().screen).toBe('account');
    expect(store.getState().account.view).toBe('camino');
    expect(sockets).toHaveLength(0);
  });

  it('con sesión y camino abre la ficha, ofrece el ninja del camino y se conecta', () => {
    const socket = enter();
    expect(store.getState().screen).toBe('online');
    expect(online()).toMatchObject({ link: 'open', place: 'home', view: 'pick', element: 'water' });
    expect(socket.payloads).toEqual([]);
    // Las flechas recorren los tres ninjas, dando la vuelta.
    cyclePick(1);
    expect(online().element).toBe('snow');
    cyclePick(1);
    expect(online().element).toBe('fire');
    cyclePick(-1);
    expect(online().element).toBe('snow');
  });

  it('la ✕ vuelve a la portada y cierra la conexión, sin olvidar el ninja elegido', () => {
    const socket = enter();
    cyclePick(1);
    closeOnline();
    expect(socket.closedWith).toBe(1000);
    expect(store.getState().screen).toBe('title');
    expect(online()).toMatchObject({ link: 'off', place: null, element: 'snow' });
  });
});

describe('La cola (R-52)', () => {
  it('"Jugar" entra con el ninja elegido, y el servidor dice cómo va la búsqueda', () => {
    const socket = enter();
    joinQueue();
    expect(socket.payloads).toEqual([{ type: 'queue.join', element: 'water' }]);
    expect(online().busy).toBe(true);
    const seats = [
      { element: 'fire' as const, name: null },
      { element: 'water' as const, name: 'Ana' },
      { element: 'snow' as const, name: null },
    ];
    socket.say({ type: 'queue.state', you: 'water', seats, offer: null, waitedMs: 1200 });
    expect(online()).toMatchObject({ place: 'queue', busy: false, queue: { you: 'water', waitedMs: 1200 } });
    acceptBot();
    leaveQueue();
    expect(socket.payloads.slice(1)).toEqual([{ type: 'queue.acceptBot' }, { type: 'queue.leave' }]);
    socket.say({ type: 'idle', reason: null, notice: null });
    expect(online()).toMatchObject({ place: 'home', queue: null });
  });

  it('si la conexión se cae mientras busca, al volver sigue buscando con el mismo ninja', async () => {
    const socket = enter();
    joinQueue();
    const seats = [
      { element: 'fire' as const, name: null },
      { element: 'water' as const, name: 'Ana' },
      { element: 'snow' as const, name: null },
    ];
    socket.say({ type: 'queue.state', you: 'water', seats, offer: null, waitedMs: 0 });
    socket.onclose?.({ code: 1006 });
    await settle();
    expect(online().link).toBe('reconnecting');
    timers.shift()?.();
    const again = last();
    expect(again).not.toBe(socket);
    again.onopen?.();
    again.say({ type: 'welcome', name: 'Ana' });
    // El servidor la sacó de la cola al caerse: la devuelve al inicio.
    again.say({ type: 'idle', reason: null, notice: null });
    expect(again.payloads).toEqual([{ type: 'queue.join', element: 'water' }]);
    // Solo una vez: el siguiente "inicio" ya no la mete de nuevo.
    again.say({ type: 'idle', reason: null, notice: null });
    expect(again.payloads).toHaveLength(1);
  });

  it('quien cancela la búsqueda mientras se reconecta tampoco vuelve a entrar sola', async () => {
    const socket = enter();
    joinQueue();
    const seats = [
      { element: 'fire' as const, name: null },
      { element: 'water' as const, name: 'Ana' },
      { element: 'snow' as const, name: null },
    ];
    socket.say({ type: 'queue.state', you: 'water', seats, offer: null, waitedMs: 0 });
    socket.onclose?.({ code: 1006 });
    await settle();
    // Sin conexión no hay a quién avisarle, pero la intención vale: ya no quiere buscar.
    leaveQueue();
    timers.shift()?.();
    last().onopen?.();
    last().say({ type: 'idle', reason: null, notice: null });
    expect(last().payloads).toEqual([]);
    expect(online().place).toBe('home');
  });

  it('quien canceló la búsqueda no vuelve a entrar sola tras una caída', async () => {
    const socket = enter();
    joinQueue();
    const seats = [
      { element: 'fire' as const, name: null },
      { element: 'water' as const, name: 'Ana' },
      { element: 'snow' as const, name: null },
    ];
    socket.say({ type: 'queue.state', you: 'water', seats, offer: null, waitedMs: 0 });
    leaveQueue();
    socket.say({ type: 'idle', reason: null, notice: null });
    socket.onclose?.({ code: 1006 });
    await settle();
    timers.shift()?.();
    last().onopen?.();
    last().say({ type: 'idle', reason: null, notice: null });
    expect(last().payloads).toEqual([]);
  });
});

describe('Las salas con código (R-53)', () => {
  it('el código se limpia antes de mandarlo, y uno que no puede existir ni se pregunta', () => {
    const socket = enter();
    joinRoom('   ');
    expect(online().error).toBe('code_empty');
    joinRoom('abc');
    expect(online().error).toBe('room_not_found');
    // La O y el 0 no están en el alfabeto de los códigos.
    joinRoom('KQ7RTO');
    expect(online().error).toBe('room_not_found');
    expect(socket.payloads).toEqual([]);
    joinRoom(' kq7 rtx ');
    expect(socket.payloads).toEqual([{ type: 'room.join', code: 'KQ7RTX', element: 'water' }]);
    expect(online()).toMatchObject({ busy: true, error: null });
  });

  it('el servidor dice por qué no se pudo entrar; los errores del protocolo no se le muestran a nadie', () => {
    const socket = enter();
    for (const code of ['room_not_found', 'room_full', 'room_started'] as const) {
      joinRoom('KQ7RTX');
      socket.say({ type: 'error', code });
      expect(online()).toMatchObject({ busy: false, error: code });
    }
    joinRoom('KQ7RTX');
    socket.say({ type: 'error', code: 'not_now' });
    expect(online()).toMatchObject({ busy: false, error: null });
  });

  it('crear, elegir un ninja libre y empezar salen como mensajes; la sala la describe el servidor', () => {
    const socket = enter();
    createRoom();
    const seat = (element: 'fire' | 'water' | 'snow', name: string | null, you = false) => ({
      element,
      name,
      host: you,
      you,
      connected: name !== null,
    });
    const room = {
      type: 'room.state' as const,
      code: 'KQ7RTX',
      host: 'Ana',
      seats: [seat('fire', null), seat('water', 'Ana', true), seat('snow', null)],
      you: { seat: 'water' as const, host: true, wanted: null },
      choosing: [],
      start: 'alone' as const,
      bot: null,
    };
    socket.say(room);
    expect(online()).toMatchObject({ place: 'room', busy: false, room: { code: 'KQ7RTX', start: 'alone' } });
    pickSeat('snow');
    startRoom();
    expect(socket.payloads).toEqual([
      { type: 'room.create', element: 'water' },
      { type: 'room.pick', element: 'snow' },
      { type: 'room.start' },
    ]);
    // La sala se cerró: vuelve al inicio con el aviso.
    socket.say({ type: 'idle', reason: 'room_closed', notice: null });
    expect(online()).toMatchObject({ place: 'home', room: null, roomClosed: true });
  });
});

describe('La partida y sus avisos (R-38, R-39 y R-54)', () => {
  const start = (socket: FakeSocket, room: string | null = null) => {
    const { state, events } = createMatch({ seed: 3, difficulty: 'classic' });
    socket.say({ type: 'match.start', matchId: 'm1', you: 'water', seats: SEATS, state, events, room });
    return state;
  };

  it('al empezar una partida, el tablero pasa a jugarse contra el servidor', () => {
    const socket = enter();
    start(socket);
    expect(store.getState()).toMatchObject({ local: false, screen: 'loading', seed: null });
    expect(online().match).toMatchObject({ you: 'water', seats: SEATS, room: null, turn: null, ready: [] });
    // El consejo de la carga es uno de los del ninja elegido.
    expect(store.getState().loadingTip.length).toBeGreaterThan(20);
  });

  it('si el servidor la devuelve al inicio, la partida ya no existe para ella: sale del tablero con el aviso', () => {
    const socket = enter();
    start(socket);
    socket.say({ type: 'idle', reason: null, notice: 'restart' });
    expect(store.getState()).toMatchObject({ local: true, screen: 'online', phase: 'idle' });
    expect(online()).toMatchObject({ match: null, place: 'home', notice: 'restart' });
    dismissNotice();
    expect(online().notice).toBeNull();
    expect(socket.payloads).toEqual([{ type: 'notice.seen' }]);
  });

  it('"Salir" pregunta antes, y al confirmar le avisa al servidor (R-39)', () => {
    const socket = enter();
    start(socket);
    askLeave(true);
    expect(online().leaving).toBe(true);
    askLeave(false);
    expect(online().leaving).toBe(false);
    leaveMatch();
    expect(socket.payloads).toEqual([{ type: 'match.leave' }]);
    // Sigue en el tablero hasta que el servidor responde.
    expect(online().match).not.toBeNull();
    socket.say({ type: 'idle', reason: null, notice: null });
    expect(online().match).toBeNull();
    expect(store.getState().screen).toBe('online');
  });

  it('D-105: al volver de una partida que abandonó, vuelve a leer su progreso: el avance de sus logros cambió', async () => {
    const socket = enter();
    await settle();
    start(socket);
    // Durante la partida el servidor le sumó a "Aturdidor"; su ficha todavía muestra lo de antes.
    served = progress({ achievements: { ...noAchievements(), stunner: { count: 3, done: false } } });
    expect(store.getState().progress.data?.achievements.stunner).toEqual({ count: 0, done: false });
    leaveMatch();
    socket.say({ type: 'idle', reason: null, notice: null });
    await settle();
    expect(store.getState().screen).toBe('online');
    expect(store.getState().progress.data?.achievements.stunner).toEqual({ count: 3, done: false });
  });

  it('quien sale sin conexión sale igual, y al volver se le avisa al servidor que abandonó', async () => {
    const socket = enter();
    const state = start(socket, null);
    socket.onclose?.({ code: 1006 });
    await settle();
    leaveMatch();
    expect(online().match).toBeNull();
    expect(store.getState().screen).toBe('online');
    timers.shift()?.();
    const again = last();
    again.onopen?.();
    again.say({ type: 'welcome', name: 'Ana' });
    again.say({ type: 'match.resume', matchId: 'm1', you: 'water', seats: SEATS, state, room: null, turn: null });
    expect(again.payloads).toEqual([{ type: 'match.leave' }]);
    expect(online().match).toBeNull();
    expect(store.getState().local).toBe(true);
  });

  it('al terminar, quien salió de la cola vuelve al inicio; quien jugaba en una sala, a la sala', () => {
    const socket = enter();
    start(socket, 'KQ7RTX');
    expect(online().place).toBe('room');
    const end = {
      type: 'match.end' as const,
      result: 'victory' as const,
      coins: { lines: [{ round: 1 as const, coins: 60 }], doubled: false, total: 60 },
      achievements: noAchievements(),
      gained: {},
      completed: [],
      balance: 60,
    };
    socket.say({ ...end, room: 'KQ7RTX' });
    expect(online().place).toBe('room');
    socket.say({ ...end, room: null });
    expect(online()).toMatchObject({ place: 'home', room: null });
    finishResults();
    expect(store.getState()).toMatchObject({ screen: 'online', local: true });
    expect(online()).toMatchObject({ match: null, end: null, view: 'pick' });
  });

  it('con la sesión terminada deja la partida y la cuenta, y no vuelve a intentar', async () => {
    const socket = enter();
    start(socket);
    socket.onclose?.({ code: CLOSE.sessionEnded });
    await settle();
    expect(online()).toMatchObject({ link: 'signedOut', match: null });
    expect(store.getState().account.user).toBeNull();
    expect(timers).toHaveLength(0);
  });

  it('al abrir el juego, quien se había desconectado de una partida vuelve derecho a ella; quien la juega en otra pestaña, no', async () => {
    playStatus = { status: 200, body: { match: 'here' } };
    await resumeIfPlaying();
    expect(sockets).toHaveLength(0);
    playStatus = { status: 200, body: { match: null } };
    await resumeIfPlaying();
    expect(sockets).toHaveLength(0);
    playStatus = { status: 200, body: { match: 'away' } };
    await resumeIfPlaying();
    expect(sockets).toHaveLength(1);
    expect(online().link).toBe('connecting');
  });
});

describe('Lo que llega atrasado no se anima (R-36)', () => {
  const state = createMatch({ seed: 3, difficulty: 'classic' }).state;
  const result: HostMessage = { type: 'turnResult', state, events: [] };
  const turnStart: HostMessage = {
    type: 'turnStart',
    turn: { n: 2, deadline: 0, totalMs: 10_000, plans: [] },
    seats: SEATS,
  };
  const end: HostMessage = {
    type: 'matchEnd',
    end: {
      result: 'victory',
      coins: { lines: [], doubled: false, total: 0 },
      achievements: noAchievements(),
      gained: {},
      completed: [],
      balance: 0,
      room: null,
    },
  };
  const resume: HostMessage = {
    type: 'matchResume',
    state,
    online: { you: 'water', seats: SEATS, room: null },
    turn: null,
  };

  it('un turno está atrasado si detrás ya espera el resultado del siguiente, o la vuelta a la partida', () => {
    expect(staleBehind(result, [])).toBe(false);
    expect(staleBehind(result, [turnStart])).toBe(false);
    expect(staleBehind(result, [turnStart, result])).toBe(true);
    expect(staleBehind(turnStart, [result])).toBe(true);
    expect(staleBehind(result, [resume])).toBe(true);
  });

  it('el último turno se anima aunque ya haya llegado el final, y el final y la vuelta nunca se saltan', () => {
    expect(staleBehind(result, [end])).toBe(false);
    expect(staleBehind(end, [result])).toBe(false);
    expect(staleBehind(resume, [result])).toBe(false);
  });
});

describe('La Libreta ninja (D-100 y D-105)', () => {
  it('D-105: la colección va de un elemento a la vez, en dos páginas, y las flechas no salen de ese elemento', () => {
    expect(PAGES_PER_ELEMENT).toBe(2);
    expect([0, 1, 2, 3, 4, 5].map(pageElement)).toEqual(['fire', 'fire', 'water', 'water', 'snow', 'snow']);
    expect([0, 1, 2, 3, 4, 5].map(pageWithin)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(firstPageOf('snow')).toBe(4);
    openNotebook('cards', 'snow');
    expect(store.getState().notebook).toMatchObject({ tab: 'cards', page: 4 });
    turnPage(1);
    expect(store.getState().notebook.page).toBe(5);
    // Desde la segunda página, la siguiente es la primera del mismo elemento: da la vuelta sin cambiar de elemento.
    turnPage(1);
    expect(store.getState().notebook.page).toBe(4);
    turnPage(-1);
    expect(store.getState().notebook.page).toBe(5);
    expect(store.getState().progress.tab).toBe('snow');
  });

  it('D-105: la pestaña de un elemento lleva a su primera página, y sus cajas son las de ese elemento', () => {
    openNotebook('cards', 'snow');
    turnPage(1);
    showCardsOf('water');
    expect(store.getState().notebook).toMatchObject({ tab: 'cards', page: 2 });
    expect(store.getState().progress.tab).toBe('water');
    turnPage(-1);
    expect(store.getState().notebook.page).toBe(3);
    expect(store.getState().progress.tab).toBe('water');
  });

  it('vuelve a la pantalla desde la que se abrió, también si dentro se pasó a las cajas', () => {
    store.setState({ screen: 'results' });
    openNotebook('progress');
    expect(store.getState()).toMatchObject({ screen: 'notebook', notebook: { tab: 'progress', from: 'results' } });
    openNotebook('boxes', 'water');
    expect(store.getState().notebook).toMatchObject({ tab: 'boxes', page: 2, from: 'results' });
  });
});
