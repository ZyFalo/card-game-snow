import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_FOLDS,
  ACHIEVEMENT_IDS,
  type AchievementId,
  basicHealsBy,
  createMatch,
  ELEMENTS,
  type ElementKind,
  earnedAchievements,
  HEALER_GOAL,
  type MatchState,
  type Plan,
  personalAchievements,
  planTeam,
  resolveTurn,
  rngFrom,
} from '../src';
import { addEnemy, blank, ninja, place } from './helpers';

/* Logros por persona (R-55 del PRD de v2): los que gana, en cada turno, quien lleva a cada ninja. */

const card = (id: ElementKind, value: number, n = 1) => ({ id: `${id}-t${n}`, element: id, value });

/** Resuelve un turno y dice qué logros gana quien lleva a cada ninja. */
function play(state: MatchState, plans: Plan[], heals: Partial<Record<ElementKind, number>> = {}) {
  const result = resolveTurn(state, plans);
  const turn = { before: state, after: result.state, events: result.events };
  const earned = Object.fromEntries(
    ELEMENTS.map((el) => [el, personalAchievements(turn, el, heals[el] ?? 0)]),
  ) as Record<ElementKind, AchievementId[]>;
  return { ...result, earned };
}

describe('Logros por persona (R-55)', () => {
  it('R-55: los 9 logros se reparten en tres pliegues de tres, sin repetir ninguno', () => {
    const all = Object.values(ACHIEVEMENT_FOLDS).flat();
    expect(all).toHaveLength(9);
    expect([...all].sort()).toEqual([...ACHIEVEMENT_IDS].sort());
    expect(ACHIEVEMENT_FOLDS.fire).toEqual(['combo2', 'combo3', 'perfectSweep']);
    expect(ACHIEVEMENT_FOLDS.water).toEqual(['upAgain', 'bonusWon', 'untouched']);
    expect(ACHIEVEMENT_FOLDS.snow).toEqual(['reviver', 'healer15', 'noOneLeft']);
  });

  it('D-98: "Barrido perfecto" ya no se llama como la dificultad Tormenta', () => {
    expect(ACHIEVEMENT_IDS).toContain('perfectSweep');
    expect(ACHIEVEMENT_IDS).not.toContain('perfectStorm');
  });

  it('R-55: un combo doble es de quienes jugaron carta, no de quien no la jugó', () => {
    const s = blank();
    place(s, 'fire', 3, 1, { hand: [card('fire', 10)] });
    place(s, 'water', 3, 3, { hand: [card('water', 9)] });
    addEnemy(s, 'colossus', 5, 2);
    const { earned } = play(s, [
      { ninjaId: 'fire', action: { type: 'card', cardId: 'fire-t1', at: { x: 4, y: 2 } } },
      { ninjaId: 'water', action: { type: 'card', cardId: 'water-t1', at: { x: 4, y: 2 } } },
    ]);
    expect(earned).toEqual({ fire: ['combo2'], water: ['combo2'], snow: [] });
  });

  it('R-55: un combo triple da los dos logros de combo a los tres', () => {
    const s = blank();
    place(s, 'fire', 3, 1, { hand: [card('fire', 10)] });
    place(s, 'water', 3, 3, { hand: [card('water', 9)] });
    place(s, 'snow', 2, 2, { hand: [card('snow', 9)] });
    addEnemy(s, 'colossus', 5, 2);
    const at = { x: 4, y: 2 };
    const { earned } = play(
      s,
      ELEMENTS.map((id) => ({ ninjaId: id, action: { type: 'card' as const, cardId: `${id}-t1`, at } })),
    );
    for (const id of ELEMENTS) expect(earned[id]).toEqual(['combo2', 'combo3']);
  });

  it('R-55: una carta sola no es un combo', () => {
    const s = blank();
    place(s, 'fire', 3, 1, { hand: [card('fire', 10)] });
    addEnemy(s, 'colossus', 5, 2);
    const { earned } = play(s, [{ ninjaId: 'fire', action: { type: 'card', cardId: 'fire-t1', at: { x: 4, y: 2 } } }]);
    expect(earned.fire).toEqual([]);
  });

  it('R-55: "Barrido perfecto" es de quien jugó la carta que alcanzó a 3 gólems', () => {
    const s = blank();
    place(s, 'water', 3, 2, { hand: [card('water', 9)] });
    addEnemy(s, 'sniper', 5, 1);
    addEnemy(s, 'sniper', 5, 2);
    addEnemy(s, 'sniper', 5, 3);
    const { earned } = play(s, [
      { ninjaId: 'water', action: { type: 'card', cardId: 'water-t1', at: { x: 5, y: 2 } } },
    ]);
    expect(earned).toEqual({ fire: [], water: ['perfectSweep'], snow: [] });
  });

  it('R-55: con dos gólems en el área no hay "Barrido perfecto", aunque otro golpe sume un tercero', () => {
    const s = blank();
    place(s, 'water', 3, 2, { hand: [card('water', 9)] });
    place(s, 'fire', 3, 0);
    const far = addEnemy(s, 'sniper', 5, 0);
    addEnemy(s, 'sniper', 5, 2);
    addEnemy(s, 'sniper', 5, 3);
    const { earned, events } = play(s, [
      { ninjaId: 'fire', action: { type: 'attack', targetId: far.id } },
      { ninjaId: 'water', action: { type: 'card', cardId: 'water-t1', at: { x: 5, y: 2 } } },
    ]);
    // La carta alcanzó a dos gólems, y el ataque de Brasa, a un tercero.
    expect(events.filter((e) => e.t === 'damage' && e.cause === 'card')).toHaveLength(2);
    expect(events.filter((e) => e.t === 'damage' && e.cause === 'attack')).toHaveLength(1);
    expect(earned.water).toEqual([]);
    expect(earned.fire).toEqual([]);
  });

  it('R-55: "Reanimador" es de quien revive, con su acción o con su carta de Nieve', () => {
    const basic = blank();
    place(basic, 'fire', 1, 1, { hp: 0, everKo: true });
    place(basic, 'water', 1, 2);
    expect(play(basic, [{ ninjaId: 'water', action: { type: 'revive', targetId: 'fire' } }]).earned).toEqual({
      fire: [],
      water: ['reviver'],
      snow: [],
    });

    const withCard = blank();
    place(withCard, 'fire', 2, 3, { hp: 0, everKo: true });
    place(withCard, 'snow', 1, 4, { hand: [card('snow', 9)] });
    const { earned } = play(withCard, [
      { ninjaId: 'snow', action: { type: 'card', cardId: 'snow-t1', at: { x: 2, y: 3 } } },
    ]);
    expect(earned.snow).toEqual(['reviver']);
  });

  it('R-55: una reanimación interrumpida no da el logro', () => {
    const s = blank();
    place(s, 'fire', 1, 1, { hp: 0, everKo: true });
    // Marea, con 1 de vida, cae antes de terminar: el coloso la alcanza.
    place(s, 'water', 1, 2, { hp: 1 });
    addEnemy(s, 'colossus', 2, 2);
    const { earned, events } = play(s, [{ ninjaId: 'water', action: { type: 'revive', targetId: 'fire' } }]);
    expect(events.some((e) => e.t === 'reviveInterrupted')).toBe(true);
    expect(earned.water).toEqual([]);
  });

  it('R-55: "Mano sanadora" llega con la curación número 15 de la partida, y una sola vez', () => {
    const s = blank();
    place(s, 'water', 1, 3, { hp: 10 });
    const heal: Plan[] = [{ ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } }];
    expect(play(s, heal, { snow: HEALER_GOAL - 2 }).earned.snow).toEqual([]);
    expect(play(s, heal, { snow: HEALER_GOAL - 1 }).earned.snow).toEqual(['healer15']);
    expect(play(s, heal, { snow: HEALER_GOAL }).earned.snow).toEqual([]);
    // Es de quien cura, no de a quien curan.
    expect(play(s, heal, { water: HEALER_GOAL - 1 }).earned.water).toEqual([]);
  });

  it('R-55: solo cuentan las curaciones de la acción básica, no las de una carta de Nieve', () => {
    const s = blank();
    place(s, 'water', 1, 3, { hp: 10 });
    place(s, 'fire', 1, 4, { hp: 10 });
    ninja(s, 'snow').hand = [card('snow', 9)];
    const basic = resolveTurn(s, [{ ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } }]);
    expect(basicHealsBy(basic.events, 'snow')).toBe(1);
    expect(basicHealsBy(basic.events, 'water')).toBe(0);
    const withCard = resolveTurn(s, [
      { ninjaId: 'snow', action: { type: 'card', cardId: 'snow-t1', at: { x: 1, y: 4 } } },
    ]);
    expect(withCard.events.filter((e) => e.t === 'heal')).toHaveLength(2);
    expect(basicHealsBy(withCard.events, 'snow')).toBe(0);
  });

  /** La última ronda, con un gólem a punto de caer junto a Brasa. */
  const lastBlow = (bonus: MatchState['bonusCondition']) => {
    const s = blank({ bonus });
    s.round = 3;
    place(s, 'fire', 3, 2);
    const last = addEnemy(s, 'sniper', 5, 2, { hp: 1 });
    return { s, plans: [{ ninjaId: 'fire' as const, action: { type: 'attack' as const, targetId: last.id } }] };
  };

  it('R-55: "De pie otra vez" es de quien cayó y terminó de pie una partida ganada', () => {
    const { s, plans } = lastBlow('noKo');
    ninja(s, 'water').everKo = true;
    place(s, 'snow', 0, 4, { hp: 0, everKo: true });
    const { state, earned } = play(s, plans);
    expect(state.status).toBe('victory');
    // Marea cayó y la levantaron; Escarcha sigue en el suelo; Brasa nunca cayó.
    expect(earned).toEqual({ fire: [], water: ['upAgain'], snow: [] });
  });

  it('R-55: "Nadie se queda atrás" es de todo el equipo cuando ganan tras caer los tres', () => {
    const { s, plans } = lastBlow('noKo');
    for (const id of ELEMENTS) ninja(s, id).everKo = true;
    s.stats.fallenNinjas = [...ELEMENTS];
    const { earned } = play(s, plans);
    for (const id of ELEMENTS) expect(earned[id]).toEqual(['upAgain', 'noOneLeft']);
  });

  it('R-55: los logros que piden ganar no se dan mientras la partida sigue, ni al perderla', () => {
    const playing = blank();
    for (const id of ELEMENTS) ninja(playing, id).everKo = true;
    playing.stats.fallenNinjas = [...ELEMENTS];
    addEnemy(playing, 'colossus', 8, 2);
    expect(play(playing, []).earned).toEqual({ fire: [], water: [], snow: [] });

    const lost = blank();
    place(lost, 'fire', 4, 2, { hp: 1, everKo: true });
    place(lost, 'water', 0, 2, { hp: 0, everKo: true });
    place(lost, 'snow', 0, 4, { hp: 0, everKo: true });
    lost.stats.fallenNinjas = [...ELEMENTS];
    addEnemy(lost, 'colossus', 5, 2);
    const { state, earned } = play(lost, []);
    expect(state.status).toBe('defeat');
    expect(earned).toEqual({ fire: [], water: [], snow: [] });
  });

  it('R-55: "Sin un rasguño" es de todo el equipo al entrar al bonus por vida completa', () => {
    const { s, plans } = lastBlow('fullHealth');
    const { state, earned } = play(s, plans);
    expect(state.round).toBe('bonus');
    for (const id of ELEMENTS) expect(earned[id]).toEqual(['untouched']);
    // En los turnos del bonus ya no se vuelve a dar.
    expect(play(state, []).earned).toEqual({ fire: [], water: [], snow: [] });
  });

  it('R-55: entrar al bonus por otra condición no da "Sin un rasguño"', () => {
    const { s, plans } = lastBlow('noKo');
    const { state, earned } = play(s, plans);
    expect(state.round).toBe('bonus');
    expect(earned).toEqual({ fire: [], water: [], snow: [] });
  });

  it('R-55: "Bonus conquistado" es de todo el equipo al ganar la ronda bonus', () => {
    const s = blank();
    s.round = 'bonus';
    s.stats.bonusEntered = true;
    place(s, 'fire', 3, 2);
    const last = addEnemy(s, 'sniper', 5, 2, { hp: 1 });
    const { state, earned } = play(s, [{ ninjaId: 'fire', action: { type: 'attack', targetId: last.id } }]);
    expect(state).toMatchObject({ status: 'victory', bonusOutcome: 'won' });
    for (const id of ELEMENTS) expect(earned[id]).toEqual(['bonusWon']);
  });

  it('R-55: sumados turno a turno, los logros del equipo son los mismos que da la partida entera', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const difficulty = seed % 2 === 0 ? 'storm' : 'classic';
      let { state } = createMatch({ seed: seed * 104_729, difficulty });
      const rng = rngFrom(seed);
      const earned = new Set<AchievementId>();
      const heals: Record<ElementKind, number> = { fire: 0, water: 0, snow: 0 };
      for (let turn = 0; turn < 90 && state.status === 'playing'; turn++) {
        const result = resolveTurn(state, planTeam(state, { skill: 0.7, rng }));
        const record = { before: state, after: result.state, events: result.events };
        for (const id of ELEMENTS) {
          for (const a of personalAchievements(record, id, heals[id])) earned.add(a);
          heals[id] += basicHealsBy(result.events, id);
        }
        state = result.state;
      }
      expect(state.status, `semilla ${seed}`).not.toBe('playing');
      // Las curaciones contadas por ninja son las que contó el motor.
      expect(heals.fire + heals.water + heals.snow, `semilla ${seed}`).toBe(state.stats.basicHeals);
      expect([...earned].sort(), `semilla ${seed}`).toEqual(earnedAchievements(state).sort());
    }
  });
});
