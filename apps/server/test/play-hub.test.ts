import { CLOSE, type ClientMessage, type ClientPayload, PROTOCOL_VERSION } from '@ventisca/protocol';
import { describe, expect, it } from 'vitest';
import { Hub } from '../src/play/hub';
import { again, type FakeLink, person } from './support/fake-link';

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
    const hub = new Hub({ log: silent });
    const ana = person('Ana');
    await hub.connect(ana);
    expect(ana.received).toMatchObject([
      { type: 'welcome', name: 'Ana', seq: 0 },
      { type: 'idle', reason: null, notice: null, seq: 1 },
    ]);
    expect(hub.online).toBe(1);
  });

  it('una conexión nueva de la misma cuenta cierra la anterior, y la cuenta sigue conectada', async () => {
    const hub = new Hub({ log: silent });
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
    const hub = new Hub({ log: silent });
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
    const hub = new Hub({ log: silent });
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
    const hub = new Hub({ log: silent });
    const ana = person();
    const beto = person();
    await hub.connect(ana);
    await hub.connect(beto);
    await hub.shutdown();
    expect([ana.closedWith, beto.closedWith]).toEqual([CLOSE.restart, CLOSE.restart]);
    expect(hub.online).toBe(0);
  });
});
