import { BALANCE } from './balance';
import type { Vec } from './types';

export const GRID_W = BALANCE.grid.width;
export const GRID_H = BALANCE.grid.height;

export const key = (v: Vec): string => `${v.x},${v.y}`;
export const vec = (x: number, y: number): Vec => ({ x, y });
export const eq = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
export const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Vec, b: Vec): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const inBounds = (v: Vec): boolean => v.x >= 0 && v.y >= 0 && v.x < GRID_W && v.y < GRID_H;

const DIRS4: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Todas las casillas del tablero, en orden fila por fila. */
export function allTiles(): Vec[] {
  const out: Vec[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) out.push({ x, y });
  return out;
}

/** Las 8 casillas vecinas (diagonales incluidas) dentro del tablero. */
export function neighbors8(v: Vec): Vec[] {
  const out: Vec[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = { x: v.x + dx, y: v.y + dy };
      if (inBounds(n)) out.push(n);
    }
  }
  return out;
}

/** Área de 3×3 centrada en `c`, recortada en los bordes (R-16). */
export function area3x3(c: Vec): Vec[] {
  const out: Vec[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (inBounds(n)) out.push(n);
    }
  }
  return out;
}

export interface BfsNode {
  dist: number;
  prev: string | null;
  pos: Vec;
}

/**
 * Búsqueda en anchura en 4 direcciones desde `start`, hasta `maxDist` pasos.
 * `passable` decide por qué casillas se puede pasar (el inicio siempre cuenta).
 */
export function bfs(start: Vec, maxDist: number, passable: (v: Vec) => boolean): Map<string, BfsNode> {
  const seen = new Map<string, BfsNode>();
  seen.set(key(start), { dist: 0, prev: null, pos: start });
  const queue: Vec[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift() as Vec;
    const node = seen.get(key(cur)) as BfsNode;
    if (node.dist >= maxDist) continue;
    for (const d of DIRS4) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(n);
      if (!inBounds(n) || seen.has(k) || !passable(n)) continue;
      seen.set(k, { dist: node.dist + 1, prev: key(cur), pos: n });
      queue.push(n);
    }
  }
  return seen;
}

/** Reconstruye el camino (inicio incluido) hasta `target` a partir de un resultado de bfs. */
export function pathTo(nodes: Map<string, BfsNode>, target: Vec): Vec[] {
  const out: Vec[] = [];
  let cur: BfsNode | undefined = nodes.get(key(target));
  while (cur) {
    out.push(cur.pos);
    cur = cur.prev ? nodes.get(cur.prev) : undefined;
  }
  return out.reverse();
}

/** Distancia de camino desde varias fuentes a todas las casillas alcanzables. */
export function distanceField(sources: Vec[], passable: (v: Vec) => boolean): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: Vec[] = [];
  for (const s of sources) {
    dist.set(key(s), 0);
    queue.push(s);
  }
  while (queue.length > 0) {
    const cur = queue.shift() as Vec;
    const d = dist.get(key(cur)) as number;
    for (const dir of DIRS4) {
      const n = { x: cur.x + dir.x, y: cur.y + dir.y };
      const k = key(n);
      if (!inBounds(n) || dist.has(k) || !passable(n)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}
