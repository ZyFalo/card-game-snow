import type { ElementKind } from '@ventisca/core';
import { type ClientMessage, type ClientPayload, PROTOCOL_VERSION } from '@ventisca/protocol';
import { Hub, PLAY_TIMINGS, type PlayTimings } from '../../src/play/hub';
import type { PrepareMatch } from '../../src/play/match';
import { again, type FakeLink, person } from './fake-link';
import { MemoryStore } from './memory-store';

export { type Board, board } from './board';

/*
 * Un mundo de prueba para el juego en línea: el centro del juego con un almacén en memoria, conexiones de
 * mentira y tableros preparados. Las pruebas que lo usan mueven el reloj a mano (`vi.useFakeTimers`).
 */

/** Los plazos de producción: las pruebas esperan lo mismo que esperará una persona. */
export const TIMINGS: PlayTimings = PLAY_TIMINGS;

const silent = { info() {}, warn() {}, error() {} };

let seq = 0;
export const message = (payload: ClientPayload): ClientMessage => {
  seq += 1;
  return { v: PROTOCOL_VERSION, seq, ...payload } as ClientMessage;
};

export interface World {
  hub: Hub;
  store: MemoryStore;
  /** Una persona nueva, con su carta de camino elegida y ya conectada. */
  join(name: string, camino?: ElementKind): Promise<FakeLink>;
  /** Esa persona manda un mensaje. */
  say(link: FakeLink, payload: ClientPayload): Promise<void>;
  /** Vuelve a conectarse con una conexión nueva. */
  back(link: FakeLink): Promise<FakeLink>;
}

export function world(options: { prepare?: PrepareMatch; timings?: Partial<PlayTimings> } = {}): World {
  const store = new MemoryStore();
  const hub = new Hub({
    log: silent,
    store,
    seed: () => 2026,
    timings: { ...TIMINGS, ...options.timings },
    prepare: options.prepare,
  });
  return {
    hub,
    store,
    async join(name, camino = 'fire') {
      const link = person(name);
      store.give(link.player.userId, camino);
      await hub.connect(link);
      return link;
    },
    say: (link, payload) => hub.receive(link, message(payload)),
    async back(link) {
      const next = again(link);
      await hub.connect(next);
      return next;
    },
  };
}

/** Tres personas en una partida que salió de una sala: Ana con Fuego, Beto con Agua y Caro con Nieve. */
export async function trio(w: World) {
  const ana = await w.join('Ana', 'fire');
  const beto = await w.join('Beto', 'water');
  const caro = await w.join('Caro', 'snow');
  await w.say(ana, { type: 'room.create', element: 'fire' });
  const code = ana.last('room.state')?.code as string;
  await w.say(beto, { type: 'room.join', code, element: 'water' });
  await w.say(caro, { type: 'room.join', code, element: 'snow' });
  await w.say(ana, { type: 'room.start' });
  return { ana, beto, caro, code };
}

/** Dos personas y el bot: Ana con Fuego, Beto con Agua y el bot con Nieve. */
export async function duo(w: World) {
  const ana = await w.join('Ana', 'fire');
  const beto = await w.join('Beto', 'water');
  await w.say(ana, { type: 'room.create', element: 'fire' });
  const code = ana.last('room.state')?.code as string;
  await w.say(beto, { type: 'room.join', code, element: 'water' });
  await w.say(ana, { type: 'room.start' });
  return { ana, beto, code };
}

/** Todas avisan que terminaron de mirar ese turno: el reloj del siguiente empieza. */
export async function watched(w: World, links: FakeLink[], turn: number): Promise<void> {
  for (const link of links) await w.say(link, { type: 'turn.ready', turn });
}
