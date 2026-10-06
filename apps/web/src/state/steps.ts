import {
  type ElementKind,
  enemyAt,
  eq,
  isActionValid,
  isRock,
  key,
  ninjaAt,
  type Plan,
  type Vec,
} from '@ventisca/core';
import { NINJA_TEXT, NOTICE } from '../i18n/es';
import { activeInfo, plansArray, reviverOf, withoutAction } from './planning';
import type { AppState, PlanStep } from './store';

/*
 * La planificación de un ninja va en dos pasos (lineamientos de diseño, sección "Tablero"): primero
 * moverse, donde el tablero solo ofrece casillas, y después actuar, donde ofrece los objetivos y deja las
 * casillas a la vista, para cambiar de destino con otro clic. Elegir una carta cambia a un tercer modo, el
 * de colocarla, que es exclusivo. Este módulo decide qué hace cada clic en cada paso; no toca el estado:
 * devuelve lo que hay que cambiar.
 */

/** Sonidos de la planificación. */
export type StepSound = 'select' | 'place' | 'error';

export type StepState = Pick<AppState, 'match' | 'plans' | 'active' | 'pendingCard' | 'step'>;

/** Lo que cambia tras un clic o un deshacer. Lo que no aparece, se queda como estaba. */
export interface StepOutcome {
  /** El plan nuevo del ninja activo. */
  plan?: Plan;
  step?: PlanStep;
  /** Se activa otro ninja. */
  select?: ElementKind;
  /** Se sale del modo carta. */
  cardDone?: boolean;
  /** El ninja activo eligió su acción: con "Pasar al siguiente ninja", le toca al que siga. */
  finished?: true;
  notice?: string;
  sound?: StepSound;
}

const NOTHING: StepOutcome = {};

/** Qué hace un clic en una casilla, según el paso en que está el ninja activo. */
export function clickOutcome(s: StepState, v: Vec): StepOutcome {
  const m = s.match;
  if (!m) return NOTHING;
  const occupant = ninjaAt(m, v);
  const info = activeInfo(s);
  if (!info) return occupant && occupant.hp > 0 ? { select: occupant.id } : NOTHING;
  const { ninja, plan } = info;
  const name = NINJA_TEXT[ninja.id].name;
  const others = plansArray(s.plans).filter((p) => p.ninjaId !== ninja.id);
  const other = occupant && occupant.id !== ninja.id ? occupant : null;

  // Modo carta: el tablero solo ofrece dónde colocarla.
  if (s.pendingCard) {
    if (info.cardTiles.some((t) => eq(t, v))) {
      const action = { type: 'card', cardId: s.pendingCard, at: v } as const;
      return { plan: { ...withoutAction(plan), action }, cardDone: true, finished: true, sound: 'place' };
    }
    if (other && other.hp > 0) return { select: other.id };
    return { notice: NOTICE.cardOutOfRange, sound: 'error' };
  }

  const own = occupant?.id === ninja.id;
  const onGhost = !!plan.moveTo && eq(plan.moveTo, v);
  /** Un caído que el ninja activo no puede revivir: o ya lo revive otro (R-09), o le falta estar al lado. */
  const cannotRevive = (fallen: ElementKind): StepOutcome => {
    const reviver = reviverOf(s.plans, fallen);
    const text =
      reviver && reviver !== ninja.id
        ? NOTICE.reviveTaken(NINJA_TEXT[reviver].name, NINJA_TEXT[fallen].name)
        : NOTICE.reviveFromNeighbor(NINJA_TEXT[fallen].name);
    return { notice: text, sound: 'error' };
  };

  /**
   * El plan tras elegir a dónde va: una casilla, o `null` si se queda en su lugar. La acción que ya tenía se
   * conserva si desde ahí todavía alcanza; si no, se suelta y lo dice. No cambia de ninja: puede elegir
   * otra casilla con otro clic.
   */
  const moved = (to: Vec | null): StepOutcome => {
    const next: Plan = to ? { ninjaId: ninja.id, moveTo: to } : { ninjaId: ninja.id };
    if (plan.action && isActionValid(m, ninja.id, to ?? ninja.pos, plan.action)) next.action = plan.action;
    const lost = plan.action && !next.action;
    return { plan: next, step: 'act', sound: 'select', ...(lost ? { notice: NOTICE.actionLost } : {}) };
  };
  /** Por qué no vale una casilla a la que no puede ir: la reservó otro ninja o es una roca. */
  const blocked = (): StepOutcome | null => {
    const reservedBy = others.find((p) => p.moveTo && eq(p.moveTo, v));
    if (reservedBy) return { notice: NOTICE.tileReserved(NINJA_TEXT[reservedBy.ninjaId].name), sound: 'error' };
    if (isRock(m, v)) return { notice: NOTICE.rock, sound: 'error' };
    return null;
  };

  if (s.step === 'move') {
    // Quedarse: su propia casilla.
    if (own) return moved(null);
    if (info.moves.has(key(v))) return moved(v);
    if (other) {
      if (other.hp > 0) return { select: other.id };
      return cannotRevive(other.id);
    }
    if (enemyAt(m, v)) return { notice: NOTICE.moveFirst(name), sound: 'error' };
    return blocked() ?? { notice: NOTICE.outOfReach(name), sound: 'error' };
  }

  // Paso de actuar: el tablero ofrece los objetivos, y las casillas siguen valiendo. La casilla de su
  // fantasma, o la suya, cancela el movimiento y lo devuelve a su lugar.
  if (onGhost) return moved(null);
  if (own) return plan.moveTo ? moved(null) : NOTHING;
  if (info.moves.has(key(v))) return moved(v);
  if (other) {
    if (info.heal.some((a) => a.id === other.id)) {
      return { plan: { ...plan, action: { type: 'heal', targetId: other.id } }, finished: true, sound: 'place' };
    }
    if (info.revive.some((a) => a.id === other.id)) {
      return { plan: { ...plan, action: { type: 'revive', targetId: other.id } }, finished: true, sound: 'place' };
    }
    if (other.hp > 0) return { select: other.id };
    return cannotRevive(other.id);
  }
  const enemy = enemyAt(m, v);
  if (enemy) {
    if (info.attack.some((e) => e.id === enemy.id)) {
      return { plan: { ...plan, action: { type: 'attack', targetId: enemy.id } }, finished: true, sound: 'place' };
    }
    return { notice: NOTICE.enemyOutOfRange, sound: 'error' };
  }
  return blocked() ?? { notice: NOTICE.pickTarget(name), sound: 'error' };
}

/** ¿Hay un paso que deshacer? Sin nada que deshacer, Esc abre la pausa. */
export function canUndo(s: Pick<StepState, 'plans' | 'active' | 'pendingCard' | 'step'>): boolean {
  if (!s.active) return false;
  return !!s.pendingCard || !!s.plans[s.active] || s.step === 'act';
}

/** Deshace el último paso del ninja activo: la carta en la mano, la acción, o la casilla elegida. */
export function undoOutcome(s: Pick<StepState, 'plans' | 'active' | 'pendingCard' | 'step'>): StepOutcome {
  if (!s.active) return NOTHING;
  if (s.pendingCard) return { cardDone: true };
  const plan = s.plans[s.active];
  if (plan?.action) return { plan: withoutAction(plan), sound: 'select' };
  // Sin acción, lo último fue elegir casilla, o quedarse: vuelve al paso de moverse, sin casilla.
  if (plan?.moveTo || s.step === 'act') return { plan: { ninjaId: s.active }, step: 'move', sound: 'select' };
  return NOTHING;
}
