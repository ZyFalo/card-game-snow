import { createMatch, type ElementKind, type Enemy, type EnemyKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { boardLayers } from './board';
import type { AppState } from './store';

/*
 * Lineamientos de diseño, sección "Tablero": qué muestra el tablero mientras se planifica, y cuándo. Un
 * solo modo a la vez para el ninja activo, y los demás en silueta y punto.
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

/** Brasa y Marea van contra Témpano, y Escarcha contra Carámbano: los tres se mueven antes. */
const PLANS: Record<ElementKind, Plan> = {
  fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 }, action: { type: 'attack', targetId: 'e2' } },
  water: { ninjaId: 'water', moveTo: { x: 3, y: 2 }, action: { type: 'attack', targetId: 'e2' } },
  snow: { ninjaId: 'snow', moveTo: { x: 4, y: 3 }, action: { type: 'attack', targetId: 'e1' } },
};

type Board = Parameters<typeof boardLayers>[0];

const planning = (patch: Partial<Board> = {}): Board => ({
  phase: 'planning',
  screen: 'battle',
  match: match(),
  plans: {},
  active: 'fire',
  step: 'move',
  pendingCard: null,
  hover: null,
  ...patch,
});

/** Las capas de un estado que está en planificación. */
function layers(patch: Partial<Board> = {}) {
  const l = boardLayers(planning(patch));
  if (!l) throw new Error('sin capas');
  return l;
}

describe('Capas del tablero al planificar', () => {
  it('fuera de la planificación el tablero no muestra planes', () => {
    for (const phase of ['idle', 'intro', 'resolving', 'ended'] satisfies AppState['phase'][]) {
      expect(boardLayers(planning({ phase, plans: PLANS }))).toBeNull();
    }
    expect(boardLayers(planning({ screen: 'results', plans: PLANS }))).toBeNull();
    expect(boardLayers(planning({ match: null }))).toBeNull();
  });

  describe('Un solo modo a la vez', () => {
    it('moverse: solo casillas, las del ninja activo y la suya, que es quedarse', () => {
      const l = layers({ active: 'water', step: 'move' });
      expect(l.mode).toBe('move');
      expect(l.active).toEqual({ ninja: 'water', at: { x: 1, y: 2 } });
      // Marea da dos pasos y no puede terminar sobre un compañero.
      const keys = l.moves.map((t) => `${t.x},${t.y}`).sort();
      expect(keys).toEqual(['0,1', '0,2', '0,3', '1,0', '1,4', '2,1', '2,2', '2,3', '3,2'].sort());
      expect(l.stay).toEqual({ x: 1, y: 2 });
      // Ningún anillo: los objetivos son del paso de actuar.
      expect(l.options).toEqual([]);
      expect(l.chosen).toBeNull();
      expect(l.card).toBeNull();
    });

    it('actuar: solo anillos, sobre lo que el ninja activo alcanza desde su casilla planeada', () => {
      // Escarcha, desde (4,3), alcanza a los tres gólems; nadie está herido.
      const l = layers({ plans: { snow: { ninjaId: 'snow', moveTo: { x: 4, y: 3 } } }, active: 'snow', step: 'act' });
      expect(l.mode).toBe('act');
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 5, y: 1 } },
        { kind: 'attack', at: { x: 4, y: 2 } },
        { kind: 'attack', at: { x: 5, y: 3 } },
      ]);
      expect(l.chosen).toBeNull();
      // Ninguna casilla de movimiento.
      expect(l.moves).toEqual([]);
      expect(l.stay).toBeNull();
    });

    it('actuar: el objetivo elegido se aparta de los posibles', () => {
      const l = layers({ plans: PLANS, active: 'snow', step: 'act' });
      expect(l.chosen).toEqual({ kind: 'attack', at: { x: 5, y: 1 } });
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 4, y: 2 } },
        { kind: 'attack', at: { x: 5, y: 3 } },
      ]);
    });

    it('actuar: curar y revivir son objetivos sobre aliados, cada uno con su tipo', () => {
      const m = match();
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 2 } });
      Object.assign(ninja(m, 'water'), { hp: 22, pos: { x: 2, y: 1 } });
      // Escarcha cura a Marea, que está herida y en pie. A Brasa, caída y lejos, ni la cura ni la revive.
      const heal = layers({
        match: m,
        plans: { snow: { ninjaId: 'snow', moveTo: { x: 1, y: 2 } } },
        active: 'snow',
        step: 'act',
      });
      expect(heal.options.filter((o) => o.kind !== 'attack')).toEqual([{ kind: 'heal', at: { x: 2, y: 1 } }]);
      // Marea, junto a Brasa, puede revivirla.
      const revive = layers({
        match: m,
        plans: { water: { ninjaId: 'water', moveTo: { x: 3, y: 1 } } },
        active: 'water',
        step: 'act',
      });
      expect(revive.options.filter((o) => o.kind !== 'attack')).toEqual([{ kind: 'revive', at: { x: 3, y: 2 } }]);
      // Si Escarcha ya planeó revivirla, Marea no puede elegirla: un caído solo tiene un reanimador (R-09).
      // Sobre Brasa queda el punto de Escarcha.
      const taken = layers({
        match: m,
        plans: {
          water: { ninjaId: 'water', moveTo: { x: 3, y: 1 } },
          snow: { ninjaId: 'snow', moveTo: { x: 2, y: 3 }, action: { type: 'revive', targetId: 'fire' } },
        },
        active: 'water',
        step: 'act',
      });
      expect(taken.options.filter((o) => o.kind === 'revive')).toEqual([]);
      expect(taken.dots).toEqual([{ at: { x: 3, y: 2 }, by: ['snow'] }]);
    });

    it('moverse: con el ratón sobre un caído se ven sus casillas vecinas, desde las que se le revive (R-09)', () => {
      const m = match();
      // Brasa cayó en (3,1): de sus 8 vecinas, (2,0) es una roca y en (4,2) está Témpano.
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 1 } });
      const over = { match: m, active: 'water' as const, hover: { x: 3, y: 1 } };
      const spots = layers({ ...over, step: 'move' }).reviveSpots.map((t) => `${t.x},${t.y}`);
      expect(spots.sort()).toEqual(['2,1', '2,2', '3,0', '3,2', '4,0', '4,1']);
      // Solo con el ratón sobre el caído, y solo en el paso de moverse: en los otros modos no hay casillas.
      expect(layers({ ...over, step: 'move', hover: { x: 3, y: 2 } }).reviveSpots).toEqual([]);
      expect(layers({ ...over, step: 'move', hover: { x: 1, y: 3 } }).reviveSpots).toEqual([]);
      expect(layers({ ...over, step: 'act' }).reviveSpots).toEqual([]);
      ninja(m, 'water').hand = [{ id: 'water-1', element: 'water', value: 10 }];
      expect(layers({ ...over, step: 'move', pendingCard: 'water-1' }).reviveSpots).toEqual([]);
    });

    it('moverse: si a ese caído ya lo revive otro ninja, sus casillas no se iluminan (R-09)', () => {
      const m = match();
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 1 } });
      const reviving: Plan = { ninjaId: 'snow', moveTo: { x: 2, y: 2 }, action: { type: 'revive', targetId: 'fire' } };
      const over = { match: m, plans: { snow: reviving }, step: 'move' as const, hover: { x: 3, y: 1 } };
      expect(layers({ ...over, active: 'water' }).reviveSpots).toEqual([]);
      // A quien lo revive sí: puede cambiar de casilla y seguir al lado.
      expect(layers({ ...over, active: 'snow' }).reviveSpots).toHaveLength(6);
    });

    it('carta: solo las casillas donde cabe la carta y, bajo el ratón, su área', () => {
      const m = match();
      ninja(m, 'snow').hand = [{ id: 'snow-1', element: 'snow', value: 10 }];
      const l = layers({
        match: m,
        plans: PLANS,
        active: 'snow',
        step: 'act',
        pendingCard: 'snow-1',
        hover: { x: 4, y: 2 },
      });
      expect(l.mode).toBe('card');
      expect(l.moves).toEqual([]);
      expect(l.options).toEqual([]);
      expect(l.chosen).toBeNull();
      expect(l.aims).toEqual([]);
      expect(l.card?.tiles.length).toBeGreaterThan(0);
      // Bajo el ratón, el área de 3×3 con los gólems que alcanzaría: los tres.
      expect(l.card?.area).toHaveLength(9);
      expect(l.card?.enemies).toEqual([
        { x: 5, y: 1 },
        { x: 4, y: 2 },
        { x: 5, y: 3 },
      ]);
    });

    it('el alcance de un gólem se ve con el ratón encima, y solo en el paso de moverse', () => {
      const over = { x: 4, y: 2 };
      expect(layers({ active: 'fire', step: 'move', hover: over }).threat.length).toBeGreaterThan(0);
      expect(layers({ active: 'fire', step: 'move' }).threat).toEqual([]);
      expect(layers({ active: 'fire', step: 'act', hover: over }).threat).toEqual([]);
    });
  });

  describe('Los demás ninjas quedan en silueta y punto', () => {
    it('cada ninja que planea moverse deja su fantasma en el destino', () => {
      expect(layers({ plans: PLANS, active: 'snow' }).ghosts).toEqual([
        { ninja: 'fire', at: { x: 3, y: 1 } },
        { ninja: 'water', at: { x: 3, y: 2 } },
        { ninja: 'snow', at: { x: 4, y: 3 } },
      ]);
      // Quien ataca sin moverse no tiene fantasma.
      const m = match();
      ninja(m, 'water').pos = { x: 3, y: 2 };
      const still: Plan = { ninjaId: 'water', action: { type: 'attack', targetId: 'e2' } };
      expect(layers({ match: m, plans: { water: still } }).ghosts).toEqual([]);
    });

    it('el camino hasta el fantasma se muestra solo para el ninja activo', () => {
      expect(layers({ plans: PLANS, active: 'snow' }).path).toEqual({
        ninja: 'snow',
        tiles: [
          { x: 1, y: 3 },
          { x: 2, y: 3 },
          { x: 3, y: 3 },
          { x: 4, y: 3 },
        ],
      });
      expect(layers({ plans: PLANS, active: 'fire' }).path?.ninja).toBe('fire');
      // Si el ninja activo no planea moverse, no hay ningún camino en el tablero.
      const { snow: _snow, ...others } = PLANS;
      expect(layers({ plans: others, active: 'snow' }).path).toBeNull();
    });

    it('cada acción planeada deja un punto por ninja sobre su objetivo, en cualquier modo', () => {
      const dots = [
        { at: { x: 4, y: 2 }, by: ['fire', 'water'] },
        { at: { x: 5, y: 1 }, by: ['snow'] },
      ];
      expect(layers({ plans: PLANS, active: 'snow', step: 'move' }).dots).toEqual(dots);
      expect(layers({ plans: PLANS, active: 'snow', step: 'act' }).dots).toEqual(dots);
    });

    it('los objetivos de los demás no llevan anillo: los anillos son del ninja activo', () => {
      // Brasa está en el paso de actuar; Témpano es objetivo de Marea, pero el anillo es por Brasa.
      const { fire: _fire, ...others } = PLANS;
      const l = layers({
        plans: { ...others, fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } } },
        active: 'fire',
        step: 'act',
      });
      expect(l.chosen).toBeNull();
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 5, y: 1 } },
        { kind: 'attack', at: { x: 4, y: 2 } },
      ]);
      // En el paso de moverse no hay ningún anillo, aunque los tres tengan objetivo.
      expect(layers({ plans: PLANS, active: 'fire', step: 'move' }).options).toEqual([]);
      expect(layers({ plans: PLANS, active: 'fire', step: 'move' }).chosen).toBeNull();
    });

    it('la carta de otro ninja queda en su casilla; su área se ve solo con el ratón encima', () => {
      const m = match();
      ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 12 }];
      const plans: AppState['plans'] = {
        fire: { ninjaId: 'fire', action: { type: 'card', cardId: 'fire-1', at: { x: 3, y: 1 } } },
      };
      const other = layers({ match: m, plans, active: 'water' }).cards;
      expect(other).toEqual([{ ninja: 'fire', at: { x: 3, y: 1 }, value: 12, area: [] }]);
      expect(layers({ match: m, plans, active: 'water', hover: { x: 3, y: 1 } }).cards[0]?.area).toHaveLength(9);
      // La del ninja activo sí muestra su área.
      expect(layers({ match: m, plans, active: 'fire', step: 'act' }).cards[0]?.area).toHaveLength(9);
    });

    it('D-32: el número de orden va en la casilla desde la que actúa cada ninja', () => {
      expect(layers({ plans: PLANS, active: 'snow' }).order).toEqual([
        { ninja: 'fire', at: { x: 3, y: 1 }, n: 1 },
        { ninja: 'water', at: { x: 3, y: 2 }, n: 2 },
        { ninja: 'snow', at: { x: 4, y: 3 }, n: 3 },
      ]);
    });
  });

  describe('La línea de mira aparece solo con el ratón', () => {
    it('sin el ratón sobre un plan no hay ninguna línea de mira', () => {
      expect(layers({ plans: PLANS, active: 'snow' }).aims).toEqual([]);
      // Una casilla vacía tampoco pide ninguna.
      expect(layers({ plans: PLANS, active: 'snow', hover: { x: 7, y: 4 } }).aims).toEqual([]);
    });

    it('sobre un objetivo: una por atacante, desde su casilla planeada', () => {
      expect(layers({ plans: PLANS, active: 'fire', hover: { x: 4, y: 2 } }).aims).toEqual([
        { kind: 'attack', by: 'fire', from: { x: 3, y: 1 }, to: { x: 4, y: 2 } },
        { kind: 'attack', by: 'water', from: { x: 3, y: 2 }, to: { x: 4, y: 2 } },
      ]);
    });

    it('también sobre quien actúa o sobre su fantasma', () => {
      const aim = { kind: 'attack', by: 'snow', from: { x: 4, y: 3 }, to: { x: 5, y: 1 } };
      expect(layers({ plans: PLANS, active: 'fire', hover: { x: 1, y: 3 } }).aims).toEqual([aim]);
      expect(layers({ plans: PLANS, active: 'fire', hover: { x: 4, y: 3 } }).aims).toEqual([aim]);
    });

    it('apuntar a un objetivo que nadie ha elegido no dibuja ninguna mira: solo los planes la tienen', () => {
      // Escarcha, desde su casilla planeada, alcanza a Granizo, y el tablero se lo ofrece; pero no es un plan.
      const l = layers({ plans: PLANS, active: 'snow', step: 'act', hover: { x: 5, y: 3 } });
      expect(l.options).toContainEqual({ kind: 'attack', at: { x: 5, y: 3 } });
      expect(l.aims).toEqual([]);
    });
  });
});
