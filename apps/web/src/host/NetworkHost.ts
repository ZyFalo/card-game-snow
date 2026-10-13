import type { ElementKind, Plan, ReplayData } from '@ventisca/core';
import type { ClientPayload, SeatPlan, ServerMessage } from '@ventisca/protocol';
import type { GameHost, HostListener, HostMessage, OnlineTurn } from './GameHost';

/*
 * Host de una partida en línea: el motor corre en el servidor, y aquí solo se traduce. Lo que manda el
 * servidor sobre la partida se convierte en los mensajes que la interfaz ya sabe mostrar, y lo que decide
 * quien juega sale como mensajes del protocolo. Solo se habla del ninja de esta persona: el servidor sabe
 * qué asiento ocupa cada conexión.
 *
 * El reloj es del servidor (R-36): aquí no vence nada. `timer()` dice cuándo vence, para dibujarlo.
 */

/** El plan de un ninja como viaja por la red: sin decir de quién es. */
export function toSeatPlan(plan: Plan | undefined): SeatPlan {
  return {
    ...(plan?.moveTo ? { moveTo: { x: plan.moveTo.x, y: plan.moveTo.y } } : {}),
    ...(plan?.action ? { action: structuredClone(plan.action) as SeatPlan['action'] } : {}),
  };
}

/** El plan de un ninja como lo usa el tablero, o `undefined` si no planea nada. */
export function toPlan(ninjaId: ElementKind, plan: SeatPlan | null): Plan | undefined {
  if (!plan || (!plan.moveTo && !plan.action)) return undefined;
  return {
    ninjaId,
    ...(plan.moveTo ? { moveTo: plan.moveTo } : {}),
    ...(plan.action ? { action: plan.action as Plan['action'] } : {}),
  };
}

export class NetworkHost implements GameHost {
  readonly local = false;
  private readonly listeners = new Set<HostListener>();
  /** El turno que se planea, o `null` entre un turno y otro. */
  private turn: number | null = null;
  private deadline: number | null = null;

  constructor(
    private readonly send: (payload: ClientPayload) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  subscribe(listener: HostListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Un mensaje del servidor. Devuelve si era de la partida. */
  receive(message: ServerMessage): boolean {
    switch (message.type) {
      case 'match.start': {
        const { you, seats, room, state, events } = message;
        this.reset();
        this.emit({ type: 'matchStart', state, events, online: { you, seats, room } });
        return true;
      }
      case 'match.resume': {
        const { you, seats, room, state } = message;
        const turn = message.turn ? this.open(message.turn.n, message.turn) : null;
        if (!turn) this.reset();
        this.emit({ type: 'matchResume', state, online: { you, seats, room }, turn });
        return true;
      }
      case 'turn.start':
        this.emit({ type: 'turnStart', turn: this.open(message.turn, message), seats: message.seats });
        return true;
      case 'team.plan': {
        const { turn, ninja, plan, card, ready } = message;
        this.emit({ type: 'teamPlan', turn, plan: { ninja, plan, card, ready } });
        return true;
      }
      case 'plan.fix': {
        const { turn, plan, reason, by } = message;
        this.emit({ type: 'planFix', turn, plan, reason, by });
        return true;
      }
      case 'turn.result':
        this.reset();
        this.emit({ type: 'turnResult', state: message.state, events: message.events });
        return true;
      case 'player.status':
        this.emit({ type: 'seat', ninja: message.ninja, status: message.status });
        return true;
      case 'match.end': {
        const { result, coins, earned, achievements, balance, room } = message;
        this.reset();
        this.emit({ type: 'matchEnd', end: { result, coins, earned, achievements, balance, room } });
        return true;
      }
      default:
        return false;
    }
  }

  /** En línea las partidas las empieza el servidor: llegan solas, como `matchStart`. */
  async start(): Promise<void> {}

  /** Confirma el plan del ninja de esta persona. Confirmar es definitivo (R-36). */
  async submit(plans: Plan[]): Promise<void> {
    if (this.turn === null) return;
    this.send({ type: 'plan.confirm', turn: this.turn, plan: toSeatPlan(plans[0]) });
  }

  planChanged(plan: Plan | undefined): void {
    if (this.turn === null) return;
    this.send({ type: 'plan.update', turn: this.turn, plan: toSeatPlan(plan) });
  }

  watched(turn: number): void {
    this.send({ type: 'turn.ready', turn });
  }

  /** Sale de la partida: es abandonar (R-39). */
  leave(): void {
    this.send({ type: 'match.leave' });
  }

  /* El reloj es del servidor: nada lo detiene ni lo reanuda desde aquí. */
  startTimer(): void {}
  pauseTimer(): void {}
  resumeTimer(): void {}

  stopTimer(): void {
    this.deadline = null;
  }

  timer() {
    return { deadline: this.deadline, remaining: null };
  }

  /** Sin la semilla, que el servidor no manda (D-102), una partida en línea no se puede repetir aquí. */
  replay(): ReplayData | null {
    return null;
  }

  close(): void {
    this.reset();
    this.listeners.clear();
  }

  /** Ya no se planea ningún turno: ni hay reloj, ni a dónde mandar un plan. */
  private reset(): void {
    this.turn = null;
    this.deadline = null;
  }

  /** Empieza a contar un turno: lo que falta llega medido al enviarlo, y aquí se pasa al reloj de la página. */
  private open(n: number, clock: { endsInMs: number; seconds: number; plans: OnlineTurn['plans'] }): OnlineTurn {
    this.turn = n;
    this.deadline = this.now() + clock.endsInMs;
    return { n, deadline: this.deadline, totalMs: clock.seconds * 1000, plans: clock.plans };
  }

  private emit(message: HostMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}
