import { createMatch, type ElementKind, type Enemy, type EnemyKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { boardLayers } from './board';
import type { AppState } from './store';

/*
 * Lineamientos de diseño, sección "Tablero": qué muestra el tablero mientras se planifica, y cuándo. El
 * ninja activo ve a la vez sus casillas y sus objetivos, y los planes del equipo quedan en silueta y marca.
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

  describe('Planificar: casillas y objetivos a la vez; la carta es un modo aparte', () => {
    it('al activar un ninja se ven sus casillas, con la suya entre ellas', () => {
      const l = layers({ active: 'water' });
      expect(l.mode).toBe('plan');
      expect(l.active).toEqual({ ninja: 'water', at: { x: 1, y: 2 } });
      // Marea da dos pasos y no puede terminar sobre un compañero.
      const keys = l.moves.map((t) => `${t.x},${t.y}`).sort();
      expect(keys).toEqual(['0,1', '0,2', '0,3', '1,0', '1,4', '2,1', '2,2', '2,3', '3,2'].sort());
      expect(l.stay).toEqual({ x: 1, y: 2 });
      // Todavía no eligió casilla: van con toda su intensidad.
      expect(l.moved).toBe(false);
      expect(l.card).toBeNull();
    });

    it('y, a la vez, los objetivos que alcanza desde donde está', () => {
      // Desde la columna 1 nadie alcanza a un gólem.
      expect(layers({ active: 'fire' }).options).toEqual([]);
      // Con Brasa en (3,1), sin moverse alcanza a Carámbano y a Témpano. A Granizo no.
      const m = match();
      ninja(m, 'fire').pos = { x: 3, y: 1 };
      const l = layers({ match: m, active: 'fire' });
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 5, y: 1 } },
        { kind: 'attack', at: { x: 4, y: 2 } },
      ]);
      expect(l.moved).toBe(false);
      expect(l.moves.length).toBeGreaterThan(0);
    });

    it('al moverse, los objetivos se cuentan desde la casilla planeada, y sus casillas siguen ahí, más tenues', () => {
      // Escarcha, desde (1,3), no alcanza a nadie; desde (4,3) alcanza a los tres gólems. Nadie está herido.
      expect(layers({ active: 'snow' }).options).toEqual([]);
      const l = layers({ plans: { snow: { ninjaId: 'snow', moveTo: { x: 4, y: 3 } } }, active: 'snow' });
      expect(l.mode).toBe('plan');
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 5, y: 1 } },
        { kind: 'attack', at: { x: 4, y: 2 } },
        { kind: 'attack', at: { x: 5, y: 3 } },
      ]);
      // Las casillas no se apagan: son las mismas de antes de moverse, con la del fantasma entre ellas,
      // y su propia casilla.
      const before = layers({ active: 'snow' });
      expect(l.moves).toEqual(before.moves);
      expect(l.moves).toContainEqual({ x: 4, y: 3 });
      expect(l.stay).toEqual({ x: 1, y: 3 });
      expect(l.moved).toBe(true);
      // Solo cuenta el movimiento del ninja activo.
      expect(layers({ plans: { snow: { ninjaId: 'snow', moveTo: { x: 4, y: 3 } } }, active: 'fire' }).moved).toBe(
        false,
      );
    });

    it('el objetivo elegido deja de ser una opción y pasa a ser una marca', () => {
      const l = layers({ plans: PLANS, active: 'snow' });
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 4, y: 2 } },
        { kind: 'attack', at: { x: 5, y: 3 } },
      ]);
      expect(l.marks).toContainEqual({ kind: 'attack', at: { x: 5, y: 1 }, by: ['snow'] });
    });

    it('curar y revivir son objetivos sobre aliados, cada uno con su tipo', () => {
      const m = match();
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 2 } });
      Object.assign(ninja(m, 'water'), { hp: 22, pos: { x: 2, y: 1 } });
      // Escarcha cura a Marea, que está herida y en pie. A Brasa, caída y lejos, ni la cura ni la revive.
      const heal = layers({
        match: m,
        plans: { snow: { ninjaId: 'snow', moveTo: { x: 1, y: 2 } } },
        active: 'snow',
      });
      expect(heal.options.filter((o) => o.kind !== 'attack')).toEqual([{ kind: 'heal', at: { x: 2, y: 1 } }]);
      // Sin moverse también la alcanza: está a 3 casillas.
      expect(layers({ match: m, active: 'snow' }).options).toEqual([{ kind: 'heal', at: { x: 2, y: 1 } }]);
      // Marea, junto a Brasa, puede revivirla.
      const revive = layers({
        match: m,
        plans: { water: { ninjaId: 'water', moveTo: { x: 3, y: 1 } } },
        active: 'water',
      });
      expect(revive.options.filter((o) => o.kind !== 'attack')).toEqual([{ kind: 'revive', at: { x: 3, y: 2 } }]);
      // Si Escarcha ya planeó revivirla, Marea no puede elegirla: un caído solo tiene un reanimador (R-09).
      // Sobre Brasa queda la marca de Escarcha.
      const taken = layers({
        match: m,
        plans: {
          water: { ninjaId: 'water', moveTo: { x: 3, y: 1 } },
          snow: { ninjaId: 'snow', moveTo: { x: 2, y: 3 }, action: { type: 'revive', targetId: 'fire' } },
        },
        active: 'water',
      });
      expect(taken.options.filter((o) => o.kind === 'revive')).toEqual([]);
      expect(taken.marks).toEqual([{ kind: 'revive', at: { x: 3, y: 2 }, by: ['snow'] }]);
    });

    it('con el ratón sobre un caído se ven sus casillas vecinas, desde las que se le revive (R-09)', () => {
      const m = match();
      // Brasa cayó en (3,1): de sus 8 vecinas, (2,0) es una roca y en (4,2) está Témpano.
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 1 } });
      const over = { match: m, active: 'water' as const, hover: { x: 3, y: 1 } };
      const spots = ['2,1', '2,2', '3,0', '3,2', '4,0', '4,1'];
      expect(
        layers(over)
          .reviveSpots.map((t) => `${t.x},${t.y}`)
          .sort(),
      ).toEqual(spots);
      // También después de moverse: desde ahí se puede cambiar de casilla para revivir.
      const moved = { ...over, plans: { water: { ninjaId: 'water', moveTo: { x: 2, y: 3 } } as Plan } };
      expect(
        layers(moved)
          .reviveSpots.map((t) => `${t.x},${t.y}`)
          .sort(),
      ).toEqual(spots);
      // Solo con el ratón sobre el caído, y no con una carta en la mano.
      expect(layers({ ...over, hover: { x: 3, y: 2 } }).reviveSpots).toEqual([]);
      expect(layers({ ...over, hover: { x: 1, y: 3 } }).reviveSpots).toEqual([]);
      ninja(m, 'water').hand = [{ id: 'water-1', element: 'water', value: 10 }];
      expect(layers({ ...over, pendingCard: 'water-1' }).reviveSpots).toEqual([]);
    });

    it('si a ese caído ya lo revive otro ninja, sus casillas no se iluminan (R-09)', () => {
      const m = match();
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 1 } });
      const reviving: Plan = { ninjaId: 'snow', moveTo: { x: 2, y: 2 }, action: { type: 'revive', targetId: 'fire' } };
      const over = { match: m, plans: { snow: reviving }, hover: { x: 3, y: 1 } };
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
        pendingCard: 'snow-1',
        hover: { x: 4, y: 2 },
      });
      expect(l.mode).toBe('card');
      // Las cartas son un modo exclusivo: ni casillas de movimiento ni objetivos.
      expect(l.moves).toEqual([]);
      expect(l.stay).toBeNull();
      expect(l.options).toEqual([]);
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

    it('el alcance de un gólem se ve con el ratón encima, y no con una carta en la mano', () => {
      const over = { x: 4, y: 2 };
      expect(layers({ active: 'fire', hover: over }).threat.length).toBeGreaterThan(0);
      expect(layers({ active: 'fire' }).threat).toEqual([]);
      // Después de moverse también.
      expect(layers({ plans: { fire: PLANS.fire }, active: 'fire', hover: over }).threat.length).toBeGreaterThan(0);
      const m = match();
      ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
      expect(layers({ match: m, active: 'fire', pendingCard: 'fire-1', hover: over }).threat).toEqual([]);
    });
  });

  describe('Los planes del equipo quedan en silueta y marca', () => {
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

    it('cada objetivo elegido lleva una marca con quienes lo eligieron, en orden Fuego, Agua, Nieve', () => {
      // Brasa y Marea van contra Témpano, y Escarcha contra Carámbano.
      const marks = [
        { kind: 'attack', at: { x: 4, y: 2 }, by: ['fire', 'water'] },
        { kind: 'attack', at: { x: 5, y: 1 }, by: ['snow'] },
      ];
      // Se ve siempre: con cualquier ninja activo, con una carta en la mano y sin ningún ninja activo.
      expect(layers({ plans: PLANS, active: 'snow' }).marks).toEqual(marks);
      expect(layers({ plans: PLANS, active: 'fire' }).marks).toEqual(marks);
      expect(layers({ plans: PLANS, active: null }).marks).toEqual(marks);
      const m = match();
      ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
      const { fire: _fire, ...others } = PLANS;
      expect(layers({ match: m, plans: others, active: 'fire', pendingCard: 'fire-1' }).marks).toEqual([
        { kind: 'attack', at: { x: 4, y: 2 }, by: ['water'] },
        { kind: 'attack', at: { x: 5, y: 1 }, by: ['snow'] },
      ]);
    });

    it('un gólem elegido por uno, dos y tres ninjas: la marca suma a cada uno', () => {
      const all: Record<ElementKind, Plan> = {
        ...PLANS,
        // Escarcha, desde (1,3), no alcanza a Témpano: se acerca.
        snow: { ninjaId: 'snow', moveTo: { x: 3, y: 3 }, action: { type: 'attack', targetId: 'e2' } },
      };
      const at = { x: 4, y: 2 };
      expect(layers({ plans: { fire: all.fire }, active: 'water' }).marks).toEqual([
        { kind: 'attack', at, by: ['fire'] },
      ]);
      expect(layers({ plans: { water: all.water, fire: all.fire }, active: 'snow' }).marks).toEqual([
        { kind: 'attack', at, by: ['fire', 'water'] },
      ]);
      expect(layers({ plans: all, active: 'snow' }).marks).toEqual([
        { kind: 'attack', at, by: ['fire', 'water', 'snow'] },
      ]);
    });

    it('curar y revivir elegidos llevan su propia marca, con quien lo eligió', () => {
      const m = match();
      Object.assign(ninja(m, 'fire'), { hp: 0, pos: { x: 3, y: 2 } });
      Object.assign(ninja(m, 'water'), { hp: 22, pos: { x: 2, y: 1 } });
      const plans = {
        water: { ninjaId: 'water', moveTo: { x: 3, y: 1 }, action: { type: 'revive', targetId: 'fire' } },
        snow: { ninjaId: 'snow', moveTo: { x: 1, y: 2 }, action: { type: 'heal', targetId: 'water' } },
      } satisfies Partial<Record<ElementKind, Plan>>;
      expect(layers({ match: m, plans, active: 'snow' }).marks).toEqual([
        { kind: 'revive', at: { x: 3, y: 2 }, by: ['water'] },
        { kind: 'heal', at: { x: 2, y: 1 }, by: ['snow'] },
      ]);
    });

    it('los objetivos posibles son solo del ninja activo', () => {
      // Brasa ya se movió: Témpano, que ya eligió Marea, sigue siendo una opción para ella.
      const { fire: _fire, ...others } = PLANS;
      const l = layers({ plans: { ...others, fire: { ninjaId: 'fire', moveTo: { x: 3, y: 1 } } }, active: 'fire' });
      expect(l.options).toEqual([
        { kind: 'attack', at: { x: 5, y: 1 } },
        { kind: 'attack', at: { x: 4, y: 2 } },
      ]);
      // Los que alcanzan Marea y Escarcha desde sus casillas no se le ofrecen a nadie más: sin ninja activo
      // no hay objetivos posibles, aunque los tres tengan uno elegido.
      expect(layers({ plans: PLANS, active: null }).options).toEqual([]);
      // Con una carta en la mano tampoco: es un modo aparte.
      const m = match();
      ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
      const placing = layers({ match: m, plans: { fire: PLANS.fire }, active: 'fire', pendingCard: 'fire-1' });
      expect(placing.options).toEqual([]);
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
      expect(layers({ match: m, plans, active: 'fire' }).cards[0]?.area).toHaveLength(9);
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
      const l = layers({ plans: PLANS, active: 'snow', hover: { x: 5, y: 3 } });
      expect(l.options).toContainEqual({ kind: 'attack', at: { x: 5, y: 3 } });
      expect(l.aims).toEqual([]);
    });
  });
});
