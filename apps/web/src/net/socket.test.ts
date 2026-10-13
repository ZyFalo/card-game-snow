import { CLOSE, PLAY_PATH, PROTOCOL_VERSION, type ServerMessage } from '@ventisca/protocol';
import { describe, expect, it } from 'vitest';
import { type LinkStatus, PlaySocket, playUrl, RETRY_MS, type SocketLike } from './socket';

/* La conexión del juego en línea: numerar, comprobar lo que llega y volver a conectarse. */

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.closedWith = code ?? 1005;
  }
}

function setup(signedIn: boolean | null = true) {
  const sockets: FakeSocket[] = [];
  const statuses: LinkStatus[] = [];
  const messages: ServerMessage[] = [];
  const timers: { task: () => void; ms: number; cancelled: boolean }[] = [];
  const answer = { signedIn };
  const socket = new PlaySocket({
    url: 'ws://juego.test/api/play',
    open: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    later: (task, ms) => {
      const timer = { task, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    signedIn: async () => answer.signedIn,
    onStatus: (status) => statuses.push(status),
    onMessage: (message) => messages.push(message),
  });
  const last = () => sockets[sockets.length - 1] as FakeSocket;
  /** Corre el reintento pendiente. */
  const retry = () => {
    const timer = timers.filter((t) => !t.cancelled).pop();
    timers.length = 0;
    timer?.task();
  };
  /** Deja que termine la pregunta por la sesión. */
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return { socket, sockets, statuses, messages, timers, last, retry, settle, answer };
}

const welcome = { v: PROTOCOL_VERSION, seq: 0, type: 'welcome', name: 'Ana' };

describe('La conexión del juego en línea', () => {
  it('la dirección sale de la página: segura si la página lo es, y siempre en el mismo origen', () => {
    expect(playUrl({ protocol: 'https:', host: 'ventisca.wpena.dev' })).toBe(`wss://ventisca.wpena.dev${PLAY_PATH}`);
    expect(playUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(`ws://localhost:5173${PLAY_PATH}`);
  });

  it('abre una sola conexión, y avisa cuando queda abierta', () => {
    const t = setup();
    t.socket.connect();
    t.socket.connect();
    expect(t.sockets).toHaveLength(1);
    expect(t.statuses).toEqual(['connecting']);
    t.last().onopen?.();
    expect(t.statuses).toEqual(['connecting', 'open']);
    expect(t.socket.state).toBe('open');
  });

  it('cada mensaje sale con la versión del protocolo y su número, que empieza en cero en cada conexión', async () => {
    const t = setup();
    t.socket.connect();
    // Sin conexión abierta, el mensaje se pierde, y se dice.
    expect(t.socket.send({ type: 'queue.leave' })).toBe(false);
    t.last().onopen?.();
    expect(t.socket.send({ type: 'queue.join', element: 'fire' })).toBe(true);
    expect(t.socket.send({ type: 'queue.leave' })).toBe(true);
    expect(t.last().sent.map((s) => JSON.parse(s))).toEqual([
      { v: PROTOCOL_VERSION, seq: 0, type: 'queue.join', element: 'fire' },
      { v: PROTOCOL_VERSION, seq: 1, type: 'queue.leave' },
    ]);
    t.last().onclose?.({ code: 1006 });
    await t.settle();
    t.retry();
    t.last().onopen?.();
    t.socket.send({ type: 'queue.leave' });
    expect(JSON.parse(t.last().sent[0] as string).seq).toBe(0);
  });

  it('entrega los mensajes que cumplen el protocolo y deja pasar los que no', () => {
    const t = setup();
    t.socket.connect();
    t.last().onopen?.();
    t.last().onmessage?.({ data: JSON.stringify(welcome) });
    t.last().onmessage?.({ data: 'esto no es JSON' });
    t.last().onmessage?.({ data: JSON.stringify({ ...welcome, v: PROTOCOL_VERSION + 1 }) });
    t.last().onmessage?.({ data: JSON.stringify({ ...welcome, type: 'inventado' }) });
    t.last().onmessage?.({ data: new ArrayBuffer(4) });
    expect(t.messages).toEqual([welcome]);
  });

  it('si se cae, vuelve a intentar con cada vez más espera, y al abrirse la espera vuelve al principio', async () => {
    const t = setup();
    t.socket.connect();
    t.last().onopen?.();
    t.last().onclose?.({ code: 1006 });
    await t.settle();
    expect(t.statuses).toEqual(['connecting', 'open', 'reconnecting']);
    const waits: number[] = [];
    for (let i = 0; i < RETRY_MS.length + 2; i++) {
      waits.push(t.timers[0]?.ms as number);
      t.retry();
      t.last().onclose?.({ code: 1006 });
      await t.settle();
    }
    expect(waits).toEqual([...RETRY_MS, RETRY_MS[RETRY_MS.length - 1], RETRY_MS[RETRY_MS.length - 1]]);
    t.retry();
    t.last().onopen?.();
    expect(t.socket.state).toBe('open');
    t.last().onclose?.({ code: CLOSE.restart });
    await t.settle();
    expect(t.timers[0]?.ms).toBe(RETRY_MS[0]);
    expect(t.socket.state).toBe('reconnecting');
  });

  it('no vuelve a intentar si la cuenta abrió el juego en otra pestaña, si hay versión nueva o si la sesión terminó', async () => {
    for (const [code, status] of [
      [CLOSE.replaced, 'replaced'],
      [CLOSE.protocol, 'outdated'],
      [CLOSE.sessionEnded, 'signedOut'],
    ] as const) {
      const t = setup();
      t.socket.connect();
      t.last().onopen?.();
      t.last().onclose?.({ code });
      await t.settle();
      expect(t.socket.state).toBe(status);
      expect(t.timers).toHaveLength(0);
      expect(t.sockets).toHaveLength(1);
    }
  });

  it('un intento que no llega a abrirse pregunta por la sesión: sin sesión, deja de intentar', async () => {
    const t = setup(false);
    t.socket.connect();
    t.last().onclose?.({ code: 1006 });
    await t.settle();
    expect(t.socket.state).toBe('signedOut');
    expect(t.timers).toHaveLength(0);
  });

  it('un intento que no llega a abrirse, con sesión o sin respuesta del servidor, se repite', async () => {
    for (const answer of [true, null]) {
      const t = setup(answer);
      t.socket.connect();
      t.last().onclose?.({ code: 1006 });
      await t.settle();
      // Nunca se abrió: sigue siendo el primer intento.
      expect(t.socket.state).toBe('connecting');
      expect(t.timers).toHaveLength(1);
      t.retry();
      expect(t.sockets).toHaveLength(2);
    }
  });

  it('una conexión que se cayó ya abierta no pregunta por la sesión: se reintenta sin más', async () => {
    const t = setup(false);
    t.socket.connect();
    t.last().onopen?.();
    t.last().onclose?.({ code: 1006 });
    await t.settle();
    expect(t.socket.state).toBe('reconnecting');
    expect(t.timers).toHaveLength(1);
  });

  it('al cerrarla a pedido deja de intentar, y lo que llegue de la conexión vieja no cuenta', async () => {
    const t = setup();
    t.socket.connect();
    t.last().onopen?.();
    const old = t.last();
    t.socket.close();
    expect(old.closedWith).toBe(1000);
    expect(t.socket.state).toBe('closed');
    expect(old.onmessage).toBeNull();
    expect(old.onclose).toBeNull();
    expect(t.socket.send({ type: 'queue.leave' })).toBe(false);
    // También con un reintento pendiente.
    t.socket.connect();
    t.last().onopen?.();
    t.last().onclose?.({ code: 1006 });
    await t.settle();
    expect(t.timers[0]?.cancelled).toBe(false);
    t.socket.close();
    expect(t.timers[0]?.cancelled).toBe(true);
    expect(t.socket.state).toBe('closed');
  });

  it('si se cierra a pedido mientras se pregunta por la sesión, no vuelve a intentar', async () => {
    const t = setup(true);
    t.socket.connect();
    t.last().onclose?.({ code: 1006 });
    t.socket.close();
    await t.settle();
    expect(t.socket.state).toBe('closed');
    expect(t.timers).toHaveLength(0);
  });
});
