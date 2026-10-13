import { canMoveTo, type ElementKind, eq, getNinja, isActionValid, type MatchState, type Plan } from '@ventisca/core';
import type { SeatPlan, ServerPayload } from '@ventisca/protocol';

/*
 * La validación de los planes (R-35, D-102). El servidor revisa cada plan con el motor en cuanto llega, y
 * guarda solo lo que vale. Entre personas rige el orden de llegada: si dos quieren la misma casilla o el
 * mismo caído, se lo queda quien lo eligió primero, y a la otra se le avisa.
 *
 * Así los planes guardados nunca chocan entre sí, y al resolver el turno el motor no descarta nada.
 */

export type PlanFix = Pick<Extract<ServerPayload, { type: 'plan.fix' }>, 'reason' | 'by'>;

export interface PlanCheck {
  /** Lo que quedó del plan; `null` si no quedó nada. */
  plan: Plan | null;
  /** Por qué se quitó una parte, si se quitó alguna. */
  fix: PlanFix | null;
}

/**
 * Revisa el plan que una persona quiere para su ninja, contra el estado de la partida y los planes ya
 * aceptados de los demás. Lo que no vale se quita: la casilla, la acción o las dos cosas.
 */
export function checkPlan(state: MatchState, seat: ElementKind, wanted: SeatPlan, others: readonly Plan[]): PlanCheck {
  const ninja = getNinja(state, seat);
  if (!ninja || ninja.hp <= 0) return { plan: null, fix: wanted.moveTo || wanted.action ? invalid : null };
  let fix: PlanFix | null = null;
  const plan: Plan = { ninjaId: seat };

  if (wanted.moveTo) {
    const to = wanted.moveTo;
    if (canMoveTo(state, seat, to, others)) plan.moveTo = { x: to.x, y: to.y };
    else {
      // Llega hasta ahí, pero alguien la reservó antes; o no llega, y entonces el plan no vale.
      const holder = canMoveTo(state, seat, to) ? others.find((p) => p.moveTo && eq(p.moveTo, to)) : undefined;
      fix = holder ? { reason: 'tile_reserved', by: holder.ninjaId } : invalid;
    }
  }

  if (wanted.action) {
    // La acción se mide desde donde va a estar: la casilla que quedó, o la suya.
    const from = plan.moveTo ?? ninja.pos;
    const action = wanted.action;
    if (isActionValid(state, seat, from, action, others)) plan.action = structuredClone(action);
    else {
      const reviver =
        action.type === 'revive' && isActionValid(state, seat, from, action)
          ? others.find((p) => p.action?.type === 'revive' && p.action.targetId === action.targetId)
          : undefined;
      // Si ya había un motivo por la casilla, ese es el que se dice: la acción cayó por arrastre.
      fix ??= reviver ? { reason: 'revive_taken', by: reviver.ninjaId } : invalid;
    }
  }

  return { plan: plan.moveTo || plan.action ? plan : null, fix };
}

const invalid: PlanFix = { reason: 'invalid', by: null };

/** El plan de un ninja como viaja por la red: sin decir de quién es. */
export function seatPlan(plan: Plan | undefined): SeatPlan | null {
  if (!plan) return null;
  const out: SeatPlan = {};
  if (plan.moveTo) out.moveTo = { x: plan.moveTo.x, y: plan.moveTo.y };
  if (plan.action) out.action = structuredClone(plan.action) as SeatPlan['action'];
  return out;
}
