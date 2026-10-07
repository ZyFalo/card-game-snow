import {
  createMatch,
  type Difficulty,
  difficultyConfig,
  type ElementKind,
  type Enemy,
  type EnemyKind,
  getNinja,
  type MatchState,
  type Ninja,
  type Plan,
} from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { bonusProgress, contextualTip, firstFallTip, planLabel, reviverOf, turnClockMs } from './planning';

/* R-21: la ficha del bonus contra el reloj cuenta el turno que se planifica y los que quedan. */
describe('Bonus contra el reloj en la planificación (R-21)', () => {
  /** Estado en la planificación del turno `t` (ya se resolvieron t − 1 turnos). */
  const planningTurn = (t: number, difficulty: Difficulty) => {
    const s = createMatch({ seed: 1, difficulty, bonusCondition: 'turnLimit' }).state;
    s.turn = t - 1;
    return s;
  };

  for (const difficulty of ['classic', 'storm'] as const) {
    const n = difficultyConfig(difficulty).bonusTurnLimit;
    it(`R-21 (${difficulty}): en el primer turno dice "Turno 1 de ${n} · quedan ${n}"`, () => {
      expect(bonusProgress(planningTurn(1, difficulty)).text).toBe(`Turno 1 de ${n} · quedan ${n}`);
    });
    it(`R-21 (${difficulty}): en el último turno dice "Turno ${n} de ${n} · quedan 1"`, () => {
      expect(bonusProgress(planningTurn(n, difficulty)).text).toBe(`Turno ${n} de ${n} · quedan 1`);
    });
  }

  it('R-21: pasado el límite ya no quedan turnos para el bonus', () => {
    const n = difficultyConfig('classic').bonusTurnLimit;
    expect(bonusProgress(planningTurn(n + 1, 'classic'))).toEqual({
      text: `Turno ${n + 1} de ${n} · límite superado`,
      cls: 'bad',
    });
  });
});

describe('Reloj del turno (R-04)', () => {
  it('R-04: 10 s por cada uno de los 3 ninjas: 30 s en Normal, 15 s en Experto y sin reloj en Relajado', () => {
    expect(turnClockMs('normal', 3)).toBe(30_000);
    expect(turnClockMs('expert', 3)).toBe(15_000);
    expect(turnClockMs('relaxed', 3)).toBeNull();
  });

  it('R-04: con un ninja caído el turno dura 20 s, porque el reloj cuenta solo los ninjas en pie', () => {
    expect(turnClockMs('normal', 2)).toBe(20_000);
  });
});

/* R-09: revivir se explica la primera vez que cae un ninja, y un caído solo puede tener un reanimador. */
describe('Revivir en la planificación (R-09)', () => {
  const match = (down: ElementKind[] = []): MatchState => {
    const s = createMatch({ seed: 1 }).state;
    for (const n of s.ninjas) if (down.includes(n.id)) n.hp = 0;
    return s;
  };
  type Tip = Parameters<typeof contextualTip>[0];
  const planning = (patch: Partial<Tip>): Tip => ({
    phase: 'planning',
    resolveStep: null,
    boosting: false,
    match: match(['water']),
    plans: {},
    active: 'fire',
    pendingCard: null,
    hover: null,
    reviveTip: null,
    ...patch,
  });
  const HOW = 'Muévete junto a Marea para revivirlo. Se levanta al final del turno: protege a quien lo revive.';
  const PLAN = 'Elige a dónde se mueve Brasa, o un objetivo desde donde está.';
  /** Brasa da un paso al frente desde donde empieza la partida. */
  const step = (m: MatchState): Plan => {
    const at = m.ninjas[0]?.pos ?? { x: 0, y: 0 };
    return { ninjaId: 'fire', moveTo: { x: at.x + 1, y: at.y } };
  };

  it('R-09: el consejo nombra al primer caído, y sale una sola vez por partida', () => {
    expect(firstFallTip(match(), false)).toBeNull();
    expect(firstFallTip(match(['water']), false)).toBe('water');
    expect(firstFallTip(match(['snow', 'water']), false)).toBe('water');
    expect(firstFallTip(match(['water']), true)).toBeNull();
  });

  it('al activar un ninja, el consejo ofrece moverse o elegir un objetivo desde donde está', () => {
    expect(contextualTip(planning({ match: match() }))).toBe(PLAN);
    expect(contextualTip(planning({ match: match(), active: 'snow' }))).toBe(
      'Elige a dónde se mueve Escarcha, o un objetivo desde donde está.',
    );
  });

  it('R-09: la primera vez que cae un ninja, el consejo de ese momento dice cómo revivirlo', () => {
    expect(contextualTip(planning({ reviveTip: 'water' }))).toBe(HOW);
    // Sin ese consejo pendiente, dice lo de siempre.
    expect(contextualTip(planning({}))).toBe(PLAN);
    // Cuando ya eligió casilla, o con una carta en la mano, cada momento dice lo suyo.
    const m = match(['water']);
    expect(contextualTip(planning({ match: m, reviveTip: 'water', plans: { fire: step(m) } }))).not.toBe(HOW);
    expect(contextualTip(planning({ reviveTip: 'water', pendingCard: 'fire-1' }))).not.toBe(HOW);
    // Si ese ninja ya está en pie, el consejo no tiene a quién nombrar.
    expect(contextualTip(planning({ reviveTip: 'water', match: match() }))).toBe(PLAN);
  });

  it('después de moverse, el consejo dice que elija qué hace y que puede cambiar de casilla', () => {
    const m = match();
    // Con una carta en la mano, Brasa tiene qué hacer desde cualquier casilla.
    (m.ninjas[0] as MatchState['ninjas'][number]).hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
    expect(contextualTip(planning({ match: m, plans: { fire: step(m) } }))).toBe(
      'Elige qué hace Brasa: un objetivo o una carta. Para cambiar a dónde se mueve, haz clic en otra casilla de su color.',
    );
  });

  it('si se movió a donde no alcanza a nadie, la franja dice quién falta sin contar al ninja activo', () => {
    // Al empezar nadie alcanza a un gólem ni tiene cartas. Brasa se mueve: sigue activa, porque el foco no
    // salta tras moverse, pero ya no le queda nada por decidir.
    const m = match();
    expect(contextualTip(planning({ match: m, plans: { fire: step(m) } }))).toBe(
      'Tab pasa al siguiente ninja. Falta planear a Marea y Escarcha.',
    );
  });

  it('R-09: quién revive a un caído sale de los planes', () => {
    const revive = { type: 'revive', targetId: 'water' } as const;
    expect(reviverOf({}, 'water')).toBeNull();
    expect(reviverOf({ snow: { ninjaId: 'snow', action: revive } }, 'water')).toBe('snow');
    expect(reviverOf({ snow: { ninjaId: 'snow', action: revive } }, 'fire')).toBeNull();
    expect(reviverOf({ fire: { ninjaId: 'fire', action: { type: 'attack', targetId: 'e1' } } }, 'water')).toBeNull();
  });
});

/** Una partida con un solo gólem, de la clase y en la casilla que se pidan. */
function withGolem(kind: EnemyKind, x: number, y: number): MatchState {
  const s = createMatch({ seed: 1 }).state;
  const golem: Enemy = { id: 'e1', kind, pos: { x, y }, hp: 50, maxHp: 60, stunned: false, burnTicks: 0 };
  s.enemies = [golem];
  return s;
}

/* D-74: el panel de cada ninja resume su plan con palabras y sin números. */
describe('El resumen del plan en el panel (D-74)', () => {
  const m = withGolem('colossus', 5, 2);
  const ninja = (id: ElementKind): Ninja => getNinja(m, id) as Ninja;
  const fire = ninja('fire');
  fire.hand = [{ id: 'fire-1', element: 'fire', value: 11 }];
  const to = { x: fire.pos.x + 1, y: fire.pos.y };
  const attack = { type: 'attack', targetId: 'e1' } as const;
  const card = { type: 'card', cardId: 'fire-1', at: to } as const;
  const label = (plan: Plan | undefined, id: ElementKind = 'fire') => planLabel(plan, ninja(id), m);

  it('con movimiento y acción dice las dos cosas, en orden: "Moverse → atacar a Témpano"', () => {
    expect(label({ ninjaId: 'fire', moveTo: to, action: attack })).toBe('Moverse → atacar a Témpano');
    expect(label({ ninjaId: 'snow', moveTo: to, action: { type: 'heal', targetId: 'fire' } }, 'snow')).toBe(
      'Moverse → curar a Brasa',
    );
    expect(label({ ninjaId: 'fire', moveTo: to, action: { type: 'revive', targetId: 'water' } })).toBe(
      'Moverse → revivir a Marea',
    );
    expect(label({ ninjaId: 'fire', moveTo: to, action: card })).toBe('Moverse → jugar carta');
  });

  it('si no se mueve, dice solo la acción', () => {
    expect(label({ ninjaId: 'fire', action: attack })).toBe('Atacar a Témpano');
    expect(label({ ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } }, 'snow')).toBe('Curar a Marea');
    expect(label({ ninjaId: 'fire', action: { type: 'revive', targetId: 'snow' } })).toBe('Revivir a Escarcha');
    expect(label({ ninjaId: 'fire', action: card })).toBe('Jugar carta');
  });

  it('no lleva números: una carta no dice su valor', () => {
    for (const plan of [
      { ninjaId: 'fire', action: card },
      { ninjaId: 'fire', moveTo: to, action: card },
      { ninjaId: 'fire', moveTo: to, action: attack },
    ] satisfies Plan[]) {
      expect(label(plan)).not.toMatch(/\d/);
    }
  });

  it('solo moverse, sin plan y caído se dicen como antes', () => {
    expect(label({ ninjaId: 'fire', moveTo: to })).toBe('Solo moverse');
    expect(label(undefined)).toBe('Sin plan');
    expect(planLabel(undefined, { ...fire, hp: 0 }, m)).toBe('Caído');
  });

  it('para quien no ve la pantalla, el resumen se dice sin la flecha', () => {
    expect(planLabel({ ninjaId: 'fire', moveTo: to, action: attack }, fire, m, true)).toBe(
      'Moverse y atacar a Témpano',
    );
    expect(planLabel({ ninjaId: 'fire', action: attack }, fire, m, true)).toBe('Atacar a Témpano');
  });
});

/* D-74: al pasar el ratón sobre un gólem, la franja dice su nombre y cómo ataca. */
describe('El gólem bajo el ratón (D-74)', () => {
  type Tip = Parameters<typeof contextualTip>[0];
  const tip = (kind: EnemyKind, patch: Partial<Tip> = {}) =>
    contextualTip({
      phase: 'planning',
      resolveStep: null,
      boosting: false,
      match: withGolem(kind, 5, 2),
      plans: {},
      active: 'fire',
      pendingCard: null,
      hover: { x: 5, y: 2 },
      reviveTip: null,
      ...patch,
    });

  it('dice su nombre y un consejo corto sobre cómo ataca, sin su vida ni otros números de la partida', () => {
    expect(tip('colossus')).toBe(
      'Témpano. Lento pero brutal: barre tres casillas. No se pongan hombro con hombro frente a él.',
    );
    expect(tip('sniper')).toBe('Carámbano. Pega más fuerte de lejos (3 a 5). Acércate para que duela menos.');
    expect(tip('artillery')).toBe('Granizo. Su granizo salpica 4 a los vecinos del objetivo. No se amontonen.');
  });

  it('vale antes y después de moverse, y no con una carta en la mano', () => {
    const m = withGolem('colossus', 5, 2);
    const at = m.ninjas[0]?.pos ?? { x: 0, y: 0 };
    const moved: Plan = { ninjaId: 'fire', moveTo: { x: at.x + 1, y: at.y } };
    expect(tip('colossus', { match: m, plans: { fire: moved } })).toMatch(/^Témpano\. /);
    expect(tip('colossus', { pendingCard: 'fire-1' })).toBe(
      'Elige dónde colocar la carta de Brasa. Afecta un área de 3×3.',
    );
  });

  it('fuera del gólem, la franja vuelve al consejo de planificar', () => {
    expect(tip('colossus', { hover: { x: 4, y: 2 } })).toBe(
      'Elige a dónde se mueve Brasa, o un objetivo desde donde está.',
    );
  });
});
