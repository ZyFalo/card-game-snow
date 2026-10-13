import type { ElementKind } from '@ventisca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '../src/play/link';
import { arrange, Queue, type QueueState, type Team, type Waiting } from '../src/play/queue';

/* La cola pública (R-52): quién juega con quién, y cuándo se ofrece el bot (D-88). */

const OFFER_MS = 30_000;
let people = 0;
const player = (name: string): Player => {
  people += 1;
  return { userId: `u${people}`, name };
};

describe('Cola pública: cómo se arman los grupos (R-52)', () => {
  const at = (name: string, element: ElementKind, since: number): Waiting => ({
    player: player(name),
    element,
    since,
    accepted: false,
  });
  const names = (groups: Waiting[][]) => groups.map((g) => g.map((w) => w.player.name));

  it('R-52: junta a personas con ninjas distintos, por orden de llegada', () => {
    const groups = arrange([at('Ana', 'fire', 1), at('Beto', 'water', 2), at('Caro', 'snow', 3)]);
    expect(names(groups)).toEqual([['Ana', 'Beto', 'Caro']]);
  });

  it('R-52: dos personas con el mismo ninja nunca quedan en el mismo equipo', () => {
    const groups = arrange([at('Ana', 'fire', 1), at('Beto', 'fire', 2), at('Caro', 'water', 3)]);
    expect(names(groups)).toEqual([['Ana', 'Caro'], ['Beto']]);
  });

  it('R-52: quien llegó antes completa su equipo antes', () => {
    const groups = arrange([
      at('Ana', 'fire', 1),
      at('Beto', 'fire', 2),
      at('Caro', 'water', 3),
      at('Dani', 'water', 4),
      at('Eli', 'snow', 5),
    ]);
    expect(names(groups)).toEqual([
      ['Ana', 'Caro', 'Eli'],
      ['Beto', 'Dani'],
    ]);
  });

  it('el orden es el de llegada, no el de la lista', () => {
    const groups = arrange([at('Caro', 'snow', 30), at('Ana', 'snow', 10), at('Beto', 'fire', 20)]);
    expect(names(groups)).toEqual([['Ana', 'Beto'], ['Caro']]);
  });
});

describe('Cola pública (R-52, D-88)', () => {
  let teams: Team[];
  let states: Map<string, QueueState>;
  let queue: Queue;

  beforeEach(() => {
    vi.useFakeTimers();
    teams = [];
    states = new Map();
    queue = new Queue({
      offerMs: OFFER_MS,
      now: () => Date.now(),
      later: (task, ms) => {
        const timer = setTimeout(task, ms);
        return () => clearTimeout(timer);
      },
      onState: (userId, state) => states.set(userId, state),
      onTeam: (team) => teams.push(team),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seats = (who: Player) => states.get(who.userId)?.seats.map((s) => s.name);
  const offer = (who: Player) => states.get(who.userId)?.offer ?? null;

  it('R-52: una persona sola sigue esperando, y la pantalla dice qué elementos se buscan', () => {
    const ana = player('Ana');
    queue.join(ana, 'fire');
    expect(states.get(ana.userId)).toMatchObject({ you: 'fire', offer: null, waitedMs: 0 });
    expect(seats(ana)).toEqual(['Ana', null, null]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(teams).toEqual([]);
    expect(queue.has(ana.userId)).toBe(true);
    // Sola no hay oferta del bot, por mucho que espere (D-35).
    expect(queue.stateOf(ana.userId)).toMatchObject({ offer: null, waitedMs: 10 * 60_000 });
  });

  it('R-52: con tres personas de ninjas distintos, la partida empieza en el acto, sin bot', () => {
    const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
    queue.join(ana, 'fire');
    queue.join(beto, 'snow');
    expect(seats(ana)).toEqual(['Ana', null, 'Beto']);
    expect(seats(beto)).toEqual(['Ana', null, 'Beto']);
    queue.join(caro, 'water');
    expect(teams).toEqual([
      {
        bot: null,
        members: [
          { player: ana, element: 'fire' },
          { player: beto, element: 'snow' },
          { player: caro, element: 'water' },
        ],
      },
    ]);
    expect(queue.size).toBe(0);
  });

  it('D-88: con dos personas, la oferta del bot aparece para ambas a los 30 s de estar juntas', () => {
    const [ana, beto] = [player('Ana'), player('Beto')];
    queue.join(ana, 'fire');
    vi.advanceTimersByTime(45_000);
    queue.join(beto, 'water');
    // Ana ya llevaba 45 s sola, pero la pareja acaba de formarse.
    expect(offer(ana)).toBeNull();
    vi.advanceTimersByTime(OFFER_MS - 1);
    expect(offer(ana)).toBeNull();
    expect(offer(beto)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(offer(ana)).toEqual({ bot: 'snow', accepted: false, waitingFor: null });
    expect(offer(beto)).toEqual({ bot: 'snow', accepted: false, waitingFor: null });
    expect(states.get(ana.userId)?.waitedMs).toBe(45_000 + OFFER_MS);
    expect(states.get(beto.userId)?.waitedMs).toBe(OFFER_MS);
    expect(teams).toEqual([]);
  });

  it('D-88: la oferta sale cuando se cumple el plazo, aunque el reloj marque un milisegundo menos', () => {
    // Un temporizador puede sonar un instante antes de lo que dice la hora: la oferta no depende de ella.
    let pending: (() => void) | null = null;
    const seen = new Map<string, QueueState>();
    const lagging = new Queue({
      offerMs: OFFER_MS,
      now: () => 1_000,
      later: (task) => {
        pending = task;
        return () => {
          pending = null;
        };
      },
      onState: (userId, state) => seen.set(userId, state),
      onTeam: () => {},
    });
    const [ana, beto] = [player('Ana'), player('Beto')];
    lagging.join(ana, 'fire');
    lagging.join(beto, 'water');
    expect(seen.get(ana.userId)?.offer).toBeNull();
    (pending as (() => void) | null)?.();
    expect(seen.get(ana.userId)?.offer).toEqual({ bot: 'snow', accepted: false, waitingFor: null });
    expect(lagging.acceptBot(ana.userId)).toBe(true);
  });

  it('D-88: la partida con el bot empieza cuando aceptan las dos, no antes', () => {
    const [ana, beto] = [player('Ana'), player('Beto')];
    queue.join(ana, 'water');
    queue.join(beto, 'snow');
    vi.advanceTimersByTime(OFFER_MS);
    expect(queue.acceptBot(ana.userId)).toBe(true);
    expect(offer(ana)).toEqual({ bot: 'fire', accepted: true, waitingFor: 'Beto' });
    expect(offer(beto)).toEqual({ bot: 'fire', accepted: false, waitingFor: null });
    expect(teams).toEqual([]);
    expect(queue.acceptBot(beto.userId)).toBe(true);
    expect(teams).toEqual([
      {
        bot: 'fire',
        members: [
          { player: ana, element: 'water' },
          { player: beto, element: 'snow' },
        ],
      },
    ]);
    expect(queue.size).toBe(0);
  });

  it('D-88: antes de los 30 s no hay nada que aceptar', () => {
    const [ana, beto] = [player('Ana'), player('Beto')];
    queue.join(ana, 'fire');
    queue.join(beto, 'water');
    vi.advanceTimersByTime(OFFER_MS - 1000);
    expect(queue.acceptBot(ana.userId)).toBe(false);
    expect(queue.acceptBot(beto.userId)).toBe(false);
    vi.advanceTimersByTime(1000);
    // Lo que intentaron aceptar antes no cuenta: la oferta llega sin aceptar.
    expect(offer(ana)).toMatchObject({ accepted: false });
    expect(teams).toEqual([]);
  });

  it('D-88: una persona sola no puede aceptar el bot', () => {
    const ana = player('Ana');
    queue.join(ana, 'fire');
    vi.advanceTimersByTime(OFFER_MS * 2);
    expect(queue.acceptBot(ana.userId)).toBe(false);
    expect(teams).toEqual([]);
  });

  it('D-88: mientras tanto la búsqueda sigue: si llega una tercera persona, juegan las tres', () => {
    const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
    queue.join(ana, 'fire');
    queue.join(beto, 'water');
    vi.advanceTimersByTime(OFFER_MS);
    queue.acceptBot(ana.userId);
    queue.join(caro, 'snow');
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({ bot: null });
    expect(teams[0]?.members.map((m) => m.player.name)).toEqual(['Ana', 'Beto', 'Caro']);
  });

  it('D-88: si una cancela, sale de la cola y la otra sigue esperando, sin oferta', () => {
    const [ana, beto] = [player('Ana'), player('Beto')];
    queue.join(ana, 'fire');
    queue.join(beto, 'water');
    vi.advanceTimersByTime(OFFER_MS);
    queue.acceptBot(ana.userId);
    expect(queue.leave(beto.userId)).toBe(true);
    expect(queue.has(beto.userId)).toBe(false);
    expect(states.get(ana.userId)).toMatchObject({ offer: null });
    expect(seats(ana)).toEqual(['Ana', null, null]);
    expect(teams).toEqual([]);
  });

  it('D-88: con otra pareja, el plazo vuelve a empezar y lo aceptado antes no cuenta', () => {
    const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
    queue.join(ana, 'fire');
    queue.join(beto, 'water');
    vi.advanceTimersByTime(OFFER_MS);
    queue.acceptBot(ana.userId);
    queue.leave(beto.userId);
    queue.join(caro, 'water');
    expect(offer(ana)).toBeNull();
    vi.advanceTimersByTime(OFFER_MS);
    expect(offer(ana)).toEqual({ bot: 'snow', accepted: false, waitingFor: null });
    queue.acceptBot(caro.userId);
    expect(teams).toEqual([]);
    queue.acceptBot(ana.userId);
    expect(teams).toHaveLength(1);
  });

  it('D-88: lo aceptado con una pareja no pasa a la siguiente, aunque llegue sin quedarse sola', () => {
    const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
    queue.join(ana, 'fire');
    queue.join(beto, 'water');
    // Caro también lleva a Agua: espera en otro grupo.
    queue.join(caro, 'water');
    vi.advanceTimersByTime(OFFER_MS);
    queue.acceptBot(ana.userId);
    // Beto se va, y Caro pasa en el acto al grupo de Ana.
    queue.leave(beto.userId);
    expect(seats(ana)).toEqual(['Ana', 'Caro', null]);
    vi.advanceTimersByTime(OFFER_MS);
    expect(offer(ana)).toEqual({ bot: 'snow', accepted: false, waitingFor: null });
    queue.acceptBot(caro.userId);
    expect(teams).toEqual([]);
  });

  it('D-88: si las mismas dos personas se separan y vuelven a juntarse, los 30 s empiezan otra vez', () => {
    const [ana, beto] = [player('Ana'), player('Beto')];
    queue.join(ana, 'fire');
    queue.join(beto, 'water');
    vi.advanceTimersByTime(OFFER_MS);
    expect(offer(ana)).not.toBeNull();
    queue.leave(beto.userId);
    queue.join(beto, 'water');
    expect(offer(ana)).toBeNull();
    expect(queue.acceptBot(ana.userId)).toBe(false);
    vi.advanceTimersByTime(OFFER_MS - 1);
    expect(offer(ana)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(offer(ana)).not.toBeNull();
  });

  it('R-52: quien cambia de ninja en la cola conserva su turno', () => {
    const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
    queue.join(ana, 'fire');
    vi.advanceTimersByTime(1000);
    queue.join(beto, 'fire');
    vi.advanceTimersByTime(1000);
    // Beto ve que con Fuego no completa nada, y cambia a Agua.
    queue.join(beto, 'water');
    expect(seats(beto)).toEqual(['Ana', 'Beto', null]);
    expect(states.get(beto.userId)?.waitedMs).toBe(1000);
    queue.join(caro, 'snow');
    expect(teams).toHaveLength(1);
  });

  it('R-52: salir de la cola sin estar en ella no hace nada', () => {
    expect(queue.leave('nadie')).toBe(false);
  });

  it('cada persona ve solo a quienes están en su propio grupo', () => {
    const [ana, beto, caro] = [player('Ana'), player('Beto'), player('Caro')];
    queue.join(ana, 'fire');
    queue.join(beto, 'fire');
    queue.join(caro, 'water');
    expect(seats(ana)).toEqual(['Ana', 'Caro', null]);
    expect(seats(caro)).toEqual(['Ana', 'Caro', null]);
    expect(seats(beto)).toEqual(['Beto', null, null]);
  });
});
