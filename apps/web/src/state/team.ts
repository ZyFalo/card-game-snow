import { ELEMENTS, type ElementKind, getNinja, type MatchState } from '@ventisca/core';
import type { MatchSeat, TeamPlan } from '@ventisca/protocol';
import { toPlan } from '../host/NetworkHost';
import { ENEMY_TEXT, ES, NINJA_TEXT, ONLINE_TEXT, PLAN_TEXT, TIP_TEXT } from '../i18n/es';
import { activeInfo, canAct, namedGolem } from './planning';
import type { AppState, OnlineMatch } from './store';

/*
 * El equipo en una partida en línea (R-35 a R-39). Cada persona lleva a un solo ninja y ve los planes de
 * los demás en tiempo real, con las mismas marcas del tablero. Aquí se decide, sin tocar el estado, cómo
 * se ven esos planes, quién está listo, qué dice la franja de arriba y qué dice el panel de cada ninja.
 */

type Plans = AppState['plans'];

/** Los planes de los compañeros como los dibuja el tablero. El de `you` no entra: lo lleva esta persona. */
export function teamPlans(plans: readonly TeamPlan[], you: ElementKind | null): Plans {
  const out: Plans = {};
  for (const p of plans) {
    if (p.ninja === you) continue;
    const plan = toPlan(p.ninja, p.plan);
    if (plan) out[p.ninja] = plan;
  }
  return out;
}

/** Los ninjas que ya están listos: confirmaron, o no tienen nada que confirmar. */
export const readyOf = (plans: readonly TeamPlan[]): ElementKind[] => plans.filter((p) => p.ready).map((p) => p.ninja);

/**
 * La carta que planea jugar un compañero, puesta a la vista. En su mano llega tapada, sin valor (R-35): el
 * servidor manda el valor aparte, con el plan, y con él la miniatura del tablero ya puede mostrarlo.
 */
export function reveal(state: MatchState, plan: TeamPlan): MatchState {
  const action = plan.plan?.action;
  if (action?.type !== 'card' || plan.card === null) return state;
  const value = plan.card;
  const card = getNinja(state, plan.ninja)?.hand.find((c) => c.id === action.cardId);
  if (!card || card.value === value) return state;
  return {
    ...state,
    ninjas: state.ninjas.map((n) =>
      n.id === plan.ninja ? { ...n, hand: n.hand.map((c) => (c.id === action.cardId ? { ...c, value } : c)) } : n,
    ),
  };
}

export const revealAll = (state: MatchState, plans: readonly TeamPlan[]): MatchState => plans.reduce(reveal, state);

/** Los ninjas que planean jugar carta este turno, en orden Fuego, Agua y Nieve (R-18). */
export const cardPlayers = (plans: Plans): ElementKind[] => ELEMENTS.filter((id) => plans[id]?.action?.type === 'card');

/** Hay combo a la vista: dos o más ninjas planean carta. Devuelve quiénes, o una lista vacía. */
export function comboOf(plans: Plans): ElementKind[] {
  const players = cardPlayers(plans);
  return players.length >= 2 ? players : [];
}

export const seatOf = (match: OnlineMatch, ninja: ElementKind): MatchSeat | undefined =>
  match.seats.find((s) => s.element === ninja);

/** Quién lleva a ese ninja, como se le dice a esta persona: "Tú", el nombre visible de la otra, o "Bot". */
export function whoPlays(match: OnlineMatch, ninja: ElementKind): string {
  if (ninja === match.you) return ONLINE_TEXT.you;
  const seat = seatOf(match, ninja);
  return seat?.kind === 'human' ? (seat.name ?? '') : ONLINE_TEXT.bot;
}

/** Lo mismo, en medio de una frase: "tú", el nombre, o "el bot". */
function whoInline(match: OnlineMatch, ninja: ElementKind): string {
  if (ninja === match.you) return ONLINE_TEXT.comboYou;
  const seat = seatOf(match, ninja);
  return seat?.kind === 'human' ? (seat.name ?? '') : ONLINE_TEXT.comboBot;
}

/** ¿Está quieto ese ninja porque su dueño no está? Se desconectó o salió de la partida (R-38, R-39). */
export function isAsleep(match: OnlineMatch | null, ninja: ElementKind): boolean {
  const seat = match ? seatOf(match, ninja) : undefined;
  return seat?.kind === 'human' && seat.status !== 'here';
}

export type SeatState = 'ko' | 'away' | 'left' | 'ready' | 'planning';

/** Lo que dice el panel en cada estado. */
export const SEAT_TEXT: Record<SeatState, string> = {
  ko: PLAN_TEXT.ko,
  away: ONLINE_TEXT.seat.away,
  left: ONLINE_TEXT.seat.left,
  ready: ONLINE_TEXT.seat.ready,
  planning: ONLINE_TEXT.seat.planning,
};

/**
 * El estado que dice el panel de un ninja en línea: caído, desconectado, fuera de la partida y, mientras se
 * planea, listo o planeando. Fuera de la planificación, quien está en pie y presente no dice nada.
 */
export function seatState(
  s: Pick<AppState, 'phase' | 'view'>,
  match: OnlineMatch,
  ninja: ElementKind,
): SeatState | null {
  const n = s.view ? getNinja(s.view, ninja) : undefined;
  const seat = seatOf(match, ninja);
  if (seat?.kind === 'human' && seat.status === 'left') return 'left';
  if (seat?.kind === 'human' && seat.status === 'away') return 'away';
  if (n && n.hp <= 0) return 'ko';
  if (s.phase !== 'planning') return null;
  return match.ready.includes(ninja) ? 'ready' : 'planning';
}

type TipState = Pick<
  AppState,
  'phase' | 'resolveStep' | 'boosting' | 'match' | 'plans' | 'active' | 'pendingCard' | 'spotted' | 'demo' | 'online'
>;

/**
 * La franja de arriba en una partida en línea. Como en el sandbox, dice el estado del turno; además dice
 * a quién se espera y anuncia el combo, que sin chat es la forma de coordinarlo (D-91).
 */
export function onlineTip(s: TipState): string | null {
  const om = s.online.match;
  const m = s.match;
  if (!om) return null;
  if (s.phase === 'intro') return TIP_TEXT.intro;
  if (s.phase === 'resolving') {
    if (om.waiting) return ONLINE_TEXT.waitingTeam;
    const hint = s.boosting ? ES.accelerating : TIP_TEXT.holdToBoost;
    if (s.resolveStep === 'enemies') return TIP_TEXT.enemies(hint);
    if (s.resolveStep === 'end') return TIP_TEXT.end(hint);
    return ONLINE_TEXT.team(hint);
  }
  if (s.phase !== 'planning' || !m) return null;
  const golem = namedGolem(s);
  const name = NINJA_TEXT[om.you].name;
  if (s.pendingCard) return TIP_TEXT.placeCard(name);
  // El combo manda sobre lo demás: es lo que el equipo necesita saber para sumarse.
  const combo = comboOf(s.plans);
  if (combo.length > 0 && !golem) {
    // Esta persona va al final: "BrasaLuz y tú".
    const names = [...combo.filter((id) => id !== om.you), ...combo.filter((id) => id === om.you)];
    return ONLINE_TEXT.combo(names.map((id) => whoInline(om, id)));
  }
  // Al mirar a un gólem: su nombre y cómo ataca, igual que en el sandbox.
  if (golem) return TIP_TEXT.enemy(ENEMY_TEXT[golem].name, ENEMY_TEXT[golem].hint);
  if (!om.plays) {
    const me = getNinja(m, om.you);
    return me && me.hp <= 0 ? ONLINE_TEXT.fallen(name) : ONLINE_TEXT.returning(name);
  }
  if (om.ready.includes(om.you)) {
    const pending = ELEMENTS.filter((id) => id !== om.you && !om.ready.includes(id));
    return pending.length > 0 ? ONLINE_TEXT.readyWaiting(pending.map((id) => whoPlays(om, id))) : ONLINE_TEXT.readyAll;
  }
  const info = activeInfo(s);
  if (!info) return null;
  if (!info.plan.action) {
    if (!info.plan.moveTo) return TIP_TEXT.plan(name);
    if (canAct(m, s.plans, om.you)) return TIP_TEXT.act(name);
  }
  return ONLINE_TEXT.planDone;
}
