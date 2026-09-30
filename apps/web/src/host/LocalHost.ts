import {
  createMatch,
  type DeckCard,
  type Difficulty,
  type ElementKind,
  type GameEvent,
  type MapId,
  type MatchState,
  type Plan,
  type ReplayData,
  resolveTurn,
  type TurnResult,
} from '@ventisca/core';

/**
 * GameHost (§11.3): la UI solo habla con esta interfaz. En v1 la implementa
 * LocalHost (todo en el navegador); en v2 la implementará NetworkHost.
 * El reloj del turno vive aquí, no en el motor (principio 2).
 */
/** Datos para iniciar una partida: semilla, dificultad y reserva de cada ninja (R-26). */
export interface MatchStart {
  seed: number;
  difficulty: Difficulty;
  mapId?: MapId;
  decks?: Partial<Record<ElementKind, DeckCard[]>>;
}

export interface GameHost {
  start(opts: MatchStart): { state: MatchState; events: GameEvent[] };
  submit(plans: Plan[]): TurnResult;
  startTimer(ms: number | null, onTimeout: () => void): void;
  pauseTimer(): void;
  resumeTimer(): void;
  stopTimer(): void;
  timer(): { deadline: number | null; remaining: number | null };
  replay(): ReplayData | null;
}

export class LocalHost implements GameHost {
  private state: MatchState | null = null;
  private decks: MatchStart['decks'];
  private turns: Plan[][] = [];
  private handle: number | null = null;
  private deadline: number | null = null;
  private remaining: number | null = null;
  private onTimeout: (() => void) | null = null;

  start(opts: MatchStart) {
    this.stopTimer();
    this.decks = opts.decks;
    const created = createMatch(opts);
    this.state = created.state;
    this.turns = [];
    return created;
  }

  submit(plans: Plan[]): TurnResult {
    if (!this.state) throw new Error('No hay partida en curso.');
    const result = resolveTurn(this.state, plans);
    this.turns.push(structuredClone(plans));
    this.state = result.state;
    return result;
  }

  startTimer(ms: number | null, onTimeout: () => void): void {
    this.stopTimer();
    this.onTimeout = onTimeout;
    if (ms === null) return;
    this.deadline = performance.now() + ms;
    this.handle = window.setTimeout(() => this.fire(), ms);
  }

  pauseTimer(): void {
    if (this.deadline === null) return;
    this.remaining = Math.max(0, this.deadline - performance.now());
    this.deadline = null;
    if (this.handle !== null) window.clearTimeout(this.handle);
    this.handle = null;
  }

  resumeTimer(): void {
    if (this.remaining === null) return;
    const ms = this.remaining;
    this.remaining = null;
    this.deadline = performance.now() + ms;
    this.handle = window.setTimeout(() => this.fire(), ms);
  }

  stopTimer(): void {
    if (this.handle !== null) window.clearTimeout(this.handle);
    this.handle = null;
    this.deadline = null;
    this.remaining = null;
    this.onTimeout = null;
  }

  timer() {
    return { deadline: this.deadline, remaining: this.remaining };
  }

  replay(): ReplayData | null {
    if (!this.state) return null;
    return {
      version: 1,
      seed: this.state.seed,
      mapId: this.state.mapId,
      difficulty: this.state.difficulty,
      bonusCondition: this.state.bonusCondition,
      ...(this.decks ? { decks: structuredClone(this.decks) } : {}),
      turns: structuredClone(this.turns),
    };
  }

  private fire(): void {
    const cb = this.onTimeout;
    this.handle = null;
    this.deadline = null;
    this.onTimeout = null;
    cb?.();
  }
}
