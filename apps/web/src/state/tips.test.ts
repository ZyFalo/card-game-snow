import { createMatch, type ElementKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './persist';
import { bubbleSlot, momentTip, TIP_IDS, type TipId } from './tips';

/*
 * D-80: cuatro consejos en el momento, cada uno una sola vez, en una burbuja que va siempre junto a la
 * mano. Qué consejo sale, cuándo, de qué ninja habla y qué se marca con el borde dorado.
 */

type Tips = Parameters<typeof momentTip>[0];

/** La partida al empezar: nadie alcanza a un gólem y nadie tiene cartas. */
const match = (): MatchState => createMatch({ seed: 1 }).state;

const ninja = (m: MatchState, id: ElementKind) => {
  const n = m.ninjas.find((x) => x.id === id);
  if (!n) throw new Error(id);
  return n;
};

const card = (id: ElementKind, value = 9) => ({ id: `${id}-1`, element: id, value });

/** Ese ninja da un paso al frente: desde ahí no alcanza a nadie, así que ya no le queda nada por decidir. */
const step = (m: MatchState, id: ElementKind = 'fire'): Plan => {
  const at = ninja(m, id).pos;
  return { ninjaId: id, moveTo: { x: at.x + 1, y: at.y } };
};

const planning = (patch: Partial<Tips> = {}, learned: TipId[] = []): Tips => ({
  phase: 'planning',
  settings: { ...DEFAULT_SETTINGS, learnedTips: learned },
  match: match(),
  plans: {},
  active: 'fire',
  pendingCard: null,
  ...patch,
});

const SWITCH = 'Brasa ya tiene su plan. Elige otro ninja con un clic o con Tab.';
const FIRST_CARD =
  'Tu primera carta. Elígela con un clic (o la tecla 1) y colócala en una casilla roja. El ▶ junto al título muestra qué hace.';
const COMBO = 'Dos ninjas tienen carta. Si las juegan en el mismo turno, donde sea, hay combo.';

describe('Consejos en el momento (D-80)', () => {
  it('D-80: al empezar el turno, sin nada que enseñar, no hay burbuja', () => {
    expect(momentTip(planning())).toBeNull();
  });

  it('D-80: cambiar de ninja, la primera vez que un ninja completa su plan y a otro le falta el suyo', () => {
    const m = match();
    expect(momentTip(planning({ match: m, plans: { fire: step(m) } }))).toEqual({
      id: 'switchNinja',
      text: SWITCH,
      ninja: 'fire',
      mark: 'panel',
    });
    // Habla del ninja activo, que es el que ya terminó: lo nombra y marca su panel.
    const water = momentTip(planning({ match: m, plans: { water: step(m, 'water') }, active: 'water' }));
    expect(water).toMatchObject({
      text: 'Marea ya tiene su plan. Elige otro ninja con un clic o con Tab.',
      ninja: 'water',
      mark: 'panel',
    });
    // Si el activo todavía tiene algo por decidir, no sale: aunque otro ya haya terminado.
    expect(momentTip(planning({ match: m, plans: { water: step(m, 'water') } }))).toBeNull();
  });

  it('D-80: cambiar de ninja no sale si a nadie más le falta su plan, ni con una carta en la mano', () => {
    const m = match();
    const all = { fire: step(m), water: step(m, 'water'), snow: step(m, 'snow') };
    // Los tres terminaron: no hay otro ninja que elegir, toca confirmar.
    expect(momentTip(planning({ match: m, plans: all }))).toBeNull();
    // Con la carta otra vez en la mano, quien juega está colocándola: el plan de Brasa no está cerrado.
    const withCard = match();
    ninja(withCard, 'fire').hand = [card('fire')];
    const at = ninja(withCard, 'fire').pos;
    const placed: Plan = { ...step(withCard), action: { type: 'card', cardId: 'fire-1', at } };
    const done = planning({ match: withCard, plans: { fire: placed } }, ['firstCard']);
    expect(momentTip(done)?.id).toBe('switchNinja');
    expect(momentTip({ ...done, pendingCard: 'fire-1' })).toBeNull();
  });

  it('D-80: primera carta, cuando el ninja activo tiene una carta en la mano', () => {
    const m = match();
    ninja(m, 'water').hand = [card('water')];
    // La mano que se ve es la del ninja activo: con Brasa activo todavía no hay carta que señalar.
    expect(momentTip(planning({ match: m }))).toBeNull();
    // Marca su primera carta, la de la tecla 1.
    expect(momentTip(planning({ match: m, active: 'water' }))).toEqual({
      id: 'firstCard',
      text: FIRST_CARD,
      ninja: 'water',
      mark: 'card',
    });
  });

  it('D-80: combo posible, la primera vez que el ninja activo y otro en pie tienen carta', () => {
    const m = match();
    ninja(m, 'fire').hand = [card('fire')];
    // Con una sola mano con cartas no hay combo que anunciar.
    expect(momentTip(planning({ match: m }, ['firstCard']))).toBeNull();
    ninja(m, 'snow').hand = [card('snow', 12)];
    // Marca las cartas de la mano que se ve: cualquiera sirve para el combo.
    expect(momentTip(planning({ match: m }, ['firstCard']))).toEqual({
      id: 'combo',
      text: COMBO,
      ninja: 'fire',
      mark: 'hand',
    });
    // Habla de la mano que se ve: con un ninja activo sin cartas, espera a que se active uno que las tenga.
    expect(momentTip(planning({ match: m, active: 'water' }, ['firstCard']))).toBeNull();
    // Un caído no juega su carta (R-09).
    ninja(m, 'snow').hp = 0;
    expect(momentTip(planning({ match: m }, ['firstCard', 'firstFall']))).toBeNull();
  });

  it('D-80: primera caída, nombra al caído y al ninja activo, que es quien puede ir a revivirlo', () => {
    const m = match();
    ninja(m, 'fire').hp = 0;
    expect(momentTip(planning({ match: m, active: 'water' }))).toEqual({
      id: 'firstFall',
      text: 'Brasa cayó. Mueve a Marea junto a él para revivirlo. Se levanta al final del turno: protege a quien lo revive.',
      // Señala a Marea, que es a quien hay que mover: su panel lleva el borde dorado.
      ninja: 'water',
      mark: 'panel',
    });
    // Con dos caídos, nombra al primero en el orden de los paneles.
    ninja(m, 'water').hp = 0;
    expect(momentTip(planning({ match: m, active: 'snow' }))?.text).toBe(
      'Brasa cayó. Mueve a Escarcha junto a él para revivirlo. Se levanta al final del turno: protege a quien lo revive.',
    );
  });

  it('D-80: sale uno a la vez, en este orden: la caída, la primera carta, el combo y cambiar de ninja', () => {
    expect(TIP_IDS).toEqual(['firstFall', 'firstCard', 'combo', 'switchNinja']);
    // Marea cayó; Brasa y Escarcha tienen carta, y Brasa ya completó su plan.
    const m = match();
    ninja(m, 'water').hp = 0;
    ninja(m, 'fire').hand = [card('fire')];
    ninja(m, 'snow').hand = [card('snow', 12)];
    const fire: Plan = { ...step(m), action: { type: 'card', cardId: 'fire-1', at: ninja(m, 'fire').pos } };
    const seen = (learned: TipId[]) => momentTip(planning({ match: m, plans: { fire } }, learned))?.id ?? null;
    expect(seen([])).toBe('firstFall');
    expect(seen(['firstFall'])).toBe('firstCard');
    expect(seen(['firstFall', 'firstCard'])).toBe('combo');
    expect(seen(['firstFall', 'firstCard', 'combo'])).toBe('switchNinja');
    expect(seen(['firstFall', 'firstCard', 'combo', 'switchNinja'])).toBeNull();
  });

  it('D-80: un consejo aprendido no vuelve a salir', () => {
    const m = match();
    expect(momentTip(planning({ match: m, plans: { fire: step(m) } }, ['switchNinja']))).toBeNull();
  });

  it('D-80: con "Consejos en pantalla" apagado no sale ninguno', () => {
    const m = match();
    const off = planning({ match: m, plans: { fire: step(m) } });
    expect(momentTip({ ...off, settings: { ...off.settings, tips: false } })).toBeNull();
  });

  it('D-80: solo salen al planificar, con un ninja activo en pie', () => {
    const m = match();
    const plans = { fire: step(m) };
    for (const phase of ['idle', 'intro', 'resolving', 'ended'] satisfies Tips['phase'][]) {
      expect(momentTip(planning({ match: m, plans, phase }))).toBeNull();
    }
    expect(momentTip(planning({ match: m, plans, active: null }))).toBeNull();
    expect(momentTip(planning({ match: null, plans }))).toBeNull();
  });
});

describe('Dónde va la burbuja (D-80): siempre junto a la mano, nunca sobre el tablero', () => {
  it('va en el espacio libre junto a la mano mientras lo haya: con la mano vacía, o con una o dos cartas', () => {
    expect(bubbleSlot(0)).toBe('hand');
    expect(bubbleSlot(1)).toBe('hand');
    expect(bubbleSlot(2)).toBe('hand');
  });

  it('con tres o cuatro cartas ya no queda espacio libre a su lado: sube encima de la mano', () => {
    expect(bubbleSlot(3)).toBe('above-hand');
    expect(bubbleSlot(4)).toBe('above-hand');
  });
});
