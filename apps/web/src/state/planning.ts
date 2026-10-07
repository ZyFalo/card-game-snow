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
    revive: reviveTargets(m, ninja.id, from, others),
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

/** El plan de un ninja sin su acción. */
export const withoutAction = (plan: Plan): Plan =>
  plan.moveTo ? { ninjaId: plan.ninjaId, moveTo: plan.moveTo } : { ninjaId: plan.ninjaId };

/** ¿Tiene ese ninja con qué actuar desde su casilla planeada: un objetivo a su alcance o una carta en la mano? */
export function canAct(m: MatchState, plans: AppState['plans'], id: ElementKind): boolean {
  const n = getNinja(m, id);
  if (!n || n.hp <= 0) return false;
  const from = plans[id]?.moveTo ?? n.pos;
  const others = plansArray(plans).filter((p) => p.ninjaId !== id);
  return (
    n.hand.length > 0 ||
    attackTargets(m, id, from).length > 0 ||
    healTargets(m, id, from).length > 0 ||
    reviveTargets(m, id, from, others).length > 0
  );
}

/** R-09: el ninja que ya planeó revivir a ese caído, si lo hay. Un caído solo puede tener un reanimador. */
export function reviverOf(plans: AppState['plans'], fallen: ElementKind): ElementKind | null {
  const plan = plansArray(plans).find((p) => p.action?.type === 'revive' && p.action.targetId === fallen);
  return plan ? plan.ninjaId : null;
}

/** ¿Le queda a ese ninja algo por decidir? Con acción, no; si ya se movió y no tiene con qué actuar, tampoco. */
export function hasPending(m: MatchState, plans: AppState['plans'], id: ElementKind): boolean {
  const n = getNinja(m, id);
  if (!n || n.hp <= 0) return false;
  const plan = plans[id];
  if (plan?.action) return false;
  return !plan?.moveTo || canAct(m, plans, id);
}

/** El siguiente ninja con algo por decidir, en orden Fuego, Agua, Nieve, sin contar al de partida. */
export function nextPending(m: MatchState, plans: AppState['plans'], from: ElementKind | null): ElementKind | null {
  const start = from ? ELEMENTS.indexOf(from) : -1;
  const others = from ? ELEMENTS.length - 1 : ELEMENTS.length;
  for (let i = 1; i <= others; i++) {
    const id = ELEMENTS[(start + i) % ELEMENTS.length] as ElementKind;
    if (hasPending(m, plans, id)) return id;
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

/** La acción de un plan, con palabras y en minúscula: "atacar a Témpano". */
function actionLabel(action: NonNullable<Plan['action']>, m: MatchState): string {
  switch (action.type) {
    case 'attack': {
      const e = getEnemy(m, action.targetId);
      return PLAN_TEXT.attack(e ? ENEMY_TEXT[e.kind].name : undefined);
    }
    case 'heal':
      return PLAN_TEXT.heal(NINJA_TEXT[action.targetId as ElementKind]?.name);
    case 'revive':
      return PLAN_TEXT.revive(NINJA_TEXT[action.targetId as ElementKind]?.name);
    case 'card':
      return PLAN_TEXT.card;
  }
}

/**
 * El resumen del plan de un ninja para su panel, sin números: "Moverse → atacar a Témpano". `spoken` da
 * el mismo resumen para quien lo oye: sin la flecha.
 */
export function planLabel(plan: Plan | undefined, ninja: Ninja, m: MatchState, spoken = false): string {
  const status = planStatus(plan, ninja);
  if (status === 'ko') return PLAN_TEXT.ko;
  if (status === 'none') return PLAN_TEXT.none;
  if (!plan?.action) return PLAN_TEXT.move;
  const action = actionLabel(plan.action, m);
  if (!plan.moveTo) return action.charAt(0).toUpperCase() + action.slice(1);
  return spoken ? PLAN_TEXT.moveThenSpoken(action) : PLAN_TEXT.moveThen(action);
}

/** Casillas que un enemigo puede golpear el próximo turno: lo que pinta la ayuda de alcance (D-78). */
export const threatTiles = (m: MatchState, e: Enemy): Vec[] => enemyThreatTiles(m, e);

export const tileKey = key;

/**
 * R-09: la primera vez que cae un ninja en la partida, el consejo de cómo revivir lo nombra. `seen` dice
 * si ese consejo ya salió.
 */
export function firstFallTip(m: MatchState, seen: boolean): ElementKind | null {
  if (seen) return null;
  return m.ninjas.find((n) => n.hp <= 0)?.id ?? null;
}

type TipState = Pick<
  AppState,
  'phase' | 'resolveStep' | 'boosting' | 'match' | 'plans' | 'active' | 'pendingCard' | 'hover' | 'reviveTip'
>;

/** Consejo contextual para la barra superior (§9.5). */
export function contextualTip(s: TipState): string | null {
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
      return TIP_TEXT.enemy(t.name, t.tip);
    }
  }
  const info = activeInfo(s);
  if (!info) return TIP_TEXT.confirm;
  const name = NINJA_TEXT[info.ninja.id].name;
  if (s.pendingCard) return TIP_TEXT.placeCard(name);
  if (!info.plan.action) {
    if (!info.plan.moveTo) {
      // La primera vez que cae un ninja, el consejo de ese momento explica cómo se le revive (R-09).
      const fallen = s.reviveTip ? getNinja(m, s.reviveTip) : undefined;
      if (fallen && fallen.hp <= 0) return TIP_TEXT.reviveHow(NINJA_TEXT[fallen.id].name);
      return TIP_TEXT.plan(name);
    }
    // Ya eligió casilla: le falta qué hacer, si desde ahí tiene con qué.
    if (canAct(m, s.plans, info.ninja.id)) return TIP_TEXT.act(name);
  }
  // Este ninja ya no tiene nada por decidir, aunque siga activo: el foco no salta tras moverse. Quiénes
  // faltan, o todo listo.
  const pending = ELEMENTS.filter((id) => id !== info.ninja.id && hasPending(m, s.plans, id));
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
