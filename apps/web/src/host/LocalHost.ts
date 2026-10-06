import { createMatch, type MatchState, type Plan, REPLAY_VERSION, type ReplayData, resolveTurn } from '@ventisca/core';
import type { GameHost, HostListener, HostMessage, MatchStart } from './GameHost';

/** Host del sandbox: el motor corre en el navegador. */
export class LocalHost implements GameHost {
  private state: MatchState | null = null;
  private decks: MatchStart['decks'];
  private turns: Plan[][] = [];
  private readonly listeners = new Set<HostListener>();
  private handle: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private remaining: number | null = null;
  private onTimeout: (() => void) | null = null;

  subscribe(listener: HostListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(opts: MatchStart): Promise<void> {
    this.stopTimer();
    this.decks = opts.decks;
    const created = createMatch(opts);
    this.state = created.state;
    this.turns = [];
    this.send({ type: 'matchStart', ...created });
  }

  async submit(plans: Plan[]): Promise<void> {
    if (!this.state) throw new Error('No hay partida en curso.');
    const result = resolveTurn(this.state, plans);
    this.turns.push(structuredClone(plans));
    this.state = result.state;
    this.send({ type: 'turnResult', ...result });
  }

  /**
   * Reemplaza el estado de la partida en curso por un tablero preparado. Solo para las pruebas e2e y
   * las capturas: la repetición grabada deja de corresponder a la partida.
   */
  load(state: MatchState): void {
    if (!this.state) throw new Error('No hay partida en curso.');
    this.state = structuredClone(state);
  }

  startTimer(ms: number | null, onTimeout: () => void): void {
    this.stopTimer();
    this.onTimeout = onTimeout;
    if (ms === null) return;
    this.deadline = performance.now() + ms;
    this.handle = setTimeout(() => this.fire(), ms);
  }

  pauseTimer(): void {
    if (this.deadline === null) return;
    this.remaining = Math.max(0, this.deadline - performance.now());
    this.deadline = null;
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }

  resumeTimer(): void {
    if (this.remaining === null) return;
    const ms = this.remaining;
    this.remaining = null;
    this.deadline = performance.now() + ms;
    this.handle = setTimeout(() => this.fire(), ms);
  }

  stopTimer(): void {
    if (this.handle !== null) clearTimeout(this.handle);
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
      version: REPLAY_VERSION,
      seed: this.state.seed,
      mapId: this.state.mapId,
      difficulty: this.state.difficulty,
      bonusCondition: this.state.bonusCondition,
      ...(this.decks ? { decks: structuredClone(this.decks) } : {}),
      turns: structuredClone(this.turns),
    };
  }

  close(): void {
    this.stopTimer();
    this.listeners.clear();
  }

  /** Como llegaría por la red: después de la llamada que lo produjo, nunca durante ella. */
  private send(msg: HostMessage): void {
    queueMicrotask(() => {
      for (const listener of this.listeners) listener(msg);
    });
  }

  private fire(): void {
    const cb = this.onTimeout;
    this.handle = null;
    this.deadline = null;
    this.onTimeout = null;
    cb?.();
  }
}
