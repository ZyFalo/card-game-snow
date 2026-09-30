import { BALANCE, ELEMENTS } from './balance';
import { area3x3, eq, manhattan } from './grid';
import {
  attackTargets,
  cardTiles,
  enemyStats,
  getNinja,
  healTargets,
  isThreatened,
  livingEnemies,
  livingNinjas,
  moveOptions,
  ninjaStats,
  reviveTargets,
} from './queries';
import type { Rng } from './rng';
import type { Action, Card, Enemy, MatchState, Ninja, Plan, Vec } from './types';

/*
 * Bot de ninjas (§8 del PRD). Es una IA de utilidad simple y determinista:
 * evalúa cada casilla alcanzable y cada acción posible y se queda con la de
 * mayor puntaje. Se usa para simular partidas (balance) y para "sugerir jugada".
 */

export interface BotOptions {
  /** 1 = siempre la mejor opción. Con menos, a veces elige entre las 3 mejores. */
  skill?: number;
  rng?: Rng;
}

interface Candidate {
  pos: Vec;
  action?: Action;
  score: number;
}

/** Plan completo del equipo, respetando reservas de casilla y buscando combos. */
export function planTeam(s: MatchState, opts: BotOptions = {}): Plan[] {
  const plans: Plan[] = [];
  for (const id of ELEMENTS) {
    const n = getNinja(s, id);
    if (!n || n.hp <= 0) continue;
    plans.push(bestPlanFor(s, n, plans, false, opts));
  }
  // Segunda pasada: si alguien juega carta, los demás con carta evalúan sumarse al combo.
  if (plans.some((p) => p.action?.type === 'card')) {
    for (let i = 0; i < plans.length; i++) {
      const current = plans[i] as Plan;
      if (current.action?.type === 'card') continue;
      const n = getNinja(s, current.ninjaId);
      if (!n || n.hand.length === 0) continue;
      const others = plans.filter((_, j) => j !== i);
      const alt = bestPlanFor(s, n, others, true, opts);
      if (alt.action?.type === 'card') plans[i] = alt;
    }
  }
  return plans;
}

/** Sugerencia para un solo ninja, dados los planes que el jugador ya hizo. */
export function suggestPlan(s: MatchState, ninjaId: string, plans: readonly Plan[]): Plan | null {
  const n = getNinja(s, ninjaId);
  if (!n || n.hp <= 0) return null;
  const others = plans.filter((p) => p.ninjaId !== ninjaId);
  const joinCombo = others.some((p) => p.action?.type === 'card');
  return bestPlanFor(s, n, others, joinCombo, {});
}

function bestPlanFor(s: MatchState, n: Ninja, others: readonly Plan[], comboJoin: boolean, opts: BotOptions): Plan {
  const destinations = [...moveOptions(s, n.id, others).values()].map((path) => path[path.length - 1] as Vec);
  const positions = [n.pos, ...destinations];
  const enemies = livingEnemies(s);
  const candidates: Candidate[] = [];

  for (const pos of positions) {
    let bestAction: Action | undefined;
    let bestValue = 0;
    const consider = (action: Action, value: number): void => {
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    };

    for (const t of reviveTargets(s, n.id, pos)) {
      // R-09 (D-18): vuelve con 1 HP antes de la fase enemiga. Si un gólem lo alcanza, casi seguro
      // vuelve a caer: solo vale la pena si no hay nada mejor que hacer (evita bucles de revivir y caer).
      consider({ type: 'revive', targetId: t.id }, isThreatened(s, t.pos) ? 4 : 45);
    }

    for (const ally of healTargets(s, n.id, pos)) {
      const amount = Math.min(boosted(n, ninjaStats(n).heal), ally.maxHp - ally.hp);
      const urgency = ally.hp / ally.maxHp < 0.4 ? 10 : 0;
      consider({ type: 'heal', targetId: ally.id }, amount * 1.5 + urgency);
    }

    for (const e of attackTargets(s, n.id, pos)) {
      const dmg = boosted(n, ninjaStats(n).attack);
      const value = Math.min(dmg, e.hp) + (dmg >= e.hp ? 14 : 0) + threatWeight(e);
      consider({ type: 'attack', targetId: e.id }, value);
    }

    const card = bestCard(n);
    if (card) {
      for (const tile of cardTiles(s, n.id, pos)) {
        const r = evaluateCard(s, n, pos, others, card, tile);
        const eligible = comboJoin ? r.hits >= 1 || r.heal > 0 : r.hits >= 2 || r.kills >= 1 || r.heal >= 12;
        if (eligible) consider({ type: 'card', cardId: card.id, at: tile }, r.value + (comboJoin ? 12 : 0));
      }
    }

    const candidate: Candidate = { pos, score: positionScore(s, n, pos, enemies) + bestValue };
    if (bestAction) candidate.action = bestAction;
    candidates.push(candidate);
  }

  // Orden estable: ante empate gana la casilla evaluada primero (quedarse quieto).
  candidates.sort((a, b) => b.score - a.score);
  let choice = candidates[0] as Candidate;
  const skill = opts.skill ?? 1;
  if (skill < 1 && opts.rng && opts.rng.next() > skill) choice = opts.rng.pick(candidates.slice(0, 3));

  const plan: Plan = { ninjaId: n.id };
  if (!eq(choice.pos, n.pos)) plan.moveTo = choice.pos;
  if (choice.action) plan.action = choice.action;
  return plan;
}

const boosted = (n: Ninja, base: number): number => (n.boost ? Math.floor(base * BALANCE.boostMultiplier) : base);

function bestCard(n: Ninja): Card | undefined {
  let best: Card | undefined;
  for (const c of n.hand) if (!best || c.value > best.value) best = c;
  return best;
}

function threatWeight(e: Enemy): number {
  switch (e.kind) {
    case 'artillery':
      return 3;
    case 'sniper':
      return 2;
    case 'colossus':
      return 2;
  }
}

/** Suma del daño de los enemigos que podrían alcanzar la casilla en su próximo turno. */
function threatAt(pos: Vec, enemies: readonly Enemy[]): number {
  let threat = 0;
  for (const e of enemies) {
    const st = enemyStats(e);
    if (manhattan(e.pos, pos) <= st.move + st.range) threat += st.attack;
  }
  return threat;
}

function positionScore(s: MatchState, n: Ninja, pos: Vec, enemies: readonly Enemy[]): number {
  if (enemies.length === 0) return 0;
  const threat = threatAt(pos, enemies);
  const nearest = Math.min(...enemies.map((e) => manhattan(pos, e.pos)));
  switch (n.element) {
    case 'water':
      return -1.2 * nearest - 0.15 * threat;
    case 'fire':
      return -0.6 * threat - 0.8 * Math.abs(nearest - 2);
    case 'snow': {
      const allies = livingNinjas(s).filter((a) => a.id !== n.id);
      const spread = allies.length
        ? allies.reduce((acc, a) => acc + Math.max(0, manhattan(pos, a.pos) - 3), 0) / allies.length
        : 0;
      return -0.8 * threat - 0.6 * Math.abs(nearest - 3) - 0.3 * spread;
    }
  }
}

interface CardEval {
  value: number;
  hits: number;
  kills: number;
  heal: number;
}

function evaluateCard(s: MatchState, n: Ninja, pos: Vec, others: readonly Plan[], card: Card, at: Vec): CardEval {
  const area = area3x3(at);
  const inArea = (v: Vec): boolean => area.some((a) => eq(a, v));
  const dmg = card.element === 'water' ? card.value * BALANCE.waterCardMultiplier : card.value;
  const r: CardEval = { value: 0, hits: 0, kills: 0, heal: 0 };
  for (const e of livingEnemies(s)) {
    if (!inArea(e.pos)) continue;
    r.hits += 1;
    r.value += Math.min(dmg, e.hp);
    if (dmg >= e.hp) {
      r.kills += 1;
      r.value += 14;
    } else if (card.element === 'fire') {
      r.value += 5; // aturdir a quien sigue en pie vale un turno enemigo
    }
  }
  if (card.element === 'snow') {
    for (const ally of s.ninjas) {
      const where = ally.id === n.id ? pos : (others.find((p) => p.ninjaId === ally.id)?.moveTo ?? ally.pos);
      if (!inArea(where)) continue;
      if (ally.hp <= 0) {
        r.heal += card.value;
        r.value += 30;
      } else {
        const h = Math.min(card.value, ally.maxHp - ally.hp);
        r.heal += h;
        r.value += h * 1.2;
      }
    }
  }
  return r;
}
