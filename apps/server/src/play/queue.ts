import { ELEMENTS, type ElementKind } from '@ventisca/core';
import type { ServerPayload } from '@ventisca/protocol';
import type { Player } from './link';

/*
 * La cola pública (R-52). Cada persona entra con el ninja que eligió, y la cola arma equipos con un ninja
 * de cada elemento, juntando a cualquiera (D-43, D-70).
 *
 * - Con tres personas, la partida empieza.
 * - Con dos, a los 30 s de estar juntas se les ofrece el bot en el ninja libre, y la partida empieza cuando
 *   ambas aceptan (D-88). Mientras tanto la búsqueda sigue: si llega una tercera, empieza con ella.
 * - Una persona sola nunca juega en línea: sigue esperando o cancela (D-35).
 */

export type QueueState = Extract<ServerPayload, { type: 'queue.state' }>;

/** Quien espera en la cola. */
export interface Waiting {
  player: Player;
  element: ElementKind;
  /** Cuándo entró. */
  since: number;
  /** Aceptó la oferta del bot para el grupo en que está. */
  accepted: boolean;
}

/** Un equipo listo para jugar. `bot`: el ninja que queda para el bot, o `null` si son tres personas. */
export interface Team {
  members: { player: Player; element: ElementKind }[];
  bot: ElementKind | null;
}

/**
 * Reparte a quienes esperan en grupos, cada uno con ninjas distintos. Va por orden de llegada: cada
 * persona entra al primer grupo al que le falta su elemento, y si no hay, abre uno. Así quien llegó antes
 * completa su equipo antes, y quien entra nunca le quita el lugar a nadie.
 */
export function arrange(waiting: readonly Waiting[]): Waiting[][] {
  const groups: Waiting[][] = [];
  for (const w of [...waiting].sort((a, b) => a.since - b.since)) {
    const group = groups.find((g) => g.every((other) => other.element !== w.element));
    if (group) group.push(w);
    else groups.push([w]);
  }
  return groups;
}

/** La pareja, sin importar el orden: para saber desde cuándo esas dos personas están juntas. */
const pairKey = (group: readonly Waiting[]): string =>
  group
    .map((w) => w.player.userId)
    .sort()
    .join('+');

export interface QueueOptions {
  /** Cuánto esperan dos personas juntas antes de que se les ofrezca el bot (D-88). */
  offerMs: number;
  now(): number;
  /** Corre `task` dentro de `ms`; devuelve cómo cancelarlo. */
  later(task: () => void, ms: number): () => void;
  /** La cola de esa persona cambió: hay que decírselo. */
  onState(userId: string, state: QueueState): void;
  /** Se armó un equipo: sus personas ya salieron de la cola. */
  onTeam(team: Team): void;
}

export class Queue {
  private waiting: Waiting[] = [];
  /** Cada pareja que está junta: si ya se le ofreció el bot, y cómo cancelar el plazo que falta para eso. */
  private readonly pairs = new Map<string, { offered: boolean; cancel: () => void }>();

  constructor(private readonly options: QueueOptions) {}

  has(userId: string): boolean {
    return this.waiting.some((w) => w.player.userId === userId);
  }

  get size(): number {
    return this.waiting.length;
  }

  /** Entra a la cola con ese ninja. Quien ya estaba, cambia de ninja sin perder su turno. */
  join(player: Player, element: ElementKind): void {
    const already = this.waiting.find((w) => w.player.userId === player.userId);
    if (already) {
      already.element = element;
      already.accepted = false;
    } else {
      this.waiting.push({ player, element, since: this.options.now(), accepted: false });
    }
    this.settle();
  }

  /** Sale de la cola: canceló, o se le cerró la conexión. Devuelve si estaba. */
  leave(userId: string): boolean {
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((w) => w.player.userId !== userId);
    if (this.waiting.length === before) return false;
    this.settle();
    return true;
  }

  /** Acepta empezar con el bot. Solo vale mientras la oferta está a la vista. */
  acceptBot(userId: string): boolean {
    const group = arrange(this.waiting).find((g) => g.some((w) => w.player.userId === userId));
    if (!group || !this.offered(group)) return false;
    const me = group.find((w) => w.player.userId === userId) as Waiting;
    me.accepted = true;
    this.settle();
    return true;
  }

  /**
   * ¿Ya se le ofrece el bot a ese grupo? Son dos personas, y llevan juntas lo que pide D-88. Lo dice el
   * plazo al cumplirse, no una resta de horas: un temporizador puede sonar un milisegundo antes de lo que
   * marca el reloj, y entonces la oferta no saldría nunca.
   */
  private offered(group: readonly Waiting[]): boolean {
    return group.length === 2 && this.pairs.get(pairKey(group))?.offered === true;
  }

  /**
   * Deja la cola al día después de cada cambio: saca los equipos que ya se pueden formar, cuenta el tiempo
   * de cada pareja y le dice a cada persona cómo quedó su grupo.
   */
  private settle(): void {
    for (;;) {
      const groups = arrange(this.waiting);
      const full = groups.find((g) => g.length === ELEMENTS.length);
      const agreed = groups.find((g) => this.offered(g) && g.every((w) => w.accepted));
      const ready = full ?? agreed;
      if (!ready) break;
      this.waiting = this.waiting.filter((w) => !ready.includes(w));
      const bot = ELEMENTS.find((el) => ready.every((w) => w.element !== el)) ?? null;
      this.options.onTeam({ members: ready.map(({ player, element }) => ({ player, element })), bot });
    }

    const groups = arrange(this.waiting);
    const live = new Set<string>();
    for (const group of groups) {
      if (group.length !== 2) continue;
      const key = pairKey(group);
      live.add(key);
      if (this.pairs.has(key)) continue;
      // Una pareja nueva: lo que alguna hubiera aceptado con otra persona ya no cuenta.
      for (const w of group) w.accepted = false;
      const pair = { offered: false, cancel: () => {} };
      pair.cancel = this.options.later(() => {
        pair.offered = true;
        this.settle();
      }, this.options.offerMs);
      this.pairs.set(key, pair);
    }
    for (const [key, pair] of this.pairs) {
      if (live.has(key)) continue;
      pair.cancel();
      this.pairs.delete(key);
    }
    for (const group of groups) {
      // Quien quedó sola ya no tiene oferta que aceptar.
      if (group.length !== 2) for (const w of group) w.accepted = false;
      for (const w of group) this.options.onState(w.player.userId, this.stateFor(w, group));
    }
  }

  /** Lo que ve esa persona: los tres asientos, la oferta del bot y cuánto lleva buscando. */
  private stateFor(me: Waiting, group: readonly Waiting[]): QueueState {
    const offered = this.offered(group);
    const other = group.find((w) => w !== me);
    return {
      type: 'queue.state',
      you: me.element,
      seats: ELEMENTS.map((element) => ({
        element,
        name: group.find((w) => w.element === element)?.player.name ?? null,
      })),
      offer: offered
        ? {
            bot: ELEMENTS.find((el) => group.every((w) => w.element !== el)) as ElementKind,
            accepted: me.accepted,
            // A quién se espera: solo se dice cuando esta persona ya aceptó.
            waitingFor: me.accepted && other && !other.accepted ? other.player.name : null,
          }
        : null,
      waitedMs: Math.max(0, this.options.now() - me.since),
    };
  }

  /** El estado de la cola para esa persona, o `null` si no está. */
  stateOf(userId: string): QueueState | null {
    const group = arrange(this.waiting).find((g) => g.some((w) => w.player.userId === userId));
    const me = group?.find((w) => w.player.userId === userId);
    return group && me ? this.stateFor(me, group) : null;
  }

  /** Vacía la cola y cancela lo pendiente (al apagar el servidor). */
  clear(): void {
    for (const pair of this.pairs.values()) pair.cancel();
    this.pairs.clear();
    this.waiting = [];
  }
}
