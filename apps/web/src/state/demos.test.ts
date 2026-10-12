import { ELEMENTS, type ElementKind, type GameEvent, isRock } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { HELP } from '../i18n/es';
import { cardDemo, type Demo } from './demos';

/*
 * D-81: las demostraciones de las cartas. Cada una la juega el propio motor sobre un tablero preparado:
 * el estado de antes, los planes, los eventos que resolvió el motor y el estado de después.
 */

const inView = (d: Demo, at: { x: number; y: number }) =>
  at.x >= d.view.x && at.x < d.view.x + d.view.w && at.y >= d.view.y && at.y < d.view.y + d.view.h;
const cards = (d: Demo) => d.events.filter((e): e is Extract<GameEvent, { t: 'card' }> => e.t === 'card');
const damages = (d: Demo) => d.events.filter((e): e is Extract<GameEvent, { t: 'damage' }> => e.t === 'damage');
const labels = (d: Demo) => Object.fromEntries(d.labels.map((l) => [`${l.at.x},${l.at.y}`, l.text]));
const ninja = (d: Demo, id: ElementKind, when: 'before' | 'after' = 'after') => {
  const n = d[when].ninjas.find((x) => x.id === id);
  if (!n) throw new Error(id);
  return n;
};

describe('Demostración de una carta (D-81)', () => {
  it('D-81: la de Fuego la juega el motor: daña y aturde a los dos gólems del área', () => {
    const d = cardDemo('fire', 9, false);
    // Una sola carta, la de Brasa, en el centro del área; el motor la resolvió sobre dos gólems.
    expect(cards(d).map((c) => [c.ninjaId, c.card.value, c.at, c.combo])).toEqual([['fire', 9, { x: 4, y: 2 }, false]]);
    expect(damages(d).map((e) => [e.targetId, e.amount, e.cause])).toEqual([
      ['e1', 9, 'card'],
      ['e2', 9, 'card'],
    ]);
    // Después: los dos perdieron 9 de vida y quedaron aturdidos.
    expect(d.before.enemies.map((e) => [e.id, e.hp, e.stunned])).toEqual([
      ['e1', 30, false],
      ['e2', 60, false],
    ]);
    expect(d.after.enemies.map((e) => [e.id, e.hp, e.stunned])).toEqual([
      ['e1', 21, true],
      ['e2', 51, true],
    ]);
    expect(labels(d)).toEqual({ '5,1': '−9 · aturdido', '5,3': '−9 · aturdido' });
    expect(d.numbers).toBe(true);
  });

  it('D-81: usa el valor de la carta que se le pide', () => {
    const d = cardDemo('fire', 12, false);
    expect(cards(d)[0]?.card.value).toBe(12);
    expect(labels(d)).toEqual({ '5,1': '−12 · aturdido', '5,3': '−12 · aturdido' });
    // La de Agua hace el doble de su valor.
    expect(labels(cardDemo('water', 12, false))).toEqual({ '5,1': '−24', '5,3': '−24' });
  });

  it('D-81: con combo, otro ninja juega su carta en el mismo turno, y Fuego además quema', () => {
    const d = cardDemo('fire', 9, true);
    expect(d.events.find((e) => e.t === 'combo')).toEqual({ t: 'combo', elements: ['fire', 'water'] });
    // La otra carta cae en otra casilla del tablero en miniatura, donde no alcanza a ningún gólem.
    expect(cards(d).map((c) => [c.ninjaId, c.at, c.combo])).toEqual([
      ['fire', { x: 4, y: 2 }, true],
      ['water', { x: 3, y: 3 }, true],
    ]);
    expect(damages(d).map((e) => [e.targetId, e.amount])).toEqual([
      ['e1', 9],
      ['e2', 9],
    ]);
    expect(d.after.enemies.every((e) => e.stunned && e.burnTicks > 0)).toBe(true);
    expect(labels(d)).toEqual({ '5,1': '−9 · aturdido · quema', '5,3': '−9 · aturdido · quema' });
    // Sin combo no hay segunda carta ni quemadura.
    const alone = cardDemo('fire', 9, false);
    expect(alone.events.some((e) => e.t === 'combo')).toBe(false);
    expect(alone.after.enemies.every((e) => e.burnTicks === 0)).toBe(true);
  });

  it('D-81: la de Agua hace el doble a los gólems y, con combo, da Potencia al equipo', () => {
    expect(labels(cardDemo('water', 9, false))).toEqual({ '5,1': '−18', '5,3': '−18' });
    const d = cardDemo('water', 9, true);
    expect(d.events.find((e) => e.t === 'combo')).toEqual({ t: 'combo', elements: ['fire', 'water'] });
    expect(ELEMENTS.map((id) => ninja(d, id).boost)).toEqual([true, true, true]);
    // Las etiquetas hablan de la carta de Agua: los gólems, y los ninjas que se ven con su Potencia.
    expect(labels(d)).toEqual({ '5,1': '−18', '5,3': '−18', '2,2': 'Potencia', '4,3': 'Potencia' });
  });

  it('D-81: la de Nieve daña a los gólems, cura al herido y revive al caído; con combo, da Escudo', () => {
    const d = cardDemo('snow', 9, false);
    // Antes: Brasa está herido y Marea, caída, los dos dentro del área.
    expect(ninja(d, 'fire', 'before').hp).toBe(ninja(d, 'fire', 'before').maxHp - 15);
    expect(ninja(d, 'water', 'before').hp).toBe(0);
    expect(ninja(d, 'fire').hp).toBe(ninja(d, 'fire', 'before').hp + 9);
    expect(ninja(d, 'water').hp).toBe(9);
    expect(labels(d)).toEqual({ '5,1': '−9', '5,3': '−9', '4,3': '+9', '3,1': 'revive · +9' });

    const combo = cardDemo('snow', 9, true);
    expect(combo.events.find((e) => e.t === 'combo')).toEqual({ t: 'combo', elements: ['fire', 'snow'] });
    expect(ELEMENTS.map((id) => ninja(combo, id).shield)).toEqual([true, true, true]);
    expect(labels(combo)).toEqual({
      '5,1': '−9',
      '5,3': '−9',
      '4,3': '+9 · Escudo',
      '3,1': 'revive · +9 · Escudo',
      '2,3': 'Escudo',
    });
  });

  it('D-81: con la mano vacía muestra el efecto sin números', () => {
    const d = cardDemo('fire', null, false);
    expect(d.numbers).toBe(false);
    expect(labels(d)).toEqual({ '5,1': 'aturdido', '5,3': 'aturdido' });
    expect(labels(cardDemo('water', null, false))).toEqual({});
    expect(labels(cardDemo('snow', null, true))).toEqual({
      '4,3': 'Escudo',
      '3,1': 'revive · Escudo',
      '2,3': 'Escudo',
    });
    // El motor la juega igual: los gólems reciben el golpe.
    expect(damages(d)).toHaveLength(2);
  });

  it('D-81: enseña solo lo que hace la carta: se corta antes de que respondan los gólems', () => {
    for (const el of ELEMENTS) {
      for (const combo of [false, true]) {
        const d = cardDemo(el, 9, combo);
        const kinds = new Set(d.events.map((e) => e.t));
        for (const t of ['enemyAttack', 'enemySkip', 'roundEnd', 'roundStart', 'matchEnd', 'ko', 'draw'] as const) {
          expect(kinds.has(t), `${el} ${combo ? 'con' : 'sin'} combo: ${t}`).toBe(false);
        }
        // Los estados solo se encienden: lo que se lee al final es lo que la carta dejó.
        for (const e of d.events) if (e.t === 'status') expect(e.on, `${el}: ${e.status}`).toBe(true);
        // Ningún gólem se movió, y la partida de la demostración sigue en juego.
        expect(d.after.enemies.map((e) => e.pos)).toEqual(d.before.enemies.map((e) => e.pos));
        expect(d.after.status).toBe('playing');
      }
    }
  });

  it('D-81: todo lo que enseña cabe en su tablero en miniatura, de 4×3 casillas y sin rocas', () => {
    for (const el of ELEMENTS) {
      const d = cardDemo(el, 9, true);
      expect(d.view).toEqual({ x: 2, y: 1, w: 4, h: 3 });
      for (const c of cards(d)) {
        expect(inView(d, c.at)).toBe(true);
        // Quien juega cada carta también se ve.
        expect(inView(d, ninja(d, c.ninjaId, 'before').pos)).toBe(true);
      }
      for (const e of d.before.enemies) expect(inView(d, e.pos)).toBe(true);
      for (const l of d.labels) expect(inView(d, l.at)).toBe(true);
      for (let x = d.view.x; x < d.view.x + d.view.w; x++) {
        for (let y = d.view.y; y < d.view.y + d.view.h; y++) expect(isRock(d.before, { x, y })).toBe(false);
      }
    }
  });

  it('D-81: lo que se lee sobre una unidad va encima de su casilla, y ahí arriba no hay nadie', () => {
    for (const el of ELEMENTS) {
      for (const combo of [false, true]) {
        const d = cardDemo(el, 9, combo);
        const units = [...d.after.ninjas, ...d.after.enemies].map((u) => `${u.pos.x},${u.pos.y}`);
        for (const l of d.labels) {
          expect(units, `${el}: sobre (${l.at.x},${l.at.y})`).not.toContain(`${l.at.x},${l.at.y - 1}`);
        }
      }
    }
  });

  it('D-81: es siempre la misma: no depende de la partida en curso ni del azar', () => {
    expect(cardDemo('snow', 10, true)).toEqual(cardDemo('snow', 10, true));
    // Los planes son los que resolvió el motor: una carta por ninja que juega.
    expect(cardDemo('fire', 9, true).plans.map((p) => [p.ninjaId, p.action?.type])).toEqual([
      ['fire', 'card'],
      ['water', 'card'],
    ]);
    expect(cardDemo('fire', 9, false).plans.map((p) => p.ninjaId)).toEqual(['fire']);
  });

  it('D-81: la ayuda dice dónde está el ▶ y qué muestra', () => {
    expect(HELP.cards).toContain('El ▶ junto a «Cartas de…» muestra qué hace la carta, sin combo y con combo.');
  });
});
