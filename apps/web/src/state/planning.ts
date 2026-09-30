import {
  attackTargets,
  BALANCE,
  cardTiles,
  difficultyConfig,
  ELEMENTS,
  type ElementKind,
  type Enemy,
  enemyAt,
  enemyThreatTiles,
  getEnemy,
  getNinja,
  healTargets,
  key,
  type MatchState,
  moveOptions,
  type Ninja,
  type Plan,
  reviveTargets,
  type Vec,
} from '@ventisca/core';
import { BONUS_PROGRESS, ENEMY_TEXT, ES, NINJA_TEXT, type Pace, PLAN_TEXT, TIP_TEXT } from '../i18n/es';
import type { AppState } from './store';

/** R-04: el reloj da 10 s por ninja en pie que controla el jugador, según el ritmo; Relajado no tiene reloj. */
export function turnClockMs(pace: Pace, living: number): number | null {
  const mult = BALANCE.paceMultiplier[pace];
  if (!mult) return null;
  return Math.max(1, living) * BALANCE.planSecondsPerNinja * mult * 1000;
}

export const plansArray = (plans: AppState['plans']): Plan[] =>
  ELEMENTS.flatMap((id) => {
    const p = plans[id];
    return p ? [p] : [];
  });

export interface ActiveInfo {
  ninja: Ninja;
  plan: Plan;
  from: Vec;
  moves: Map<string, Vec[]>;
  attack: Enemy[];
  heal: Ninja[];
  revive: Ninja[];
  cardTiles: Vec[];
}

/** Todo lo que puede hacer el ninja activo desde su casilla planificada. */
export function activeInfo(s: Pick<AppState, 'match' | 'plans' | 'active' | 'pendingCard'>): ActiveInfo | null {
  const m = s.match;
  if (!m || !s.active) return null;
  const ninja = getNinja(m, s.active);
  if (!ninja || ninja.hp <= 0) return null;
  const plan = s.plans[s.active] ?? { ninjaId: s.active };
  const from = plan.moveTo ?? ninja.pos;
  const others = plansArray(s.plans).filter((p) => p.ninjaId !== s.active);
  return {
    ninja,
    plan,
    from,
    moves: moveOptions(m, ninja.id, others),
    attack: attackTargets(m, ninja.id, from),
    heal: healTargets(m, ninja.id, from),
    revive: reviveTargets(m, ninja.id, from),
    cardTiles: s.pendingCard ? cardTiles(m, ninja.id, from) : [],
  };
}

/** Siguiente ninja en pie (en orden Fuego, Agua, Nieve), opcionalmente solo los que no tienen acción. */
export function nextPlannable(
  m: MatchState,
  plans: AppState['plans'],
  from: ElementKind | null,
  dir: 1 | -1,
  onlyWithoutAction = false,
): ElementKind | null {
  const start = from ? ELEMENTS.indexOf(from) : -1;
  for (let step = 1; step <= ELEMENTS.length; step++) {
    const idx = (((start + dir * step) % ELEMENTS.length) + ELEMENTS.length) % ELEMENTS.length;
    const id = ELEMENTS[idx] as ElementKind;
    const n = getNinja(m, id);
    if (!n || n.hp <= 0) continue;
    if (onlyWithoutAction && plans[id]?.action) continue;
    return id;
  }
  return null;
}

export type PlanStatus = 'ko' | 'none' | 'move' | 'attack' | 'heal' | 'revive' | 'card';

export function planStatus(plan: Plan | undefined, ninja: Ninja): PlanStatus {
  if (ninja.hp <= 0) return 'ko';
  if (plan?.action) return plan.action.type;
  if (plan?.moveTo) return 'move';
  return 'none';
}

export function planLabel(plan: Plan | undefined, ninja: Ninja, m: MatchState): string {
  const status = planStatus(plan, ninja);
  const action = plan?.action;
  switch (status) {
    case 'ko':
      return PLAN_TEXT.ko;
    case 'none':
      return PLAN_TEXT.none;
    case 'move':
      return PLAN_TEXT.move;
    case 'attack': {
      const e = action?.type === 'attack' ? getEnemy(m, action.targetId) : undefined;
      return PLAN_TEXT.attack(e ? ENEMY_TEXT[e.kind].name : undefined);
    }
    case 'heal':
      return PLAN_TEXT.heal(action?.type === 'heal' ? NINJA_TEXT[action.targetId as ElementKind].name : undefined);
    case 'revive':
      return PLAN_TEXT.revive(action?.type === 'revive' ? NINJA_TEXT[action.targetId as ElementKind].name : undefined);
    case 'card': {
      const card = action?.type === 'card' ? ninja.hand.find((c) => c.id === action.cardId) : undefined;
      return PLAN_TEXT.card(card?.value);
    }
  }
}

/** Casillas que un enemigo puede golpear el próximo turno (vista previa al pasar el cursor). */
export const threatTiles = (m: MatchState, e: Enemy): Vec[] => enemyThreatTiles(m, e);

export const tileKey = key;

/** Consejo contextual para la barra superior (§9.5). */
export function contextualTip(s: AppState): string | null {
  const m = s.match;
  if (s.phase === 'intro') return TIP_TEXT.intro;
  if (s.phase === 'resolving') {
    const hint = s.boosting ? ES.accelerating : TIP_TEXT.holdToBoost;
    if (s.resolveStep === 'enemies') return TIP_TEXT.enemies(hint);
    if (s.resolveStep === 'end') return TIP_TEXT.end(hint);
    return TIP_TEXT.ninjas(hint);
  }
  if (s.phase !== 'planning' || !m) return null;
  if (s.hover) {
    const e = enemyAt(m, s.hover);
    if (e && !s.pendingCard) {
      const t = ENEMY_TEXT[e.kind];
      return TIP_TEXT.enemy(t.name, t.role, e.hp, e.maxHp, t.tip);
    }
  }
  const info = activeInfo(s);
  if (!info) return TIP_TEXT.confirm;
  const name = NINJA_TEXT[info.ninja.id].name;
  if (s.pendingCard) return TIP_TEXT.placeCard(name);
  if (!info.plan.moveTo && !info.plan.action) return TIP_TEXT.start(name);
  if (!info.plan.action) return TIP_TEXT.action(name);
  const pending = ELEMENTS.filter((id) => {
    const n = getNinja(m, id);
    return n && n.hp > 0 && !s.plans[id]?.action;
  });
  if (pending.length > 0) {
    return TIP_TEXT.pending(pending.map((id) => NINJA_TEXT[id].name));
  }
  return TIP_TEXT.ready;
}

/** Progreso de la condición del bonus (R-21) para la ficha de ronda del HUD. */
export function bonusProgress(v: MatchState): { text: string; cls: string } {
  if (v.round === 'bonus') return { text: BONUS_PROGRESS.unlocked, cls: 'ok' };
  switch (v.bonusCondition) {
    case 'noKo': {
      const ok = !v.ninjas.some((n) => n.everKo);
      return { text: ok ? BONUS_PROGRESS.noKoOk : BONUS_PROGRESS.noKoBad, cls: ok ? 'ok' : 'bad' };
    }
    case 'fullHealth': {
      const full = v.ninjas.every((n) => n.hp === n.maxHp);
      return { text: full ? BONUS_PROGRESS.fullOk : BONUS_PROGRESS.fullBad, cls: full ? 'ok' : 'bad' };
    }
    case 'turnLimit': {
      const n = difficultyConfig(v.difficulty).bonusTurnLimit;
      // El turno que se planifica (o se resuelve) es el siguiente a los ya resueltos.
      const t = v.turn + 1;
      const left = n - t + 1;
      return { text: ES.turnLimitProgress(t, n), cls: left > 2 ? 'ok' : left > 0 ? '' : 'bad' };
    }
  }
}
