import { BALANCE, ELEMENTS, type EnemyStats, type NinjaStats } from './balance';
import { allTiles, area3x3, bfs, chebyshev, inBounds, key, manhattan, pathTo } from './grid';
import type { Action, ElementKind, Enemy, MatchState, Ninja, Plan, Vec } from './types';

/*
 * Consultas puras sobre el estado. Las usan la UI (para resaltar casillas),
 * el bot y el propio motor (para validar planes). Todas miden a los objetivos
 * en su posición al inicio del turno y al actor desde su casilla planificada.
 */

export const ninjaStats = (n: Ninja): NinjaStats => BALANCE.ninjas[n.element];
export const enemyStats = (e: Enemy): EnemyStats => BALANCE.enemies[e.kind];
export const isAlive = (u: { hp: number }): boolean => u.hp > 0;

export const getNinja = (s: MatchState, id: string): Ninja | undefined => s.ninjas.find((n) => n.id === id);
export const getEnemy = (s: MatchState, id: string): Enemy | undefined => s.enemies.find((e) => e.id === id);
export const livingNinjas = (s: MatchState): Ninja[] => s.ninjas.filter(isAlive);
export const livingEnemies = (s: MatchState): Enemy[] => s.enemies.filter(isAlive);

export const isRock = (s: MatchState, v: Vec): boolean => s.rocks.some((r) => r.x === v.x && r.y === v.y);
/** Ninja en la casilla (en pie o caído: los caídos siguen ocupando su casilla). */
export const ninjaAt = (s: MatchState, v: Vec): Ninja | undefined =>
  s.ninjas.find((n) => n.pos.x === v.x && n.pos.y === v.y);
export const enemyAt = (s: MatchState, v: Vec): Enemy | undefined =>
  s.enemies.find((e) => e.hp > 0 && e.pos.x === v.x && e.pos.y === v.y);

export const isFree = (s: MatchState, v: Vec): boolean =>
  inBounds(v) && !isRock(s, v) && !ninjaAt(s, v) && !enemyAt(s, v);

/**
 * R-05. Destinos posibles de un ninja con su camino (inicio incluido).
 * Los ninjas atraviesan aliados pero no enemigos ni rocas; el destino debe
 * estar libre al inicio del turno y no reservado por el plan de otro ninja.
 */
export function moveOptions(s: MatchState, ninjaId: string, plans: readonly Plan[] = []): Map<string, Vec[]> {
  const out = new Map<string, Vec[]>();
  const n = getNinja(s, ninjaId);
  if (!n || n.hp <= 0) return out;
  const reserved = new Set<string>();
  for (const p of plans) if (p.ninjaId !== ninjaId && p.moveTo) reserved.add(key(p.moveTo));
  const nodes = bfs(n.pos, ninjaStats(n).move, (v) => !isRock(s, v) && !enemyAt(s, v));
  for (const [k, node] of nodes) {
    if (node.dist === 0) continue;
    if (!isFree(s, node.pos) || reserved.has(k)) continue;
    out.set(k, pathTo(nodes, node.pos));
  }
  return out;
}

export function canMoveTo(s: MatchState, ninjaId: string, to: Vec, plans: readonly Plan[] = []): boolean {
  return moveOptions(s, ninjaId, plans).has(key(to));
}

/** R-07. Enemigos a distancia ≤ alcance desde `from`. */
export function attackTargets(s: MatchState, ninjaId: string, from: Vec): Enemy[] {
  const n = getNinja(s, ninjaId);
  if (!n || n.hp <= 0) return [];
  const range = ninjaStats(n).range;
  return livingEnemies(s).filter((e) => manhattan(from, e.pos) <= range);
}

/** R-08. Solo Nieve: aliados en pie, heridos, distintos de sí misma y a distancia ≤ alcance. */
export function healTargets(s: MatchState, ninjaId: string, from: Vec): Ninja[] {
  const n = getNinja(s, ninjaId);
  if (!n || n.hp <= 0 || ninjaStats(n).heal <= 0) return [];
  const range = ninjaStats(n).range;
  return s.ninjas.filter((a) => a.id !== n.id && a.hp > 0 && a.hp < a.maxHp && manhattan(from, a.pos) <= range);
}

/** R-09. Aliados caídos en una de las 8 casillas vecinas a `from`. */
export function reviveTargets(s: MatchState, ninjaId: string, from: Vec): Ninja[] {
  const n = getNinja(s, ninjaId);
  if (!n || n.hp <= 0) return [];
  return s.ninjas.filter((a) => a.id !== n.id && a.hp <= 0 && chebyshev(from, a.pos) === 1);
}

/** R-16. Casillas donde se puede colocar una carta: distancia ≤ movimiento desde `from`. */
export function cardTiles(s: MatchState, ninjaId: string, from: Vec): Vec[] {
  const n = getNinja(s, ninjaId);
  if (!n || n.hp <= 0) return [];
  const reach = ninjaStats(n).move;
  const out: Vec[] = [];
  for (let y = 0; y < BALANCE.grid.height; y++) {
    for (let x = 0; x < BALANCE.grid.width; x++) {
      if (manhattan(from, { x, y }) <= reach) out.push({ x, y });
    }
  }
  return out;
}

export const cardArea = (at: Vec): Vec[] => area3x3(at);

export function unitsInArea(s: MatchState, area: readonly Vec[]): { ninjas: Ninja[]; enemies: Enemy[] } {
  const keys = new Set(area.map(key));
  return {
    ninjas: s.ninjas.filter((n) => keys.has(key(n.pos))),
    enemies: s.enemies.filter((e) => e.hp > 0 && keys.has(key(e.pos))),
  };
}

export function isActionValid(s: MatchState, ninjaId: string, from: Vec, action: Action): boolean {
  switch (action.type) {
    case 'attack':
      return attackTargets(s, ninjaId, from).some((e) => e.id === action.targetId);
    case 'heal':
      return healTargets(s, ninjaId, from).some((a) => a.id === action.targetId);
    case 'revive':
      return reviveTargets(s, ninjaId, from).some((a) => a.id === action.targetId);
    case 'card': {
      const n = getNinja(s, ninjaId);
      if (!n?.hand.some((c) => c.id === action.cardId)) return false;
      return inBounds(action.at) && manhattan(from, action.at) <= ninjaStats(n).move;
    }
  }
}

/** Casilla desde la que actúa un ninja: su destino planificado o su posición actual. */
export function actionOrigin(s: MatchState, plan: Plan): Vec {
  const n = getNinja(s, plan.ninjaId);
  if (!n) throw new Error(`Ninja desconocido: ${plan.ninjaId}`);
  return plan.moveTo ?? n.pos;
}

/**
 * Descarta las partes inválidas de los planes, en orden de resolución
 * (Fuego, Agua, Nieve), respetando las reservas de casilla (R-05, R-06).
 */
export function sanitizePlans(s: MatchState, plans: readonly Plan[]): Plan[] {
  const out: Plan[] = [];
  for (const id of ELEMENTS) {
    const raw = plans.find((p) => p.ninjaId === id);
    const n = getNinja(s, id);
    if (!raw || !n || n.hp <= 0) continue;
    const clean: Plan = { ninjaId: id };
    if (raw.moveTo && canMoveTo(s, id, raw.moveTo, out)) clean.moveTo = { x: raw.moveTo.x, y: raw.moveTo.y };
    const from = clean.moveTo ?? n.pos;
    if (raw.action && isActionValid(s, id, from, raw.action)) clean.action = structuredClone(raw.action);
    out.push(clean);
  }
  return out;
}

export const ninjaOrder = (id: ElementKind): number => ELEMENTS.indexOf(id);

/**
 * Casillas que un enemigo puede golpear en la próxima fase enemiga: todo lo que
 * queda a su alcance desde cualquier casilla a la que pueda llegar (R-05, R-12).
 */
export function enemyThreatTiles(s: MatchState, e: Enemy): Vec[] {
  const st = enemyStats(e);
  const nodes = bfs(e.pos, st.move, (v) => !isRock(s, v) && !ninjaAt(s, v));
  const stands: Vec[] = [];
  for (const node of nodes.values()) {
    const other = enemyAt(s, node.pos);
    if (!other || other.id === e.id) stands.push(node.pos);
  }
  return allTiles().filter((t) => !isRock(s, t) && stands.some((p) => manhattan(p, t) <= st.range));
}

/**
 * ¿Algún enemigo puede golpear esta casilla en la próxima fase enemiga?
 * Los aturdidos no cuentan: pierden su turno (R-19).
 */
export function isThreatened(s: MatchState, v: Vec): boolean {
  return s.enemies.some(
    (e) => e.hp > 0 && !e.stunned && enemyThreatTiles(s, e).some((t) => t.x === v.x && t.y === v.y),
  );
}
