import {
  type Action,
  area3x3,
  ELEMENTS,
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
  type Plan,
  plannedDamage,
  resolutionOrder,
  type Vec,
} from '@ventisca/core';
import { activeAids } from './aids';
import { activeInfo, plansArray, reviverOf, threatTiles } from './planning';
import type { AppState } from './store';

/*
 * Capas del tablero durante la planificación (lineamientos de diseño, sección "Tablero"). Este módulo
 * decide qué se muestra y cuándo; la escena solo lo dibuja.
 *
 * Al ninja activo el tablero le ofrece a la vez sus casillas y los objetivos que alcanza desde donde va a
 * estar: su casilla planeada o, si no se mueve, la suya. Colocar una carta es el único modo aparte: solo
 * las casillas donde cabe. Los planes del equipo quedan en silueta y marca: el fantasma de cada ninja,
 * una marca sobre cada objetivo elegido, con quienes lo eligieron, y la miniatura de cada carta colocada.
 *
 * El tablero muestra lo que se puede hacer, no el resultado. Lo demás es a pedido: con el ratón, o con
 * las ayudas opcionales (D-78), que vienen apagadas.
 *
 * Ningún tinte se mezcla con otro: cada casilla lleva un solo relleno. Si es una opción del ninja activo,
 * se ve su color; si no, el del alcance de un gólem; y si no, el del área de una carta. Las demás capas le
 * ponen, como mucho, un borde.
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

/** Una casilla al alcance de un gólem. `tint`: lleva el relleno del alcance; si no, solo su borde. */
export interface ReachTile {
  at: Vec;
  tint: boolean;
}

/**
 * Las cartas colocadas en una misma casilla: cada una deja su miniatura, y entre todas, un solo contorno
 * de su área de 3×3.
 */
export interface PlacedCards {
  at: Vec;
  /** En orden Fuego, Agua, Nieve: cada elemento tiene su lugar fijo en la casilla. */
  cards: { ninja: ElementKind; value: number | null }[];
  /** El área de 3×3, recortada en los bordes del tablero. */
  area: Vec[];
  /**
   * El área completa: su color y las casillas que rellena. Se ve para el ninja activo dueño de una de las
   * cartas, o con el ratón sobre la casilla; si no es `null`, y del área queda solo el contorno.
   */
  full: { color: ElementKind; tint: Vec[] } | null;
  /** Con el ratón sobre la casilla, las miniaturas pasan al frente de la unidad que esté en ella. */
  raised: boolean;
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
  /** Las cartas ya colocadas, agrupadas por casilla. */
  cards: PlacedCards[];
  /** Dos o más ninjas juegan carta este turno (R-18): sus miniaturas lo anuncian. */
  combo: boolean;
  /** El orden real en que actuará cada ninja (R-11, D-32), en la casilla desde la que actúa. */
  order: { ninja: ElementKind; at: Vec; n: number }[];
  /** Líneas de mira: solo las que pide el ratón. */
  aims: AimLine[];

  /** Ayuda "Ver el alcance de los enemigos" (D-78): lo que puede golpear el gólem que está bajo el ratón. */
  threat: ReachTile[];
  /**
   * Ayuda "Ver el daño antes de confirmar" (D-78): la vida que perdería cada gólem con los planes y con lo
   * que el ninja activo está apuntando.
   */
  losses: { id: string; loss: number }[];

  hover: Vec | null;
}

type BoardState = Pick<
  AppState,
  'phase' | 'screen' | 'settings' | 'local' | 'match' | 'plans' | 'active' | 'pendingCard' | 'hover'
>;

/** Lo que muestra el tablero mientras se planifica; `null` fuera de la planificación. */
export function boardLayers(s: BoardState): BoardLayers | null {
  const m = s.match;
  if (s.phase !== 'planning' || !m || s.screen !== 'battle') return null;
  const { hover } = s;
  const aids = activeAids(s);
  const info = activeInfo(s);
  const mode: BoardMode | null = !info ? null : s.pendingCard ? 'card' : 'plan';
  const layers: BoardLayers = {
    mode,
    active: null,
    moves: [],
    stay: null,
    moved: false,
    reviveSpots: [],
    options: [],
    card: null,
    ghosts: [],
    path: null,
    marks: [],
    cards: [],
    combo: false,
    order: [],
    aims: [],
    threat: [],
    losses: [],
    hover,
  };
  const plans = plansArray(s.plans);
  /** Lo que el ninja activo está apuntando con el ratón, sin haberlo elegido todavía. */
  let aiming: Plan | null = null;

  if (info) {
    layers.active = { ninja: info.ninja.id, at: info.ninja.pos };
    if (mode === 'card') {
      const fits = hover !== null && info.cardTiles.some((t) => eq(t, hover));
      const area = hover && fits ? area3x3(hover) : [];
      layers.card = {
        tiles: info.cardTiles,
        area,
        enemies: area.filter((t) => enemyAt(m, t)),
        // Solo la carta de Nieve hace algo por los ninjas del área: los cura o los revive.
        allies: info.ninja.id === 'snow' ? area.filter((t) => ninjaAt(m, t)) : [],
      };
      if (hover && fits && s.pendingCard) {
        aiming = { ...info.plan, action: { type: 'card', cardId: s.pendingCard, at: hover } };
      }
    } else {
      // Las casillas valen siempre: tras moverse, otro clic cambia de destino.
      layers.moves = [...info.moves.values()].map((path) => path[path.length - 1] as Vec);
      layers.stay = info.ninja.pos;
      layers.moved = !!info.plan.moveTo;
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
      const aimed = hover ? info.attack.find((e) => eq(e.pos, hover)) : undefined;
      if (aimed) aiming = { ...info.plan, action: { type: 'attack', targetId: aimed.id } };
    }
  }
  /** Las casillas que son una opción del ninja activo: ahí se ve solo su color. */
  const options = new Set([...layers.moves, ...(layers.stay ? [layers.stay] : [])].map(key));

  // Ayuda de alcance: lo que puede golpear el gólem que está bajo el ratón.
  const watched = aids.reach && mode !== 'card' && hover ? enemyAt(m, hover) : undefined;
  if (watched) layers.threat = threatTiles(m, watched).map((at) => ({ at, tint: !options.has(key(at)) }));
  const reached = new Set(layers.threat.filter((t) => t.tint).map((t) => key(t.at)));

  // Planes de todos los ninjas: fantasmas, marcas sobre los objetivos, cartas y orden de resolución.
  const order = resolutionOrder(m, plans);
  const marks = new Map<string, TargetMark>();
  const placed = new Map<string, PlacedCards>();
  let played = 0;
  /** Las miras de todos los planes, con la casilla donde está hoy cada ninja. */
  const planned: (AimLine & { stands: Vec })[] = [];
  // En orden Fuego, Agua, Nieve: así quedan las marcas, los puntos y las miniaturas.
  for (const id of ELEMENTS) {
    const plan = s.plans[id];
    const n = getNinja(m, id);
    if (!plan || !n || n.hp <= 0) continue;
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
      if (value !== null) played += 1;
      const group = placed.get(key(a.at)) ?? { at: a.at, cards: [], area: area3x3(a.at), full: null, raised: false };
      group.cards.push({ ninja: n.id, value });
      placed.set(key(a.at), group);
    } else if (a) {
      const target = a.type === 'attack' ? getEnemy(m, a.targetId) : getNinja(m, a.targetId);
      if (target) {
        const mark = `${a.type}:${key(target.pos)}`;
        const entry = marks.get(mark) ?? { kind: a.type, at: target.pos, by: [] };
        entry.by.push(n.id);
        marks.set(mark, entry);
        planned.push({ kind: a.type, by: n.id, from, to: target.pos, stands: n.pos });
      }
    }
    const num = order[n.id];
    if (num) layers.order.push({ ninja: n.id, at: from, n: num });
  }
  layers.marks = [...marks.values()];
  layers.combo = played >= 2;

  for (const group of placed.values()) {
    if (mode !== 'card') {
      const over = hover !== null && eq(hover, group.at);
      const owner = group.cards.find((c) => c.ninja === s.active);
      // El área completa, para el ninja activo dueño de una de las cartas, o con el ratón sobre la casilla.
      if (owner || over) {
        const color = (owner ?? group.cards[0])?.ninja;
        const tint = group.area.filter((t) => !options.has(key(t)) && !reached.has(key(t)));
        if (color) group.full = { color, tint };
      }
      group.raised = over;
    }
    layers.cards.push(group);
  }

  if (hover && mode !== 'card') {
    // La mira de un plan se ve al pasar el ratón por su objetivo, por quien actúa o por su fantasma.
    layers.aims = planned
      .filter((a) => eq(a.to, hover) || eq(a.from, hover) || eq(a.stands, hover))
      .map(({ stands: _stands, ...aim }) => aim);
  }

  if (aids.damage) {
    // Los planes tal como están, más lo que el ninja activo está apuntando.
    const aimed = aiming;
    const counted = aimed ? [...plans.filter((p) => p.ninjaId !== aimed.ninjaId), aimed] : plans;
    layers.losses = Object.entries(plannedDamage(m, counted)).map(([id, loss]) => ({ id, loss }));
  }
  return layers;
}
