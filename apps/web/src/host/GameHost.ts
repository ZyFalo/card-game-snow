import type { DeckCard, Difficulty, ElementKind, GameEvent, MapId, MatchState, Plan, ReplayData } from '@ventisca/core';
import type { MatchSeat, SeatPlan, SeatStatus, ServerMessage, TeamPlan } from '@ventisca/protocol';

/**
 * GameHost (§11.3): la UI solo habla con esta interfaz. En el sandbox la implementa
 * LocalHost (todo en el navegador); en línea la implementará NetworkHost.
 *
 * Es asíncrona (PRD de v2): pedir una partida y enviar los planes devuelven una promesa,
 * y lo que resuelve el motor llega después como mensaje. En línea el servidor también
 * puede cerrar un turno sin que este cliente confirme (al vencer su reloj), así que la UI
 * reacciona a los mensajes, no a las promesas.
 * El reloj del sandbox vive aquí, no en el motor (principio 2).
 */

/** Datos para iniciar una partida: semilla, dificultad y reserva de cada ninja (R-26). */
export interface MatchStart {
  seed: number;
  difficulty: Difficulty;
  mapId?: MapId;
  decks?: Partial<Record<ElementKind, DeckCard[]>>;
}

/** Una partida en línea, tal como la ve esta persona: su ninja, quién lleva cada uno y desde qué sala se juega. */
export interface OnlineSeats {
  you: ElementKind;
  seats: MatchSeat[];
  room: string | null;
}

/**
 * La planificación de un turno en línea (R-36). `deadline` es el momento, en el reloj de
 * `performance.now()`, en que vence el reloj del servidor. `plans`: el plan de cada ninja a la vista y
 * quién ya está listo.
 */
export interface OnlineTurn {
  n: number;
  deadline: number;
  totalMs: number;
  plans: TeamPlan[];
}

/** Lo que le queda a esta persona de una partida en línea que terminó: llega ya calculado por el servidor. */
export type OnlineEnd = Omit<Extract<ServerMessage, { type: 'match.end' }>, 'v' | 'seq' | 're' | 'type'>;

export type HostMessage =
  /** La partida está lista: su estado inicial y los eventos de la entrada. En línea, también sus asientos. */
  | { type: 'matchStart'; state: MatchState; events: GameEvent[]; online?: OnlineSeats }
  /** Un turno resuelto: el estado nuevo, sus eventos y, en el sandbox, el hash de ese estado (R-23). */
  | { type: 'turnResult'; state: MatchState; events: GameEvent[]; hash?: string }
  /** En línea: la persona volvió a una partida en curso (R-38). El tablero se pone como está, sin animarlo. */
  | { type: 'matchResume'; state: MatchState; online: OnlineSeats; turn: OnlineTurn | null }
  /** En línea: empieza la planificación de un turno, con el reloj del servidor. */
  | { type: 'turnStart'; turn: OnlineTurn; seats: MatchSeat[] }
  /** En línea: cambió el plan de un compañero, o confirmó (R-35). */
  | { type: 'teamPlan'; turn: number; plan: TeamPlan }
  /** En línea: el servidor no aceptó parte del plan de esta persona. `plan` es lo que quedó. */
  | {
      type: 'planFix';
      turn: number;
      plan: SeatPlan | null;
      reason: 'tile_reserved' | 'revive_taken' | 'invalid';
      by: ElementKind | null;
    }
  /** En línea: una persona se desconectó, volvió o abandonó. */
  | { type: 'seat'; ninja: ElementKind; status: SeatStatus }
  /** En línea: la partida terminó, con lo que le queda a esta persona. */
  | { type: 'matchEnd'; end: OnlineEnd };

export type HostListener = (msg: HostMessage) => void;

export interface GameHost {
  /**
   * La partida corre entera en este navegador: el sandbox y un jugador. Las ayudas opcionales existen
   * solo ahí (D-78); en línea no, para que todas las personas jueguen con la misma información.
   */
  readonly local: boolean;
  /** Escucha los mensajes del host. Devuelve la función para dejar de escucharlos. */
  subscribe(listener: HostListener): () => void;
  /** Pide una partida nueva. Su estado inicial llega como mensaje `matchStart`. */
  start(opts: MatchStart): Promise<void>;
  /** Envía los planes del turno. Se cumple cuando el host los acepta; el resultado llega como `turnResult`. */
  submit(plans: Plan[]): Promise<void>;
  /** En línea: el plan en curso del ninja de esta persona, para que lo vean sus compañeros (R-35). */
  planChanged?(plan: Plan | undefined): void;
  /** En línea: esta persona terminó de ver ese turno, y el reloj del siguiente puede empezar (R-36). */
  watched?(turn: number): void;
  startTimer(ms: number | null, onTimeout: () => void): void;
  pauseTimer(): void;
  resumeTimer(): void;
  stopTimer(): void;
  timer(): { deadline: number | null; remaining: number | null };
  replay(): ReplayData | null;
  /** Detiene el reloj y descarta los mensajes que aún no se entregaron. */
  close(): void;
}
