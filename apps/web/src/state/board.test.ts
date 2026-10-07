import { createMatch, type ElementKind, type Enemy, type EnemyKind, type MatchState, type Plan } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { boardLayers } from './board';
import { DEFAULT_SETTINGS } from './persist';
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
  settings: DEFAULT_SETTINGS,
  local: true,
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

/** Los ajustes con las ayudas opcionales que se pidan (D-78). */
const aids = (patch: Partial<AppState['settings']>): AppState['settings'] => ({ ...DEFAULT_SETTINGS, ...patch });
const keys = (tiles: { x: number; y: number }[]) => tiles.map((t) => `${t.x},${t.y}`).sort();

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
  });

  describe('Las ayudas opcionales (D-78)', () => {
    const golem = { x: 4, y: 2 };
    const reach = aids({ aidReach: true });
    const damage = aids({ aidDamage: true });

    it('D-78: sin la ayuda, pasar el ratón sobre un gólem no pinta su alcance', () => {
      expect(layers({ active: 'fire', hover: golem }).threat).toEqual([]);
      expect(layers({ plans: { fire: PLANS.fire }, active: 'fire', hover: golem }).threat).toEqual([]);
    });

    it('D-78: con "Ver el alcance de los enemigos" se pinta con el ratón encima, antes y después de moverse', () => {
      const before = layers({ settings: reach, active: 'fire', hover: golem }).threat;
      // Témpano da un paso y pega a la casilla de al lado: desde (4,2) alcanza hasta dos casillas.
      expect(keys(before.map((t) => t.at))).toContain('2,2');
      expect(keys(before.map((t) => t.at))).not.toContain('1,2');
      const after = layers({ settings: reach, plans: { fire: PLANS.fire }, active: 'fire', hover: golem }).threat;
      expect(keys(after.map((t) => t.at))).toEqual(keys(before.map((t) => t.at)));
      // Solo con el ratón sobre un gólem, también sin ningún ninja activo.
      expect(layers({ settings: reach, active: 'fire' }).threat).toEqual([]);
      expect(layers({ settings: reach, active: 'fire', hover: { x: 7, y: 4 } }).threat).toEqual([]);
      expect(layers({ settings: reach, active: null, hover: golem }).threat.length).toBeGreaterThan(0);
    });

    it('D-78: con una carta en la mano el alcance no se pinta: las cartas son un modo aparte', () => {
      const m = match();
      ninja(m, 'fire').hand = [{ id: 'fire-1', element: 'fire', value: 10 }];
      const l = layers({ match: m, settings: reach, active: 'fire', pendingCard: 'fire-1', hover: golem });
      expect(l.threat).toEqual([]);
    });

    it('D-78: en una partida que no es local las ayudas no valen, aunque estén encendidas', () => {
      const both = aids({ aidReach: true, aidDamage: true });
      const l = layers({ settings: both, local: false, plans: PLANS, active: 'fire', hover: golem });
      expect(l.threat).toEqual([]);
      expect(l.losses).toEqual([]);
    });

    it('una casilla que es opción del ninja activo conserva su color: el alcance le pone solo el borde', () => {
      // Brasa, en (1,1), puede ir a (2,1) y a (3,1), que Témpano alcanza.
      const l = layers({ settings: reach, active: 'fire', hover: golem });
      const options = new Set(keys([...l.moves, ...(l.stay ? [l.stay] : [])]));
      expect(l.threat.some((t) => options.has(`${t.at.x},${t.at.y}`))).toBe(true);
      for (const t of l.threat) expect(t.tint).toBe(!options.has(`${t.at.x},${t.at.y}`));
    });

    it('D-78: sin la ayuda, el tablero no dice cuánta vida perderá nadie', () => {
      expect(layers({ plans: PLANS, active: 'snow' }).losses).toEqual([]);
    });

    it('D-78: con "Ver el daño antes de confirmar", cada gólem lleva la vida que le quitarían los planes', () => {
      // Brasa (8) y Marea (10) van contra Témpano; Escarcha (6), contra Carámbano.
      expect(layers({ settings: damage, plans: PLANS, active: 'snow' }).losses).toEqual([
        { id: 'e1', loss: 6 },
        { id: 'e2', loss: 18 },
      ]);
      // Vale mientras se planifica, con cualquier ninja activo o con ninguno.
      expect(layers({ settings: damage, plans: PLANS, active: 'fire' }).losses).toHaveLength(2);
      expect(layers({ settings: damage, plans: PLANS, active: null }).losses).toHaveLength(2);
      expect(layers({ settings: damage, active: 'fire' }).losses).toEqual([]);
    });

    it('D-78: al apuntar, suma el ataque del ninja activo al gólem que tiene bajo el ratón', () => {
      const { snow: _snow, ...others } = PLANS;
      // Escarcha, desde (4,3), alcanza a Témpano: 8 + 10 + 6.
      const near: Plan = { ninjaId: 'snow', moveTo: { x: 4, y: 3 } };
      const aiming = { settings: damage, plans: { ...others, snow: near } };
      expect(layers({ ...aiming, active: 'snow', hover: golem }).losses).toEqual([{ id: 'e2', loss: 24 }]);
      // Apuntar a otro gólem cambia la cuenta, y cambia de objetivo si ya tenía uno.
      expect(layers({ ...aiming, active: 'snow', hover: { x: 5, y: 1 } }).losses).toEqual([
        { id: 'e1', loss: 6 },
        { id: 'e2', loss: 18 },
      ]);
      expect(layers({ settings: damage, plans: PLANS, active: 'snow', hover: golem }).losses).toEqual([
        { id: 'e2', loss: 24 },
      ]);
      // Sin el ratón sobre un gólem a su alcance, queda lo planeado.
      expect(layers({ ...aiming, active: 'snow' }).losses).toEqual([{ id: 'e2', loss: 18 }]);
      // Brasa, desde (1,1), no alcanza a Témpano: el ratón encima no suma nada.
      const far = layers({ settings: damage, plans: { water: PLANS.water }, active: 'fire', hover: golem });
      expect(far.losses).toEqual([{ id: 'e2', loss: 10 }]);
      // Y el ratón de un ninja no cuenta por otro: Marea está activa, y el ataque que suma es el suyo.
      const { water: _water, ...rest } = PLANS;
      const water = layers({
        settings: damage,
        plans: { ...rest, water: { ninjaId: 'water', moveTo: { x: 3, y: 2 } } },
        active: 'water',
        hover: golem,
      });
      expect(water.losses).toEqual([
        { id: 'e1', loss: 6 },
        { id: 'e2', loss: 18 },
      ]);
    });

    it('D-78: al apuntar una carta, suma lo que haría en la casilla que está bajo el ratón', () => {
      const m = match();
      ninja(m, 'water').hand = [{ id: 'water-1', element: 'water', value: 10 }];
      const placing = {
        match: m,
        settings: damage,
        plans: { fire: PLANS.fire },
        active: 'water' as const,
        pendingCard: 'water-1',
      };
      // La carta de Agua hace el doble de su valor a los gólems del área: en (3,2) alcanza solo a Témpano.
      expect(layers({ ...placing, hover: { x: 3, y: 2 } }).losses).toEqual([{ id: 'e2', loss: 28 }]);
      // Fuera de las casillas donde cabe, queda lo planeado.
      expect(layers({ ...placing, hover: { x: 8, y: 4 } }).losses).toEqual([{ id: 'e2', loss: 8 }]);
      expect(layers({ ...placing }).losses).toEqual([{ id: 'e2', loss: 8 }]);
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

    it('D-32: el número de orden va en la casilla desde la que actúa cada ninja', () => {
      expect(layers({ plans: PLANS, active: 'snow' }).order).toEqual([
        { ninja: 'fire', at: { x: 3, y: 1 }, n: 1 },
        { ninja: 'water', at: { x: 3, y: 2 }, n: 2 },
        { ninja: 'snow', at: { x: 4, y: 3 }, n: 3 },
      ]);
    });
  });

  describe('Las cartas colocadas quedan en miniatura', () => {
    /** Cada ninja con una carta en la mano, y los tres a distancia de colocarla en (3,2). */
    function withCards(): MatchState {
      const m = match();
      const values: Record<ElementKind, number> = { fire: 9, water: 10, snow: 12 };
      for (const n of m.ninjas) n.hand = [{ id: `${n.id}-1`, element: n.id, value: values[n.id] }];
      // Témpano se aparta: (3,2) y sus vecinas quedan libres.
      const colossus = m.enemies.find((e) => e.id === 'e2');
      if (colossus) colossus.pos = { x: 7, y: 2 };
      return m;
    }
    const card = (ninjaId: ElementKind, x: number, y: number): Plan => ({
      ninjaId,
      action: { type: 'card', cardId: `${ninjaId}-1`, at: { x, y } },
    });
    const at = { x: 3, y: 2 };

    it('una carta deja en su casilla su miniatura, con su valor, y el contorno de su área', () => {
      const l = layers({ match: withCards(), plans: { fire: card('fire', 3, 2) }, active: 'water' });
      expect(l.cards).toHaveLength(1);
      expect(l.cards[0]).toMatchObject({ at, cards: [{ ninja: 'fire', value: 9 }], full: null, faded: false });
      // El contorno rodea las 9 casillas del área. No rellena ninguna.
      expect(keys(l.cards[0]?.area ?? [])).toEqual(['2,1', '2,2', '2,3', '3,1', '3,2', '3,3', '4,1', '4,2', '4,3']);
      expect(l.combo).toBe(false);
    });

    it('el área completa se ve solo con su dueño activo o con el ratón sobre la miniatura', () => {
      const plans = { fire: card('fire', 3, 2) };
      const m = withCards();
      expect(layers({ match: m, plans, active: 'water' }).cards[0]?.full).toBeNull();
      expect(layers({ match: m, plans, active: 'water', hover: { x: 4, y: 2 } }).cards[0]?.full).toBeNull();
      const over = layers({ match: m, plans, active: 'water', hover: at }).cards[0];
      expect(over?.full?.color).toBe('fire');
      // Con su dueño activo, sin el ratón.
      const own = layers({ match: m, plans, active: 'fire' }).cards[0];
      expect(own?.full?.color).toBe('fire');
    });

    it('con el ratón sobre una unidad, las miniaturas de su casilla se vuelven semitransparentes', () => {
      const m = withCards();
      // Carámbano está en (5,1): la carta de Brasa cae sobre su casilla.
      const golem = { x: 5, y: 1 };
      const onGolem = { fire: card('fire', 5, 1) };
      expect(layers({ match: m, plans: onGolem, active: 'water', hover: golem }).cards[0]?.faded).toBe(true);
      // Sin el ratón encima, o con el ratón en otra casilla, se ven enteras.
      expect(layers({ match: m, plans: onGolem, active: 'water' }).cards[0]?.faded).toBe(false);
      expect(layers({ match: m, plans: onGolem, active: 'water', hover: { x: 4, y: 1 } }).cards[0]?.faded).toBe(false);
      // También con una carta en la mano: sigue habiendo una unidad que ver.
      const placing = { match: m, plans: onGolem, active: 'water' as const, pendingCard: 'water-1' };
      expect(layers({ ...placing, hover: golem }).cards[0]?.faded).toBe(true);
      // Sobre un ninja, en pie o caído, igual: Brasa está en (1,1).
      const onNinja = { water: card('water', 1, 1) };
      const brasa = { x: 1, y: 1 };
      expect(layers({ match: m, plans: onNinja, active: 'snow', hover: brasa }).cards[0]?.faded).toBe(true);
      ninja(m, 'fire').hp = 0;
      expect(layers({ match: m, plans: onNinja, active: 'snow', hover: brasa }).cards[0]?.faded).toBe(true);
      // En una casilla vacía no hay a quién dejar ver: siguen enteras, con el área completa.
      const empty = layers({ match: m, plans: { water: card('water', 3, 2) }, active: 'snow', hover: at }).cards[0];
      expect(empty?.faded).toBe(false);
      expect(empty?.full?.color).toBe('water');
    });

    it('dos y tres cartas en la misma casilla: un solo grupo y un solo contorno, en orden Fuego, Agua, Nieve', () => {
      const m = withCards();
      const two = layers({ match: m, plans: { water: card('water', 3, 2), fire: card('fire', 3, 2) }, active: 'snow' });
      expect(two.cards).toHaveLength(1);
      expect(two.cards[0]?.cards).toEqual([
        { ninja: 'fire', value: 9 },
        { ninja: 'water', value: 10 },
      ]);
      expect(two.cards[0]?.area).toHaveLength(9);
      const plans = { snow: card('snow', 3, 2), water: card('water', 3, 2), fire: card('fire', 3, 2) };
      const three = layers({ match: m, plans, active: null });
      expect(three.cards).toHaveLength(1);
      expect(three.cards[0]?.cards).toEqual([
        { ninja: 'fire', value: 9 },
        { ninja: 'water', value: 10 },
        { ninja: 'snow', value: 12 },
      ]);
    });

    it('en casillas distintas, cada carta lleva su grupo y su contorno', () => {
      const plans = { fire: card('fire', 3, 2), water: card('water', 2, 3) };
      const l = layers({ match: withCards(), plans, active: 'snow' });
      expect(l.cards.map((g) => ({ at: g.at, by: g.cards.map((c) => c.ninja) }))).toEqual([
        { at, by: ['fire'] },
        { at: { x: 2, y: 3 }, by: ['water'] },
      ]);
    });

    it('R-18: con dos o más cartas en el turno hay combo, estén en la misma casilla o en distintas', () => {
      const m = withCards();
      const same = { fire: card('fire', 3, 2), water: card('water', 3, 2) };
      const apart = { fire: card('fire', 3, 2), snow: card('snow', 2, 3) };
      expect(layers({ match: m, plans: same, active: 'snow' }).combo).toBe(true);
      expect(layers({ match: m, plans: apart, active: 'water' }).combo).toBe(true);
      expect(layers({ match: m, plans: { ...same, snow: card('snow', 3, 2) }, active: null }).combo).toBe(true);
      // Una sola carta no hace combo, y la de un ninja que ya no la tiene en la mano tampoco cuenta.
      const one = { fire: card('fire', 3, 2), water: PLANS.water };
      expect(layers({ match: m, plans: one, active: 'snow' }).combo).toBe(false);
      const spent = withCards();
      ninja(spent, 'water').hand = [];
      expect(layers({ match: spent, plans: same, active: 'snow' }).combo).toBe(false);
    });

    it('el área compartida se muestra una sola vez: en el color del ninja activo si una carta es suya', () => {
      const m = withCards();
      const plans = { fire: card('fire', 3, 2), water: card('water', 3, 2), snow: card('snow', 3, 2) };
      expect(layers({ match: m, plans, active: 'water' }).cards[0]?.full?.color).toBe('water');
      expect(layers({ match: m, plans, active: 'snow' }).cards[0]?.full?.color).toBe('snow');
      // Si ninguna es suya, con el ratón encima toma el de la primera, en orden Fuego, Agua, Nieve.
      const { fire: _fire, ...rest } = plans;
      expect(layers({ match: m, plans: rest, active: 'fire', hover: at }).cards[0]?.full?.color).toBe('water');
    });

    it('ningún tinte se mezcla: el área completa no rellena las casillas que son opción del ninja activo', () => {
      // Escarcha colocó su carta en (3,2) y Brasa está activo: con el ratón sobre la miniatura se ve el área.
      const m = withCards();
      const l = layers({ match: m, plans: { snow: card('snow', 3, 2) }, active: 'fire', hover: at });
      const options = new Set(keys([...l.moves, ...(l.stay ? [l.stay] : [])]));
      const tinted = keys(l.cards[0]?.full?.tint ?? []);
      // Brasa, en (1,1), puede ir a (2,1), (2,2) y (3,1), que están en el área: ahí se ve solo su color.
      expect([...options].filter((k) => ['2,1', '2,2', '3,1'].includes(k))).toHaveLength(3);
      expect(tinted.some((k) => options.has(k))).toBe(false);
      expect(tinted).toEqual(['2,3', '3,2', '3,3', '4,1', '4,2', '4,3']);
      // Con la dueña activa pasa lo mismo: sus casillas siguen valiendo después de colocar la carta.
      const own = layers({ match: m, plans: { snow: card('snow', 3, 2) }, active: 'snow' });
      const mine = new Set(keys([...own.moves, ...(own.stay ? [own.stay] : [])]));
      expect(own.cards[0]?.full?.tint.length).toBeGreaterThan(0);
      expect(keys(own.cards[0]?.full?.tint ?? []).some((k) => mine.has(k))).toBe(false);
    });

    it('donde el alcance de un gólem ya tiñe, el área no rellena', () => {
      const m = withCards();
      const plans = { snow: card('snow', 3, 2) };
      // Carámbano, en (5,1), está bajo el ratón, y Escarcha, activa, ve además el área de su carta.
      const l = layers({ match: m, settings: aids({ aidReach: true }), plans, active: 'snow', hover: { x: 5, y: 1 } });
      const reach = new Set(keys(l.threat.filter((t) => t.tint).map((t) => t.at)));
      const area = keys(l.cards[0]?.area ?? []);
      // El alcance de Carámbano tiñe casillas del área que no son opción de Escarcha.
      expect(area.some((k) => reach.has(k))).toBe(true);
      expect(keys(l.cards[0]?.full?.tint ?? []).some((k) => reach.has(k))).toBe(false);
    });

    it('con una carta en la mano, las cartas colocadas quedan en miniatura y contorno', () => {
      const m = withCards();
      const placing = {
        match: m,
        plans: { fire: card('fire', 3, 2) },
        active: 'water' as const,
        pendingCard: 'water-1',
      };
      const l = layers({ ...placing, hover: at });
      expect(l.mode).toBe('card');
      expect(l.cards[0]).toMatchObject({ cards: [{ ninja: 'fire', value: 9 }], full: null, faded: false });
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
