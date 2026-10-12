import { ELEMENTS, type ElementKind, type MatchState } from '@ventisca/core';
import { MOMENT_TIP, NINJA_TEXT } from '../i18n/es';
import { hasPending } from './planning';
import type { AppState } from './store';

/*
 * Consejos en el momento (D-80): cuatro consejos, cada uno una sola vez, en una burbuja que va siempre en
 * el mismo lugar, junto a la mano, nunca sobre el tablero. Lo que señala lo dice un borde dorado, en el
 * panel del ninja o en la carta, y una franja del color de ese ninja en la burbuja. Se cierran con
 * "Entendido", y el que se cierra queda aprendido: se guarda con los ajustes y no vuelve a salir. Este
 * módulo decide qué consejo sale, cuándo, de quién habla y dónde va; la interfaz solo lo dibuja.
 */

/** En el orden en que salen si coinciden: uno a la vez. */
export const TIP_IDS = ['firstFall', 'firstCard', 'combo', 'switchNinja'] as const;
export type TipId = (typeof TIP_IDS)[number];

/** Lo que lleva el borde dorado: el panel del ninja, su primera carta o todas las cartas de su mano. */
export type TipMark = 'panel' | 'card' | 'hand';

export interface MomentTip {
  id: TipId;
  text: string;
  /** El ninja del que habla: la burbuja lleva una franja de su color. */
  ninja: ElementKind;
  mark: TipMark;
}

type TipState = Pick<AppState, 'phase' | 'settings' | 'match' | 'plans' | 'active' | 'pendingCard'>;

const nameOf = (id: ElementKind): string => NINJA_TEXT[id].name;

/**
 * Cada consejo, si este es su momento: su texto y qué marca. `active` es el ninja activo, que está en pie:
 * todos hablan de él.
 */
const MOMENTS: Record<
  TipId,
  (m: MatchState, active: ElementKind, s: TipState) => Pick<MomentTip, 'text' | 'mark'> | null
> = {
  // R-09: hay un caído. Lo nombra a él y al ninja activo, que es quien puede ir a revivirlo.
  firstFall: (m, active) => {
    const fallen = m.ninjas.find((n) => n.hp <= 0);
    return fallen ? { text: MOMENT_TIP.firstFall(nameOf(fallen.id), nameOf(active)), mark: 'panel' } : null;
  },
  // La mano que se ve es la del ninja activo: el consejo espera a que tenga una carta que señalar.
  firstCard: (m, active) => (holds(m, active) ? { text: MOMENT_TIP.firstCard, mark: 'card' } : null),
  // R-18: el ninja activo y otro en pie tienen carta.
  combo: (m, active) =>
    holds(m, active) && ELEMENTS.some((id) => id !== active && holds(m, id))
      ? { text: MOMENT_TIP.combo, mark: 'hand' }
      : null,
  // El ninja activo ya no tiene nada por decidir y a otro le falta su plan: el foco no salta solo (D-79).
  switchNinja: (m, active, s) =>
    !s.pendingCard &&
    !hasPending(m, s.plans, active) &&
    ELEMENTS.some((id) => id !== active && hasPending(m, s.plans, id))
      ? { text: MOMENT_TIP.switchNinja(nameOf(active)), mark: 'panel' }
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
    if (tip) return { id, ninja: active.id, ...tip };
  }
  return null;
}

/**
 * Dónde se dibuja la burbuja: siempre en la franja de abajo, a la derecha, en el espacio libre junto a la
 * mano. Con tres o cuatro cartas ese espacio ya no existe, y sube encima de la mano, al margen derecho
 * del tablero: así no tapa ninguna carta.
 */
export type BubbleSlot = 'hand' | 'above-hand';

/** Con más cartas que estas, junto a la mano ya no queda lugar para la burbuja. */
const CARDS_BESIDE = 2;

export const bubbleSlot = (cards: number): BubbleSlot => (cards <= CARDS_BESIDE ? 'hand' : 'above-hand');
