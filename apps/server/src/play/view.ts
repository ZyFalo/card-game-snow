import type { Card, ElementKind, GameEvent, MatchState } from '@ventisca/core';

/*
 * Lo que recibe cada persona de una partida (D-102). El servidor guarda el estado completo; a cada cliente
 * le manda solo lo que su dueño puede saber:
 *
 * - Sin la semilla ni el estado del azar. Con ellos y con el motor, que es de código abierto, un cliente
 *   modificado podría calcular por adelantado a quién atacará cada gólem y qué carta va a robar.
 * - Sin las cartas de las manos de los demás, ni las de ningún mazo: se sabe cuántas hay, no cuáles
 *   (R-35). La carta que un compañero planea jugar llega aparte, con su plan.
 */

/** Una carta que está ahí, sin decir cuál es: conserva su id, para poder nombrarla, y su elemento. */
const hidden = (card: Card): Card => ({ id: card.id, element: card.element, value: 0 });

/** El estado de la partida tal como lo puede ver quien lleva ese ninja. */
export function viewFor(state: MatchState, seat: ElementKind): MatchState {
  return {
    ...structuredClone(state),
    seed: 0,
    rng: 0,
    ninjas: state.ninjas.map((n) => ({
      ...structuredClone(n),
      hand: n.id === seat ? structuredClone(n.hand) : n.hand.map(hidden),
      deck: n.deck.map(hidden),
    })),
  };
}

/** Los eventos de un turno tal como los puede ver quien lleva ese ninja: las cartas que roban los demás van tapadas. */
export function eventsFor(events: readonly GameEvent[], seat: ElementKind): GameEvent[] {
  return events.map((e) =>
    e.t === 'draw' && e.ninjaId !== seat ? { ...e, card: hidden(e.card) } : structuredClone(e),
  );
}
