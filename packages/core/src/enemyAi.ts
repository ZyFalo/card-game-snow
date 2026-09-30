import { difficultyConfig } from './balance';
import { bfs, distanceField, eq, inBounds, key, manhattan, neighbors8, pathTo } from './grid';
import { enemyAt, enemyStats, isRock, livingNinjas, ninjaAt } from './queries';
import type { Rng } from './rng';
import type { ElementKind, Enemy, MatchState, Ninja, Vec } from './types';

export interface EnemyDecision {
  path: Vec[];
  targetId: ElementKind | null;
}

/** R-13. Daño del francotirador: 3 + (distancia − 1), con tope. */
export function sniperDamage(e: Enemy, from: Vec, target: Vec): number {
  const st = enemyStats(e);
  const extra = (st.bonusPerTile ?? 0) * Math.max(0, manhattan(from, target) - 1);
  return Math.min(st.maxAttack ?? st.attack, st.attack + extra);
}

/** Casillas "hombro con hombro" del objetivo, en perpendicular al golpe del coloso. */
export function sweepTiles(from: Vec, target: Vec): Vec[] {
  const tiles =
    from.x === target.x
      ? [
          { x: target.x - 1, y: target.y },
          { x: target.x + 1, y: target.y },
        ]
      : [
          { x: target.x, y: target.y - 1 },
          { x: target.x, y: target.y + 1 },
        ];
  return tiles.filter(inBounds);
}

/** Casillas afectadas por el ataque de un enemigo (para animar y resaltar). */
export function enemyAttackArea(e: Enemy, from: Vec, target: Vec): Vec[] {
  switch (e.kind) {
    case 'sniper':
      return [target];
    case 'artillery':
      return [target, ...neighbors8(target)];
    case 'colossus':
      return [target, ...sweepTiles(from, target)];
  }
}

const livingAt = (s: MatchState, v: Vec): Ninja | undefined => {
  const n = ninjaAt(s, v);
  return n && n.hp > 0 ? n : undefined;
};

/** Daño total que produciría un ataque desde `from` (incluye salpicaduras). */
export function expectedDamage(s: MatchState, e: Enemy, from: Vec, target: Ninja): number {
  const st = enemyStats(e);
  switch (e.kind) {
    case 'sniper':
      return sniperDamage(e, from, target.pos);
    case 'artillery': {
      const extra = neighbors8(target.pos).filter((v) => livingAt(s, v)).length;
      return st.attack + (st.splash ?? 0) * extra;
    }
    case 'colossus': {
      const extra = sweepTiles(from, target.pos).filter((v) => livingAt(s, v)).length;
      return st.attack + (st.sweep ?? 0) * extra;
    }
  }
}

/** Dificultad Tormenta: rematar vale mucho y se prefiere al ninja con menos vida. */
function focusScore(s: MatchState, e: Enemy, from: Vec, target: Ninja): number {
  const dmg = expectedDamage(s, e, from, target);
  const kill = !target.shield && dmg >= target.hp ? 100 : 0;
  return dmg * 10 + kill + Math.round(10 * (1 - target.hp / target.maxHp));
}

/**
 * R-12. Evalúa cada casilla alcanzable (incluida la actual) y elige la
 * combinación casilla + objetivo con más daño; desempata con el RNG.
 * Si no alcanza a nadie, se acerca por camino al ninja en pie más cercano.
 */
export function decideEnemy(s: MatchState, e: Enemy, rng: Rng): EnemyDecision {
  const st = enemyStats(e);
  const nodes = bfs(e.pos, st.move, (v) => !isRock(s, v) && !ninjaAt(s, v));
  const candidates: Vec[] = [];
  for (const node of nodes.values()) {
    if (eq(node.pos, e.pos) || !enemyAt(s, node.pos)) candidates.push(node.pos);
  }
  const living = livingNinjas(s);
  const focus = difficultyConfig(s.difficulty).focusWeakest;

  let best = -1;
  let ties: { tile: Vec; target: Ninja }[] = [];
  for (const tile of candidates) {
    for (const target of living) {
      if (manhattan(tile, target.pos) > st.range) continue;
      const dmg = focus ? focusScore(s, e, tile, target) : expectedDamage(s, e, tile, target);
      if (dmg > best) {
        best = dmg;
        ties = [{ tile, target }];
      } else if (dmg === best) {
        ties.push({ tile, target });
      }
    }
  }
  if (ties.length > 0) {
    const choice = ties.length === 1 ? (ties[0] as { tile: Vec; target: Ninja }) : rng.pick(ties);
    return { path: pathTo(nodes, choice.tile), targetId: choice.target.id };
  }

  if (living.length === 0) return { path: [e.pos], targetId: null };
  const field = distanceField(
    living.map((n) => n.pos),
    (v) => !isRock(s, v),
  );
  let bestDist = Number.POSITIVE_INFINITY;
  let bestTiles: Vec[] = [];
  for (const tile of candidates) {
    const d = field.get(key(tile)) ?? Number.POSITIVE_INFINITY;
    if (d < bestDist) {
      bestDist = d;
      bestTiles = [tile];
    } else if (d === bestDist) {
      bestTiles.push(tile);
    }
  }
  if (bestTiles.length === 0 || !Number.isFinite(bestDist)) return { path: [e.pos], targetId: null };
  const tile = bestTiles.length === 1 ? (bestTiles[0] as Vec) : rng.pick(bestTiles);
  return { path: pathTo(nodes, tile), targetId: null };
}
