import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeLink } from './support/fake-link';
import { board, duo, TIMINGS, trio, type World, watched, world } from './support/world';

/*
 * La partida en el servidor (PRD de v2, R-33 a R-39): el motor, el reloj, los planes del equipo, el bot,
 * y lo que pasa cuando alguien se desconecta, vuelve o sale. Con conexiones de mentira y el reloj a mano.
 */

const DEADLINE = TIMINGS.turnMs + TIMINGS.graceMs;
const types = (link: FakeLink) => link.fresh().map((m) => m.type);
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Empezar una partida (R-33, R-34)', () => {
  it('R-33: cada persona recibe su asiento, el equipo y el estado inicial', async () => {
    const w = world();
    const { ana, beto, caro, code } = await trio(w);
    for (const [link, seat] of [
      [ana, 'fire'],
      [beto, 'water'],
      [caro, 'snow'],
    ] as const) {
      const start = link.last('match.start');
      expect(start).toMatchObject({ you: seat, room: code });
      expect(start?.seats).toEqual([
        { element: 'fire', kind: 'human', name: 'Ana', status: 'here' },
        { element: 'water', kind: 'human', name: 'Beto', status: 'here' },
        { element: 'snow', kind: 'human', name: 'Caro', status: 'here' },
      ]);
      expect(start?.state).toMatchObject({ status: 'playing', round: 1, turn: 0, difficulty: 'classic' });
      // La entrada: los gólems de la primera ronda.
      expect(start?.events.map((e) => e.t)).toEqual(['roundStart']);
    }
    expect(w.hub.live).toBe(1);
    expect(w.store.opened).toHaveLength(1);
    expect(w.store.opened[0]).toMatchObject({ roomCode: code, difficulty: 'classic', seed: 2026 });
    expect(w.store.opened[0]?.seats.map((s) => s.userId)).toEqual([
      ana.player.userId,
      beto.player.userId,
      caro.player.userId,
    ]);
  });

  it('un tablero preparado vale solo para la sala que la prueba eligió: las demás partidas conservan su entrada', async () => {
    const seen: (string | null)[] = [];
    let chosen = '';
    const w = world({
      prepare: (state, room) => {
        seen.push(room);
        return room !== null && room === chosen ? board({ round: 3 })(state) : null;
      },
    });
    // Una sala que la prueba no eligió: la partida queda como salió del motor, con sus rocas y su entrada.
    const first = await duo(w);
    expect(seen).toEqual([first.code]);
    const plain = first.ana.last('match.start');
    expect(plain?.state).toMatchObject({ round: 1 });
    expect(plain?.state.rocks).not.toEqual([]);
    expect(plain?.events.map((e) => e.t)).toEqual(['roundStart']);

    // La sala elegida: el tablero preparado, sin entrada.
    const caro = await w.join('Caro', 'fire');
    const dani = await w.join('Dani', 'water');
    await w.say(caro, { type: 'room.create', element: 'fire' });
    chosen = caro.last('room.state')?.code as string;
    await w.say(dani, { type: 'room.join', code: chosen, element: 'water' });
    await w.say(caro, { type: 'room.start' });
    expect(seen).toEqual([first.code, chosen]);
    expect(caro.last('match.start')?.state).toMatchObject({ round: 3, rocks: [] });
    expect(caro.last('match.start')?.events).toEqual([]);

    // Una partida que salió de la cola no tiene sala.
    for (const [name, element] of [
      ['Eva', 'fire'],
      ['Fer', 'water'],
      ['Gil', 'snow'],
    ] as const) {
      await w.say(await w.join(name, element), { type: 'queue.join', element });
    }
    expect(seen).toEqual([first.code, chosen, null]);
  });

  it('D-102: nadie recibe la semilla ni el azar de la partida', async () => {
    const w = world();
    const { ana, beto, caro } = await trio(w);
    for (const link of [ana, beto, caro]) {
      expect(link.last('match.start')?.state).toMatchObject({ seed: 0, rng: 0 });
    }
  });

  it('R-34: cada persona juega con su colección del elemento de su ninja, y el bot, con el mazo de referencia', async () => {
    const w = world();
    const { ana } = await duo(w);
    const decks = Object.fromEntries((ana.last('match.start')?.state.ninjas ?? []).map((n) => [n.id, n.deck.length]));
    // Ana, del camino de Fuego, lleva su 9 y su 12; Beto, del de Agua, también dos; el bot, las seis.
    expect(decks).toEqual({ fire: 2, water: 2, snow: 6 });
  });

  it('R-34: quien juega fuera de su camino solo lleva su carta de inicio', async () => {
    const w = world();
    const ana = await w.join('Ana', 'fire');
    const beto = await w.join('Beto', 'fire');
    await w.say(ana, { type: 'room.create', element: 'snow' });
    await w.say(beto, { type: 'room.join', code: ana.last('room.state')?.code as string, element: 'water' });
    await w.say(ana, { type: 'room.start' });
    const decks = Object.fromEntries((ana.last('match.start')?.state.ninjas ?? []).map((n) => [n.id, n.deck.length]));
    expect(decks).toEqual({ fire: 6, water: 1, snow: 1 });
  });

  it('R-33: con dos personas, el bot ocupa el ninja libre', async () => {
    const w = world();
    const { ana } = await duo(w);
    expect(ana.last('match.start')?.seats[2]).toEqual({ element: 'snow', kind: 'bot', name: null, status: 'here' });
    expect(w.store.opened[0]?.seats.map((s) => s.userId === null)).toEqual([false, false, true]);
  });

  it('D-85: en la Beta, toda partida es de Clásica', async () => {
    const w = world();
    await trio(w);
    expect(w.store.opened[0]?.difficulty).toBe('classic');
  });

  it('quien está en una partida no puede entrar a la cola ni crear una sala', async () => {
    const w = world();
    const { ana } = await trio(w);
    ana.fresh();
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    await w.say(ana, { type: 'room.create', element: 'fire' });
    expect(ana.fresh()).toMatchObject([
      { type: 'error', code: 'not_now' },
      { type: 'error', code: 'not_now' },
    ]);
  });
});

describe('El reloj del turno (R-36)', () => {
  it('R-36: el reloj empieza cuando todas terminaron de ver la entrada, no antes', async () => {
    const w = world();
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto], 0);
    expect(ana.last('turn.start')).toBeUndefined();
    await watched(w, [caro], 0);
    for (const link of [ana, beto, caro]) {
      expect(link.last('turn.start')).toMatchObject({ turn: 1, endsInMs: 10_000, seconds: 10 });
    }
  });

  it('R-36: si alguien no avisa, el reloj empieza igual al cumplirse el tope', async () => {
    const w = world();
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto], 0);
    await wait(TIMINGS.watchMs - 1);
    expect(caro.last('turn.start')).toBeUndefined();
    await wait(1);
    expect(caro.last('turn.start')).toMatchObject({ turn: 1 });
  });

  it('R-36: avisar por un turno que no es el que se está viendo no cuenta', async () => {
    const w = world();
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto], 0);
    await watched(w, [caro], 7);
    expect(caro.last('turn.start')).toBeUndefined();
  });

  it('R-36: al vencer el reloj, cada ninja actúa con lo que su persona dejó planeado, sin confirmar', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 2, y: 0 } } });
    await wait(TIMINGS.turnMs - 1);
    expect(ana.last('turn.result')).toBeUndefined();
    await wait(TIMINGS.graceMs + 1);
    for (const link of [ana, beto, caro]) {
      const result = link.last('turn.result');
      expect(result?.turn).toBe(1);
      expect(result?.events.filter((e) => e.t === 'move' && e.unitId === 'fire')).toHaveLength(1);
      expect(result?.state.ninjas.find((n) => n.id === 'fire')?.pos).toEqual({ x: 2, y: 0 });
      expect(result?.state).toMatchObject({ seed: 0, rng: 0, turn: 1 });
    }
  });

  it('R-36: si todas confirman antes, el turno se resuelve de inmediato', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 0 } } });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')).toBeUndefined();
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 4 } } });
    expect(ana.last('turn.result')?.turn).toBe(1);
    // El reloj de ese turno ya no hace nada.
    await wait(DEADLINE);
    expect(ana.all('turn.result')).toHaveLength(1);
  });

  it('R-36: el turno siguiente no empieza hasta que todas terminen de ver el anterior', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    for (const link of [ana, beto, caro]) await w.say(link, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.all('turn.start')).toHaveLength(1);
    await watched(w, [ana, beto, caro], 1);
    expect(ana.last('turn.start')).toMatchObject({ turn: 2, endsInMs: 10_000 });
  });

  it('R-36: confirmar es definitivo: lo que llega después no cambia el plan', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 0 } } });
    beto.fresh();
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 2, y: 0 } } });
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 0, y: 1 } } });
    expect(types(beto)).toEqual([]);
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.find((n) => n.id === 'fire')?.pos).toEqual({ x: 1, y: 0 });
  });

  it('un plan para un turno que ya pasó, o que todavía no empieza, se ignora', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    // Todavía se está viendo la entrada: no hay turno que planear.
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 0 } } });
    await watched(w, [ana, beto, caro], 0);
    beto.fresh();
    await w.say(ana, { type: 'plan.update', turn: 2, plan: { moveTo: { x: 1, y: 0 } } });
    await w.say(ana, { type: 'plan.update', turn: 0, plan: { moveTo: { x: 1, y: 0 } } });
    expect(types(beto)).toEqual([]);
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.find((n) => n.id === 'fire')?.pos).toEqual({ x: 0, y: 0 });
  });
});

describe('Los planes del equipo (R-35)', () => {
  it('R-35: el plan de cada persona llega en tiempo real a sus compañeros, no a ella misma', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    for (const link of [ana, beto, caro]) link.fresh();
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 2, y: 0 } } });
    expect(types(ana)).toEqual([]);
    for (const link of [beto, caro]) {
      expect(link.fresh()).toEqual([
        expect.objectContaining({
          type: 'team.plan',
          turn: 1,
          ninja: 'fire',
          plan: { moveTo: { x: 2, y: 0 } },
          card: null,
          ready: false,
        }),
      ]);
    }
  });

  it('R-35: al confirmar, el equipo ve que esa persona ya está lista', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 2 } } });
    expect(ana.last('team.plan')).toMatchObject({ ninja: 'water', plan: { moveTo: { x: 1, y: 2 } }, ready: true });
  });

  it('R-35: de la carta que planea un compañero se ve su valor, y nada más de su mano', async () => {
    const w = world({ prepare: board({ ninjas: { fire: { hand: [11, 9] } } }) });
    const { ana, beto, caro } = await trio(w);
    // Beto no ve las cartas de Ana.
    expect(
      beto
        .last('match.start')
        ?.state.ninjas.find((n) => n.id === 'fire')
        ?.hand.map((c) => c.value),
    ).toEqual([0, 0]);
    expect(
      ana
        .last('match.start')
        ?.state.ninjas.find((n) => n.id === 'fire')
        ?.hand.map((c) => c.value),
    ).toEqual([11, 9]);
    await watched(w, [ana, beto, caro], 0);
    const action = { type: 'card' as const, cardId: 'fire-m1', at: { x: 1, y: 1 } };
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { action } });
    expect(beto.last('team.plan')).toMatchObject({ ninja: 'fire', plan: { action }, card: 11 });
  });

  it('R-35: si dos personas quieren la misma casilla, es de quien llegó primero, y a la otra se le avisa', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(beto, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 1 } } });
    for (const link of [ana, beto, caro]) link.fresh();
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 1 } } });
    expect(ana.fresh()).toEqual([
      expect.objectContaining({ type: 'plan.fix', turn: 1, plan: null, reason: 'tile_reserved', by: 'water' }),
    ]);
    // El equipo ve que Ana quedó sin plan, y la casilla sigue siendo de Beto.
    expect(caro.last('team.plan')).toMatchObject({ ninja: 'fire', plan: null });
    await wait(DEADLINE);
    const after = ana.last('turn.result')?.state.ninjas;
    expect(after?.find((n) => n.id === 'water')?.pos).toEqual({ x: 1, y: 1 });
    expect(after?.find((n) => n.id === 'fire')?.pos).toEqual({ x: 0, y: 0 });
  });

  it('R-35: cuando una persona suelta una casilla, otra puede tomarla', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(beto, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 1 } } });
    await w.say(beto, { type: 'plan.update', turn: 1, plan: {} });
    ana.fresh();
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 1 } } });
    expect(types(ana)).toEqual([]);
    expect(beto.last('team.plan')).toMatchObject({ ninja: 'fire', plan: { moveTo: { x: 1, y: 1 } } });
  });

  it('D-102: un plan que el motor no acepta no se guarda ni se comparte', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    for (const link of [ana, beto, caro]) link.fresh();
    // Una casilla a la que Brasa no llega, y un gólem fuera de su alcance.
    await w.say(ana, {
      type: 'plan.update',
      turn: 1,
      plan: { moveTo: { x: 7, y: 2 }, action: { type: 'attack', targetId: 'e1' } },
    });
    expect(ana.fresh()).toEqual([
      expect.objectContaining({ type: 'plan.fix', plan: null, reason: 'invalid', by: null }),
    ]);
    expect(beto.last('team.plan')).toMatchObject({ ninja: 'fire', plan: null });
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.find((n) => n.id === 'fire')?.pos).toEqual({ x: 0, y: 0 });
  });

  it('D-102: confirmar un plan que no vale no cuenta como confirmar', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 7, y: 2 } } });
    // Falta Ana: el turno no se resolvió, y puede corregir y confirmar de nuevo.
    expect(ana.last('turn.result')).toBeUndefined();
    expect(beto.last('team.plan')).toMatchObject({ ninja: 'fire', ready: false });
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 0 } } });
    expect(ana.last('turn.result')?.turn).toBe(1);
  });

  it('R-35: cada persona planea solo a su ninja: lo que manda siempre es para su asiento', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    // La casilla (1, 2) está a un paso de Marea y a tres de Brasa: como plan de Ana, no vale.
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 2 } } });
    expect(ana.last('plan.fix')).toMatchObject({ reason: 'invalid' });
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.map((n) => n.pos.x)).toEqual([0, 0, 0]);
  });

  it('un ninja caído no planea: su persona no tiene nada que confirmar', async () => {
    const w = world({ prepare: board({ ninjas: { fire: { hp: 0 } } }) });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    expect(ana.last('turn.start')?.plans.find((p) => p.ninja === 'fire')).toMatchObject({ ready: true });
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 0 } } });
    expect(ana.last('plan.fix')).toBeUndefined();
    // Con las otras dos listas, el turno se resuelve sin esperar a Ana.
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')?.turn).toBe(1);
  });
});

describe('El asiento del bot (R-33)', () => {
  it('R-33: el bot planea en el acto, y su plan se ve como el de un compañero ya listo', async () => {
    const w = world({ prepare: board({ golems: [{ kind: 'sniper', at: [5, 4] }] }) });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    const bot = ana.last('turn.start')?.plans.find((p) => p.ninja === 'snow');
    expect(bot).toMatchObject({ ready: true });
    expect(bot?.plan).not.toBeNull();
    // Los asientos de las personas empiezan sin plan y sin confirmar.
    expect(ana.last('turn.start')?.plans.filter((p) => p.ninja !== 'snow')).toEqual([
      { ninja: 'fire', plan: null, card: null, ready: false },
      { ninja: 'water', plan: null, card: null, ready: false },
    ]);
  });

  it('R-33: el bot no espera a nadie: cuando las personas confirman, el turno se resuelve con su jugada', async () => {
    const w = world({ prepare: board({ golems: [{ kind: 'sniper', at: [5, 4] }] }) });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    const result = ana.last('turn.result');
    expect(result?.turn).toBe(1);
    // Escarcha, que lleva el bot, hizo algo: se movió o atacó.
    expect(
      result?.events.some(
        (e) => (e.t === 'move' && e.unitId === 'snow') || (e.t === 'attack' && e.sourceId === 'snow'),
      ),
    ).toBe(true);
  });

  it('R-35: la casilla que reservó el bot tampoco se le puede quitar', async () => {
    const w = world({ prepare: board({ golems: [{ kind: 'sniper', at: [5, 4] }] }) });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    const bot = ana.last('turn.start')?.plans.find((p) => p.ninja === 'snow');
    const tile = bot?.plan?.moveTo;
    expect(tile).toBeDefined();
    // Beto llega a (1, 3) y a (1, 4); si el bot va a una de esas, no se la puede quitar.
    if (tile && tile.x <= 2 && Math.abs(tile.y - 2) + tile.x <= 2) {
      await w.say(beto, { type: 'plan.update', turn: 1, plan: { moveTo: tile } });
      expect(beto.last('plan.fix')).toMatchObject({ reason: 'tile_reserved', by: 'snow' });
    }
  });

  it('R-37: el bot se suma al combo cuando un compañero planea una carta, y lo deja si la retira', async () => {
    // Escarcha tiene una carta, pero sola no le conviene jugarla: su área solo alcanza a un gólem.
    const w = world({
      prepare: board({
        ninjas: { fire: { at: [3, 1], hand: [10] }, water: { at: [3, 3] }, snow: { at: [2, 2], hand: [9] } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    const before = ana.last('turn.start')?.plans.find((p) => p.ninja === 'snow');
    expect(before?.plan?.action?.type).not.toBe('card');
    await w.say(ana, {
      type: 'plan.update',
      turn: 1,
      plan: { action: { type: 'card', cardId: 'fire-m1', at: { x: 4, y: 2 } } },
    });
    // El bot vio la carta de Ana y juega la suya: las dos personas lo ven, con su valor.
    for (const link of [ana, beto]) {
      expect(link.last('team.plan')).toMatchObject({ ninja: 'snow', card: 9, ready: true });
      expect(link.last('team.plan')?.plan?.action?.type).toBe('card');
    }
    await w.say(ana, { type: 'plan.update', turn: 1, plan: {} });
    expect(beto.last('team.plan')).toMatchObject({ ninja: 'snow', card: null });
    expect(beto.last('team.plan')?.plan?.action?.type).not.toBe('card');
  });

  it('R-37: las cartas de dos personas combinan igual que en solo', async () => {
    const w = world({
      prepare: board({
        ninjas: { fire: { at: [3, 1], hand: [10] }, water: { at: [3, 3], hand: [9] } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, {
      type: 'plan.confirm',
      turn: 1,
      plan: { action: { type: 'card', cardId: 'fire-m1', at: { x: 4, y: 2 } } },
    });
    await w.say(beto, {
      type: 'plan.confirm',
      turn: 1,
      plan: { action: { type: 'card', cardId: 'water-m1', at: { x: 4, y: 2 } } },
    });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    const events = caro.last('turn.result')?.events ?? [];
    expect(events.find((e) => e.t === 'combo')).toEqual({ t: 'combo', elements: ['fire', 'water'] });
    expect(events.filter((e) => e.t === 'card').map((e) => (e.t === 'card' ? e.combo : null))).toEqual([true, true]);
  });
});

describe('Desconectarse y volver (R-38)', () => {
  it('R-38: el ninja de quien se desconecta queda quieto, y el equipo lo ve', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(caro, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 2, y: 4 } } });
    for (const link of [ana, beto]) link.fresh();
    await w.hub.disconnect(caro);
    for (const link of [ana, beto]) {
      expect(link.fresh()).toMatchObject([
        // Lo que tenía planeado sin confirmar se descarta, y su ninja cuenta como listo.
        { type: 'team.plan', ninja: 'snow', plan: null, ready: true },
        { type: 'player.status', ninja: 'snow', status: 'away' },
      ]);
    }
    expect(w.hub.statusOf(caro.player.userId)).toBe('away');
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.find((n) => n.id === 'snow')?.pos).toEqual({ x: 0, y: 4 });
  });

  it('R-38: lo que ya había confirmado sí se juega', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 2, y: 4 } } });
    await w.hub.disconnect(caro);
    expect(ana.last('team.plan')).toMatchObject({ ninja: 'snow', plan: { moveTo: { x: 2, y: 4 } }, ready: true });
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.find((n) => n.id === 'snow')?.pos).toEqual({ x: 2, y: 4 });
  });

  it('R-36: un ninja quieto cuenta como confirmado: el turno no lo espera', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')).toBeUndefined();
    await w.hub.disconnect(caro);
    expect(ana.last('turn.result')?.turn).toBe(1);
  });

  it('R-36: tampoco se espera a quien se fue para empezar el turno siguiente', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto], 0);
    expect(ana.last('turn.start')).toBeUndefined();
    await w.hub.disconnect(caro);
    expect(ana.last('turn.start')).toMatchObject({ turn: 1 });
    expect(ana.last('turn.start')?.seats[2]).toMatchObject({ element: 'snow', status: 'away' });
    expect(ana.last('turn.start')?.plans.find((p) => p.ninja === 'snow')).toMatchObject({ ready: true });
  });

  it('R-38: quien vuelve recibe la partida como está y retoma a su ninja desde el turno siguiente', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 2, y: 0 } } });
    await w.hub.disconnect(caro);
    await wait(4000);
    const caro2 = await w.back(caro);
    expect(caro2.received.map((m) => m.type)).toEqual(['welcome', 'match.resume']);
    const resume = caro2.last('match.resume');
    expect(resume).toMatchObject({ you: 'snow', turn: { n: 1, endsInMs: 6000, seconds: 10 } });
    expect(resume?.seats[2]).toMatchObject({ status: 'here' });
    expect(resume?.state).toMatchObject({ seed: 0, rng: 0 });
    // Trae los planes del equipo, para verlos como los ven los demás.
    expect(resume?.turn?.plans.find((p) => p.ninja === 'fire')).toMatchObject({ plan: { moveTo: { x: 2, y: 0 } } });
    expect(ana.last('player.status')).toMatchObject({ ninja: 'snow', status: 'here' });
    // En este turno su ninja sigue quieto: lo que mande no cuenta.
    await w.say(caro2, { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 2, y: 4 } } });
    await wait(DEADLINE);
    expect(ana.last('turn.result')?.state.ninjas.find((n) => n.id === 'snow')?.pos).toEqual({ x: 0, y: 4 });
    // Desde el siguiente, lo lleva de nuevo.
    await watched(w, [ana, beto, caro2], 1);
    expect(caro2.last('turn.start')?.plans.find((p) => p.ninja === 'snow')).toMatchObject({ ready: false });
    await w.say(caro2, { type: 'plan.update', turn: 2, plan: { moveTo: { x: 2, y: 4 } } });
    expect(ana.last('team.plan')).toMatchObject({ ninja: 'snow', plan: { moveTo: { x: 2, y: 4 } } });
  });

  it('R-38: quien vuelve mientras se ve un turno no detiene el reloj del siguiente', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    const caro2 = await w.back(caro);
    expect(caro2.last('match.resume')).toMatchObject({ turn: null });
    expect(caro2.last('match.resume')?.state.turn).toBe(1);
    await watched(w, [ana, beto], 1);
    expect(ana.all('turn.start')).toHaveLength(1);
    await watched(w, [caro2], 1);
    expect(ana.last('turn.start')).toMatchObject({ turn: 2 });
  });

  it('R-38: sin ninguna persona conectada, la partida se detiene; si alguien vuelve, sigue', async () => {
    const w = world({ prepare: board() });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    await w.hub.disconnect(ana);
    await w.hub.disconnect(beto);
    // Nadie mira: no se resuelve ningún turno, por mucho que pase el reloj.
    await wait(TIMINGS.emptyMs - 1);
    expect(w.hub.live).toBe(1);
    expect(w.store.closed).toEqual([]);
    const ana2 = await w.back(ana);
    expect(ana2.received.map((m) => m.type)).toEqual(['welcome', 'match.resume', 'turn.start']);
    // Sigue en el mismo turno, de nuevo, y Ana lleva a su ninja.
    expect(ana2.last('match.resume')?.state.turn).toBe(0);
    expect(ana2.last('turn.start')).toMatchObject({ turn: 1, endsInMs: 10_000 });
    expect(ana2.last('turn.start')?.plans.find((p) => p.ninja === 'fire')).toMatchObject({ ready: false });
    // El plazo de la partida vacía ya no corre.
    await wait(TIMINGS.emptyMs);
    expect(w.hub.live).toBe(1);
  });

  it('R-38: a los 2 minutos sin nadie, la partida termina y todos la abandonaron', async () => {
    const w = world({ prepare: board() });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    await w.hub.disconnect(ana);
    await w.hub.disconnect(beto);
    await wait(TIMINGS.emptyMs);
    expect(w.hub.live).toBe(0);
    expect(w.store.closed).toMatchObject([
      { result: null, present: [], away: [ana.player.userId, beto.player.userId] },
    ]);
    // Quien vuelve después llega al inicio en línea.
    const ana2 = await w.back(ana);
    expect(ana2.received.map((m) => m.type)).toEqual(['welcome', 'idle']);
    expect(w.hub.statusOf(ana.player.userId)).toBeNull();
  });

  it('D-102: abrir el juego en otra pestaña lleva la partida a la nueva', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    const ana2 = await w.back(ana);
    expect(ana.closedWith).toBe(4000);
    expect(ana2.last('match.resume')).toMatchObject({ you: 'fire' });
    expect(w.hub.statusOf(ana.player.userId)).toBe('here');
  });
});

describe('Salir de la partida (R-39)', () => {
  it('R-39: quien sale vuelve al inicio, su ninja queda quieto y el equipo sigue', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    for (const link of [ana, beto, caro]) link.fresh();
    await w.say(caro, { type: 'match.leave' });
    expect(caro.fresh()).toMatchObject([{ type: 'idle', reason: null }]);
    for (const link of [ana, beto]) {
      expect(link.fresh()).toMatchObject([
        { type: 'team.plan', ninja: 'snow', plan: null, ready: true },
        { type: 'player.status', ninja: 'snow', status: 'left' },
      ]);
    }
    expect(w.hub.statusOf(caro.player.userId)).toBeNull();
    expect(w.hub.live).toBe(1);
    // El turno sigue con las dos que quedan.
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('turn.result')?.turn).toBe(1);
  });

  it('R-39: quien salió no vuelve a esa partida, y queda libre para jugar otra', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(caro, { type: 'match.leave' });
    caro.fresh();
    await w.say(caro, { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 4 } } });
    expect(caro.fresh()).toMatchObject([{ type: 'error', code: 'not_now' }]);
    await w.say(caro, { type: 'queue.join', element: 'snow' });
    expect(caro.last('queue.state')).toMatchObject({ you: 'snow' });
    // Al volver a conectarse tampoco: llega al inicio.
    const caro2 = await w.back(caro);
    expect(caro2.received.map((m) => m.type)).toEqual(['welcome', 'idle']);
  });

  it('R-38: si se van todas las personas, la partida termina en el acto', async () => {
    const w = world({ prepare: board() });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    await w.say(ana, { type: 'match.leave' });
    expect(w.hub.live).toBe(1);
    await w.say(beto, { type: 'match.leave' });
    expect(w.hub.live).toBe(0);
    // Las dos salieron por su cuenta: al cerrar la partida ya no queda nadie por contar.
    expect(w.store.closed).toMatchObject([{ result: null, present: [], away: [] }]);
    expect(w.store.abandoned.map((a) => a.userId)).toEqual([ana.player.userId, beto.player.userId]);
  });

  it('R-38: si una salió y la otra se desconectó, se espera a la que puede volver', async () => {
    const w = world({ prepare: board() });
    const { ana, beto } = await duo(w);
    await watched(w, [ana, beto], 0);
    await w.say(ana, { type: 'match.leave' });
    await w.hub.disconnect(beto);
    expect(w.hub.live).toBe(1);
    const beto2 = await w.back(beto);
    expect(beto2.last('turn.start')).toMatchObject({ turn: 1 });
    expect(beto2.last('turn.start')?.seats[0]).toMatchObject({ element: 'fire', status: 'left' });
  });
});

describe('El final de la partida', () => {
  /** La última ronda con un gólem a punto de caer: Brasa lo derriba y la partida se gana, sin bonus. */
  const lastBlow = () =>
    board({
      round: 3,
      ninjas: { fire: { at: [3, 2] }, water: { at: [5, 3] }, snow: { everKo: true } },
      golems: [{ kind: 'sniper', at: [5, 2], hp: 1 }],
    });
  const win = async (w: World, links: FakeLink[]) => {
    await watched(w, links, 0);
    for (const link of links) {
      const plan = link === links[0] ? { action: { type: 'attack' as const, targetId: 'e1' } } : {};
      await w.say(link, { type: 'plan.confirm', turn: 1, plan });
    }
  };

  it('al ganar, cada persona recibe el último turno y después el resultado', async () => {
    const w = world({ prepare: lastBlow() });
    const { ana, beto, caro } = await trio(w);
    for (const link of [ana, beto, caro]) link.fresh();
    await win(w, [ana, beto, caro]);
    for (const link of [ana, beto, caro]) {
      const got = link.fresh().map((m) => m.type);
      expect(got.slice(got.indexOf('turn.result'))).toEqual(['turn.result', 'match.end', 'room.state']);
      expect(link.last('turn.result')?.state).toMatchObject({ status: 'victory', bonusOutcome: 'missed' });
      expect(link.last('match.end')).toMatchObject({ result: 'victory' });
    }
    expect(w.hub.live).toBe(0);
    expect(w.store.closed).toMatchObject([{ result: 'victory', bonusOutcome: 'missed', turns: 1, away: [] }]);
    expect(w.store.closed[0]?.present).toHaveLength(3);
  });

  it('al perder, el resultado lo dice', async () => {
    const w = world({
      prepare: board({
        ninjas: { fire: { at: [4, 2], hp: 1 }, water: { hp: 0 }, snow: { hp: 0 } },
        golems: [{ kind: 'colossus', at: [5, 2] }],
      }),
    });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(ana.last('match.end')).toMatchObject({ result: 'defeat' });
    expect(w.store.closed).toMatchObject([{ result: 'defeat', away: [] }]);
  });

  it('R-53: tras una partida de sala, el equipo vuelve a la sala y puede jugar otra', async () => {
    const w = world({ prepare: lastBlow() });
    const { ana, beto, caro, code } = await trio(w);
    await win(w, [ana, beto, caro]);
    expect(ana.last('match.end')).toMatchObject({ room: code });
    expect(ana.last('room.state')).toMatchObject({ code, start: 'full' });
    await w.say(ana, { type: 'room.start' });
    expect(ana.all('match.start')).toHaveLength(2);
    expect(w.store.opened).toHaveLength(2);
  });

  it('R-52: tras una partida de la cola, cada quien queda libre para buscar otra', async () => {
    const w = world({ prepare: lastBlow() });
    const ana = await w.join('Ana', 'fire');
    const beto = await w.join('Beto', 'water');
    const caro = await w.join('Caro', 'snow');
    await w.say(ana, { type: 'queue.join', element: 'fire' });
    await w.say(beto, { type: 'queue.join', element: 'water' });
    await w.say(caro, { type: 'queue.join', element: 'snow' });
    expect(ana.last('match.start')).toMatchObject({ you: 'fire', room: null });
    // En plena partida no se puede buscar otra.
    await w.say(beto, { type: 'queue.join', element: 'water' });
    expect(beto.last('error')).toMatchObject({ code: 'not_now' });
    expect(beto.last('queue.state')?.seats.map((s) => s.name)).toEqual(['Ana', 'Beto', null]);
    await win(w, [ana, beto, caro]);
    expect(ana.last('match.end')).toMatchObject({ result: 'victory', room: null });
    await w.say(ana, { type: 'queue.join', element: 'water' });
    expect(ana.last('queue.state')).toMatchObject({ you: 'water' });
  });

  it('R-39: quien no volvió antes del final también abandonó, y no recibe el resultado', async () => {
    const w = world({ prepare: lastBlow() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.disconnect(caro);
    await w.say(ana, { type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(w.store.closed).toMatchObject([{ result: 'victory', away: [caro.player.userId] }]);
    expect(caro.last('match.end')).toBeUndefined();
    const caro2 = await w.back(caro);
    expect(caro2.received.map((m) => m.type)).toEqual(['welcome', 'idle']);
  });

  it('R-53: si quien creó la sala abandonó la partida, los demás la terminan y ya no hay sala a la que volver', async () => {
    const w = world({ prepare: lastBlow() });
    const { ana, beto, caro, code } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.say(ana, { type: 'match.leave' });
    beto.fresh();
    // Brasa se quedó quieta: el golpe final lo da Marea, que está junto al gólem.
    await w.say(beto, { type: 'plan.confirm', turn: 1, plan: { action: { type: 'attack', targetId: 'e1' } } });
    await w.say(caro, { type: 'plan.confirm', turn: 1, plan: {} });
    expect(beto.last('match.end')).toMatchObject({ result: 'victory', room: null });
    // Ana abandonó: sigue conectada, en el inicio, pero el resultado de esa partida no es para ella.
    expect(ana.last('match.end')).toBeUndefined();
    // Después del resultado no llega ninguna sala: se cerró con la partida.
    expect(beto.fresh().map((m) => m.type)).toEqual(['team.plan', 'turn.result', 'match.end']);
    // El código ya no lleva a ninguna parte.
    const dani = await w.join('Dani', 'fire');
    await w.say(dani, { type: 'room.join', code, element: 'fire' });
    expect(dani.last('error')).toMatchObject({ code: 'room_not_found' });
  });

  it('al apagarse el servidor, las partidas se detienen: ningún reloj sigue corriendo', async () => {
    const w = world({ prepare: board() });
    const { ana, beto, caro } = await trio(w);
    await watched(w, [ana, beto, caro], 0);
    await w.hub.shutdown();
    expect(w.hub.live).toBe(0);
    await wait(DEADLINE * 3);
    expect(ana.last('turn.result')).toBeUndefined();
    expect([ana.closedWith, beto.closedWith, caro.closedWith]).toEqual([1012, 1012, 1012]);
  });
});
