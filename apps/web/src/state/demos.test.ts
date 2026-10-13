import {
  BALANCE,
  ELEMENTS,
  type ElementKind,
  ENEMY_KINDS,
  type GameEvent,
  isRock,
  manhattan,
  neighbors8,
  sniperDamage,
  sweepTiles,
} from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { DEMO_TEXT, ENEMY_TEXT, HELP } from '../i18n/es';
import { cardDemo, type Demo, demoLayers, golemCaption, golemDemo } from './demos';

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

/*
 * D-82: las demostraciones de los gólems. Cada una enseña ataques elegidos, que el motor resuelve con sus
 * mismas funciones, y siempre deja a un ninja fuera del área, para enseñar dónde se está a salvo.
 */
describe('Demostración de un gólem (D-82)', () => {
  const attacks = (d: Demo) =>
    d.events
      .filter((e): e is Extract<GameEvent, { t: 'enemyAttack' }> => e.t === 'enemyAttack')
      .map((e) => [e.sourceId, e.targetId]);
  const marks = (d: Demo) => d.marks.map((t) => `${t.x},${t.y}`).sort();
  const golem = (d: Demo, id: string) => {
    const e = d.before.enemies.find((x) => x.id === id);
    if (!e) throw new Error(id);
    return e;
  };

  it('D-82: Carámbano, un disparo de lejos y otro de cerca, y un ninja fuera de su alcance', () => {
    const d = golemDemo('sniper');
    // Dos Carámbanos: uno le dispara a Brasa desde tres casillas y otro a Marea, que lo tiene al lado.
    expect(d.before.enemies.map((e) => e.kind)).toEqual(['sniper', 'sniper']);
    expect(attacks(d)).toEqual([
      ['e1', 'fire'],
      ['e2', 'water'],
    ]);
    expect(damages(d).map((e) => [e.targetId, e.amount, e.cause])).toEqual([
      ['fire', 5, 'enemy'],
      ['water', 3, 'enemy'],
    ]);
    // Los números son los del motor: lo que da `sniperDamage` a esas distancias.
    const [far, near] = [golem(d, 'e1'), golem(d, 'e2')];
    expect(manhattan(far.pos, ninja(d, 'fire').pos)).toBe(3);
    expect(manhattan(near.pos, ninja(d, 'water').pos)).toBe(1);
    expect(damages(d).map((e) => e.amount)).toEqual([
      sniperDamage(far, far.pos, ninja(d, 'fire').pos),
      sniperDamage(near, near.pos, ninja(d, 'water').pos),
    ]);
    // Escarcha está fuera del alcance de los dos, y lo dice.
    for (const e of d.before.enemies) {
      expect(manhattan(e.pos, ninja(d, 'snow').pos)).toBeGreaterThan(BALANCE.enemies.sniper.range);
    }
    expect(labels(d)).toEqual({ '3,1': '−5', '5,2': '−3', '2,2': 'a salvo' });
    // Se marca lo que golpea cada disparo: solo la casilla de su objetivo.
    expect(marks(d)).toEqual(['3,1', '5,2']);
    expect(d.view).toEqual({ x: 2, y: 1, w: 5, h: 2 });
  });

  it('D-82: Granizo, el objetivo, un vecino salpicado y un ninja a salvo', () => {
    const d = golemDemo('artillery');
    expect(attacks(d)).toEqual([['e1', 'fire']]);
    const { attack, splash, range } = BALANCE.enemies.artillery;
    expect(damages(d).map((e) => [e.targetId, e.amount, e.cause])).toEqual([
      ['fire', attack, 'enemy'],
      ['water', splash, 'splash'],
    ]);
    // Lanza desde lejos: al máximo de su alcance.
    expect(manhattan(golem(d, 'e1').pos, ninja(d, 'fire').pos)).toBe(range);
    expect(labels(d)).toEqual({ '3,2': '−8', '2,1': '−4', '5,1': 'a salvo' });
    // El área es la del motor: el objetivo y sus 8 vecinas. Marea está en una, en diagonal; Escarcha, fuera.
    const target = ninja(d, 'fire').pos;
    const area = [target, ...neighbors8(target)].map((t) => `${t.x},${t.y}`).sort();
    expect(marks(d)).toEqual(area);
    expect(area).toContain('2,1');
    expect(area).not.toContain('5,1');
    expect(d.view).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });

  it('D-82: Témpano, el objetivo y el barrido a su costado, hombro con hombro', () => {
    const d = golemDemo('colossus');
    expect(attacks(d)).toEqual([['e1', 'water']]);
    const { attack, sweep } = BALANCE.enemies.colossus;
    expect(damages(d).map((e) => [e.targetId, e.amount, e.cause])).toEqual([
      ['water', attack, 'enemy'],
      ['fire', sweep, 'sweep'],
    ]);
    expect(labels(d)).toEqual({ '4,2': '−10', '3,2': '−10', '5,1': 'a salvo' });
    // Barre las dos casillas a los costados de su objetivo, según `sweepTiles`: en una está Brasa.
    const e = golem(d, 'e1');
    const target = ninja(d, 'water').pos;
    expect(marks(d)).toEqual([target, ...sweepTiles(e.pos, target)].map((t) => `${t.x},${t.y}`).sort());
    expect(marks(d)).toEqual(['3,2', '4,2', '5,2']);
    expect(d.view).toEqual({ x: 3, y: 1, w: 3, h: 3 });
  });

  it('D-82: enseña solo el ataque: nadie planea ni se mueve, nadie cae, y siempre queda un ninja a salvo', () => {
    for (const kind of ENEMY_KINDS) {
      const d = golemDemo(kind);
      expect(d.plans).toEqual([]);
      expect(d.numbers).toBe(true);
      expect([...new Set(d.events.map((e) => e.t))].sort()).toEqual(['damage', 'enemyAttack']);
      expect(d.after.enemies.map((e) => e.pos)).toEqual(d.before.enemies.map((e) => e.pos));
      expect(d.after.ninjas.map((n) => n.pos)).toEqual(d.before.ninjas.map((n) => n.pos));
      expect(d.after.ninjas.every((n) => n.hp > 0)).toBe(true);
      // Los tres ninjas se ven, y exactamente uno queda a salvo, fuera de todo lo que se golpea.
      for (const n of d.before.ninjas) expect(inView(d, n.pos), `${kind}: ${n.id}`).toBe(true);
      const safe = d.labels.filter((l) => l.text === 'a salvo');
      expect(safe).toHaveLength(1);
      expect(d.marks.map((t) => `${t.x},${t.y}`)).not.toContain(`${safe[0]?.at.x},${safe[0]?.at.y}`);
    }
  });

  it('D-82: cabe en su tablero en miniatura, sin rocas, y nada de lo que se lee tapa a una unidad', () => {
    for (const kind of ENEMY_KINDS) {
      const d = golemDemo(kind);
      const units = [...d.after.ninjas, ...d.after.enemies];
      for (const u of units) expect(inView(d, u.pos), `${kind}: ${u.id}`).toBe(true);
      for (const t of d.marks) expect(inView(d, t)).toBe(true);
      for (let x = d.view.x; x < d.view.x + d.view.w; x++) {
        for (let y = d.view.y; y < d.view.y + d.view.h; y++) expect(isRock(d.before, { x, y })).toBe(false);
      }
      const at = units.map((u) => `${u.pos.x},${u.pos.y}`);
      for (const l of d.labels)
        expect(at, `${kind}: sobre (${l.at.x},${l.at.y})`).not.toContain(`${l.at.x},${l.at.y - 1}`);
      expect(golemDemo(kind)).toEqual(d);
    }
  });

  it('D-82: la línea de cada gólem lleva los números del motor, no escritos a mano', () => {
    expect(golemCaption('sniper')).toBe(
      'Dispara a un solo ninja a hasta 3 casillas. Cuanto más lejos, más duele: 3 de cerca, 4 a dos casillas y 5 a tres.',
    );
    expect(golemCaption('artillery')).toBe(
      'Lanza a hasta 2 casillas: 8 al objetivo y 4 a cualquier ninja en las 8 casillas que lo rodean, también en diagonal.',
    );
    expect(golemCaption('colossus')).toBe(
      'Golpea a quien tenga al lado y barre las dos casillas a los costados de su objetivo: 10 a cada una. No se pongan hombro con hombro frente a él.',
    );
    // Salen del balance y de las funciones del motor: si el balance cambia, la línea cambia con él.
    const { sniper, artillery, colossus } = BALANCE.enemies;
    expect(golemCaption('sniper')).toContain(`hasta ${sniper.range} casillas`);
    expect(golemCaption('sniper')).toContain(`${sniper.attack} de cerca`);
    expect(golemCaption('sniper')).toContain(`${sniper.maxAttack} a tres`);
    expect(golemCaption('artillery')).toContain(`${artillery.attack} al objetivo y ${artillery.splash} a cualquier`);
    expect(golemCaption('colossus')).toContain(`${colossus.sweep} a cada una`);
  });

  it('D-82: las demostraciones de las cartas no marcan casillas: su área ya se ve al planear', () => {
    expect(cardDemo('fire', 9, true).marks).toEqual([]);
  });

  it('D-82: la ayuda dice cómo ver el ataque de un gólem, y conserva sus números', () => {
    expect(HELP.golemsDemo).toBe(
      'Pasa el ratón sobre un gólem: «Ver cómo ataca» muestra su ataque y dónde se está a salvo.',
    );
    expect(HELP.golemsDemo).toContain(DEMO_TEXT.showAttack);
    expect(ENEMY_TEXT.sniper.tip).toMatch(/\d/);
    expect(ENEMY_TEXT.artillery.tip).toMatch(/\d/);
  });

  it('D-82: las casillas que golpea un gólem se ven teñidas todo el bucle, antes y después del ataque', () => {
    for (const kind of ENEMY_KINDS) {
      const d = golemDemo(kind);
      for (const planned of [true, false]) {
        const layers = demoLayers(d, planned);
        expect(layers?.threat, `${kind}, ${planned}`).toEqual(d.marks.map((at) => ({ at, tint: true })));
        // Nadie planea nada: no hay cartas colocadas, ni casillas de un ninja activo, ni vida por perder.
        expect(layers?.cards).toEqual([]);
        expect(layers?.active).toBeNull();
        expect(layers?.losses).toEqual([]);
      }
    }
  });

  it('D-81: la de una carta enseña lo planeado antes de jugar, y nada mientras se juega', () => {
    const d = cardDemo('fire', 9, true);
    const before = demoLayers(d, true);
    expect(before?.cards.flatMap((g) => g.cards.map((c) => c.ninja)).sort()).toEqual(['fire', 'water']);
    expect(before?.threat).toEqual([]);
    expect(demoLayers(d, false)).toBeNull();
  });
});
