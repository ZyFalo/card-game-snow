import { createMatch, type ElementKind, type Enemy, type EnemyKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { boardLayers } from './board';
import type { AppState } from './store';

/* Lineamientos de diseño, sección "Tablero": qué muestra el tablero mientras se planifica, y cuándo. */

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

  it('cada ninja que planea moverse deja su fantasma en el destino', () => {
    expect(layers({ plans: PLANS, active: 'snow' }).ghosts).toEqual([
      { ninja: 'fire', at: { x: 3, y: 1 } },
      { ninja: 'water', at: { x: 3, y: 2 } },
      { ninja: 'snow', at: { x: 4, y: 3 } },
    ]);
    // Quien ataca sin moverse no tiene fantasma.
    const still: Plan = { ninjaId: 'water', action: { type: 'attack', targetId: 'e2' } };
    expect(layers({ plans: { water: still }, match: nextTo() }).ghosts).toEqual([]);
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

  it('un ataque planeado se marca sobre su objetivo, con un punto por atacante', () => {
    expect(layers({ plans: PLANS, active: 'snow' }).marks).toEqual([
      { kind: 'attack', at: { x: 4, y: 2 }, by: ['fire', 'water'] },
      { kind: 'attack', at: { x: 5, y: 1 }, by: ['snow'] },
    ]);
  });

  it('curar y revivir se marcan sobre el aliado, con el punto de quien actúa', () => {
    const m = match();
    const [fire, water, snow] = m.ninjas as [MatchState['ninjas'][0], MatchState['ninjas'][0], MatchState['ninjas'][0]];
    fire.hp = 0;
    fire.pos = { x: 3, y: 2 };
    water.hp = 22;
    water.pos = { x: 2, y: 1 };
    snow.pos = { x: 1, y: 3 };
    const plans: AppState['plans'] = {
      water: { ninjaId: 'water', moveTo: { x: 3, y: 1 }, action: { type: 'revive', targetId: 'fire' } },
      snow: { ninjaId: 'snow', moveTo: { x: 2, y: 2 }, action: { type: 'heal', targetId: 'water' } },
    };
    expect(layers({ match: m, plans, active: 'snow' }).marks).toEqual([
      { kind: 'revive', at: { x: 3, y: 2 }, by: ['water'] },
      { kind: 'heal', at: { x: 2, y: 1 }, by: ['snow'] },
    ]);
  });

  it('sin el ratón sobre un plan no hay ninguna línea de mira', () => {
    expect(layers({ plans: PLANS, active: 'snow' }).aims).toEqual([]);
    // Una casilla vacía tampoco pide ninguna.
    expect(layers({ plans: PLANS, active: 'snow', hover: { x: 7, y: 4 } }).aims).toEqual([]);
  });

  it('la mira de un plan aparece al pasar el ratón por su objetivo: una por atacante, desde su casilla planeada', () => {
    // Granizo no es objetivo de nadie y Brasa no lo alcanza: sobre Témpano solo se ven las dos miras.
    expect(layers({ plans: PLANS, active: 'fire', hover: { x: 4, y: 2 } }).aims).toEqual([
      { kind: 'attack', by: 'fire', from: { x: 3, y: 1 }, to: { x: 4, y: 2 } },
      { kind: 'attack', by: 'water', from: { x: 3, y: 2 }, to: { x: 4, y: 2 } },
    ]);
  });

  it('la mira de un plan aparece también al pasar el ratón por quien actúa o por su fantasma', () => {
    const aim = { kind: 'attack', by: 'snow', from: { x: 4, y: 3 }, to: { x: 5, y: 1 } };
    expect(layers({ plans: PLANS, active: 'fire', hover: { x: 1, y: 3 } }).aims).toEqual([aim]);
    expect(layers({ plans: PLANS, active: 'fire', hover: { x: 4, y: 3 } }).aims).toEqual([aim]);
  });

  it('apuntar a un objetivo que nadie ha elegido no dibuja ninguna mira: solo los planes la tienen', () => {
    // Escarcha, desde su casilla planeada, alcanza a Granizo, y se lo ofrece el tablero; pero no es un plan.
    const l = layers({ plans: PLANS, active: 'snow', hover: { x: 5, y: 3 } });
    expect(l.options.attack).toContainEqual({ x: 5, y: 3 });
    expect(l.aims).toEqual([]);
  });

  it('el objetivo que el ninja activo ya eligió no se le ofrece otra vez', () => {
    // Escarcha ya va contra Carámbano: le quedan Témpano y Granizo.
    expect(layers({ plans: PLANS, active: 'snow' }).options.attack).toEqual([
      { x: 4, y: 2 },
      { x: 5, y: 3 },
    ]);
    // Sobre Carámbano se ve la mira de ese plan.
    expect(layers({ plans: PLANS, active: 'snow', hover: { x: 5, y: 1 } }).aims).toEqual([
      { kind: 'attack', by: 'snow', from: { x: 4, y: 3 }, to: { x: 5, y: 1 } },
    ]);
  });

  it('las casillas de movimiento y el marcador son los del ninja activo', () => {
    const l = layers({ active: 'water' });
    expect(l.active).toEqual({ ninja: 'water', at: { x: 1, y: 2 } });
    // Marea da dos pasos y no puede terminar sobre un compañero.
    const keys = l.moves.map((t) => `${t.x},${t.y}`).sort();
    expect(keys).toEqual(['0,1', '0,2', '0,3', '1,0', '1,4', '2,1', '2,2', '2,3', '3,2'].sort());
  });

  it('con una carta en la mano el tablero solo ofrece dónde colocarla', () => {
    const m = match();
    const snow = m.ninjas.find((n) => n.id === 'snow');
    if (!snow) throw new Error('sin Escarcha');
    snow.hand = [{ id: 'snow-1', element: 'snow', value: 10 }];
    const l = layers({ match: m, plans: PLANS, active: 'snow', pendingCard: 'snow-1', hover: { x: 4, y: 2 } });
    expect(l.moves).toEqual([]);
    expect(l.options).toEqual({ attack: [], heal: [], revive: [] });
    expect(l.aims).toEqual([]);
    expect(l.threat).toEqual([]);
    // Bajo el ratón, el área de 3×3 con los gólems que alcanzaría: los tres.
    expect(l.card?.area).toHaveLength(9);
    expect(l.card?.enemies).toEqual([
      { x: 5, y: 1 },
      { x: 4, y: 2 },
      { x: 5, y: 3 },
    ]);
  });

  it('D-32: el número de orden va en la casilla desde la que actúa cada ninja', () => {
    expect(layers({ plans: PLANS, active: 'snow' }).order).toEqual([
      { ninja: 'fire', at: { x: 3, y: 1 }, n: 1 },
      { ninja: 'water', at: { x: 3, y: 2 }, n: 2 },
      { ninja: 'snow', at: { x: 4, y: 3 }, n: 3 },
    ]);
  });
});

/** Marea junto a Témpano: puede atacarlo sin moverse. */
function nextTo(): MatchState {
  const m = match();
  const water = m.ninjas.find((n) => n.id === 'water');
  if (!water) throw new Error('sin Marea');
  water.pos = { x: 3, y: 2 };
  return m;
}
