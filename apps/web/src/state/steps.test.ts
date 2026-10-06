import { createMatch, type ElementKind, type Enemy, type EnemyKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { NOTICE } from '../i18n/es';
import { canAct, hasPending, nextPending, stepFor } from './planning';
import { canUndo, clickOutcome, type StepState, undoOutcome } from './steps';

/*
 * Lineamientos de diseño, sección "Tablero": cada ninja se planifica en dos pasos, moverse y actuar, y
 * elegir una carta cambia al modo de colocarla. Qué hace cada clic en cada paso.
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
  step: 'move',
  ...patch,
});

/** Brasa ya se movió junto a Témpano: desde (3,1) lo alcanza, y a Carámbano también. */
const MOVED: Plan = { ninjaId: 'fire', moveTo: { x: 3, y: 1 } };

describe('Paso 1, moverse: el tablero solo acepta casillas', () => {
  it('una casilla a su alcance es el destino, y pasa al paso de actuar', () => {
    expect(clickOutcome(state(), { x: 3, y: 1 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } },
      step: 'act',
      finished: 'move',
      sound: 'select',
    });
  });

  it('su propia casilla es quedarse: pasa al paso de actuar sin moverse', () => {
    expect(clickOutcome(state(), { x: 1, y: 1 })).toEqual({
      plan: { ninjaId: 'fire' },
      step: 'act',
      finished: 'move',
      sound: 'select',
    });
    // Si ya había elegido otra casilla, quedarse la suelta.
    expect(clickOutcome(state({ plans: { fire: MOVED } }), { x: 1, y: 1 }).plan).toEqual({ ninjaId: 'fire' });
  });

  it('la casilla de su fantasma confirma el destino que ya tenía', () => {
    expect(clickOutcome(state({ plans: { fire: MOVED } }), { x: 3, y: 1 })).toEqual({
      step: 'act',
      finished: 'move',
      sound: 'select',
    });
  });

  it('un gólem todavía no es un objetivo: primero hay que moverse o quedarse', () => {
    const m = match();
    ninja(m, 'fire').pos = { x: 3, y: 1 };
    // Aunque Témpano esté a su alcance sin moverse.
    expect(clickOutcome(state({ match: m }), { x: 4, y: 2 })).toEqual({
      notice: NOTICE.moveFirst('Brasa'),
      sound: 'error',
    });
  });

  it('otro ninja en pie se activa; uno caído pide acercarse', () => {
    expect(clickOutcome(state(), { x: 1, y: 2 })).toEqual({ select: 'water' });
    const m = match();
    ninja(m, 'water').hp = 0;
    expect(clickOutcome(state({ match: m }), { x: 1, y: 2 })).toEqual({
      notice: NOTICE.reviveFromNeighbor('Marea'),
      sound: 'error',
    });
  });

  it('una casilla que no vale dice por qué: una roca, fuera de alcance o reservada por otro', () => {
    expect(clickOutcome(state(), { x: 2, y: 0 }).notice).toBe(NOTICE.rock);
    expect(clickOutcome(state(), { x: 8, y: 4 }).notice).toBe(NOTICE.outOfReach('Brasa'));
    const reserved = state({ plans: { water: { ninjaId: 'water', moveTo: { x: 2, y: 1 } } } });
    expect(clickOutcome(reserved, { x: 2, y: 1 }).notice).toBe(NOTICE.tileReserved('Marea'));
  });

  it('cambiar de casilla conserva la acción si todavía alcanza, y si no, la suelta y lo dice', () => {
    const attack: Plan = { ...MOVED, action: { type: 'attack', targetId: 'e2' } };
    // Desde (2,1) Témpano queda a 3 casillas: Brasa alcanza 2.
    const lost = clickOutcome(state({ plans: { fire: attack } }), { x: 2, y: 1 });
    expect(lost.plan).toEqual({ ninjaId: 'fire', moveTo: { x: 2, y: 1 } });
    expect(lost.notice).toBe(NOTICE.actionLost);
    // Desde (2,2) sigue alcanzándolo.
    const kept = clickOutcome(state({ plans: { fire: attack } }), { x: 2, y: 2 });
    expect(kept.plan).toEqual({ ninjaId: 'fire', moveTo: { x: 2, y: 2 }, action: { type: 'attack', targetId: 'e2' } });
    expect(kept.notice).toBeUndefined();
  });
});

describe('Paso 2, actuar: el tablero solo acepta objetivos', () => {
  const acting = (patch: Partial<StepState> = {}) => state({ plans: { fire: MOVED }, step: 'act', ...patch });

  it('un gólem a su alcance es el objetivo, y el ninja termina', () => {
    expect(clickOutcome(acting(), { x: 4, y: 2 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: { type: 'attack', targetId: 'e2' } },
      finished: 'act',
      sound: 'place',
    });
  });

  it('un gólem fuera de su alcance lo dice y no cambia el plan', () => {
    expect(clickOutcome(acting(), { x: 5, y: 3 })).toEqual({ notice: NOTICE.enemyOutOfRange, sound: 'error' });
  });

  it('una casilla vacía no es un objetivo, aunque Brasa llegue hasta ella: dice cómo volver a moverse', () => {
    // (2,1) está a un paso de Brasa: en el paso de moverse sería un destino.
    expect(clickOutcome(state(), { x: 2, y: 1 }).plan).toEqual({ ninjaId: 'fire', moveTo: { x: 2, y: 1 } });
    expect(clickOutcome(acting(), { x: 2, y: 1 })).toEqual({ notice: NOTICE.pickTarget('Brasa'), sound: 'error' });
  });

  it('su casilla, o la de su fantasma, vuelve al paso de moverse sin tocar el plan', () => {
    expect(clickOutcome(acting(), { x: 1, y: 1 })).toEqual({ step: 'move', sound: 'select' });
    expect(clickOutcome(acting(), { x: 3, y: 1 })).toEqual({ step: 'move', sound: 'select' });
  });

  it('Escarcha cura al aliado herido que alcanza; a uno sano, lo activa', () => {
    const m = match();
    ninja(m, 'water').hp = 20;
    const snow = (patch: Partial<StepState> = {}) => state({ match: m, active: 'snow', step: 'act', ...patch });
    expect(clickOutcome(snow(), { x: 1, y: 2 })).toEqual({
      plan: { ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } },
      finished: 'act',
      sound: 'place',
    });
    expect(clickOutcome(snow(), { x: 1, y: 1 })).toEqual({ select: 'fire' });
  });

  it('revivir pide estar en una casilla vecina al caído, y avisa si ahí lo alcanzan', () => {
    const m = match();
    Object.assign(ninja(m, 'water'), { hp: 0, pos: { x: 3, y: 2 } });
    // Brasa, desde (3,1), está junto a Marea, que cayó al lado de Témpano.
    expect(clickOutcome(acting({ match: m }), { x: 3, y: 2 })).toEqual({
      plan: { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: { type: 'revive', targetId: 'water' } },
      finished: 'act',
      sound: 'place',
      notice: NOTICE.exposedRevive('Marea'),
    });
    // Desde su casilla de salida no llega.
    const far = state({ match: m, step: 'act' });
    expect(clickOutcome(far, { x: 3, y: 2 })).toEqual({ notice: NOTICE.reviveFromNeighbor('Marea'), sound: 'error' });
  });
});

describe('Modo carta: el tablero solo acepta dónde colocarla', () => {
  function withCard(patch: Partial<StepState> = {}) {
    const m = match();
    ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
    return state({ match: m, pendingCard: 'fire-1', ...patch });
  }

  it('una casilla a su alcance coloca la carta, en cualquiera de los dos pasos, y el ninja termina', () => {
    for (const step of ['move', 'act'] as const) {
      expect(clickOutcome(withCard({ step }), { x: 3, y: 1 })).toEqual({
        plan: { ninjaId: 'fire', action: { type: 'card', cardId: 'fire-1', at: { x: 3, y: 1 } } },
        cardDone: true,
        finished: 'act',
        sound: 'place',
      });
    }
  });

  it('la carta reemplaza a la acción que ya tenía, y conserva la casilla elegida', () => {
    const attack: Plan = { ...MOVED, action: { type: 'attack', targetId: 'e2' } };
    expect(clickOutcome(withCard({ plans: { fire: attack }, step: 'act' }), { x: 4, y: 2 }).plan).toEqual({
      ninjaId: 'fire',
      moveTo: { x: 3, y: 1 },
      action: { type: 'card', cardId: 'fire-1', at: { x: 4, y: 2 } },
    });
  });

  it('fuera de su alcance lo dice, y la carta sigue en la mano', () => {
    expect(clickOutcome(withCard(), { x: 8, y: 4 })).toEqual({ notice: NOTICE.cardOutOfRange, sound: 'error' });
  });
});

describe('Deshacer va paso a paso hacia atrás', () => {
  const attack: Plan = { ...MOVED, action: { type: 'attack', targetId: 'e2' } };

  it('primero suelta la carta que tiene en la mano', () => {
    expect(undoOutcome(state({ plans: { fire: attack }, step: 'act', pendingCard: 'fire-1' }))).toEqual({
      cardDone: true,
    });
  });

  it('después quita la acción, y se queda en el paso de actuar', () => {
    expect(undoOutcome(state({ plans: { fire: attack }, step: 'act' }))).toEqual({ plan: MOVED, sound: 'select' });
  });

  it('después quita la casilla elegida, o el quedarse, y vuelve al paso de moverse', () => {
    const back = { plan: { ninjaId: 'fire' }, step: 'move', sound: 'select' };
    expect(undoOutcome(state({ plans: { fire: MOVED }, step: 'act' }))).toEqual(back);
    expect(undoOutcome(state({ step: 'act' }))).toEqual(back);
  });

  it('sin nada que deshacer no hace nada, y Esc queda libre para abrir la pausa', () => {
    expect(undoOutcome(state())).toEqual({});
    expect(canUndo(state())).toBe(false);
    expect(canUndo(state({ step: 'act' }))).toBe(true);
    expect(canUndo(state({ plans: { fire: MOVED } }))).toBe(true);
    expect(canUndo(state({ pendingCard: 'fire-1' }))).toBe(true);
    expect(canUndo(state({ active: null, step: 'act' }))).toBe(false);
  });
});

describe('Pasar solo al siguiente ninja', () => {
  it('al activar un ninja, retoma donde iba: actuar si ya eligió casilla o acción, y si no, moverse', () => {
    expect(stepFor(undefined)).toBe('move');
    expect(stepFor({ ninjaId: 'fire' })).toBe('move');
    expect(stepFor(MOVED)).toBe('act');
    expect(stepFor({ ninjaId: 'fire', action: { type: 'attack', targetId: 'e2' } })).toBe('act');
  });

  it('un ninja tiene con qué actuar si alcanza un objetivo desde su casilla planeada o tiene una carta', () => {
    const m = match();
    expect(canAct(m, {}, 'fire')).toBe(false);
    expect(canAct(m, { fire: MOVED }, 'fire')).toBe(true);
    ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
    expect(canAct(m, {}, 'fire')).toBe(true);
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
