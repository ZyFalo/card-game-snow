import { CLOSE, type ClientMessage, type ClientPayload, PROTOCOL_VERSION } from '@ventisca/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hub } from '../src/play/hub';
import { again, type FakeLink, person } from './support/fake-link';
import { MemoryStore } from './support/memory-store';
import { board, TIMINGS, trio, watched, world } from './support/world';

/* El centro del juego en línea, con conexiones de mentira: quién está conectado y qué mensajes valen. */

const silent = { info() {}, warn() {}, error() {} };
let seq = 0;
const message = (payload: ClientPayload): ClientMessage => {
  seq += 1;
  return { v: PROTOCOL_VERSION, seq, ...payload } as ClientMessage;
};
const types = (link: FakeLink) => link.fresh().map((m) => m.type);

describe('Centro del juego en línea: conexiones (D-102)', () => {
  it('al conectarse, la persona recibe el saludo y dónde está', async () => {
    const hub = new Hub({ log: silent, store: new MemoryStore() });
    const ana = person('Ana');
    await hub.connect(ana);
    expect(ana.received).toMatchObject([
      { type: 'welcome', name: 'Ana', seq: 0 },
      { type: 'idle', reason: null, notice: null, seq: 1 },
    ]);
    expect(hub.online).toBe(1);
  });

  it('una conexión nueva de la misma cuenta cierra la anterior, y la cuenta sigue conectada', async () => {
    const hub = new Hub({ log: silent, store: new MemoryStore() });
    const first = person();
    const second = again(first);
    await hub.connect(first);
    await hub.connect(second);
    expect(first.closedWith).toBe(CLOSE.replaced);
    expect(second.closedWith).toBeNull();
    expect(hub.online).toBe(1);
    // El cierre de la pestaña vieja llega después: no desconecta a la cuenta.
    await hub.disconnect(first);
    expect(hub.online).toBe(1);
    await hub.disconnect(second);
    expect(hub.online).toBe(0);
  });

  it('un mensaje que llega por una conexión ya reemplazada no vale', async () => {
    const hub = new Hub({ log: silent, store: new MemoryStore() });
    const first = person();
    const second = again(first);
    await hub.connect(first);
    await hub.connect(second);
    types(second);
    await hub.receive(first, message({ type: 'queue.join', element: 'fire' }));
    expect(types(second)).toEqual([]);
    expect(first.received.filter((m) => m.type !== 'welcome' && m.type !== 'idle')).toEqual([]);
  });

  it('si la sesión de una cuenta termina, su conexión se cierra', async () => {
    const hub = new Hub({ log: silent, store: new MemoryStore() });
    const ana = person();
    const beto = person();
    await hub.connect(ana);
    await hub.connect(beto);
    await hub.endSession(ana.player.userId);
    expect(ana.closedWith).toBe(CLOSE.sessionEnded);
    expect(beto.closedWith).toBeNull();
    expect(hub.online).toBe(1);
  });

  it('al apagarse el servidor, todas las conexiones se cierran para que cada cliente vuelva a conectarse', async () => {
    const hub = new Hub({ log: silent, store: new MemoryStore() });
    const ana = person();
    const beto = person();
    await hub.connect(ana);
    await hub.connect(beto);
    await hub.shutdown();
    expect([ana.closedWith, beto.closedWith]).toEqual([CLOSE.restart, CLOSE.restart]);
    expect(hub.online).toBe(0);
  });
});

describe('Centro del juego en línea: la cola y las salas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('R-30: sin su carta de camino, nadie entra a la cola ni a una sala', async () => {
    const w = world();
    const nueva = person('Nueva');
    await w.hub.connect(nueva);
    nueva.fresh();
    await w.say(nueva, { type: 'queue.join', element: 'fire' });
    await w.say(nueva, { type: 'room.create', element: 'fire' });
    await w.say(nueva, { type: 'room.join', code: 'KQ7RTX', element: 'fire' });
    expect(nueva.fresh().map((m) => (m.type === 'error' ? m.code : m.type))).toEqual([
      'camino_required',
      'camino_required',
      'camino_required',
    ]);
  });

  it('R-52: la cola junta a tres personas y empieza su partida', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    const caro = await w.join('Caro');
    await w.say(ana, { type: 'queue.join', element: 'water' });
    expect(ana.last('queue.state')).toMatchObject({ you: 'water', offer: null });
    await w.say(beto, { type: 'queue.join', element: 'snow' });
    expect(ana.last('queue.state')?.seats.map((s) => s.name)).toEqual([null, 'Ana', 'Beto']);
    await w.say(caro, { type: 'queue.join', element: 'fire' });
    for (const [link, seat] of [
      [ana, 'water'],
      [beto, 'snow'],
      [caro, 'fire'],
    ] as const) {
      expect(link.last('match.start')).toMatchObject({ you: seat, room: null });
    }
    expect(w.store.opened[0]).toMatchObject({ roomCode: null });
  });

  it('D-88: a los 30 s, dos personas aceptan el bot y empieza su partida con él', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    await w.say(beto, { type: 'queue.join', element: 'water' });
    // Antes de la oferta no hay nada que aceptar.
    ana.fresh();
    await w.say(ana, { type: 'queue.acceptBot' });
    expect(ana.fresh()).toMatchObject([{ type: 'error', code: 'not_now' }]);
    await vi.advanceTimersByTimeAsync(TIMINGS.offerMs);
    expect(ana.last('queue.state')).toMatchObject({ offer: { bot: 'snow', accepted: false } });
    await w.say(ana, { type: 'queue.acceptBot' });
    expect(ana.last('queue.state')).toMatchObject({ offer: { accepted: true, waitingFor: 'Beto' } });
    expect(ana.last('match.start')).toBeUndefined();
    await w.say(beto, { type: 'queue.acceptBot' });
    expect(ana.last('match.start')?.seats.map((s) => s.kind)).toEqual(['human', 'human', 'bot']);
  });

  it('R-52: cancelar la búsqueda devuelve al inicio, y quien se queda sigue esperando', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    await w.say(beto, { type: 'queue.join', element: 'water' });
    await w.say(beto, { type: 'queue.leave' });
    expect(beto.last('idle')).toMatchObject({ reason: null });
    expect(ana.last('queue.state')?.seats.map((s) => s.name)).toEqual(['Ana', null, null]);
    // Salir sin estar en la cola no vale.
    beto.fresh();
    await w.say(beto, { type: 'queue.leave' });
    expect(beto.fresh()).toMatchObject([{ type: 'error', code: 'not_now' }]);
  });

  it('R-52: quien pierde la conexión sale de la cola', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    await w.say(beto, { type: 'queue.join', element: 'water' });
    await w.hub.disconnect(beto);
    expect(ana.last('queue.state')?.seats.map((s) => s.name)).toEqual(['Ana', null, null]);
    const beto2 = await w.back(beto);
    expect(beto2.received.map((m) => m.type)).toEqual(['welcome', 'idle']);
  });

  it('D-102: un mensaje que llega por una conexión ya reemplazada no mete a nadie en la cola', async () => {
    const w = world();
    const first = await w.join('Ana');
    const second = await w.back(first);
    second.fresh();
    await w.say(first, { type: 'queue.join', element: 'fire' });
    expect(second.fresh()).toEqual([]);
    await w.say(second, { type: 'queue.join', element: 'water' });
    expect(second.last('queue.state')).toMatchObject({ you: 'water', waitedMs: 0 });
  });

  it('R-53: los errores al unirse a una sala llegan como respuesta a ese mensaje', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const dani = await w.join('Dani');
    await w.say(dani, { type: 'room.join', code: 'KQ7RTX', element: 'fire' });
    expect(dani.last('error')).toMatchObject({ code: 'room_not_found' });
    await w.say(ana, { type: 'room.create', element: 'fire' });
    const code = ana.last('room.state')?.code as string;
    for (const name of ['Beto', 'Caro']) await w.say(await w.join(name), { type: 'room.join', code, element: 'water' });
    await w.say(dani, { type: 'room.join', code, element: 'snow' });
    expect(dani.last('error')).toMatchObject({ code: 'room_full' });
    expect(dani.last('error')?.re).toBeGreaterThan(0);
  });

  it('R-53: a una sala con la partida empezada no se entra', async () => {
    const w = world({ prepare: board() });
    const { code } = await trio(w);
    const dani = await w.join('Dani');
    await w.say(dani, { type: 'room.join', code, element: 'fire' });
    expect(dani.last('error')).toMatchObject({ code: 'room_started' });
  });

  it('R-53: quien encuentra ocupado su ninja elige uno libre, y solo entonces puede empezar la partida', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'room.create', element: 'fire' });
    const code = ana.last('room.state')?.code as string;
    await w.say(beto, { type: 'room.join', code: code.toLowerCase(), element: 'fire' });
    expect(beto.last('room.state')).toMatchObject({ host: 'Ana', you: { seat: null, wanted: 'fire' } });
    expect(ana.last('room.state')).toMatchObject({ start: 'choosing', choosing: ['Beto'] });
    ana.fresh();
    await w.say(ana, { type: 'room.start' });
    expect(ana.fresh()).toMatchObject([{ type: 'error', code: 'not_now' }]);
    await w.say(beto, { type: 'room.pick', element: 'fire' });
    expect(beto.last('error')).toMatchObject({ code: 'seat_taken' });
    await w.say(beto, { type: 'room.pick', element: 'snow' });
    expect(ana.last('room.state')).toMatchObject({ start: 'bot', bot: 'water' });
    // Solo quien creó la sala empieza.
    await w.say(beto, { type: 'room.start' });
    expect(beto.last('match.start')).toBeUndefined();
    await w.say(ana, { type: 'room.start' });
    expect(beto.last('match.start')).toMatchObject({ you: 'snow', room: code });
  });

  it('R-53: si sale quien creó la sala, a los demás se les avisa que se cerró', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'room.create', element: 'fire' });
    await w.say(beto, { type: 'room.join', code: ana.last('room.state')?.code as string, element: 'water' });
    await w.say(ana, { type: 'room.leave' });
    expect(ana.last('idle')).toMatchObject({ reason: null });
    expect(beto.last('idle')).toMatchObject({ reason: 'room_closed' });
    // Los dos quedan libres.
    await w.say(beto, { type: 'queue.join', element: 'water' });
    expect(beto.last('queue.state')).toMatchObject({ you: 'water' });
  });

  it('R-38: quien vuelve a su sala recupera su asiento, y la sala le llega de nuevo', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'room.create', element: 'fire' });
    const code = ana.last('room.state')?.code as string;
    await w.say(beto, { type: 'room.join', code, element: 'water' });
    await w.hub.disconnect(beto);
    expect(ana.last('room.state')?.seats[1]).toMatchObject({ name: 'Beto', connected: false });
    const beto2 = await w.back(beto);
    expect(beto2.received.map((m) => m.type)).toEqual(['welcome', 'room.state']);
    expect(beto2.last('room.state')).toMatchObject({ code, you: { seat: 'water' } });
    expect(ana.last('room.state')?.seats[1]).toMatchObject({ name: 'Beto', connected: true });
  });

  it('R-38: quien se desconectó y volvió durante la partida conserva su asiento en la sala al terminarla', async () => {
    const w = world({
      prepare: board({
        round: 3,
        ninjas: { fire: { at: [3, 2] }, snow: { everKo: true } },
        golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    const caro2 = await w.back(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(caro2.last('match.end')).toMatchObject({ result: 'victory' });
    // Pasan los 2 minutos del plazo de quien está sin conexión: Caro está conectada, y sigue en su asiento.
    await vi.advanceTimersByTimeAsync(TIMINGS.emptyMs + 1000);
    expect(ana.last('room.state')?.seats[2]).toMatchObject({ name: 'Caro', connected: true });
    expect(ana.last('room.state')).toMatchObject({ start: 'full' });
  });

  it('durante una partida, la sala no manda nada: nadie está mirándola', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    for (const link of [ana, beto, caro]) link.fresh();
    await w.hub.disconnect(caro);
    await w.back(caro);
    for (const link of [ana, beto]) expect(link.fresh().filter((m) => m.type === 'room.state')).toEqual([]);
  });

  it('si la sesión de alguien termina, sale de la cola y su conexión se cierra', async () => {
    const w = world();
    const ana = await w.join('Ana');
    const beto = await w.join('Beto');
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    await w.say(beto, { type: 'queue.join', element: 'water' });
    await w.hub.endSession(beto.player.userId);
    expect(beto.closedWith).toBe(CLOSE.sessionEnded);
    expect(ana.last('queue.state')?.seats.map((s) => s.name)).toEqual(['Ana', null, null]);
  });
});
