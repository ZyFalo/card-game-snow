import { createMatch, type ElementKind, type Enemy, type EnemyKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { NOTICE } from '../i18n/es';
import { canAct, hasPending, nextPending } from './planning';
import { canUndo, clickOutcome, type StepState, undoOutcome } from './steps';

/*
 * Lineamientos de diseño, sección "Tablero": al planificar a un ninja, el tablero ofrece a la vez sus
 * casillas y los objetivos que alcanza, y elegir una carta cambia al modo de colocarla. Qué hace cada clic.
 */

const HP: Record<EnemyKind, number> = { sniper: 30, artillery: 45, colossus: 60 };

const enemy = (id: string, kind: EnemyKind, x: number, y: number): Enemy => ({
  id,
  kind,
  pos: { x, y },
  hp: HP[kind],
  maxHp: HP[kind],
  stunned: false,
  burnTicks: 0,
});

/** Los tres ninjas en la columna 1 y tres gólems delante: Carámbano (e1), Témpano (e2) y Granizo (e3). */
function match(): MatchState {
  const { state } = createMatch({ seed: 7, mapId: 'cumbre', bonusCondition: 'noKo' });
  const at: Record<ElementKind, number> = { fire: 1, water: 2, snow: 3 };
  for (const n of state.ninjas) n.pos = { x: 1, y: at[n.id] };
  state.enemies = [enemy('e1', 'sniper', 5, 1), enemy('e2', 'colossus', 4, 2), enemy('e3', 'artillery', 5, 3)];
  return state;
}

const ninja = (m: MatchState, id: ElementKind) => {
  const n = m.ninjas.find((x) => x.id === id);
  if (!n) throw new Error(id);
  return n;
};

const state = (patch: Partial<StepState> = {}): StepState => ({
  match: match(),
  plans: {},
  active: 'fire',
  pendingCard: null,
  ...patch,
});

/** Brasa ya se movió junto a Témpano: desde (3,1) lo alcanza, y a Carámbano también. */
const MOVED: Plan = { ninjaId: 'fire', moveTo: { x: 3, y: 1 } };
const ATTACK = { type: 'attack', targetId: 'e2' } as const;

/** La misma partida con Brasa ya en (3,1), junto a Témpano: lo alcanza sin moverse. */
function near(): MatchState {
  const m = match();
  ninja(m, 'fire').pos = { x: 3, y: 1 };
  return m;
}

describe('Planificar: las casillas y los objetivos valen a la vez', () => {
  it('un objetivo a su alcance se elige sin moverse: el ninja se queda donde está, y termina', () => {
    expect(clickOutcome(state({ match: near() }), { x: 4, y: 2 })).toEqual({
      plan: { ninjaId: 'fire', action: ATTACK },
      finished: true,
      sound: 'place',
    });
  });

  it('una casilla de su color lo mueve, sin cambiar de ninja', () => {
    expect(clickOutcome(state(), { x: 3, y: 1 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } },
      sound: 'select',
    });
    // Tampoco cambia de ninja si desde ahí no alcanza a nadie: el foco no salta tras moverse.
    expect(clickOutcome(state(), { x: 2, y: 1 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } },
      sound: 'select',
    });
  });

  it('los objetivos se cuentan desde donde va a estar: al moverse, desde la casilla nueva', () => {
    // Desde (1,1), Témpano queda a 4 casillas, y Brasa alcanza 2.
    expect(clickOutcome(state(), { x: 4, y: 2 })).toEqual({ notice: NOTICE.enemyOutOfRange, sound: 'error' });
    // Desde (3,1) ya lo alcanza.
    expect(clickOutcome(state({ plans: { fire: MOVED } }), { x: 4, y: 2 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: ATTACK },
      finished: true,
      sound: 'place',
    });
    // Y a Granizo, ni así.
    expect(clickOutcome(state({ plans: { fire: MOVED } }), { x: 5, y: 3 })).toEqual({
      notice: NOTICE.enemyOutOfRange,
      sound: 'error',
    });
  });

  it('otro clic en una casilla de su color cambia el movimiento directamente, sin terminar', () => {
    expect(clickOutcome(state({ plans: { fire: MOVED } }), { x: 2, y: 1 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } },
      sound: 'select',
    });
  });

  it('al moverse conserva el objetivo si todavía lo alcanza, y si no, lo quita y lo dice', () => {
    const attack: Plan = { ...MOVED, action: ATTACK };
    // Desde (2,1) Témpano queda a 3 casillas: Brasa alcanza 2.
    const lost = clickOutcome(state({ plans: { fire: attack } }), { x: 2, y: 1 });
    expect(lost).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } },
      sound: 'select',
      notice: NOTICE.actionLost,
    });
    // Desde (2,2) sigue alcanzándolo.
    const kept = clickOutcome(state({ plans: { fire: attack } }), { x: 2, y: 2 });
    expect(kept).toEqual({ plan: { ninjaId: 'fire', moveTo: { x: 2, y: 2 }, action: ATTACK }, sound: 'select' });
    // Lo mismo si eligió el objetivo sin moverse y después se aleja.
    const still: Plan = { ninjaId: 'fire', action: ATTACK };
    const away = clickOutcome(state({ match: near(), plans: { fire: still } }), { x: 2, y: 1 });
    expect(away).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } },
      sound: 'select',
      notice: NOTICE.actionLost,
    });
    const close = clickOutcome(state({ match: near(), plans: { fire: still } }), { x: 3, y: 2 });
    expect(close.plan).toEqual({ ninjaId: 'fire', moveTo: { x: 3, y: 2 }, action: ATTACK });
    expect(close.notice).toBeUndefined();
  });

  it('un clic en la casilla de su fantasma, o en la suya, cancela el movimiento y lo devuelve a su lugar', () => {
    const moved = state({ plans: { fire: MOVED } });
    expect(clickOutcome(moved, { x: 3, y: 1 })).toEqual({ plan: { ninjaId: 'fire' }, sound: 'select' });
    expect(clickOutcome(moved, { x: 1, y: 1 })).toEqual({ plan: { ninjaId: 'fire' }, sound: 'select' });
    // El objetivo que ya no alcanza desde su lugar se quita, y lo dice; el que sí alcanza, se queda.
    const attack: Plan = { ...MOVED, action: ATTACK };
    const lost = clickOutcome(state({ plans: { fire: attack } }), { x: 3, y: 1 });
    expect(lost).toEqual({ plan: { ninjaId: 'fire' }, sound: 'select', notice: NOTICE.actionLost });
    const close = match();
    ninja(close, 'fire').pos = { x: 2, y: 2 };
    const kept = clickOutcome(state({ match: close, plans: { fire: attack } }), { x: 3, y: 1 });
    expect(kept.plan).toEqual({ ninjaId: 'fire', action: ATTACK });
  });

  it('si no se había movido, un clic en su casilla lo deja quieto: no cambia nada', () => {
    expect(clickOutcome(state(), { x: 1, y: 1 })).toEqual({});
    const still: Plan = { ninjaId: 'fire', action: ATTACK };
    expect(clickOutcome(state({ match: near(), plans: { fire: still } }), { x: 3, y: 1 })).toEqual({});
  });

  it('otro ninja en pie se activa; uno caído que no está al lado pide acercarse', () => {
    expect(clickOutcome(state(), { x: 1, y: 2 })).toEqual({ select: 'water' });
    const m = match();
    Object.assign(ninja(m, 'water'), { hp: 0, pos: { x: 1, y: 3 } });
    ninja(m, 'snow').pos = { x: 0, y: 4 };
    expect(clickOutcome(state({ match: m }), { x: 1, y: 3 })).toEqual({
      notice: NOTICE.reviveFromNeighbor('Marea'),
      sound: 'error',
    });
  });

  it('R-09 a un caído que está al lado se le revive sin moverse', () => {
    const m = match();
    ninja(m, 'water').hp = 0;
    expect(clickOutcome(state({ match: m }), { x: 1, y: 2 })).toEqual({
      plan: { ninjaId: 'fire', action: { type: 'revive', targetId: 'water' } },
      finished: true,
      sound: 'place',
    });
  });

  it('una casilla que no vale dice por qué: una roca, fuera de alcance o reservada por otro', () => {
    expect(clickOutcome(state(), { x: 2, y: 0 }).notice).toBe(NOTICE.rock);
    expect(clickOutcome(state(), { x: 8, y: 4 })).toEqual({ notice: NOTICE.outOfReach('Brasa'), sound: 'error' });
    const reserved = state({ plans: { water: { ninjaId: 'water', moveTo: { x: 2, y: 1 } } } });
    expect(clickOutcome(reserved, { x: 2, y: 1 }).notice).toBe(NOTICE.tileReserved('Marea'));
    // Después de moverse, igual.
    const moved = state({ plans: { fire: MOVED, water: { ninjaId: 'water', moveTo: { x: 2, y: 1 } } } });
    expect(clickOutcome(moved, { x: 2, y: 0 }).notice).toBe(NOTICE.rock);
    expect(clickOutcome(moved, { x: 8, y: 4 })).toEqual({ notice: NOTICE.outOfReach('Brasa'), sound: 'error' });
    expect(clickOutcome(moved, { x: 2, y: 1 }).notice).toBe(NOTICE.tileReserved('Marea'));
  });

  it('Escarcha cura sin moverse al aliado herido que alcanza; a uno sano, lo activa', () => {
    const m = match();
    ninja(m, 'water').hp = 20;
    const snow = state({ match: m, active: 'snow' });
    expect(clickOutcome(snow, { x: 1, y: 2 })).toEqual({
      plan: { ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } },
      finished: true,
      sound: 'place',
    });
    expect(clickOutcome(snow, { x: 1, y: 1 })).toEqual({ select: 'fire' });
  });

  it('R-09 revivir pide estar en una casilla vecina al caído', () => {
    const m = match();
    Object.assign(ninja(m, 'water'), { hp: 0, pos: { x: 3, y: 2 } });
    // Brasa, desde (3,1), está junto a Marea, que cayó al lado de Témpano. Elegirla ya no avisa de nada:
    // Marea se levanta al final del turno, después de los gólems.
    expect(clickOutcome(state({ match: m, plans: { fire: MOVED } }), { x: 3, y: 2 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: { type: 'revive', targetId: 'water' } },
      finished: true,
      sound: 'place',
    });
    // Desde su casilla de salida no llega.
    expect(clickOutcome(state({ match: m }), { x: 3, y: 2 })).toEqual({
      notice: NOTICE.reviveFromNeighbor('Marea'),
      sound: 'error',
    });
  });

  it('R-09 un caído no puede tener dos reanimadores: el segundo no puede elegirlo', () => {
    const m = match();
    Object.assign(ninja(m, 'water'), { hp: 0, pos: { x: 3, y: 2 } });
    // Brasa ya planeó revivir a Marea desde (3,1). Escarcha se mueve a (2,3), que también está junto a Marea.
    const fire: Plan = { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: { type: 'revive', targetId: 'water' } };
    const moved: Plan = { ninjaId: 'snow', moveTo: { x: 2, y: 3 } };
    const second = state({ match: m, plans: { fire, snow: moved }, active: 'snow' });
    const taken = { notice: NOTICE.reviveTaken('Brasa', 'Marea'), sound: 'error' };
    expect(clickOutcome(second, { x: 3, y: 2 })).toEqual(taken);
    expect(clickOutcome({ ...second, plans: { fire } }, { x: 3, y: 2 })).toEqual(taken);
    // Sin el plan de Brasa, Escarcha sí puede.
    const free = state({ match: m, plans: { snow: moved }, active: 'snow' });
    expect(clickOutcome(free, { x: 3, y: 2 }).plan?.action).toEqual({ type: 'revive', targetId: 'water' });
    // A Brasa su propio plan no la estorba: si cambia de casilla y sigue al lado, conserva la acción.
    const again = state({ match: m, plans: { fire }, active: 'fire' });
    expect(clickOutcome(again, { x: 2, y: 1 }).plan).toEqual({
      ninjaId: 'fire',
      moveTo: { x: 2, y: 1 },
      action: { type: 'revive', targetId: 'water' },
    });
  });
});

describe('Modo carta: el tablero solo acepta dónde colocarla', () => {
  function withCard(patch: Partial<StepState> = {}) {
    const m = match();
    ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
    return state({ match: m, pendingCard: 'fire-1', ...patch });
  }

  it('una casilla a su alcance coloca la carta, y el ninja termina', () => {
    expect(clickOutcome(withCard(), { x: 3, y: 1 })).toEqual({
      plan: { ninjaId: 'fire', action: { type: 'card', cardId: 'fire-1', at: { x: 3, y: 1 } } },
      cardDone: true,
      finished: true,
      sound: 'place',
    });
  });

  it('con una carta en la mano, un gólem no es un objetivo: su casilla es donde colocarla', () => {
    // Témpano está a su alcance, pero el clic coloca la carta ahí en vez de atacarlo.
    expect(clickOutcome(withCard({ plans: { fire: MOVED } }), { x: 4, y: 2 }).plan?.action).toEqual({
      type: 'card',
      cardId: 'fire-1',
      at: { x: 4, y: 2 },
    });
  });

  it('la carta reemplaza a la acción que ya tenía, y conserva la casilla elegida', () => {
    const attack: Plan = { ...MOVED, action: ATTACK };
    expect(clickOutcome(withCard({ plans: { fire: attack } }), { x: 4, y: 2 }).plan).toEqual({
      ninjaId: 'fire',
      moveTo: { x: 3, y: 1 },
      action: { type: 'card', cardId: 'fire-1', at: { x: 4, y: 2 } },
    });
  });

  it('fuera de su alcance lo dice, y la carta sigue en la mano', () => {
    expect(clickOutcome(withCard(), { x: 8, y: 4 })).toEqual({ notice: NOTICE.cardOutOfRange, sound: 'error' });
  });
});

describe('Deshacer va hacia atrás, de a una cosa', () => {
  const attack: Plan = { ...MOVED, action: ATTACK };

  it('primero suelta la carta que tiene en la mano', () => {
    expect(undoOutcome(state({ plans: { fire: attack }, pendingCard: 'fire-1' }))).toEqual({ cardDone: true });
  });

  it('después quita la acción, y conserva la casilla', () => {
    expect(undoOutcome(state({ plans: { fire: attack } }))).toEqual({ plan: MOVED, sound: 'select' });
    // Si la eligió sin moverse, se queda sin plan.
    expect(undoOutcome(state({ plans: { fire: { ninjaId: 'fire', action: ATTACK } } }))).toEqual({
      plan: { ninjaId: 'fire' },
      sound: 'select',
    });
  });

  it('después quita la casilla elegida', () => {
    expect(undoOutcome(state({ plans: { fire: MOVED } }))).toEqual({ plan: { ninjaId: 'fire' }, sound: 'select' });
  });

  it('sin nada que deshacer no hace nada, y Esc queda libre para abrir la pausa', () => {
    expect(undoOutcome(state())).toEqual({});
    expect(canUndo(state())).toBe(false);
    expect(canUndo(state({ plans: { fire: MOVED } }))).toBe(true);
    expect(canUndo(state({ plans: { fire: { ninjaId: 'fire', action: ATTACK } } }))).toBe(true);
    expect(canUndo(state({ pendingCard: 'fire-1' }))).toBe(true);
    expect(canUndo(state({ active: null, plans: { fire: MOVED } }))).toBe(false);
  });
});

describe('Pasar solo al siguiente ninja', () => {
  it('un ninja tiene con qué actuar si alcanza un objetivo desde su casilla planeada o tiene una carta', () => {
    const m = match();
    expect(canAct(m, {}, 'fire')).toBe(false);
    expect(canAct(m, { fire: MOVED }, 'fire')).toBe(true);
    ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
    expect(canAct(m, {}, 'fire')).toBe(true);
    // Un caído al lado también es algo que hacer, salvo que ya lo reviva otro ninja (R-09).
    const k = match();
    ninja(k, 'water').hp = 0;
    expect(canAct(k, {}, 'fire')).toBe(true);
    expect(canAct(k, { snow: { ninjaId: 'snow', action: { type: 'revive', targetId: 'water' } } }, 'fire')).toBe(false);
  });

  it('a un ninja le queda algo por decidir si no tiene acción y todavía puede moverse o actuar', () => {
    const m = match();
    expect(hasPending(m, {}, 'fire')).toBe(true);
    // Se movió a donde no alcanza a nadie y no tiene cartas: ya no le queda nada.
    expect(hasPending(m, { fire: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } } }, 'fire')).toBe(false);
    // Se movió a donde sí alcanza: le falta elegir.
    expect(hasPending(m, { fire: MOVED }, 'fire')).toBe(true);
    expect(hasPending(m, { fire: { ...MOVED, action: { type: 'attack', targetId: 'e2' } } }, 'fire')).toBe(false);
    ninja(m, 'fire').hp = 0;
    expect(hasPending(m, {}, 'fire')).toBe(false);
  });

  it('el siguiente es el primero con algo por decidir, en orden Fuego, Agua, Nieve, sin contar al que acaba', () => {
    const m = match();
    expect(nextPending(m, {}, null)).toBe('fire');
    expect(nextPending(m, {}, 'fire')).toBe('water');
    expect(nextPending(m, {}, 'snow')).toBe('fire');
    // Marea ya se movió sin tener a quién atacar: se la salta.
    const plans = { water: { ninjaId: 'water', moveTo: { x: 2, y: 2 } } } satisfies Record<string, Plan>;
    expect(nextPending(m, plans, 'fire')).toBe('snow');
    // Si a nadie más le queda nada, no hay siguiente: se queda con el ninja activo.
    const done = {
      fire: { ninjaId: 'fire', moveTo: { x: 2, y: 1 } },
      water: { ninjaId: 'water', moveTo: { x: 2, y: 2 } },
    } satisfies Record<string, Plan>;
    expect(nextPending(m, done, 'snow')).toBeNull();
  });
});
