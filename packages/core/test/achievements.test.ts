import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_FOLD_IDS,
  ACHIEVEMENT_FOLDS,
  ACHIEVEMENT_IDS,
  type AchievementCounts,
  achievementGoal,
  advance,
  BALANCE,
  countFeats,
  createMatch,
  ELEMENTS,
  type ElementKind,
  foldOf,
  type MatchState,
  type Plan,
  planTeam,
  resolveTurn,
  rngFrom,
} from '../src';
import { addEnemy, blank, ninja, place } from './helpers';

/*
 * Logros por persona (R-55 del PRD de v2): lo que cada turno suma al avance de quien lleva a cada ninja.
 * Los de un pliegue de ninja solo los suma quien juega con él; los de equipo, los tres.
 */

const card = (id: ElementKind, value: number, n = 1) => ({ id: `${id}-t${n}`, element: id, value });
const cardAt = (id: ElementKind, x: number, y: number): Plan => ({
  ninjaId: id,
  action: { type: 'card', cardId: `${id}-t1`, at: { x, y } },
});

/** Resuelve un turno y dice cuánto suma a los logros de quien lleva a cada ninja. */
function play(state: MatchState, plans: Plan[]) {
  const result = resolveTurn(state, plans);
  const turn = { after: result.state, events: result.events };
  const feats = Object.fromEntries(ELEMENTS.map((el) => [el, countFeats(turn, el)])) as Record<
    ElementKind,
    AchievementCounts
  >;
  return { ...result, feats };
}

const NOTHING = { fire: {}, water: {}, snow: {} };

describe('Logros por persona (R-55)', () => {
  it('R-55: los 12 logros se reparten en cuatro pliegues de tres, sin repetir ninguno', () => {
    const all = Object.values(ACHIEVEMENT_FOLDS).flat();
    expect(all).toHaveLength(12);
    expect([...all].sort()).toEqual([...ACHIEVEMENT_IDS].sort());
    expect(Object.keys(ACHIEVEMENT_FOLDS)).toEqual([...ACHIEVEMENT_FOLD_IDS]);
    expect(ACHIEVEMENT_FOLDS.fire).toEqual(['perfectSweep', 'stunner', 'blaze']);
    expect(ACHIEVEMENT_FOLDS.water).toEqual(['breakwater', 'highTide', 'upAgain']);
    expect(ACHIEVEMENT_FOLDS.snow).toEqual(['reviver', 'healer', 'snowShield']);
    expect(ACHIEVEMENT_FOLDS.team).toEqual(['combo3', 'untouched', 'noOneLeft']);
    expect(foldOf('blaze')).toBe('fire');
    expect(foldOf('upAgain')).toBe('water');
    expect(foldOf('healer')).toBe('snow');
    expect(foldOf('untouched')).toBe('team');
  });

  it('R-55: cada logro tiene su meta, un entero de 1 o más, y no sobra ninguna', () => {
    expect(Object.keys(BALANCE.achievements.goals).sort()).toEqual([...ACHIEVEMENT_IDS].sort());
    for (const id of ACHIEVEMENT_IDS) {
      expect(Number.isInteger(achievementGoal(id)), id).toBe(true);
      expect(achievementGoal(id), id).toBeGreaterThanOrEqual(1);
    }
  });

  it('D-98: "Barrido perfecto" ya no se llama como la dificultad Tormenta', () => {
    expect(ACHIEVEMENT_IDS).toContain('perfectSweep');
    expect(ACHIEVEMENT_IDS).not.toContain('perfectStorm');
  });

  /* ---------- Pliegue de Fuego: solo con Brasa ---------- */

  it('R-55: "Barrido perfecto" cuenta la carta de Brasa que alcanza a 3 gólems, y "Aturdidor", a los que aturde', () => {
    const s = blank();
    place(s, 'fire', 3, 2, { hand: [card('fire', 10)] });
    addEnemy(s, 'colossus', 5, 1);
    addEnemy(s, 'colossus', 5, 2);
    addEnemy(s, 'colossus', 5, 3);
    const { feats } = play(s, [cardAt('fire', 5, 2)]);
    expect(feats).toEqual({ fire: { perfectSweep: 1, stunner: 3 }, water: {}, snow: {} });
  });

  it('R-55: una carta que alcanza a 4 gólems cuenta una sola vez, y un gólem que cae no queda aturdido', () => {
    const s = blank();
    place(s, 'fire', 3, 2, { hand: [card('fire', 10)] });
    addEnemy(s, 'colossus', 5, 1);
    addEnemy(s, 'colossus', 5, 2);
    addEnemy(s, 'colossus', 5, 3);
    addEnemy(s, 'sniper', 6, 2, { hp: 4 });
    const { feats, state } = play(s, [cardAt('fire', 5, 2)]);
    expect(state.enemies).toHaveLength(3);
    expect(feats.fire).toEqual({ perfectSweep: 1, stunner: 3 });
  });

  it('R-55: con dos gólems en el área de Brasa no hay "Barrido perfecto", aunque la carta de Marea alcance a un tercero', () => {
    const s = blank();
    place(s, 'fire', 3, 0, { hand: [card('fire', 10)] });
    place(s, 'water', 3, 4, { hand: [card('water', 9)] });
    addEnemy(s, 'colossus', 5, 0);
    addEnemy(s, 'colossus', 5, 1);
    addEnemy(s, 'colossus', 5, 4);
    const { feats, events } = play(s, [cardAt('fire', 5, 0), cardAt('water', 5, 4)]);
    expect(events.filter((e) => e.t === 'damage' && e.cause === 'card')).toHaveLength(3);
    expect(feats.fire.perfectSweep).toBeUndefined();
    expect(feats.fire.stunner).toBe(2);
  });

  it('R-55: para "Barrido perfecto" solo cuentan los gólems que alcanza la carta, no los demás golpes del turno', () => {
    const s = blank();
    place(s, 'fire', 3, 2, { hand: [card('fire', 10)] });
    place(s, 'water', 6, 4);
    addEnemy(s, 'colossus', 5, 1);
    addEnemy(s, 'colossus', 5, 2);
    // Fuera del área de la carta: sigue en pie, y le pega a Marea.
    addEnemy(s, 'sniper', 8, 4);
    const { feats, events } = play(s, [cardAt('fire', 5, 2)]);
    expect(events.flatMap((e) => (e.t === 'damage' ? [e.cause] : []))).toEqual(['card', 'card', 'enemy']);
    expect(feats.fire).toEqual({ stunner: 2 });
  });

  it('R-55: la carta de Marea que alcanza a 3 gólems no es un "Barrido perfecto" para nadie', () => {
    const s = blank();
    place(s, 'water', 3, 2, { hand: [card('water', 9)] });
    addEnemy(s, 'colossus', 5, 1);
    addEnemy(s, 'colossus', 5, 2);
    addEnemy(s, 'colossus', 5, 3);
    const { feats, events } = play(s, [cardAt('water', 5, 2)]);
    expect(events.filter((e) => e.t === 'damage' && e.cause === 'card')).toHaveLength(3);
    expect(feats).toEqual(NOTHING);
  });

  it('R-55: "Llamarada" cuenta los gólems que quema la carta de Brasa en combo, y solo para Brasa', () => {
    const s = blank();
    place(s, 'fire', 4, 1, { hand: [card('fire', 10)] });
    place(s, 'water', 4, 3, { hand: [card('water', 9)] });
    addEnemy(s, 'colossus', 5, 1);
    addEnemy(s, 'colossus', 5, 2, { burnTicks: 2 });
    addEnemy(s, 'colossus', 6, 2);
    const { feats } = play(s, [cardAt('fire', 5, 2), cardAt('water', 5, 2)]);
    // Aturde a los tres, y quema a los dos que no ardían ya.
    expect(feats.fire).toEqual({ perfectSweep: 1, stunner: 3, blaze: 2 });
    // Marea le da Potencia a Brasa y a Escarcha.
    expect(feats.water).toEqual({ highTide: 2 });
    expect(feats.snow).toEqual({});
  });

  it('R-55: sin combo, la carta de Brasa no quema: no hay "Llamarada"', () => {
    const s = blank();
    place(s, 'fire', 3, 2, { hand: [card('fire', 10)] });
    addEnemy(s, 'colossus', 5, 2);
    expect(play(s, [cardAt('fire', 5, 2)]).feats.fire).toEqual({ stunner: 1 });
  });

  /* ---------- Pliegue de Agua: solo con Marea ---------- */

  it('R-55: "Rompeolas" cuenta los gólems que derriba Marea, con su ataque o con su carta', () => {
    const attack = blank();
    place(attack, 'water', 4, 2);
    const weak = addEnemy(attack, 'sniper', 5, 2, { hp: 10 });
    expect(play(attack, [{ ninjaId: 'water', action: { type: 'attack', targetId: weak.id } }]).feats).toEqual({
      fire: {},
      water: { breakwater: 1 },
      snow: {},
    });

    const withCard = blank();
    place(withCard, 'water', 3, 2, { hand: [card('water', 9)] });
    addEnemy(withCard, 'sniper', 5, 1, { hp: 18 });
    addEnemy(withCard, 'sniper', 5, 2, { hp: 18 });
    addEnemy(withCard, 'colossus', 5, 3);
    const { feats, state } = play(withCard, [cardAt('water', 5, 2)]);
    expect(state.enemies).toHaveLength(1);
    expect(feats.water).toEqual({ breakwater: 2 });
  });

  it('R-55: un gólem que Marea hirió y remató otro no cuenta en "Rompeolas", ni el que derriba Brasa', () => {
    const s = blank();
    place(s, 'fire', 3, 2);
    place(s, 'water', 4, 3);
    place(s, 'snow', 3, 3);
    // Marea le quita 10 y Escarcha, que actúa después (R-11), lo remata.
    const shared = addEnemy(s, 'sniper', 5, 3, { hp: 14 });
    const other = addEnemy(s, 'sniper', 5, 2, { hp: 8 });
    const far = addEnemy(s, 'colossus', 8, 0);
    const { feats, state } = play(s, [
      { ninjaId: 'fire', action: { type: 'attack', targetId: other.id } },
      { ninjaId: 'water', action: { type: 'attack', targetId: shared.id } },
      { ninjaId: 'snow', action: { type: 'attack', targetId: shared.id } },
    ]);
    expect(state.enemies.map((e) => e.id)).toEqual([far.id]);
    expect(feats).toEqual(NOTHING);
  });

  it('R-55: un gólem que cae por la quemadura no cuenta en "Rompeolas", aunque Marea lo haya herido', () => {
    const s = blank();
    place(s, 'water', 4, 2);
    const burning = addEnemy(s, 'sniper', 5, 2, { hp: 10 + BALANCE.burn.damage, burnTicks: 1 });
    const far = addEnemy(s, 'colossus', 8, 0);
    const { feats, state, events } = play(s, [{ ninjaId: 'water', action: { type: 'attack', targetId: burning.id } }]);
    expect(state.enemies.map((e) => e.id)).toEqual([far.id]);
    const hits = events.flatMap((e) => (e.t === 'damage' && e.targetId === burning.id ? [e.cause] : []));
    expect(hits).toEqual(['attack', 'burn']);
    expect(feats.water).toEqual({});
  });

  it('R-55: "Marea alta" cuenta a los compañeros que reciben Potencia por su combo, no a ella ni a quien ya la tenía', () => {
    const s = blank();
    place(s, 'fire', 4, 1, { hand: [card('fire', 10)], boost: true });
    place(s, 'water', 4, 3, { hand: [card('water', 9)] });
    addEnemy(s, 'colossus', 5, 2);
    const { feats, state } = play(s, [cardAt('fire', 5, 2), cardAt('water', 5, 2)]);
    expect(state.ninjas.map((n) => n.boost)).toEqual([true, true, true]);
    // Brasa ya tenía Potencia: solo cuenta Escarcha.
    expect(feats.water).toEqual({ highTide: 1 });
  });

  it('R-55: sin combo, la carta de Marea no da Potencia: no hay "Marea alta"', () => {
    const s = blank();
    place(s, 'water', 3, 2, { hand: [card('water', 9)] });
    addEnemy(s, 'colossus', 5, 2);
    expect(play(s, [cardAt('water', 5, 2)]).feats).toEqual(NOTHING);
  });

  /** La última ronda, con un gólem a punto de caer junto a Brasa. */
  const lastBlow = (bonus: MatchState['bonusCondition']) => {
    const s = blank({ bonus });
    s.round = 3;
    place(s, 'fire', 3, 2);
    const last = addEnemy(s, 'sniper', 5, 2, { hp: 1 });
    return { s, plans: [{ ninjaId: 'fire' as const, action: { type: 'attack' as const, targetId: last.id } }] };
  };

  it('R-55: "De pie otra vez" cuenta la victoria de Marea después de haber caído, y solo si es Marea', () => {
    const { s, plans } = lastBlow('noKo');
    ninja(s, 'water').everKo = true;
    ninja(s, 'fire').everKo = true;
    const { state, feats } = play(s, plans);
    expect(state.status).toBe('victory');
    // Brasa también cayó y ganó de pie, pero el logro es del pliegue de Agua.
    expect(feats).toEqual({ fire: {}, water: { upAgain: 1 }, snow: {} });
  });

  it('R-55: si Marea sigue caída al ganar, o si nunca cayó, no hay "De pie otra vez"', () => {
    const down = lastBlow('noKo');
    place(down.s, 'water', 0, 2, { hp: 0, everKo: true });
    expect(play(down.s, down.plans).state.status).toBe('victory');
    expect(play(down.s, down.plans).feats.water.upAgain).toBeUndefined();

    const never = lastBlow('turnLimit');
    never.s.turn = BALANCE.difficulty.classic.bonusTurnLimit + 5;
    expect(play(never.s, never.plans).state.status).toBe('victory');
    expect(play(never.s, never.plans).feats.water.upAgain).toBeUndefined();
  });

  /* ---------- Pliegue de Nieve: solo con Escarcha ---------- */

  it('R-55: "Reanimador" cuenta a los que revive Escarcha, con su acción o con su carta', () => {
    const basic = blank();
    place(basic, 'fire', 1, 3, { hp: 0, everKo: true });
    place(basic, 'snow', 1, 4);
    expect(play(basic, [{ ninjaId: 'snow', action: { type: 'revive', targetId: 'fire' } }]).feats).toEqual({
      fire: {},
      water: {},
      snow: { reviver: 1 },
    });

    const withCard = blank();
    place(withCard, 'fire', 2, 3, { hp: 0, everKo: true });
    place(withCard, 'water', 2, 2, { hp: 0, everKo: true });
    place(withCard, 'snow', 1, 4, { hand: [card('snow', 9)] });
    expect(play(withCard, [cardAt('snow', 2, 3)]).feats.snow).toEqual({ reviver: 2 });
  });

  it('R-55: lo que revive otro ninja no cuenta en "Reanimador", ni una reanimación interrumpida', () => {
    const other = blank();
    place(other, 'fire', 1, 1, { hp: 0, everKo: true });
    place(other, 'water', 1, 2);
    const done = play(other, [{ ninjaId: 'water', action: { type: 'revive', targetId: 'fire' } }]);
    expect(done.events.some((e) => e.t === 'revive')).toBe(true);
    expect(done.feats).toEqual(NOTHING);

    const cut = blank();
    place(cut, 'fire', 1, 3, { hp: 0, everKo: true });
    // Escarcha, con 1 de vida, cae antes de terminar: el coloso la alcanza.
    place(cut, 'snow', 1, 4, { hp: 1 });
    addEnemy(cut, 'colossus', 2, 4);
    const { feats, events } = play(cut, [{ ninjaId: 'snow', action: { type: 'revive', targetId: 'fire' } }]);
    expect(events.some((e) => e.t === 'reviveInterrupted')).toBe(true);
    expect(feats.snow).toEqual({});
  });

  it('R-55: "Mano sanadora" cuenta cada cura de Escarcha a un compañero, con su acción o con su carta', () => {
    const basic = blank();
    place(basic, 'water', 1, 3, { hp: 10 });
    expect(play(basic, [{ ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } }]).feats).toEqual({
      fire: {},
      water: {},
      snow: { healer: 1 },
    });

    const withCard = blank();
    place(withCard, 'water', 1, 3, { hp: 10 });
    place(withCard, 'fire', 2, 3, { hp: 10 });
    // Su carta también la cura a ella, y eso no cuenta: el logro es por curar a compañeros.
    place(withCard, 'snow', 1, 4, { hp: 10, hand: [card('snow', 9)] });
    const { feats, events } = play(withCard, [cardAt('snow', 1, 3)]);
    expect(events.filter((e) => e.t === 'heal')).toHaveLength(3);
    expect(feats.snow).toEqual({ healer: 2 });
  });

  it('R-55: lo que cuenta es quién cura: una cura que no viene de Escarcha no suma a "Mano sanadora"', () => {
    const s = blank();
    place(s, 'water', 1, 3, { hp: 10 });
    const { state, events } = resolveTurn(s, [{ ninjaId: 'snow', action: { type: 'heal', targetId: 'water' } }]);
    const turn = (sourceId: ElementKind | null) => ({
      after: state,
      events: events.map((e) => (e.t === 'heal' ? { ...e, sourceId } : e)),
    });
    expect(countFeats(turn('snow'), 'snow')).toEqual({ healer: 1 });
    expect(countFeats(turn('fire'), 'snow')).toEqual({});
    expect(countFeats(turn(null), 'snow')).toEqual({});
  });

  it('R-55: "Escudo de nieve" cuenta cada golpe que anula el Escudo, sea de quien sea', () => {
    const s = blank();
    place(s, 'fire', 3, 1, { shield: true });
    place(s, 'snow', 3, 3, { shield: true });
    addEnemy(s, 'colossus', 4, 1);
    addEnemy(s, 'colossus', 4, 3);
    const { feats, events, state } = play(s, []);
    expect(events.filter((e) => e.t === 'damage' && e.blocked)).toHaveLength(2);
    expect(state.ninjas.map((n) => n.hp)).toEqual(s.ninjas.map((n) => n.hp));
    expect(feats).toEqual({ fire: {}, water: {}, snow: { snowShield: 2 } });
  });

  it('R-55: un golpe que no anula el Escudo no cuenta en "Escudo de nieve"', () => {
    const s = blank();
    place(s, 'fire', 3, 1);
    addEnemy(s, 'colossus', 4, 1);
    const { feats, events } = play(s, []);
    expect(events.some((e) => e.t === 'damage' && !e.blocked)).toBe(true);
    expect(feats).toEqual(NOTHING);
  });

  /* ---------- Pliegue de Equipo: con cualquier ninja ---------- */

  it('R-55: "Combo triple" cuenta el turno en que los tres juegan carta, para los tres', () => {
    const s = blank();
    place(s, 'fire', 3, 1, { hand: [card('fire', 10)] });
    place(s, 'water', 3, 3, { hand: [card('water', 9)] });
    place(s, 'snow', 2, 2, { hand: [card('snow', 9)] });
    addEnemy(s, 'colossus', 5, 2);
    const { feats } = play(s, [cardAt('fire', 4, 2), cardAt('water', 4, 2), cardAt('snow', 4, 2)]);
    for (const id of ELEMENTS) expect(feats[id].combo3).toBe(1);
  });

  it('R-55: un combo de dos cartas no es un "Combo triple"', () => {
    const s = blank();
    place(s, 'fire', 3, 1, { hand: [card('fire', 10)] });
    place(s, 'snow', 2, 2, { hand: [card('snow', 9)] });
    addEnemy(s, 'colossus', 5, 2);
    const { feats, events } = play(s, [cardAt('fire', 4, 2), cardAt('snow', 4, 2)]);
    expect(events.some((e) => e.t === 'combo')).toBe(true);
    for (const id of ELEMENTS) expect(feats[id].combo3).toBeUndefined();
  });

  it('R-55: "Sin un rasguño" cuenta la ronda bonus a la que el equipo llega con los tres a vida completa', () => {
    for (const bonus of ['fullHealth', 'noKo', 'turnLimit'] as const) {
      const { s, plans } = lastBlow(bonus);
      const { state, feats } = play(s, plans);
      expect(state.round, bonus).toBe('bonus');
      for (const id of ELEMENTS) expect(feats[id], bonus).toEqual({ untouched: 1 });
      // En los turnos del bonus ya no se vuelve a contar.
      expect(play(state, []).feats, bonus).toEqual(NOTHING);
    }
  });

  it('R-55: llegar al bonus con alguien herido no cuenta en "Sin un rasguño"', () => {
    const { s, plans } = lastBlow('noKo');
    ninja(s, 'snow').hp -= 1;
    const { state, feats } = play(s, plans);
    expect(state.round).toBe('bonus');
    expect(feats).toEqual(NOTHING);
  });

  it('R-55: a vida completa pero sin llegar al bonus, no hay "Sin un rasguño"', () => {
    const { s, plans } = lastBlow('turnLimit');
    s.turn = BALANCE.difficulty.classic.bonusTurnLimit + 5;
    const { state, feats } = play(s, plans);
    expect(state).toMatchObject({ status: 'victory', bonusOutcome: 'missed' });
    expect(feats).toEqual(NOTHING);
  });

  it('R-55: "Nadie se queda atrás" cuenta la victoria en que los tres cayeron y volvieron, para los tres', () => {
    const { s, plans } = lastBlow('noKo');
    for (const id of ELEMENTS) ninja(s, id).everKo = true;
    const { state, feats } = play(s, plans);
    expect(state.status).toBe('victory');
    expect(feats).toEqual({ fire: { noOneLeft: 1 }, water: { upAgain: 1, noOneLeft: 1 }, snow: { noOneLeft: 1 } });
  });

  it('R-55: si uno de los tres nunca cayó, o sigue caído al ganar, no hay "Nadie se queda atrás"', () => {
    const never = lastBlow('noKo');
    ninja(never.s, 'water').everKo = true;
    ninja(never.s, 'snow').everKo = true;
    for (const id of ELEMENTS) expect(play(never.s, never.plans).feats[id].noOneLeft).toBeUndefined();

    const down = lastBlow('noKo');
    for (const id of ELEMENTS) ninja(down.s, id).everKo = true;
    place(down.s, 'snow', 0, 4, { hp: 0 });
    expect(play(down.s, down.plans).state.status).toBe('victory');
    for (const id of ELEMENTS) expect(play(down.s, down.plans).feats[id].noOneLeft).toBeUndefined();
  });

  it('R-55: los logros que piden ganar no se cuentan mientras la partida sigue, ni al perderla', () => {
    const playing = blank();
    for (const id of ELEMENTS) ninja(playing, id).everKo = true;
    addEnemy(playing, 'colossus', 8, 2);
    expect(play(playing, []).feats).toEqual(NOTHING);

    const lost = blank();
    place(lost, 'fire', 4, 2, { hp: 1, everKo: true });
    place(lost, 'water', 0, 2, { hp: 0, everKo: true });
    place(lost, 'snow', 0, 4, { hp: 0, everKo: true });
    addEnemy(lost, 'colossus', 5, 2);
    const { state, feats } = play(lost, []);
    expect(state.status).toBe('defeat');
    expect(feats).toEqual(NOTHING);
  });

  it('R-55: perder la ronda bonus con los tres caídos es una victoria, pero nadie volvió', () => {
    const s = blank();
    s.round = 'bonus';
    s.stats.bonusEntered = true;
    place(s, 'fire', 4, 2, { hp: 1, everKo: true });
    place(s, 'water', 0, 2, { hp: 0, everKo: true });
    place(s, 'snow', 0, 4, { hp: 0, everKo: true });
    addEnemy(s, 'colossus', 5, 2);
    const { state, feats } = play(s, []);
    expect(state).toMatchObject({ status: 'victory', bonusOutcome: 'lost' });
    expect(feats).toEqual(NOTHING);
  });

  it('R-55: el avance de un logro se acumula hasta su meta, y ahí queda completo', () => {
    const goal = achievementGoal('stunner');
    expect(goal).toBeGreaterThan(3);
    expect(advance('stunner', { count: 0, done: false }, 3)).toEqual({ count: 3, done: false, gained: 3 });
    expect(advance('stunner', { count: 3, done: false }, 2)).toEqual({ count: 5, done: false, gained: 2 });
    // Al llegar justo a la meta queda completo; si el turno trae de más, suma solo lo que faltaba.
    expect(advance('stunner', { count: goal - 1, done: false }, 1)).toEqual({ count: goal, done: true, gained: 1 });
    expect(advance('stunner', { count: goal - 2, done: false }, 9)).toEqual({ count: goal, done: true, gained: 2 });
    expect(advance('stunner', { count: goal - 1, done: false }, 0)).toEqual({
      count: goal - 1,
      done: false,
      gained: 0,
    });
  });

  it('R-55: un logro completo ya no cambia, y lo que no es una cantidad entera de 1 o más no suma', () => {
    const goal = achievementGoal('healer');
    expect(advance('healer', { count: goal, done: true }, 5)).toEqual({ count: goal, done: true, gained: 0 });
    // Completo desde antes de que su meta subiera: sigue completo, con lo que tenía.
    expect(advance('healer', { count: 2, done: true }, 5)).toEqual({ count: 2, done: true, gained: 0 });
    expect(advance('healer', { count: 4, done: false }, -3)).toEqual({ count: 4, done: false, gained: 0 });
    expect(advance('healer', { count: 4, done: false }, 2.9)).toEqual({ count: 6, done: false, gained: 2 });
    // Un contador que ya pasaba de la meta sin estar completo se completa en la meta, sin sumar de más.
    expect(advance('healer', { count: goal + 7, done: false }, 1)).toEqual({ count: goal, done: true, gained: 0 });
  });

  it('R-55: sumado turno a turno, lo que cuenta cada persona coincide con lo que contó el motor', () => {
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const difficulty = seed % 2 === 0 ? 'storm' : 'classic';
      let { state } = createMatch({ seed: seed * 104_729, difficulty });
      const rng = rngFrom(seed);
      const total: Record<ElementKind, AchievementCounts> = { fire: {}, water: {}, snow: {} };
      let blocked = 0;
      for (let turn = 0; turn < 90 && state.status === 'playing'; turn++) {
        const result = resolveTurn(state, planTeam(state, { skill: 0.7, rng }));
        const record = { after: result.state, events: result.events };
        const feats = ELEMENTS.map((id) => countFeats(record, id));
        for (const [i, id] of ELEMENTS.entries()) {
          for (const [key, n] of Object.entries(feats[i] ?? {})) {
            const k = key as keyof AchievementCounts;
            // Los de un pliegue de ninja solo los suma quien lleva a ese ninja.
            expect([id, 'team'], `semilla ${seed}`).toContain(foldOf(k));
            expect(n, `semilla ${seed}`).toBeGreaterThan(0);
            total[id][k] = (total[id][k] ?? 0) + n;
            seen += 1;
          }
          // Los de equipo valen igual para los tres.
          for (const k of ACHIEVEMENT_FOLDS.team) expect(feats[i]?.[k], `semilla ${seed}`).toBe(feats[0]?.[k]);
        }
        blocked += result.events.filter((e) => e.t === 'damage' && e.blocked).length;
        state = result.state;
      }
      expect(state.status, `semilla ${seed}`).not.toBe('playing');
      expect(total.snow.combo3 ?? 0, `semilla ${seed}`).toBe(state.stats.tripleCombos);
      expect(total.snow.snowShield ?? 0, `semilla ${seed}`).toBe(blocked);
      expect(total.water.breakwater ?? 0, `semilla ${seed}`).toBeLessThanOrEqual(state.stats.enemiesDefeated);
      expect(total.snow.reviver ?? 0, `semilla ${seed}`).toBeLessThanOrEqual(state.stats.revives);
      expect(total.snow.healer ?? 0, `semilla ${seed}`).toBeGreaterThanOrEqual(state.stats.basicHeals);
    }
    // Las partidas del bot dejan hazañas de sobra: la prueba no pasa en vacío.
    expect(seen).toBeGreaterThan(500);
  });
});
