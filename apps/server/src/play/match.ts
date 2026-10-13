import {
  type AchievementId,
  basicHealsBy,
  type ClearedRound,
  createMatch,
  type DeckCard,
  type Difficulty,
  ELEMENTS,
  type ElementKind,
  type GameEvent,
  getNinja,
  type MatchState,
  type Plan,
  personalAchievements,
  resolveTurn,
  suggestPlan,
} from '@ventisca/core';
import type { MatchSeat, SeatPlan, SeatStatus, ServerPayload, TeamPlan } from '@ventisca/protocol';
import type { Player } from './link';
import { checkPlan, seatPlan } from './plans';
import type { Team } from './queue';
import { eventsFor, viewFor } from './view';

/*
 * Una partida en línea (PRD de v2, R-33 a R-40). El motor es el mismo del sandbox, sin cambios
 * (`packages/core`): aquí solo se decide cuándo se resuelve cada turno y qué sabe cada persona.
 *
 * Un turno pasa por dos momentos:
 * - **Planificar.** El reloj da 10 s (R-36). Cada persona manda el plan de su ninja, que se valida al
 *   llegar y se comparte con el equipo (R-35). Confirmar es definitivo. El turno se resuelve cuando todos
 *   confirmaron o cuando vence el reloj, con lo que cada quien dejó planeado.
 * - **Mirar.** El servidor resuelve el turno de una vez, pero cada cliente tarda unos segundos en
 *   animarlo. El reloj del turno siguiente empieza cuando todas las personas avisaron que terminaron de
 *   verlo, o cuando vence un tope, para que nadie pueda detener la partida.
 *
 * El ninja de quien se desconecta queda quieto (R-38): no planea, y cuenta como confirmado. Si vuelve, lo
 * retoma desde el turno siguiente. Si no queda ninguna persona, la partida se detiene; a los 2 minutos, o
 * en el acto si todas abandonaron, termina.
 */

/** Los plazos de una partida. Las pruebas los acortan. */
export interface MatchTimings {
  /** R-36: lo que dura la planificación de un turno. */
  turnMs: number;
  /** Lo que se espera, después de vencer el reloj, a un plan que ya venía en camino. */
  graceMs: number;
  /** El tope para mirar un turno, o la entrada de la partida, antes de que empiece el siguiente. */
  watchMs: number;
  /** R-38: lo que vive una partida sin ninguna persona conectada. */
  emptyMs: number;
}

/** Cómo terminó una partida para el equipo. `null`: se fueron todas las personas antes del final. */
export interface MatchOutcome {
  result: 'victory' | 'defeat' | null;
  state: MatchState;
  /** Quienes estaban conectados al final. */
  present: string[];
  /** Quienes se desconectaron y no volvieron antes del final: abandonaron (R-39). */
  away: string[];
  /** Quienes salieron con "Salir". */
  left: string[];
}

/** Lo que deja un turno para las recompensas (R-40 y R-55). */
export interface TurnRewards {
  /** Las rondas que el equipo superó en ese turno. */
  rounds: ClearedRound[];
  /** Quienes estaban conectados al resolverlo: son quienes las cobran (D-48). */
  present: string[];
  /** Los logros que ganó cada persona conectada. */
  earned: { userId: string; achievements: AchievementId[] }[];
}

/** Lo que una partida necesita de afuera. */
export interface MatchHost {
  timings: MatchTimings;
  now(): number;
  /** Corre `task` dentro de `ms`; devuelve cómo cancelarlo. */
  later(task: () => void | Promise<void>, ms: number): () => void;
  /** Le manda un mensaje a esa persona, si está conectada. */
  send(userId: string, message: ServerPayload): void;
  /**
   * Un turno dejó rondas superadas o logros: se guardan antes de contarlo. Devuelve `false` si la partida
   * ya no está viva en la base, porque otro proceso del servidor la dio por interrumpida (R-54).
   */
  rewards(match: Match, turn: TurnRewards): Promise<boolean>;
  /** La partida terminó. */
  over(match: Match, outcome: MatchOutcome): void | Promise<void>;
}

interface HumanSeat {
  kind: 'human';
  element: ElementKind;
  player: Player;
  status: SeatStatus;
  /** Lleva a su ninja en el turno que se está planeando: estaba conectada cuando empezó. */
  plays: boolean;
}

interface BotSeat {
  kind: 'bot';
  element: ElementKind;
}

type Seat = HumanSeat | BotSeat;

/** `watching`: se mira el turno anterior. `planning`: corre el reloj. `frozen`: no hay nadie. */
type Phase = 'watching' | 'planning' | 'frozen' | 'over';

export interface MatchSetup {
  id: string;
  team: Team;
  /** El código de la sala desde la que se juega, o `null` si salió de la cola. */
  room: string | null;
  difficulty: Difficulty;
  seed: number;
  /** La reserva de cada persona: su colección del elemento de su ninja (R-34). El bot usa el mazo de referencia. */
  decks: Partial<Record<ElementKind, DeckCard[]>>;
  /** Solo para las pruebas: deja la partida recién creada en un tablero preparado. */
  prepare?: (state: MatchState) => MatchState;
}

export class Match {
  readonly id: string;
  readonly room: string | null;
  readonly difficulty: Difficulty;
  readonly seed: number;
  private state: MatchState;
  private readonly opening: GameEvent[];
  private readonly seats: Seat[];
  private phase: Phase = 'watching';
  /** Los planes aceptados del turno que se planea: nunca chocan entre sí. */
  private readonly plans = new Map<ElementKind, Plan>();
  /** Quienes ya confirmaron, o no tienen nada que confirmar. */
  private readonly ready = new Set<ElementKind>();
  /** Quienes ya avisaron que terminaron de mirar el turno anterior. */
  private readonly watched = new Set<string>();
  /** El turno que se está mirando: 0 es la entrada de la partida. */
  private watching = 0;
  private deadline = 0;
  private cancel: (() => void) | null = null;
  /** ¿Algún compañero del bot planea carta? El bot se suma al combo cuando eso cambia. */
  private teamPlaysCard = false;
  /** Las curaciones básicas de cada ninja en la partida, para "Mano sanadora" (R-55). */
  private readonly heals: Record<ElementKind, number> = { fire: 0, water: 0, snow: 0 };

  constructor(
    setup: MatchSetup,
    private readonly host: MatchHost,
  ) {
    this.id = setup.id;
    this.room = setup.room;
    this.difficulty = setup.difficulty;
    this.seed = setup.seed;
    const created = createMatch({ seed: setup.seed, difficulty: setup.difficulty, decks: setup.decks });
    this.state = setup.prepare ? setup.prepare(created.state) : created.state;
    this.opening = setup.prepare ? [] : created.events;
    this.seats = ELEMENTS.map((element): Seat => {
      const member = setup.team.members.find((m) => m.element === element);
      return member
        ? { kind: 'human', element, player: member.player, status: 'here', plays: false }
        : { kind: 'bot', element };
    });
  }

  /* ---------- Quién está ---------- */

  get humans(): HumanSeat[] {
    return this.seats.filter((s): s is HumanSeat => s.kind === 'human');
  }

  /** Las personas conectadas que siguen en la partida. */
  private get here(): HumanSeat[] {
    return this.humans.filter((s) => s.status === 'here');
  }

  private seatOf(userId: string): HumanSeat | undefined {
    return this.humans.find((s) => s.player.userId === userId);
  }

  /** Cómo está esa persona en la partida, o `null` si no juega en ella. */
  statusOf(userId: string): SeatStatus | null {
    return this.seatOf(userId)?.status ?? null;
  }

  get over(): boolean {
    return this.phase === 'over';
  }

  /** El turno que se planea o se acaba de resolver: el siguiente a los ya resueltos. */
  private get turn(): number {
    return this.state.turn + 1;
  }

  private publicSeats(): MatchSeat[] {
    return this.seats.map((s) =>
      s.kind === 'human'
        ? { element: s.element, kind: 'human', name: s.player.name, status: s.status }
        : { element: s.element, kind: 'bot', name: null, status: 'here' },
    );
  }

  private teamPlan(element: ElementKind): TeamPlan {
    const plan = this.plans.get(element);
    const action = plan?.action;
    const card =
      action?.type === 'card'
        ? (getNinja(this.state, element)?.hand.find((c) => c.id === action.cardId)?.value ?? null)
        : null;
    return { ninja: element, plan: seatPlan(plan), card, ready: this.ready.has(element) };
  }

  private toHere(message: (seat: HumanSeat) => ServerPayload, except?: HumanSeat): void {
    for (const seat of this.here) if (seat !== except) this.host.send(seat.player.userId, message(seat));
  }

  private timer(task: () => void | Promise<void>, ms: number): void {
    this.cancel?.();
    this.cancel = this.host.later(task, ms);
  }

  /* ---------- El recorrido de un turno ---------- */

  /** Empieza la partida: cada persona recibe su vista del estado inicial y los eventos de la entrada. */
  start(): void {
    this.toHere((seat) => ({
      type: 'match.start',
      matchId: this.id,
      you: seat.element,
      seats: this.publicSeats(),
      state: viewFor(this.state, seat.element),
      events: eventsFor(this.opening, seat.element),
      room: this.room,
    }));
    this.watch(0);
  }

  /** Espera a que todas las personas terminen de mirar ese turno, con un tope. */
  private watch(turn: number): void {
    this.phase = 'watching';
    this.watching = turn;
    this.watched.clear();
    this.timer(() => this.beginTurn(), this.host.timings.watchMs);
  }

  /** Esa persona terminó de mirar el turno. Cuando terminaron todas, empieza el reloj del siguiente. */
  async watchedBy(userId: string, turn: number): Promise<void> {
    const seat = this.seatOf(userId);
    if (this.phase !== 'watching' || turn !== this.watching || seat?.status !== 'here') return;
    this.watched.add(userId);
    await this.maybeBegin();
  }

  private async maybeBegin(): Promise<void> {
    if (this.phase !== 'watching' || !this.here.every((s) => this.watched.has(s.player.userId))) return;
    await this.beginTurn();
  }

  /** Empieza la planificación de un turno: quién lleva a su ninja, el plan del bot y el reloj. */
  private async beginTurn(): Promise<void> {
    if (this.phase === 'over') return;
    if (this.here.length === 0) {
      await this.freeze();
      return;
    }
    this.phase = 'planning';
    this.plans.clear();
    this.ready.clear();
    this.teamPlaysCard = false;
    for (const seat of this.seats) {
      const standing = (getNinja(this.state, seat.element)?.hp ?? 0) > 0;
      if (seat.kind === 'bot') {
        // El bot planea en el acto, y su plan se ve como el de un compañero más.
        const plan = standing ? suggestPlan(this.state, seat.element, []) : null;
        if (plan && (plan.moveTo || plan.action)) this.plans.set(seat.element, plan);
        this.ready.add(seat.element);
        continue;
      }
      // Un ninja quieto o caído no tiene nada que confirmar.
      seat.plays = seat.status === 'here' && standing;
      if (!seat.plays) this.ready.add(seat.element);
    }
    const { turnMs, graceMs } = this.host.timings;
    this.deadline = this.host.now() + turnMs;
    this.timer(() => this.resolve(), turnMs + graceMs);
    const plans = ELEMENTS.map((el) => this.teamPlan(el));
    this.toHere(() => ({
      type: 'turn.start',
      turn: this.turn,
      endsInMs: turnMs,
      seconds: Math.round(turnMs / 1000),
      seats: this.publicSeats(),
      plans,
    }));
    await this.maybeResolve();
  }

  /**
   * El plan de una persona para su ninja: el que tiene en curso o, con `confirm`, el definitivo. Se guarda
   * lo que vale. Si algo no vale, se le dice, y esa confirmación no cuenta: puede corregirlo y confirmar.
   */
  async planBy(userId: string, turn: number, wanted: SeatPlan, confirm: boolean): Promise<void> {
    const seat = this.seatOf(userId);
    if (this.phase !== 'planning' || turn !== this.turn || !seat?.plays) return;
    // Confirmar es definitivo: lo que llegue después no cambia el plan.
    if (this.ready.has(seat.element)) return;
    const others = [...this.plans.values()].filter((p) => p.ninjaId !== seat.element);
    const { plan, fix } = checkPlan(this.state, seat.element, wanted, others);
    if (plan) this.plans.set(seat.element, plan);
    else this.plans.delete(seat.element);
    if (fix) this.host.send(userId, { type: 'plan.fix', turn, plan: seatPlan(plan ?? undefined), ...fix });
    else if (confirm) this.ready.add(seat.element);
    this.toHere(() => ({ type: 'team.plan', turn, ...this.teamPlan(seat.element) }), seat);
    this.botReacts();
    await this.maybeResolve();
  }

  /**
   * El bot se suma al combo: cuando un compañero empieza a planear una carta, vuelve a pensar su jugada
   * con los planes a la vista, y juega la suya si le conviene. Si ya nadie planea carta, vuelve a su jugada
   * de siempre. Respeta lo que los demás ya reservaron.
   */
  private botReacts(): void {
    for (const seat of this.seats) {
      if (seat.kind !== 'bot' || (getNinja(this.state, seat.element)?.hp ?? 0) <= 0) continue;
      const others = [...this.plans.values()].filter((p) => p.ninjaId !== seat.element);
      const cards = others.some((p) => p.action?.type === 'card');
      if (cards === this.teamPlaysCard) continue;
      this.teamPlaysCard = cards;
      const plan = suggestPlan(this.state, seat.element, others);
      const joins = plan?.action?.type === 'card';
      // Solo cambia para sumarse al combo o para dejarlo: si no, su plan queda como estaba.
      if (!plan || (cards && !joins)) continue;
      if (plan.moveTo || plan.action) this.plans.set(seat.element, plan);
      else this.plans.delete(seat.element);
      this.toHere(() => ({ type: 'team.plan', turn: this.turn, ...this.teamPlan(seat.element) }));
    }
  }

  private async maybeResolve(): Promise<void> {
    if (this.phase === 'planning' && ELEMENTS.every((el) => this.ready.has(el))) await this.resolve();
  }

  /** Resuelve el turno con lo que cada ninja tiene planeado, y lo manda a mirar. */
  private async resolve(): Promise<void> {
    if (this.phase !== 'planning') return;
    const before = this.state;
    const result = resolveTurn(before, [...this.plans.values()]);
    this.state = result.state;
    this.plans.clear();
    this.ready.clear();
    // Primero se guarda lo que el turno deja ganado; después se cuenta. Así no se pierde si el servidor cae.
    const record = { before, after: result.state, events: result.events };
    const rewards: TurnRewards = {
      rounds: result.events.flatMap((e) => (e.t === 'roundEnd' ? [e.round] : [])),
      present: this.here.map((s) => s.player.userId),
      earned: this.here
        .map((s) => ({
          userId: s.player.userId,
          achievements: personalAchievements(record, s.element, this.heals[s.element]),
        }))
        .filter((e) => e.achievements.length > 0),
    };
    for (const el of ELEMENTS) this.heals[el] += basicHealsBy(result.events, el);
    if ((rewards.rounds.length > 0 || rewards.earned.length > 0) && !(await this.host.rewards(this, rewards))) return;
    this.toHere((seat) => ({
      type: 'turn.result',
      turn: result.state.turn,
      events: eventsFor(result.events, seat.element),
      state: viewFor(result.state, seat.element),
    }));
    if (result.state.status !== 'playing') {
      await this.finish(result.state.status);
      return;
    }
    this.watch(result.state.turn);
  }

  /* ---------- Desconectarse, volver y salir ---------- */

  /** Esa persona deja de llevar a su ninja en este turno: lo que no había confirmado se descarta (R-38). */
  private release(seat: HumanSeat): void {
    seat.plays = false;
    if (this.phase !== 'planning' || this.ready.has(seat.element)) return;
    this.plans.delete(seat.element);
    this.ready.add(seat.element);
    this.toHere(() => ({ type: 'team.plan', turn: this.turn, ...this.teamPlan(seat.element) }));
    this.botReacts();
  }

  /** Lo que sigue cuando alguien dejó de estar: resolver, empezar o detener la partida. */
  private async afterAbsence(): Promise<void> {
    if (this.phase === 'over') return;
    if (this.here.length === 0) {
      await this.freeze();
      return;
    }
    await this.maybeBegin();
    await this.maybeResolve();
  }

  /** Se le cerró la conexión: su ninja queda quieto hasta que vuelva. */
  async disconnect(userId: string): Promise<void> {
    const seat = this.seatOf(userId);
    if (seat?.status !== 'here' || this.phase === 'over') return;
    seat.status = 'away';
    this.release(seat);
    this.toHere(() => ({ type: 'player.status', ninja: seat.element, status: 'away' }));
    await this.afterAbsence();
  }

  /**
   * Volvió: recibe la partida tal como está. Retoma a su ninja desde el turno siguiente (R-38); si la
   * partida estaba detenida porque no quedaba nadie, sigue con ese mismo turno, de nuevo.
   */
  async reconnect(userId: string): Promise<void> {
    const seat = this.seatOf(userId);
    if (seat?.status !== 'away' || this.phase === 'over') return;
    seat.status = 'here';
    const planning = this.phase === 'planning';
    this.host.send(userId, {
      type: 'match.resume',
      matchId: this.id,
      you: seat.element,
      seats: this.publicSeats(),
      state: viewFor(this.state, seat.element),
      room: this.room,
      turn: planning
        ? {
            n: this.turn,
            endsInMs: Math.max(0, this.deadline - this.host.now()),
            seconds: Math.round(this.host.timings.turnMs / 1000),
            plans: ELEMENTS.map((el) => this.teamPlan(el)),
          }
        : null,
    });
    this.toHere(() => ({ type: 'player.status', ninja: seat.element, status: 'here' }), seat);
    if (this.phase === 'frozen') await this.beginTurn();
  }

  /** Sale con el botón "Salir": abandona (R-39). Su ninja queda quieto hasta el final. */
  async leave(userId: string): Promise<void> {
    const seat = this.seatOf(userId);
    if (!seat || seat.status === 'left' || this.phase === 'over') return;
    seat.status = 'left';
    this.release(seat);
    this.toHere(() => ({ type: 'player.status', ninja: seat.element, status: 'left' }));
    await this.afterAbsence();
  }

  /**
   * No queda ninguna persona conectada: la partida se detiene, sin resolver turnos. Si todas abandonaron,
   * termina en el acto; si alguna puede volver, se la espera 2 minutos (R-38).
   */
  private async freeze(): Promise<void> {
    this.phase = 'frozen';
    this.plans.clear();
    this.ready.clear();
    this.cancel?.();
    this.cancel = null;
    if (this.humans.every((s) => s.status === 'left')) {
      await this.finish(null);
      return;
    }
    this.timer(() => this.finish(null), this.host.timings.emptyMs);
  }

  /** La partida terminó: con victoria o derrota, o sin nadie (`null`). */
  private async finish(result: 'victory' | 'defeat' | null): Promise<void> {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.cancel?.();
    this.cancel = null;
    const ids = (status: SeatStatus) => this.humans.filter((s) => s.status === status).map((s) => s.player.userId);
    // Quien no volvió antes del final también abandonó (R-39).
    await this.host.over(this, {
      result,
      state: this.state,
      present: ids('here'),
      away: ids('away'),
      left: ids('left'),
    });
  }

  /** Detiene la partida sin terminarla: el servidor se apaga. */
  stop(): void {
    this.phase = 'over';
    this.cancel?.();
    this.cancel = null;
  }
}
