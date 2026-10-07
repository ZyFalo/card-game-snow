import {
  type Action,
  area3x3,
  type ElementKind,
  enemyAt,
  eq,
  getEnemy,
  getNinja,
  isRock,
  key,
  moveOptions,
  neighbors8,
  ninjaAt,
  resolutionOrder,
  type Vec,
} from '@ventisca/core';
import { activeInfo, plansArray, reviverOf, threatTiles } from './planning';
import type { AppState } from './store';

/*
 * Capas del tablero durante la planificación (lineamientos de diseño, sección "Tablero"). Este módulo
 * decide qué se muestra y cuándo; la escena solo lo dibuja.
 *
 * Al ninja activo el tablero le ofrece a la vez sus casillas y los objetivos que alcanza desde donde va a
 * estar: su casilla planeada o, si no se mueve, la suya. Colocar una carta es el único modo aparte: solo
 * las casillas donde cabe. Los planes del equipo quedan en silueta y marca: el fantasma de cada ninja y
 * una marca sobre cada objetivo elegido, con quienes lo eligieron.
 */

/** Las acciones que apuntan a una unidad. Una carta apunta a una casilla y se dibuja como un área. */
export type MarkKind = Exclude<Action['type'], 'card'>;

/**
 * Lo que el tablero le ofrece al ninja activo: planificar (casillas y objetivos a la vez) o colocar la
 * carta que tiene en la mano. `null` si no hay ninja activo.
 */
export type BoardMode = 'plan' | 'card';

/** Un objetivo que el ninja activo puede elegir. */
export interface TargetOption {
  kind: MarkKind;
  at: Vec;
}

/** Marca sobre el objetivo de una acción planeada, con quienes lo eligieron en orden Fuego, Agua, Nieve. */
export interface TargetMark {
  kind: MarkKind;
  at: Vec;
  by: ElementKind[];
}

/** Una carta ya colocada. Su área se muestra para el ninja activo, o al pasar el ratón por su casilla. */
export interface PlacedCard {
  ninja: ElementKind;
  at: Vec;
  value: number | null;
  /** El área de 3×3, o vacía si no se muestra. */
  area: Vec[];
}

/** Línea de mira de una acción planeada: de la casilla desde la que actúa el ninja a su objetivo. */
export interface AimLine {
  kind: MarkKind;
  by: ElementKind;
  from: Vec;
  to: Vec;
}

export interface BoardLayers {
  mode: BoardMode | null;
  /** El ninja que se está planificando, en la casilla donde está. */
  active: { ninja: ElementKind; at: Vec } | null;

  /** Las casillas a las que puede ir el ninja activo. */
  moves: Vec[];
  /** Su propia casilla: quedarse, o volver a su lugar si ya eligió otra. */
  stay: Vec | null;
  /** El ninja activo ya eligió casilla: las demás siguen a la vista, más tenues, para cambiar de destino. */
  moved: boolean;
  /** Las casillas que puede golpear el gólem que está bajo el ratón. */
  threat: Vec[];
  /** Las casillas vecinas al caído que está bajo el ratón, desde las que se le revive (R-09). */
  reviveSpots: Vec[];

  /** Los objetivos que el ninja activo puede elegir desde donde va a estar, sin el que ya eligió. */
  options: TargetOption[];

  /** Modo carta: dónde se puede colocar y, bajo el ratón, a quién alcanzaría. */
  card: { tiles: Vec[]; area: Vec[]; enemies: Vec[]; allies: Vec[] } | null;

  /** El fantasma de cada ninja que planea moverse, en su destino. */
  ghosts: { ninja: ElementKind; at: Vec }[];
  /** El camino hasta su fantasma: solo el del ninja activo. */
  path: { ninja: ElementKind; tiles: Vec[] } | null;
  /** Una marca por objetivo elegido, de cualquier ninja: se ve siempre. */
  marks: TargetMark[];
  /** Las cartas ya colocadas. */
  cards: PlacedCard[];
  /** El orden real en que actuará cada ninja (R-11, D-32), en la casilla desde la que actúa. */
  order: { ninja: ElementKind; at: Vec; n: number }[];
  /** Líneas de mira: solo las que pide el ratón. */
  aims: AimLine[];
  hover: Vec | null;
}

type BoardState = Pick<AppState, 'phase' | 'screen' | 'match' | 'plans' | 'active' | 'pendingCard' | 'hover'>;

/** Lo que muestra el tablero mientras se planifica; `null` fuera de la planificación. */
export function boardLayers(s: BoardState): BoardLayers | null {
  const m = s.match;
  if (s.phase !== 'planning' || !m || s.screen !== 'battle') return null;
  const { hover } = s;
  const info = activeInfo(s);
  const mode: BoardMode | null = !info ? null : s.pendingCard ? 'card' : 'plan';
  const layers: BoardLayers = {
    mode,
    active: null,
    moves: [],
    stay: null,
    moved: false,
    threat: [],
    reviveSpots: [],
    options: [],
    card: null,
    ghosts: [],
    path: null,
    marks: [],
    cards: [],
    order: [],
    aims: [],
    hover,
  };

  if (info) {
    layers.active = { ninja: info.ninja.id, at: info.ninja.pos };
    if (mode === 'card') {
      const area = hover && info.cardTiles.some((t) => eq(t, hover)) ? area3x3(hover) : [];
      layers.card = {
        tiles: info.cardTiles,
        area,
        enemies: area.filter((t) => enemyAt(m, t)),
        // Solo la carta de Nieve hace algo por los ninjas del área: los cura o los revive.
        allies: info.ninja.id === 'snow' ? area.filter((t) => ninjaAt(m, t)) : [],
      };
    } else {
      // Las casillas valen siempre: tras moverse, otro clic cambia de destino.
      layers.moves = [...info.moves.values()].map((path) => path[path.length - 1] as Vec);
      layers.stay = info.ninja.pos;
      layers.moved = !!info.plan.moveTo;
      const enemy = hover ? enemyAt(m, hover) : undefined;
      if (enemy) layers.threat = threatTiles(m, enemy);
      // Un caído se revive desde cualquiera de sus 8 casillas vecinas: al pasar el ratón por él, se ven.
      // Si ya lo revive otro ninja, no: un caído solo puede tener un reanimador.
      const fallen = hover ? ninjaAt(m, hover) : undefined;
      if (fallen && fallen.hp <= 0) {
        const reviver = reviverOf(s.plans, fallen.id);
        if (!reviver || reviver === info.ninja.id) {
          layers.reviveSpots = neighbors8(fallen.pos).filter((t) => !isRock(m, t) && !enemyAt(m, t));
        }
      }
      // Los objetivos, a la vez que las casillas: los que alcanza desde su casilla planeada o, si no se
      // mueve, desde la suya.
      const picked = info.plan.action;
      const all: (TargetOption & { id: string })[] = [
        ...info.attack.map((e) => ({ kind: 'attack' as const, at: e.pos, id: e.id })),
        ...info.heal.map((a) => ({ kind: 'heal' as const, at: a.pos, id: a.id })),
        ...info.revive.map((a) => ({ kind: 'revive' as const, at: a.pos, id: a.id })),
      ];
      // El que ya eligió no es una opción: lleva su marca.
      for (const { id, ...option } of all) {
        if (!(picked && picked.type === option.kind && picked.targetId === id)) layers.options.push(option);
      }
    }
  }

  // Planes de todos los ninjas: fantasmas, marcas sobre los objetivos, cartas y orden de resolución.
  const plans = plansArray(s.plans);
  const order = resolutionOrder(m, plans);
  const marks = new Map<string, TargetMark>();
  /** Las miras de todos los planes, con la casilla donde está hoy cada ninja. */
  const planned: (AimLine & { stands: Vec })[] = [];
  for (const plan of plans) {
    const n = getNinja(m, plan.ninjaId);
    if (!n || n.hp <= 0) continue;
    const isActive = n.id === s.active;
    const from = plan.moveTo ?? n.pos;
    if (plan.moveTo) {
      layers.ghosts.push({ ninja: n.id, at: plan.moveTo });
      if (isActive) {
        const others = plans.filter((p) => p.ninjaId !== n.id);
        const tiles = moveOptions(m, n.id, others).get(key(plan.moveTo)) ?? [n.pos, plan.moveTo];
        layers.path = { ninja: n.id, tiles };
      }
    }
    const a = plan.action;
    if (a?.type === 'card') {
      const value = n.hand.find((c) => c.id === a.cardId)?.value ?? null;
      // El área, para el ninja activo; la de los demás, solo al pasar el ratón por su casilla.
      const shown = mode !== 'card' && (isActive || (hover !== null && eq(hover, a.at)));
      layers.cards.push({ ninja: n.id, at: a.at, value, area: shown ? area3x3(a.at) : [] });
    } else if (a) {
      const target = a.type === 'attack' ? getEnemy(m, a.targetId) : getNinja(m, a.targetId);
      if (target) {
        const id = `${a.type}:${key(target.pos)}`;
        const mark = marks.get(id) ?? { kind: a.type, at: target.pos, by: [] };
        mark.by.push(n.id);
        marks.set(id, mark);
        planned.push({ kind: a.type, by: n.id, from, to: target.pos, stands: n.pos });
      }
    }
    const num = order[n.id];
    if (num) layers.order.push({ ninja: n.id, at: from, n: num });
  }
  layers.marks = [...marks.values()];

  if (hover && mode !== 'card') {
    // La mira de un plan se ve al pasar el ratón por su objetivo, por quien actúa o por su fantasma.
    layers.aims = planned
      .filter((a) => eq(a.to, hover) || eq(a.from, hover) || eq(a.stands, hover))
      .map(({ stands: _stands, ...aim }) => aim);
  }
  return layers;
}
