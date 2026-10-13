import { randomInt, randomUUID } from 'node:crypto';
import { type AchievementId, type DeckCard, type ElementKind, reserveFor } from '@ventisca/core';
import {
  CLOSE,
  type ClientMessage,
  PLAY_TURN_SECONDS,
  type PlayError,
  type SeatStatus,
  type ServerPayload,
} from '@ventisca/protocol';
import type { AchievementGain } from '../progress/store';
import type { Link, Player } from './link';
import { Match, type MatchOutcome, type MatchTimings, type PrepareMatch, type TurnRewards } from './match';
import { Queue, type Team } from './queue';
import { Rooms } from './rooms';
import type { PlayStore } from './store';

/*
 * El centro del juego en línea: sabe quién está conectado y dónde está cada persona (en el inicio, en la
 * cola, en una sala o en una partida), y reparte cada mensaje a quien le toca.
 *
 * Todo vive en la memoria de este proceso: hay una sola instancia del servidor (PRD de v2, "Arquitectura").
 */

export interface HubLog {
  info(data: object, message: string): void;
  warn(data: object, message: string): void;
  error(data: object, message: string): void;
}

/** Los plazos del juego en línea. Las pruebas los acortan. */
export interface PlayTimings extends MatchTimings {
  /** D-88: lo que esperan dos personas juntas en la cola antes de que se les ofrezca el bot. */
  offerMs: number;
}

export const PLAY_TIMINGS: PlayTimings = {
  // R-36 (D-90): 10 s por turno, como el original.
  turnMs: PLAY_TURN_SECONDS * 1000,
  graceMs: 400,
  // El turno más largo, con combo, se anima en unos 8 s; la entrada de una partida, en menos.
  watchMs: 20_000,
  offerMs: 30_000,
  // R-38: 2 minutos sin nadie.
  emptyMs: 120_000,
};

export interface HubOptions {
  log: HubLog;
  store: PlayStore;
  timings?: Partial<PlayTimings>;
  /** La semilla de cada partida; las pruebas la fijan. Por defecto, una al azar que nadie puede adivinar. */
  seed?: () => number;
  /** Solo para las pruebas: deja cada partida recién creada en un tablero preparado. */
  prepare?: PrepareMatch;
}

export class Hub {
  /** La conexión abierta de cada cuenta: una sola a la vez (D-102). */
  private readonly links = new Map<string, Link>();
  /** La partida de cada persona que está en una y no la abandonó. */
  private readonly playing = new Map<string, Match>();
  private readonly matches = new Set<Match>();
  /**
   * Lo que cada persona lleva sumado a sus logros en su partida en curso, para mostrárselo al final. Vive
   * solo en la memoria, mientras dura la partida: en la base queda el avance de la cuenta, no el de cada partida.
   */
  private readonly gains = new WeakMap<Match, Map<string, AchievementGain>>();
  private readonly queue: Queue;
  private readonly rooms: Rooms;
  private readonly timings: PlayTimings;
  private readonly store: PlayStore;
  /** Lo que cambia el estado pasa de a uno, en orden: ningún mensaje ve a medias lo que hizo otro. */
  private chain: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private readonly options: HubOptions) {
    this.timings = { ...PLAY_TIMINGS, ...options.timings };
    this.store = options.store;
    this.queue = new Queue({
      offerMs: this.timings.offerMs,
      now: () => Date.now(),
      later: (task, ms) => this.later(task, ms),
      onState: (userId, state) => this.send(userId, state),
      // El equipo se arma a mitad de un mensaje: la partida empieza enseguida, dentro de la misma tarea.
      onTeam: (team) => this.teams.push({ team, room: null }),
    });
    this.rooms = new Rooms({
      emptyMs: this.timings.emptyMs,
      later: (task, ms) => this.later(task, ms),
      onState: (userId, state) => this.send(userId, state),
      onClosed: (_room, userIds) => {
        for (const userId of userIds) this.send(userId, { type: 'idle', reason: 'room_closed', notice: null });
      },
    });
  }

  /** Los equipos ya armados que esperan su partida: se empiezan al terminar la tarea en curso. */
  private readonly teams: { team: Team; room: string | null }[] = [];

  /** Cuántas personas hay conectadas. */
  get online(): number {
    return this.links.size;
  }

  /** Cuántas partidas hay en curso. */
  get live(): number {
    return this.matches.size;
  }

  /** Cómo está esa persona en su partida, o `null` si no está en ninguna. */
  statusOf(userId: string): SeatStatus | null {
    return this.playing.get(userId)?.statusOf(userId) ?? null;
  }

  /**
   * Corre `task` cuando terminen las anteriores, y después empieza las partidas que se hayan armado. Un
   * fallo se registra y no detiene a las que siguen.
   */
  private run(task: () => void | Promise<void>): Promise<void> {
    this.chain = this.chain
      .then(async () => {
        if (this.stopped) return;
        await task();
        while (this.teams.length > 0) {
          const next = this.teams.shift();
          if (next) await this.begin(next.team, next.room);
        }
      })
      .catch((err: unknown) => {
        const e = err as Error;
        this.options.log.error({ err: { type: e?.name, message: e?.message } }, 'Fallo en el juego en línea');
      });
    return this.chain;
  }

  /** Corre `task` dentro de `ms`, en su turno; devuelve cómo cancelarlo. */
  private later(task: () => void | Promise<void>, ms: number): () => void {
    const timer = setTimeout(() => void this.run(task), ms);
    return () => clearTimeout(timer);
  }

  private send(userId: string, message: ServerPayload, re?: number): void {
    this.links.get(userId)?.send(message, re);
  }

  /* ---------- Conexiones ---------- */

  /** Una persona abrió su conexión. Si ya tenía otra, vale la nueva: la anterior se cierra. */
  connect(link: Link): Promise<void> {
    return this.run(async () => {
      const { userId, name } = link.player;
      const previous = this.links.get(userId);
      this.links.set(userId, link);
      previous?.close(CLOSE.replaced);
      link.send({ type: 'welcome', name });
      await this.place(link.player, previous !== undefined);
    });
  }

  /** La conexión se cerró. La de una pestaña ya reemplazada no cuenta: esa persona sigue conectada. */
  disconnect(link: Link): Promise<void> {
    return this.run(async () => {
      const { userId } = link.player;
      if (this.links.get(userId) !== link) return;
      this.links.delete(userId);
      await this.gone(userId);
    });
  }

  /** Un mensaje ya validado contra el protocolo. */
  receive(link: Link, message: ClientMessage): Promise<void> {
    return this.run(async () => {
      // Llegó por una conexión que ya fue reemplazada: no vale.
      if (this.links.get(link.player.userId) !== link) return;
      const error = await this.handle(link.player, message);
      if (error) link.send({ type: 'error', code: error }, message.seq);
    });
  }

  /** La sesión de esa cuenta terminó (la cerró, cambió su contraseña o borró la cuenta): fuera su conexión. */
  endSession(userId: string): Promise<void> {
    return this.run(async () => {
      const link = this.links.get(userId);
      if (!link) return;
      this.links.delete(userId);
      link.close(CLOSE.sessionEnded);
      await this.gone(userId);
    });
  }

  /**
   * El servidor se apaga. Las partidas en curso se pierden (R-54): a cada persona se le acreditan las
   * rondas que ya había terminado, y le queda el aviso para cuando vuelva. Después se cierran todas las
   * conexiones, y cada cliente volverá a conectarse solo.
   */
  shutdown(): Promise<void> {
    return this.run(async () => {
      this.stopped = true;
      this.queue.clear();
      this.rooms.clear();
      for (const match of this.matches) {
        match.stop();
        await this.store.interrupt(match.id);
      }
      this.matches.clear();
      this.playing.clear();
      for (const link of this.links.values()) link.close(CLOSE.restart);
      this.links.clear();
    });
  }

  /**
   * Le dice a la persona dónde está al conectarse: en su partida, en su sala o en el inicio. `again`: ya
   * estaba conectada desde otra pestaña, así que para los demás no cambió nada.
   */
  private async place(player: Player, again: boolean): Promise<void> {
    const { userId } = player;
    // Su lugar en la sala vuelve a contar como conectado, también si la sala está en plena partida.
    const room = this.rooms.reconnect(userId);
    const match = this.playing.get(userId);
    if (match) {
      // Con otra pestaña sigue "aquí": primero sale, y vuelve con el estado al día.
      if (again) await match.disconnect(userId);
      if (this.playing.get(userId) === match) {
        await match.reconnect(userId);
        return;
      }
    }
    if (room) return;
    await this.idle(userId);
  }

  /** Lleva a esa persona al inicio en línea, con el aviso pendiente de su última partida si hay uno. */
  private async idle(userId: string): Promise<void> {
    this.send(userId, { type: 'idle', reason: null, notice: await this.store.notice(userId) });
  }

  /** Esa persona se quedó sin conexión: sale de la cola, y su lugar en la sala o en la partida la espera. */
  private async gone(userId: string): Promise<void> {
    this.queue.leave(userId);
    this.rooms.disconnect(userId);
    await this.playing.get(userId)?.disconnect(userId);
  }

  /* ---------- Mensajes ---------- */

  /** Devuelve el error con que se responde, o `null` si el mensaje se atendió. */
  private async handle(player: Player, message: ClientMessage): Promise<PlayError | null> {
    const { userId } = player;
    const match = this.playing.get(userId);
    switch (message.type) {
      case 'queue.join': {
        if (match || this.rooms.of(userId)) return 'not_now';
        if ((await this.store.collectionOf(userId)) === null) return 'camino_required';
        this.queue.join(player, message.element);
        return null;
      }
      case 'queue.leave':
        if (!this.queue.leave(userId)) return 'not_now';
        await this.idle(userId);
        return null;
      case 'queue.acceptBot':
        return this.queue.acceptBot(userId) ? null : 'not_now';
      case 'room.create': {
        if (match || this.rooms.of(userId) || this.queue.has(userId)) return 'not_now';
        if ((await this.store.collectionOf(userId)) === null) return 'camino_required';
        this.rooms.create(player, message.element);
        return null;
      }
      case 'room.join': {
        if (match || this.rooms.of(userId) || this.queue.has(userId)) return 'not_now';
        if ((await this.store.collectionOf(userId)) === null) return 'camino_required';
        const joined = this.rooms.join(player, message.code, message.element);
        return typeof joined === 'string' ? joined : null;
      }
      case 'room.pick':
        return this.rooms.pick(userId, message.element);
      case 'room.start': {
        const room = this.rooms.of(userId);
        const team = this.rooms.start(userId);
        if (typeof team === 'string' || !room) return typeof team === 'string' ? team : 'not_now';
        this.teams.push({ team, room: room.code });
        return null;
      }
      case 'room.leave':
        if (match || !this.rooms.of(userId)) return 'not_now';
        this.rooms.leave(userId);
        await this.idle(userId);
        return null;
      case 'plan.update':
      case 'plan.confirm':
        // Un plan de un turno que ya pasó es una carrera normal: se ignora sin responder.
        await match?.planBy(userId, message.turn, message.plan, message.type === 'plan.confirm');
        return match ? null : 'not_now';
      case 'turn.ready':
        await match?.watchedBy(userId, message.turn);
        return match ? null : 'not_now';
      case 'match.leave': {
        if (!match) return 'not_now';
        this.playing.delete(userId);
        // Abandonó (R-39): pierde las monedas de esta partida. Su avance en los logros ya está guardado.
        await this.store.abandon(match.id, userId);
        // Quien sale de la partida también sale de su sala, y vuelve al inicio en línea.
        this.rooms.abandon(userId);
        await match.leave(userId);
        await this.idle(userId);
        return null;
      }
      case 'notice.seen':
        await this.store.noticeSeen(userId);
        return null;
    }
  }

  /* ---------- Partidas ---------- */

  /** Empieza la partida de un equipo: cada persona juega con su colección del elemento de su ninja (R-34). */
  private async begin(team: Team, room: string | null): Promise<void> {
    const decks: Partial<Record<ElementKind, DeckCard[]>> = {};
    for (const member of team.members) {
      const collection = (await this.store.collectionOf(member.player.userId)) ?? {};
      decks[member.element] = reserveFor(collection, member.element);
    }
    const id = randomUUID();
    const seed = this.options.seed?.() ?? randomInt(0, 2 ** 32);
    const match = new Match(
      // D-85: en la Beta solo se juega Clásica.
      { id, team, room, difficulty: 'classic', seed, decks, prepare: this.options.prepare },
      {
        timings: this.timings,
        now: () => Date.now(),
        later: (task, ms) => this.later(task, ms),
        send: (userId, message) => this.send(userId, message),
        rewards: (m, turn) => this.rewards(m, turn),
        over: (m, outcome) => this.finished(m, outcome),
      },
    );
    await this.store.openMatch({
      id,
      roomCode: room,
      difficulty: match.difficulty,
      seed,
      seats: (['fire', 'water', 'snow'] as const).map((element) => ({
        element,
        userId: team.members.find((m) => m.element === element)?.player.userId ?? null,
      })),
    });
    this.matches.add(match);
    for (const member of team.members) this.playing.set(member.player.userId, match);
    this.options.log.info({ matchId: id, people: team.members.length, bot: team.bot !== null }, 'Empieza una partida');
    match.start();
    // Quien se quedó sin conexión justo antes de empezar entra a la partida como desconectado.
    for (const member of team.members) {
      if (!this.links.has(member.player.userId)) await match.disconnect(member.player.userId);
    }
  }

  /**
   * Un turno dejó algo ganado: las rondas superadas quedan por cobrar para quienes estaban conectados, y
   * el avance de los logros se suma en el acto (R-40 y R-55). Si la base dice que la partida ya no está viva,
   * es que otro proceso del servidor la interrumpió al arrancar (R-54): aquí también se termina.
   */
  private async rewards(match: Match, turn: TurnRewards): Promise<boolean> {
    if (turn.rounds.length > 0 && !(await this.store.recordRounds(match.id, turn.present, turn.rounds))) {
      await this.interrupted(match);
      return false;
    }
    if (turn.feats.length === 0) return true;
    const fresh = await this.store.addFeats(turn.feats);
    const gains = this.gains.get(match) ?? new Map<string, AchievementGain>();
    for (const [userId, gain] of fresh) {
      const mine = gains.get(userId) ?? { gained: {}, completed: [] };
      for (const [id, n] of Object.entries(gain.gained) as [AchievementId, number][]) {
        mine.gained[id] = (mine.gained[id] ?? 0) + n;
      }
      mine.completed.push(...gain.completed);
      gains.set(userId, mine);
    }
    this.gains.set(match, gains);
    return true;
  }

  /** La partida se perdió por un reinicio del servidor: quienes seguían en ella vuelven al inicio, con el aviso. */
  private async interrupted(match: Match): Promise<void> {
    match.stop();
    this.matches.delete(match);
    for (const seat of match.humans) {
      const { userId } = seat.player;
      if (this.playing.get(userId) !== match) continue;
      this.playing.delete(userId);
      this.rooms.abandon(userId);
      await this.idle(userId);
    }
    if (match.room !== null) this.rooms.finish(match.room);
    this.options.log.warn({ matchId: match.id }, 'Una partida se interrumpió desde otro proceso');
  }

  /**
   * Una partida terminó. Se cierra y se hacen las cuentas: cada persona presente cobra sus rondas, y quien
   * no volvió a tiempo abandonó (R-39). Después cada quien recibe su resultado y vuelve a su lugar.
   */
  private async finished(match: Match, outcome: MatchOutcome): Promise<void> {
    const { state, result, present, away, left } = outcome;
    const settled = await this.store.settle(match.id, {
      result,
      bonusOutcome: state.bonusOutcome,
      turns: state.turn,
      present,
      away,
    });
    if (settled === null) {
      await this.interrupted(match);
      return;
    }
    this.matches.delete(match);
    // Quienes abandonaron con "Salir" ya no estaban en `playing`; los demás salen ahora.
    for (const seat of match.humans) {
      const { userId } = seat.player;
      if (this.playing.get(userId) === match) this.playing.delete(userId);
    }
    // Quien no volvió antes del final también abandonó, y sale de la sala (R-39).
    for (const userId of away) this.rooms.abandon(userId);
    const open = match.room !== null && this.rooms.survives(match.room);
    this.options.log.info(
      { matchId: match.id, result, turns: state.turn, present: present.length, left: away.length + left.length },
      'Termina una partida',
    );
    if (result !== null) {
      const gains = this.gains.get(match);
      for (const userId of present) {
        const mine = settled.get(userId);
        // Sin cuentas, esa cuenta se borró a mitad de la partida: no hay resultado que darle.
        if (!mine) continue;
        this.send(userId, {
          type: 'match.end',
          result,
          coins: { lines: mine.lines, doubled: mine.doubled, total: mine.total },
          achievements: mine.achievements,
          gained: gains?.get(userId)?.gained ?? {},
          completed: gains?.get(userId)?.completed ?? [],
          balance: mine.balance,
          room: open ? match.room : null,
        });
      }
    }
    // Después del resultado, la sala: quien vuelve a ella la recibe para cuando cierre esa pantalla.
    if (match.room !== null) this.rooms.finish(match.room);
  }
}
