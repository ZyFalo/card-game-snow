import {
  createMatch,
  type Difficulty,
  difficultyConfig,
  type ElementKind,
  type MatchState,
  type Plan,
} from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { bonusProgress, contextualTip, firstFallTip, reviverOf, turnClockMs } from './planning';

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
