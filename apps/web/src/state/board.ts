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
 */

/** Las acciones que apuntan a una unidad. Una carta apunta a una casilla y se dibuja como un área. */
export type MarkKind = Exclude<Action['type'], 'card'>;

/** Marca sobre el objetivo de una acción planeada, con quienes lo eligieron en orden Fuego, Agua, Nieve. */
export interface TargetMark {
  kind: MarkKind;
  at: Vec;
  by: ElementKind[];
}

/** Línea de mira de una acción planeada: de la casilla desde la que actúa el ninja a su objetivo. */
export interface AimLine {
  kind: MarkKind;
  by: ElementKind;
  from: Vec;
  to: Vec;
}

export interface BoardLayers {
  /** Casillas que puede golpear el gólem que está bajo el ratón. */
  threat: Vec[];
  /** El ninja que se está planificando, en la casilla donde está. */
  active: { ninja: ElementKind; at: Vec } | null;
  /** Casillas a las que puede moverse el ninja activo. */
  moves: Vec[];
  /** Objetivos que el ninja activo puede elegir desde su casilla planeada, sin el que ya eligió. */
  options: Record<MarkKind, Vec[]>;
  /** Con una carta en la mano: dónde se puede colocar y, bajo el ratón, a quién alcanzaría. */
  card: { tiles: Vec[]; area: Vec[]; enemies: Vec[]; allies: Vec[] } | null;
  /** El fantasma de cada ninja que planea moverse, en su destino. */
  ghosts: { ninja: ElementKind; at: Vec }[];
  /** El camino hasta su fantasma: solo el del ninja activo. */
  path: { ninja: ElementKind; tiles: Vec[] } | null;
  /** Una marca por objetivo y tipo de acción. */
  marks: TargetMark[];
  /** Las cartas ya colocadas, con su área. */
  cards: { ninja: ElementKind; at: Vec; area: Vec[]; value: number | null }[];
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
  const layers: BoardLayers = {
    threat: [],
    active: null,
    moves: [],
    options: { attack: [], heal: [], revive: [] },
    card: null,
    ghosts: [],
    path: null,
    marks: [],
    cards: [],
    order: [],
    aims: [],
    hover,
  };

  if (hover && !s.pendingCard) {
    const enemy = enemyAt(m, hover);
    if (enemy) layers.threat = threatTiles(m, enemy);
  }

  if (info) {
    layers.active = { ninja: info.ninja.id, at: info.ninja.pos };
    if (s.pendingCard) {
      const area = hover && info.cardTiles.some((t) => eq(t, hover)) ? area3x3(hover) : [];
      layers.card = {
        tiles: info.cardTiles,
        area,
        enemies: area.filter((t) => enemyAt(m, t)),
        // Solo la carta de Nieve hace algo por los ninjas del área: los cura o los revive.
        allies: info.ninja.id === 'snow' ? area.filter((t) => ninjaAt(m, t)) : [],
      };
    } else {
      const chosen = info.plan.action;
      const open = (kind: MarkKind, id: string) => !(chosen?.type === kind && chosen.targetId === id);
      layers.moves = [...info.moves.values()].map((path) => path[path.length - 1] as Vec);
      layers.options = {
        attack: info.attack.filter((e) => open('attack', e.id)).map((e) => e.pos),
        heal: info.heal.filter((a) => open('heal', a.id)).map((a) => a.pos),
        revive: info.revive.filter((a) => open('revive', a.id)).map((a) => a.pos),
      };
    }
  }

  // Planes de todos los ninjas: fantasmas, objetivos, cartas y orden de resolución.
  const plans = plansArray(s.plans);
  const order = resolutionOrder(m, plans);
  const marks = new Map<string, TargetMark>();
  /** Las miras de todos los planes, con la casilla donde está hoy cada ninja. */
  const planned: (AimLine & { stands: Vec })[] = [];
  for (const plan of plans) {
    const n = getNinja(m, plan.ninjaId);
    if (!n || n.hp <= 0) continue;
    const from = plan.moveTo ?? n.pos;
    if (plan.moveTo) {
      layers.ghosts.push({ ninja: n.id, at: plan.moveTo });
      if (n.id === s.active) {
        const others = plans.filter((p) => p.ninjaId !== n.id);
        const tiles = moveOptions(m, n.id, others).get(key(plan.moveTo)) ?? [n.pos, plan.moveTo];
        layers.path = { ninja: n.id, tiles };
      }
    }
    const a = plan.action;
    if (a?.type === 'card') {
      const value = n.hand.find((c) => c.id === a.cardId)?.value ?? null;
      layers.cards.push({ ninja: n.id, at: a.at, area: area3x3(a.at), value });
    } else if (a) {
      const target = a.type === 'attack' ? getEnemy(m, a.targetId) : getNinja(m, a.targetId);
      if (target) {
        const id = `${a.type}:${a.targetId}`;
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

  if (hover && !s.pendingCard) {
    // La mira de un plan se ve al pasar el ratón por su objetivo, por quien actúa o por su fantasma.
    layers.aims = planned
      .filter((a) => eq(a.to, hover) || eq(a.from, hover) || eq(a.stands, hover))
      .map(({ stands: _stands, ...aim }) => aim);
  }
  return layers;
}
