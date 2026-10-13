import type { ElementKind, Enemy, EnemyKind, MatchState } from '@ventisca/core';
import { type ClientMessage, type ClientPayload, PROTOCOL_VERSION } from '@ventisca/protocol';
import { Hub, type PlayTimings } from '../../src/play/hub';
import { again, type FakeLink, person } from './fake-link';
import { MemoryStore } from './memory-store';

/*
 * Un mundo de prueba para el juego en línea: el centro del juego con un almacén en memoria, conexiones de
 * mentira y tableros preparados. Las pruebas que lo usan mueven el reloj a mano (`vi.useFakeTimers`).
 */

export const TIMINGS: PlayTimings = {
  turnMs: 10_000,
  graceMs: 400,
  watchMs: 20_000,
  offerMs: 30_000,
  emptyMs: 120_000,
};

const silent = { info() {}, warn() {}, error() {} };

let seq = 0;
export const message = (payload: ClientPayload): ClientMessage => {
  seq += 1;
  return { v: PROTOCOL_VERSION, seq, ...payload } as ClientMessage;
};

/** Dónde va cada quien en un tablero preparado. Lo que no se dice, queda como en la partida recién creada. */
export interface Board {
  ninjas?: Partial<Record<ElementKind, { at?: [number, number]; hp?: number; hand?: number[]; everKo?: boolean }>>;
  golems?: { kind: EnemyKind; at: [number, number]; hp?: number }[];
  round?: MatchState['round'];
  bonus?: MatchState['bonusCondition'];
}

const LIFE: Record<EnemyKind, number> = { sniper: 30, artillery: 45, colossus: 60 };

/** Un tablero sin rocas, con los ninjas en la columna 0 y un coloso lejos, que tarda en llegar. */
export function board(spec: Board = {}): (state: MatchState) => MatchState {
  return (state) => {
    state.rocks = [];
    state.round = spec.round ?? 1;
    state.bonusCondition = spec.bonus ?? 'noKo';
    const rows: Record<ElementKind, number> = { fire: 0, water: 2, snow: 4 };
    for (const n of state.ninjas) {
      const s = spec.ninjas?.[n.id] ?? {};
      const [x, y] = s.at ?? [0, rows[n.id]];
      n.pos = { x, y };
      n.hp = s.hp ?? n.maxHp;
      n.everKo = s.everKo ?? n.hp <= 0;
      n.hand = (s.hand ?? []).map((value, i) => ({ id: `${n.id}-m${i + 1}`, element: n.id, value }));
    }
    const golems = spec.golems ?? [{ kind: 'colossus' as const, at: [8, 2] as [number, number] }];
    state.enemies = golems.map(
      (g, i): Enemy => ({
        id: `e${i + 1}`,
        kind: g.kind,
        pos: { x: g.at[0], y: g.at[1] },
        hp: g.hp ?? LIFE[g.kind],
        maxHp: LIFE[g.kind],
        stunned: false,
        burnTicks: 0,
      }),
    );
    state.nextEnemySeq = state.enemies.length + 1;
    return state;
  };
}

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

export function world(
  options: { prepare?: (state: MatchState) => MatchState; timings?: Partial<PlayTimings> } = {},
): World {
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
