import {
  type Action,
  area3x3,
  type ElementKind,
  enemyAt,
  eq,
  getEnemy,
  getNinja,
  key,
  moveOptions,
  ninjaAt,
  resolutionOrder,
  type Vec,
} from '@ventisca/core';
import { activeInfo, plansArray, threatTiles } from './planning';
import type { AppState } from './store';

/*
 * Capas del tablero durante la planificación (lineamientos de diseño, sección "Tablero"). Este módulo
 * decide qué se muestra y cuándo; la escena solo lo dibuja.
 *
 * El tablero muestra un solo modo a la vez, el del ninja activo: moverse (solo casillas), actuar (solo
 * anillos) o colocar una carta (solo las casillas donde cabe). Los demás ninjas quedan en silueta y punto.
 */

/** Las acciones que apuntan a una unidad. Una carta apunta a una casilla y se dibuja como un área. */
export type MarkKind = Exclude<Action['type'], 'card'>;

/** Lo que el tablero le ofrece al ninja activo: `null` si no hay ninja activo. */
export type BoardMode = 'move' | 'act' | 'card';

/** Un objetivo que el ninja activo puede elegir en el paso de actuar. */
export interface TargetOption {
  kind: MarkKind;
  at: Vec;
}

/** Los puntos sobre el objetivo de una acción planeada: uno por ninja, en orden Fuego, Agua, Nieve. */
export interface TargetDots {
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

  /** Modo moverse: las casillas a las que puede ir el ninja activo. */
  moves: Vec[];
  /** Modo moverse: su propia casilla, que es quedarse. */
  stay: Vec | null;
  /** Modo moverse: las casillas que puede golpear el gólem que está bajo el ratón. */
  threat: Vec[];

  /** Modo actuar: los objetivos que el ninja activo puede elegir desde su casilla planeada, sin el elegido. */
  options: TargetOption[];
  /** Modo actuar: el objetivo que ya eligió. */
  chosen: TargetOption | null;

  /** Modo carta: dónde se puede colocar y, bajo el ratón, a quién alcanzaría. */
  card: { tiles: Vec[]; area: Vec[]; enemies: Vec[]; allies: Vec[] } | null;

  /** El fantasma de cada ninja que planea moverse, en su destino. */
  ghosts: { ninja: ElementKind; at: Vec }[];
  /** El camino hasta su fantasma: solo el del ninja activo. */
  path: { ninja: ElementKind; tiles: Vec[] } | null;
  /** Un punto por ninja sobre el objetivo de cada acción planeada. */
  dots: TargetDots[];
  /** Las cartas ya colocadas. */
  cards: PlacedCard[];
  /** El orden real en que actuará cada ninja (R-11, D-32), en la casilla desde la que actúa. */
  order: { ninja: ElementKind; at: Vec; n: number }[];
  /** Líneas de mira: solo las que pide el ratón. */
  aims: AimLine[];
  hover: Vec | null;
}

type BoardState = Pick<AppState, 'phase' | 'screen' | 'match' | 'plans' | 'active' | 'step' | 'pendingCard' | 'hover'>;

/** Lo que muestra el tablero mientras se planifica; `null` fuera de la planificación. */
export function boardLayers(s: BoardState): BoardLayers | null {
  const m = s.match;
  if (s.phase !== 'planning' || !m || s.screen !== 'battle') return null;
  const { hover } = s;
  const info = activeInfo(s);
  const mode: BoardMode | null = !info ? null : s.pendingCard ? 'card' : s.step;
  const layers: BoardLayers = {
    mode,
    active: null,
    moves: [],
    stay: null,
    threat: [],
    options: [],
    chosen: null,
    card: null,
    ghosts: [],
    path: null,
    dots: [],
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
    } else if (mode === 'move') {
      layers.moves = [...info.moves.values()].map((path) => path[path.length - 1] as Vec);
      layers.stay = info.ninja.pos;
      const enemy = hover ? enemyAt(m, hover) : undefined;
      if (enemy) layers.threat = threatTiles(m, enemy);
    } else {
      const picked = info.plan.action;
      const all: (TargetOption & { id: string })[] = [
        ...info.attack.map((e) => ({ kind: 'attack' as const, at: e.pos, id: e.id })),
        ...info.heal.map((a) => ({ kind: 'heal' as const, at: a.pos, id: a.id })),
        ...info.revive.map((a) => ({ kind: 'revive' as const, at: a.pos, id: a.id })),
      ];
      for (const { id, ...option } of all) {
        if (picked && picked.type === option.kind && picked.targetId === id) layers.chosen = option;
        else layers.options.push(option);
      }
    }
  }

  // Planes de todos los ninjas: fantasmas, puntos sobre los objetivos, cartas y orden de resolución.
  const plans = plansArray(s.plans);
  const order = resolutionOrder(m, plans);
  const dots = new Map<string, TargetDots>();
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
        const id = key(target.pos);
        const entry = dots.get(id) ?? { at: target.pos, by: [] };
        entry.by.push(n.id);
        dots.set(id, entry);
        planned.push({ kind: a.type, by: n.id, from, to: target.pos, stands: n.pos });
      }
    }
    const num = order[n.id];
    if (num) layers.order.push({ ninja: n.id, at: from, n: num });
  }
  layers.dots = [...dots.values()];

  if (hover && mode !== 'card') {
    // La mira de un plan se ve al pasar el ratón por su objetivo, por quien actúa o por su fantasma.
    layers.aims = planned
      .filter((a) => eq(a.to, hover) || eq(a.from, hover) || eq(a.stands, hover))
      .map(({ stands: _stands, ...aim }) => aim);
  }
  return layers;
}
