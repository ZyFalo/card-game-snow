import { ELEMENTS, type ElementKind, type MatchState } from '@ventisca/core';
import { MOMENT_TIP, NINJA_TEXT } from '../i18n/es';
import { hasPending } from './planning';
import type { AppState } from './store';

/*
 * Consejos en el momento (D-80): cuatro consejos, cada uno una sola vez, en una burbuja pegada a los
 * paneles o a la mano, nunca sobre el tablero. Se cierran con "Entendido", y el que se cierra queda
 * aprendido: se guarda con los ajustes y no vuelve a salir. Este módulo decide qué consejo sale, cuándo y
 * dónde; la interfaz solo lo dibuja.
 */

/** En el orden en que salen si coinciden: uno a la vez. */
export const TIP_IDS = ['firstFall', 'firstCard', 'combo', 'switchNinja'] as const;
export type TipId = (typeof TIP_IDS)[number];

/** A qué se refiere la burbuja: a los paneles de los ninjas o a la mano. */
export type TipAnchor = 'panels' | 'hand';

export interface MomentTip {
  id: TipId;
  text: string;
  anchor: TipAnchor;
}

type TipState = Pick<AppState, 'phase' | 'settings' | 'match' | 'plans' | 'active' | 'pendingCard'>;

const nameOf = (id: ElementKind): string => NINJA_TEXT[id].name;

/** Cada consejo, si este es su momento. `active` es el ninja activo, que está en pie. */
const MOMENTS: Record<TipId, (m: MatchState, active: ElementKind, s: TipState) => Omit<MomentTip, 'id'> | null> = {
  // R-09: hay un caído. Lo nombra a él y al ninja activo, que es quien puede ir a revivirlo.
  firstFall: (m, active) => {
    const fallen = m.ninjas.find((n) => n.hp <= 0);
    return fallen ? { text: MOMENT_TIP.firstFall(nameOf(fallen.id), nameOf(active)), anchor: 'panels' } : null;
  },
  // La mano que se ve es la del ninja activo: el consejo espera a que tenga una carta que señalar.
  firstCard: (m, active) => (holds(m, active) ? { text: MOMENT_TIP.firstCard, anchor: 'hand' } : null),
  // R-18: el ninja activo y otro en pie tienen carta.
  combo: (m, active) =>
    holds(m, active) && ELEMENTS.some((id) => id !== active && holds(m, id))
      ? { text: MOMENT_TIP.combo, anchor: 'hand' }
      : null,
  // El ninja activo ya no tiene nada por decidir y a otro le falta su plan: el foco no salta solo (D-79).
  switchNinja: (m, active, s) =>
    !s.pendingCard &&
    !hasPending(m, s.plans, active) &&
    ELEMENTS.some((id) => id !== active && hasPending(m, s.plans, id))
      ? { text: MOMENT_TIP.switchNinja(nameOf(active)), anchor: 'panels' }
      : null,
};

/** ¿Tiene ese ninja, en pie, alguna carta en la mano? */
function holds(m: MatchState, id: ElementKind): boolean {
  const n = m.ninjas.find((x) => x.id === id);
  return !!n && n.hp > 0 && n.hand.length > 0;
}

/** El consejo que toca mostrar ahora, o `null`. Respeta "Consejos en pantalla" y los ya aprendidos. */
export function momentTip(s: TipState): MomentTip | null {
  if (!s.settings.tips || s.phase !== 'planning' || !s.match) return null;
  const active = s.match.ninjas.find((n) => n.id === s.active);
  if (!active || active.hp <= 0) return null;
  for (const id of TIP_IDS) {
    if (s.settings.learnedTips.includes(id)) continue;
    const tip = MOMENTS[id](s.match, active.id, s);
    if (tip) return { id, ...tip };
  }
  return null;
}

/**
 * Dónde se dibuja la burbuja. Entre el tablero y los paneles no hay lugar para ella, así que va a los
 * lados, donde no tapa nada: sobre la fila de paneles, en el margen izquierdo del tablero; o en la mano,
 * al lado de las cartas. Si las cartas no dejan lugar, encima de la mano, en el margen derecho.
 */
export type BubbleSlot = 'panels' | 'hand' | 'above-hand';

/** Con más cartas que estas, la burbuja ya no cabe a su lado. */
const CARDS_BESIDE = 2;

export function bubbleSlot(anchor: TipAnchor, cards: number): BubbleSlot {
  if (anchor === 'panels') return 'panels';
  return cards <= CARDS_BESIDE ? 'hand' : 'above-hand';
}
