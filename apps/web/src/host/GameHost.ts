import type { DeckCard, Difficulty, ElementKind, GameEvent, MapId, MatchState, Plan, ReplayData } from '@ventisca/core';

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

export type HostMessage =
  /** La partida está lista: su estado inicial y los eventos de la entrada. */
  | { type: 'matchStart'; state: MatchState; events: GameEvent[] }
  /** Un turno resuelto: el estado nuevo, sus eventos y el hash de ese estado (R-23). */
  | { type: 'turnResult'; state: MatchState; events: GameEvent[]; hash: string };

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
  startTimer(ms: number | null, onTimeout: () => void): void;
  pauseTimer(): void;
  resumeTimer(): void;
  stopTimer(): void;
  timer(): { deadline: number | null; remaining: number | null };
  replay(): ReplayData | null;
  /** Detiene el reloj y descarta los mensajes que aún no se entregaron. */
  close(): void;
}
