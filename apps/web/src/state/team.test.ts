import { createMatch, type MatchState } from '@ventisca/core';
import { type MatchSeat, PLAY_TURN_SECONDS, PROTOCOL_VERSION, type TeamPlan } from '@ventisca/protocol';
import { describe, expect, it } from 'vitest';
import { NetworkHost, toPlan, toSeatPlan } from '../host/NetworkHost';
import { HELP, ONLINE_TEXT, TIP_TEXT } from '../i18n/es';
import { noAchievements } from './achievements';
import { boardLayers } from './board';
import { DEFAULT_SETTINGS } from './persist';
import { type AppState, initialOnline, type OnlineMatch } from './store';
import { cardPlayers, comboOf, isAsleep, onlineTip, readyOf, reveal, seatState, teamPlans, whoPlays } from './team';
import { momentTip } from './tips';

/* El equipo en una partida en línea: los planes de los demás, quién está listo y qué dice la franja. */

const SEATS: MatchSeat[] = [
  { element: 'fire', kind: 'human', name: 'BrasaLuz', status: 'here' },
  { element: 'water', kind: 'bot', name: null, status: 'here' },
  { element: 'snow', kind: 'human', name: 'OlaFria22', status: 'here' },
];

function online(patch: Partial<OnlineMatch> = {}): OnlineMatch {
  return { you: 'snow', seats: SEATS, room: null, turn: 1, ready: ['water'], plays: true, waiting: false, ...patch };
}

/** El estado como lo manda el servidor a quien lleva a Escarcha: las cartas de los demás van tapadas. */
function served(): MatchState {
  const { state } = createMatch({ seed: 7, difficulty: 'classic' });
  for (const n of state.ninjas) {
    n.hand = [{ id: `${n.id}-a`, element: n.id, value: n.id === 'snow' ? 9 : 0 }];
  }
  return state;
}

function app(match: MatchState, om: OnlineMatch, patch: Partial<AppState> = {}) {
  return {
    phase: 'planning' as const,
    screen: 'battle' as const,
    settings: DEFAULT_SETTINGS,
    local: false,
    resolveStep: null,
    boosting: false,
    match,
    view: match,
    plans: {},
    active: om.plays && !om.ready.includes(om.you) ? om.you : null,
    pendingCard: null,
    hover: null,
    spotted: null,
    demo: null,
    online: { ...initialOnline(), link: 'open' as const, match: om },
    ...patch,
  };
}

const plan = (ninja: TeamPlan['ninja'], p: TeamPlan['plan'], extra: Partial<TeamPlan> = {}): TeamPlan => ({
  ninja,
  plan: p,
  card: null,
  ready: false,
  ...extra,
});

describe('Los planes del equipo (R-35)', () => {
  it('los planes de los compañeros pasan al tablero; el propio no, porque lo lleva esta persona', () => {
    const plans = [
      plan('fire', { moveTo: { x: 1, y: 2 } }),
      plan('water', { action: { type: 'attack', targetId: 'e1' } }, { ready: true }),
      plan('snow', { moveTo: { x: 2, y: 4 } }),
    ];
    expect(teamPlans(plans, 'snow')).toEqual({
      fire: { ninjaId: 'fire', moveTo: { x: 1, y: 2 } },
      water: { ninjaId: 'water', action: { type: 'attack', targetId: 'e1' } },
    });
    expect(readyOf(plans)).toEqual(['water']);
  });

  it('un compañero sin plan no deja nada en el tablero', () => {
    expect(teamPlans([plan('fire', null), plan('water', {})], 'snow')).toEqual({});
    expect(toPlan('fire', null)).toBeUndefined();
    expect(toPlan('fire', {})).toBeUndefined();
  });

  it('el plan viaja sin decir de quién es, y vuelve con su ninja', () => {
    const mine = {
      ninjaId: 'snow' as const,
      moveTo: { x: 3, y: 1 },
      action: { type: 'heal' as const, targetId: 'fire' },
    };
    expect(toSeatPlan(mine)).toEqual({ moveTo: { x: 3, y: 1 }, action: { type: 'heal', targetId: 'fire' } });
    expect(toSeatPlan(undefined)).toEqual({});
    expect(toPlan('snow', toSeatPlan(mine))).toEqual(mine);
  });

  it('la carta que planea un compañero llega tapada, y el valor que manda el servidor la destapa', () => {
    const state = served();
    const card = plan('fire', { action: { type: 'card', cardId: 'fire-a', at: { x: 5, y: 2 } } }, { card: 11 });
    const shown = reveal(state, card);
    expect(shown.ninjas.find((n) => n.id === 'fire')?.hand).toEqual([{ id: 'fire-a', element: 'fire', value: 11 }]);
    // Lo demás no cambia, ni el estado original.
    expect(shown.ninjas.find((n) => n.id === 'water')).toBe(state.ninjas.find((n) => n.id === 'water'));
    expect(state.ninjas.find((n) => n.id === 'fire')?.hand[0]?.value).toBe(0);
    // Sin carta en el plan, o con una que no está en esa mano, no hay nada que destapar.
    expect(reveal(state, plan('fire', { moveTo: { x: 1, y: 1 } }))).toBe(state);
    expect(
      reveal(state, plan('fire', { action: { type: 'card', cardId: 'otra', at: { x: 5, y: 2 } } }, { card: 9 })),
    ).toBe(state);
  });

  it('el tablero cuenta la carta tapada de un compañero para el combo, sin inventarle un valor', () => {
    const state = served();
    const om = online();
    const plans = {
      fire: { ninjaId: 'fire' as const, action: { type: 'card' as const, cardId: 'fire-a', at: { x: 5, y: 2 } } },
      snow: { ninjaId: 'snow' as const, action: { type: 'card' as const, cardId: 'snow-a', at: { x: 6, y: 3 } } },
    };
    const layers = boardLayers(app(state, om, { plans }));
    expect(layers?.combo).toBe(true);
    const values = layers?.cards.flatMap((g) => g.cards);
    expect(values).toEqual([
      { ninja: 'fire', value: null },
      { ninja: 'snow', value: 9 },
    ]);
    expect(cardPlayers(plans)).toEqual(['fire', 'snow']);
    expect(comboOf(plans)).toEqual(['fire', 'snow']);
    expect(comboOf({ fire: plans.fire })).toEqual([]);
  });
});

describe('Quién está listo y quién duerme (R-36, R-38 y R-39)', () => {
  it('la marca de listo va sobre quien confirmó: ni sobre un caído, ni sobre quien no está', () => {
    const state = served();
    const fallen = { ...state, ninjas: state.ninjas.map((n) => (n.id === 'water' ? { ...n, hp: 0 } : n)) };
    const seats = SEATS.map((s) => (s.element === 'fire' ? { ...s, status: 'away' as const } : s));
    const om = online({ seats, ready: ['fire', 'water', 'snow'] });
    const layers = boardLayers(app(fallen, om));
    expect(layers?.ready.map((r) => r.ninja)).toEqual(['snow']);
    // En el sandbox no hay marca de listo.
    expect(boardLayers({ ...app(state, om), local: true })?.ready).toEqual([]);
  });

  it('la marca baja de lugar si en esa casilla hay una carta colocada', () => {
    const state = served();
    const fire = state.ninjas.find((n) => n.id === 'fire');
    const plans = {
      snow: {
        ninjaId: 'snow' as const,
        action: { type: 'card' as const, cardId: 'snow-a', at: fire?.pos ?? { x: 0, y: 0 } },
      },
    };
    const layers = boardLayers(app(state, online({ ready: ['fire'] }), { plans }));
    expect(layers?.ready).toEqual([{ ninja: 'fire', at: fire?.pos, below: true }]);
  });

  it('el panel dice cómo va cada persona: planeando, lista, desconectada, fuera o con su ninja caído', () => {
    const state = served();
    const s = { phase: 'planning' as const, view: state };
    const om = online({ ready: ['water', 'fire'] });
    expect(seatState(s, om, 'fire')).toBe('ready');
    expect(seatState(s, om, 'snow')).toBe('planning');
    expect(seatState(s, om, 'water')).toBe('ready');
    const away = online({ seats: SEATS.map((x) => (x.element === 'fire' ? { ...x, status: 'away' as const } : x)) });
    const left = online({ seats: SEATS.map((x) => (x.element === 'fire' ? { ...x, status: 'left' as const } : x)) });
    expect(seatState(s, away, 'fire')).toBe('away');
    expect(seatState(s, left, 'fire')).toBe('left');
    expect(isAsleep(away, 'fire')).toBe(true);
    expect(isAsleep(left, 'fire')).toBe(true);
    // El bot nunca duerme, ni quien está presente; sin partida en línea, nadie.
    expect(isAsleep(away, 'water')).toBe(false);
    expect(isAsleep(om, 'fire')).toBe(false);
    expect(isAsleep(null, 'fire')).toBe(false);
    const ko = { ...state, ninjas: state.ninjas.map((n) => (n.id === 'snow' ? { ...n, hp: 0 } : n)) };
    expect(seatState({ phase: 'planning', view: ko }, om, 'snow')).toBe('ko');
    // Mientras se ve el turno, quien está en pie y presente no dice nada.
    expect(seatState({ phase: 'resolving', view: state }, om, 'fire')).toBeNull();
    expect(seatState({ phase: 'resolving', view: state }, away, 'fire')).toBe('away');
  });

  it('a cada quien se le dice por su nombre: tú, la otra persona o el bot', () => {
    const om = online();
    expect(whoPlays(om, 'snow')).toBe('Tú');
    expect(whoPlays(om, 'fire')).toBe('BrasaLuz');
    expect(whoPlays(om, 'water')).toBe('Bot');
  });
});

describe('La franja de arriba en línea (D-91)', () => {
  const state = served();

  it('al planear dice qué elegir; con el plan hecho, que confirme', () => {
    const om = online();
    expect(onlineTip(app(state, om))).toBe(TIP_TEXT.plan('Escarcha'));
    const me = state.ninjas.find((n) => n.id === 'snow');
    const plans = {
      snow: {
        ninjaId: 'snow' as const,
        action: { type: 'card' as const, cardId: 'snow-a', at: me?.pos ?? { x: 0, y: 0 } },
      },
    };
    expect(onlineTip(app(state, om, { plans }))).toBe(ONLINE_TEXT.planDone);
    expect(onlineTip(app(state, om, { pendingCard: 'snow-a' }))).toBe(TIP_TEXT.placeCard('Escarcha'));
  });

  it('ya lista, dice a quién se espera, con el texto aprobado', () => {
    const om = online({ ready: ['water', 'snow'] });
    expect(onlineTip(app(state, om))).toBe(
      'Listo. Esperando a BrasaLuz: el turno se resuelve al confirmar todos o al llegar a cero.',
    );
    expect(onlineTip(app(state, online({ ready: ['water', 'snow', 'fire'] })))).toBe(ONLINE_TEXT.readyAll);
  });

  it('anuncia el combo con quienes juegan carta, y esta persona va al final', () => {
    const om = online();
    const at = { x: 5, y: 2 };
    const card = (ninja: 'fire' | 'water' | 'snow') => ({
      ninjaId: ninja,
      action: { type: 'card' as const, cardId: `${ninja}-a`, at },
    });
    expect(onlineTip(app(state, om, { plans: { fire: card('fire'), snow: card('snow') } }))).toBe(
      'Combo: BrasaLuz y tú juegan carta este turno.',
    );
    expect(onlineTip(app(state, om, { plans: { fire: card('fire'), water: card('water'), snow: card('snow') } }))).toBe(
      'Combo: BrasaLuz, el bot y tú juegan carta este turno.',
    );
    // El combo de los demás también se anuncia: es la señal para sumarse.
    expect(onlineTip(app(state, om, { plans: { fire: card('fire'), water: card('water') } }))).toBe(
      'Combo: BrasaLuz y el bot juegan carta este turno.',
    );
    // Una sola carta no es combo.
    expect(onlineTip(app(state, om, { plans: { fire: card('fire') } }))).toBe(TIP_TEXT.plan('Escarcha'));
    // Quien lleva a Brasa también se lee al final, aunque su ninja actúe primero.
    const asFire = online({ you: 'fire' });
    expect(onlineTip(app(state, asFire, { plans: { fire: card('fire'), snow: card('snow') } }))).toBe(
      'Combo: OlaFria22 y tú juegan carta este turno.',
    );
  });

  it('con su ninja caído, o recién vuelta a la partida, dice por qué no planea', () => {
    const ko = { ...state, ninjas: state.ninjas.map((n) => (n.id === 'snow' ? { ...n, hp: 0 } : n)) };
    expect(onlineTip(app(ko, online({ plays: false, ready: ['water', 'snow'] })))).toBe(ONLINE_TEXT.fallen('Escarcha'));
    expect(onlineTip(app(state, online({ plays: false, ready: ['water', 'snow'] })))).toBe(
      ONLINE_TEXT.returning('Escarcha'),
    );
  });

  it('mientras se ve el turno habla del equipo, y al terminar dice que espera a los demás', () => {
    const seeing = app(state, online({ turn: null }), { phase: 'resolving', resolveStep: 'ninjas' });
    expect(onlineTip(seeing)).toBe(ONLINE_TEXT.team(TIP_TEXT.holdToBoost));
    const waiting = app(state, online({ turn: null, waiting: true }), { phase: 'resolving', resolveStep: 'end' });
    expect(onlineTip(waiting)).toBe(ONLINE_TEXT.waitingTeam);
    expect(onlineTip({ ...seeing, online: initialOnline() })).toBeNull();
  });

  it('el consejo de pasar a otro ninja no sale en línea: cada persona lleva a uno solo', () => {
    const om = online();
    const me = state.ninjas.find((n) => n.id === 'snow');
    const plans = {
      snow: {
        ninjaId: 'snow' as const,
        action: { type: 'card' as const, cardId: 'snow-a', at: me?.pos ?? { x: 0, y: 0 } },
      },
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      learnedTips: ['firstCard' as const, 'combo' as const, 'firstFall' as const],
    };
    const base = {
      phase: 'planning' as const,
      settings,
      match: state,
      plans,
      active: 'snow' as const,
      pendingCard: null,
    };
    expect(momentTip({ ...base, local: true })?.id).toBe('switchNinja');
    expect(momentTip({ ...base, local: false })).toBeNull();
    expect(om.you).toBe('snow');
  });
});

describe('La ayuda con las reglas en línea', () => {
  it('D-90: explica el reloj con los segundos del servidor, no con un número escrito a mano', () => {
    const lines = HELP.online(PLAY_TURN_SECONDS);
    expect(lines.filter((line) => line.includes(`El reloj da ${PLAY_TURN_SECONDS} s por turno`))).toHaveLength(1);
    const other = HELP.online(15).join(' ');
    expect(other).toContain('El reloj da 15 s por turno');
    expect(other).not.toContain(`${PLAY_TURN_SECONDS} s`);
  });

  it('cubre el reloj, el ninja quieto, el abandono y los reinicios', () => {
    const text = HELP.online(PLAY_TURN_SECONDS).join(' ');
    for (const part of [
      'no hay pausa',
      'confirmar es definitivo',
      'su ninja queda quieto hasta que vuelva',
      'Quien vuelve lo retoma desde el turno siguiente',
      'Salir con la ✕ es abandonar: pierdes las monedas de esa partida',
      'También abandona quien se desconecta y no vuelve antes del final',
      'Si el servidor se reinicia, la partida termina',
      'no cuenta como derrota',
    ]) {
      expect(text).toContain(part);
    }
  });
});

describe('El host de red', () => {
  const seq = { v: PROTOCOL_VERSION, seq: 0 } as const;

  it('traduce lo que manda el servidor a los mensajes que la interfaz ya sabe mostrar', () => {
    const sent: unknown[] = [];
    let now = 1_000;
    const host = new NetworkHost(
      (p) => sent.push(p),
      () => now,
    );
    const got: unknown[] = [];
    host.subscribe((m) => got.push(m));
    const state = served();
    expect(host.receive({ ...seq, type: 'welcome', name: 'Ana' })).toBe(false);
    host.receive({
      ...seq,
      type: 'match.start',
      matchId: 'm',
      you: 'snow',
      seats: SEATS,
      state,
      events: [],
      room: 'ABCDEF',
    });
    expect(got[0]).toEqual({
      type: 'matchStart',
      state,
      events: [],
      online: { you: 'snow', seats: SEATS, room: 'ABCDEF' },
    });
    // Sin turno abierto no hay a dónde mandar un plan.
    host.planChanged({ ninjaId: 'snow', moveTo: { x: 1, y: 1 } });
    void host.submit([]);
    expect(sent).toEqual([]);
    host.receive({ ...seq, type: 'turn.start', turn: 1, endsInMs: 10_000, seconds: 10, seats: SEATS, plans: [] });
    expect(got[1]).toEqual({
      type: 'turnStart',
      turn: { n: 1, deadline: 11_000, totalMs: 10_000, plans: [] },
      seats: SEATS,
    });
    // El reloj es del servidor: aquí solo se sabe cuándo vence.
    expect(host.timer()).toEqual({ deadline: 11_000, remaining: null });
    now = 4_000;
    host.planChanged({ ninjaId: 'snow', moveTo: { x: 1, y: 1 } });
    void host.submit([{ ninjaId: 'snow', moveTo: { x: 1, y: 1 } }]);
    host.watched(1);
    host.leave();
    expect(sent).toEqual([
      { type: 'plan.update', turn: 1, plan: { moveTo: { x: 1, y: 1 } } },
      { type: 'plan.confirm', turn: 1, plan: { moveTo: { x: 1, y: 1 } } },
      { type: 'turn.ready', turn: 1 },
      { type: 'match.leave' },
    ]);
    host.receive({ ...seq, type: 'turn.result', turn: 1, events: [], state });
    expect(got[2]).toEqual({ type: 'turnResult', state, events: [] });
    expect(host.timer().deadline).toBeNull();
    expect(host.local).toBe(false);
    expect(host.replay()).toBeNull();
  });

  it('al volver a una partida, el reloj sigue desde lo que falta', () => {
    const host = new NetworkHost(
      () => {},
      () => 500,
    );
    const got: unknown[] = [];
    host.subscribe((m) => got.push(m));
    const state = served();
    const base = {
      ...seq,
      type: 'match.resume' as const,
      matchId: 'm',
      you: 'fire' as const,
      seats: SEATS,
      state,
      room: null,
    };
    host.receive({ ...base, turn: { n: 4, endsInMs: 3_200, seconds: 10, plans: [] } });
    expect(got[0]).toMatchObject({ type: 'matchResume', turn: { n: 4, deadline: 3_700, totalMs: 10_000 } });
    host.receive({ ...base, turn: null });
    expect(got[1]).toMatchObject({ type: 'matchResume', turn: null });
    expect(host.timer().deadline).toBeNull();
  });

  it('lo demás de la partida pasa tal cual: el plan de un compañero, una corrección, un asiento y el final', () => {
    const host = new NetworkHost(() => {});
    const got: unknown[] = [];
    host.subscribe((m) => got.push(m));
    host.receive({
      ...seq,
      type: 'team.plan',
      turn: 2,
      ninja: 'fire',
      plan: { moveTo: { x: 1, y: 1 } },
      card: null,
      ready: true,
    });
    host.receive({ ...seq, type: 'plan.fix', turn: 2, plan: null, reason: 'tile_reserved', by: 'fire' });
    host.receive({ ...seq, type: 'player.status', ninja: 'fire', status: 'away' });
    const end = {
      result: 'victory' as const,
      coins: { lines: [{ round: 1 as const, coins: 60 }], doubled: false, total: 60 },
      // El avance de los logros llega tal cual lo dijo el servidor: lo que lleva, lo que sumó y lo que completó.
      achievements: { ...noAchievements(), combo3: { count: 3, done: true }, healer: { count: 7, done: false } },
      gained: { combo3: 1, healer: 4 },
      completed: ['combo3' as const],
      balance: 60,
      room: null,
    };
    host.receive({ ...seq, type: 'match.end', ...end });
    expect(got).toEqual([
      { type: 'teamPlan', turn: 2, plan: { ninja: 'fire', plan: { moveTo: { x: 1, y: 1 } }, card: null, ready: true } },
      { type: 'planFix', turn: 2, plan: null, reason: 'tile_reserved', by: 'fire' },
      { type: 'seat', ninja: 'fire', status: 'away' },
      { type: 'matchEnd', end },
    ]);
    host.close();
    host.receive({ ...seq, type: 'player.status', ninja: 'fire', status: 'here' });
    expect(got).toHaveLength(4);
  });
});
