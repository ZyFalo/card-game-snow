import { createMatch, type GameEvent, hashState, type MatchState, resolveTurn } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { checkPlan } from '../src/play/plans';
import { eventsFor, viewFor } from '../src/play/view';

/* Lo que sabe cada cliente (D-102) y la validación de los planes (R-35), sin red ni reloj. */

/** Un tablero conocido: los tres ninjas en la columna 0, con cartas en la mano, y un gólem a la vista. */
function board(): MatchState {
  const { state } = createMatch({ seed: 2026, mapId: 'cumbre', bonusCondition: 'noKo' });
  state.rocks = [];
  state.enemies = [{ id: 'e1', kind: 'sniper', pos: { x: 3, y: 1 }, hp: 30, maxHp: 30, stunned: false, burnTicks: 0 }];
  for (const n of state.ninjas) {
    n.pos = { x: 0, y: { fire: 0, water: 2, snow: 4 }[n.id] };
    n.hand = n.deck.splice(0, 2);
  }
  return state;
}

describe('Lo que recibe cada cliente (D-102)', () => {
  it('D-102: el estado viaja sin la semilla ni el azar de la partida', () => {
    const state = board();
    expect(state.seed).not.toBe(0);
    expect(state.rng).not.toBe(0);
    const view = viewFor(state, 'fire');
    expect(view.seed).toBe(0);
    expect(view.rng).toBe(0);
    // Sin ellos no se puede adelantar el turno: ni siquiera coincide el hash del estado.
    expect(hashState(view)).not.toBe(hashState(state));
  });

  it('R-35: cada persona ve su mano, y de las demás solo cuántas cartas hay', () => {
    const state = board();
    const view = viewFor(state, 'water');
    const mine = view.ninjas.find((n) => n.id === 'water');
    expect(mine?.hand).toEqual(state.ninjas.find((n) => n.id === 'water')?.hand);
    for (const other of view.ninjas.filter((n) => n.id !== 'water')) {
      const real = state.ninjas.find((n) => n.id === other.id);
      expect(other.hand).toHaveLength(2);
      expect(other.hand.map((c) => c.id)).toEqual(real?.hand.map((c) => c.id));
      expect(other.hand.every((c) => c.value === 0 && c.bankId === undefined)).toBe(true);
    }
  });

  it('R-35: de los mazos se sabe cuántas cartas quedan, no cuáles: ni del propio', () => {
    const state = board();
    const view = viewFor(state, 'snow');
    for (const n of view.ninjas) {
      expect(n.deck).toHaveLength(state.ninjas.find((x) => x.id === n.id)?.deck.length ?? -1);
      expect(n.deck.every((c) => c.value === 0)).toBe(true);
    }
  });

  it('lo demás llega tal cual: el tablero, la vida y los gólems', () => {
    const state = board();
    const view = viewFor(state, 'fire');
    expect(view.enemies).toEqual(state.enemies);
    expect(view.ninjas.map((n) => [n.id, n.pos, n.hp, n.meter])).toEqual(
      state.ninjas.map((n) => [n.id, n.pos, n.hp, n.meter]),
    );
    expect(view).toMatchObject({ round: state.round, turn: state.turn, mapId: state.mapId, status: 'playing' });
  });

  it('la vista es una copia: cambiarla no toca la partida', () => {
    const state = board();
    const view = viewFor(state, 'fire');
    (view.ninjas[0] as MatchState['ninjas'][number]).hp = 1;
    view.enemies.length = 0;
    expect(state.ninjas[0]?.hp).not.toBe(1);
    expect(state.enemies).toHaveLength(1);
  });

  it('R-35: la carta que roba un compañero llega tapada; la propia, no', () => {
    const card = { id: 'water-3', element: 'water' as const, value: 11, bankId: 'water-14' };
    const events: GameEvent[] = [
      { t: 'turnStart', turn: 4 },
      { t: 'draw', ninjaId: 'water', card },
      { t: 'meter', ninjaId: 'water', value: 0 },
    ];
    expect(eventsFor(events, 'water')).toEqual(events);
    expect(eventsFor(events, 'fire')[1]).toEqual({
      t: 'draw',
      ninjaId: 'water',
      card: { id: 'water-3', element: 'water', value: 0 },
    });
    // Lo demás no cambia.
    expect(eventsFor(events, 'fire')[0]).toEqual(events[0]);
    expect(eventsFor(events, 'fire')[2]).toEqual(events[2]);
  });

  it('una carta jugada sí la ve todo el equipo, con su valor', () => {
    const state = board();
    const fire = state.ninjas.find((n) => n.id === 'fire');
    const cardId = fire?.hand[0]?.id as string;
    const { events } = resolveTurn(state, [{ ninjaId: 'fire', action: { type: 'card', cardId, at: { x: 1, y: 1 } } }]);
    const played = eventsFor(events, 'snow').find((e) => e.t === 'card');
    expect(played).toMatchObject({ ninjaId: 'fire', card: { id: cardId, value: fire?.hand[0]?.value } });
  });
});

describe('Validación de los planes (R-35, D-102)', () => {
  it('un plan que vale se guarda entero', () => {
    const state = board();
    const check = checkPlan(state, 'fire', { moveTo: { x: 1, y: 1 }, action: { type: 'attack', targetId: 'e1' } }, []);
    expect(check).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 1, y: 1 }, action: { type: 'attack', targetId: 'e1' } },
      fix: null,
    });
  });

  it('un plan vacío es no hacer nada, y no tiene nada que corregir', () => {
    expect(checkPlan(board(), 'fire', {}, [])).toEqual({ plan: null, fix: null });
  });

  it('una casilla a la que el ninja no llega no vale', () => {
    const check = checkPlan(board(), 'fire', { moveTo: { x: 5, y: 0 } }, []);
    expect(check).toEqual({ plan: null, fix: { reason: 'invalid', by: null } });
  });

  it('R-35: una casilla que ya reservó un compañero es de quien llegó primero', () => {
    const state = board();
    const others = [{ ninjaId: 'water' as const, moveTo: { x: 1, y: 1 } }];
    const check = checkPlan(state, 'fire', { moveTo: { x: 1, y: 1 } }, others);
    expect(check).toEqual({ plan: null, fix: { reason: 'tile_reserved', by: 'water' } });
  });

  it('si la casilla no vale, la acción se mide desde donde está el ninja', () => {
    const state = board();
    // Desde (0, 0), el gólem de (3, 1) queda a 4 casillas: fuera del alcance de Fuego.
    const others = [{ ninjaId: 'water' as const, moveTo: { x: 1, y: 1 } }];
    const wanted = { moveTo: { x: 1, y: 1 }, action: { type: 'attack' as const, targetId: 'e1' } };
    expect(checkPlan(state, 'fire', wanted, others)).toEqual({
      plan: null,
      fix: { reason: 'tile_reserved', by: 'water' },
    });
    // Sin la reserva del compañero, el mismo plan vale entero.
    expect(checkPlan(state, 'fire', wanted, []).fix).toBeNull();
  });

  it('un objetivo fuera de alcance no vale, pero la casilla se conserva', () => {
    const check = checkPlan(
      board(),
      'water',
      { moveTo: { x: 1, y: 2 }, action: { type: 'attack', targetId: 'e1' } },
      [],
    );
    expect(check).toEqual({ plan: { ninjaId: 'water', moveTo: { x: 1, y: 2 } }, fix: { reason: 'invalid', by: null } });
  });

  it('un gólem que no existe, o una carta que no está en su mano, no valen', () => {
    const state = board();
    expect(checkPlan(state, 'fire', { action: { type: 'attack', targetId: 'e99' } }, []).plan).toBeNull();
    const stolen = state.ninjas.find((n) => n.id === 'water')?.hand[0]?.id as string;
    const check = checkPlan(state, 'fire', { action: { type: 'card', cardId: stolen, at: { x: 1, y: 0 } } }, []);
    expect(check).toEqual({ plan: null, fix: { reason: 'invalid', by: null } });
  });

  it('una carta propia, dentro de su alcance, vale', () => {
    const state = board();
    const cardId = state.ninjas.find((n) => n.id === 'fire')?.hand[0]?.id as string;
    const action = { type: 'card' as const, cardId, at: { x: 2, y: 0 } };
    expect(checkPlan(state, 'fire', { action }, []).plan).toEqual({ ninjaId: 'fire', action });
    // A tres casillas ya no llega: la carta se coloca a lo que camina el ninja.
    const far = { type: 'card' as const, cardId, at: { x: 3, y: 0 } };
    expect(checkPlan(state, 'fire', { action: far }, []).fix).toEqual({ reason: 'invalid', by: null });
  });

  it('R-09: a un caído lo revive quien lo eligió primero', () => {
    const state = board();
    const fallen = state.ninjas.find((n) => n.id === 'water') as MatchState['ninjas'][number];
    fallen.hp = 0;
    fallen.everKo = true;
    fallen.pos = { x: 1, y: 2 };
    const revive = { type: 'revive' as const, targetId: 'water' as const };
    const snow = checkPlan(state, 'snow', { moveTo: { x: 1, y: 3 }, action: revive }, []);
    expect(snow.fix).toBeNull();
    const fire = checkPlan(state, 'fire', { moveTo: { x: 1, y: 1 }, action: revive }, [snow.plan as never]);
    expect(fire).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 1, y: 1 } },
      fix: { reason: 'revive_taken', by: 'snow' },
    });
  });

  it('un ninja caído no planea nada', () => {
    const state = board();
    (state.ninjas.find((n) => n.id === 'fire') as MatchState['ninjas'][number]).hp = 0;
    expect(checkPlan(state, 'fire', { moveTo: { x: 1, y: 0 } }, [])).toEqual({
      plan: null,
      fix: { reason: 'invalid', by: null },
    });
    expect(checkPlan(state, 'fire', {}, [])).toEqual({ plan: null, fix: null });
  });

  it('lo que queda guardado nunca choca: el motor no descarta nada al resolver', () => {
    const state = board();
    const fire = checkPlan(state, 'fire', { moveTo: { x: 1, y: 1 }, action: { type: 'attack', targetId: 'e1' } }, []);
    const water = checkPlan(state, 'water', { moveTo: { x: 1, y: 1 } }, [fire.plan as never]);
    const snow = checkPlan(state, 'snow', { moveTo: { x: 2, y: 3 }, action: { type: 'attack', targetId: 'e1' } }, [
      fire.plan as never,
    ]);
    expect(water.plan).toBeNull();
    const plans = [fire.plan, snow.plan].filter((p) => p !== null);
    const { events } = resolveTurn(state, plans);
    expect(events.filter((e) => e.t === 'move').map((e) => e.unitId)).toEqual(expect.arrayContaining(['fire', 'snow']));
    expect(events.filter((e) => e.t === 'attack')).toHaveLength(2);
  });
});
