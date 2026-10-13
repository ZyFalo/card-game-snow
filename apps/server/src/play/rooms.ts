import { randomInt } from 'node:crypto';
import { ELEMENTS, type ElementKind } from '@ventisca/core';
import {
  isRoomCode,
  normalizeRoomCode,
  type PlayError,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ServerPayload,
} from '@ventisca/protocol';
import type { Player } from './link';
import type { Team } from './queue';

/*
 * Las salas con código (R-53), para jugar con amigos.
 *
 * - El código tiene 6 caracteres, sin los que se confunden al dictarlos.
 * - Hay un asiento por elemento. Quien se une y encuentra ocupado su ninja elige uno libre.
 * - Solo quien creó la sala puede empezar: con dos personas, con el bot en el ninja libre; con tres, la
 *   partida completa (D-89).
 * - Al terminar una partida, el equipo vuelve a la sala.
 * - La sala se cierra cuando sale quien la creó, o cuando esa persona lleva 2 minutos sin conexión. Quien
 *   se desconecta conserva su asiento ese mismo tiempo (R-38).
 */

export type RoomState = Extract<ServerPayload, { type: 'room.state' }>;

export interface Member {
  player: Player;
  /** Su ninja, o `null` mientras elige uno libre. */
  seat: ElementKind | null;
  /** El ninja que traía y encontró ocupado. */
  wanted: ElementKind | null;
  connected: boolean;
  /** Cancela el plazo que corre mientras está sin conexión. */
  cancelGone: (() => void) | null;
}

export interface Room {
  code: string;
  /** Quien la creó: la única persona que puede empezar la partida. */
  host: Player;
  /** En orden de llegada. */
  members: Map<string, Member>;
  /** Hay una partida en curso: nadie más puede unirse. */
  playing: boolean;
  /** Quien la creó abandonó la partida en curso: la sala se cierra cuando esa partida termine. */
  orphan: boolean;
}

export interface RoomsOptions {
  /** Cuánto conserva su lugar quien se desconecta, y cuánto vive una sala sin nadie (R-38). */
  emptyMs: number;
  later(task: () => void, ms: number): () => void;
  /** La sala de esa persona cambió: hay que decírselo. */
  onState(userId: string, state: RoomState): void;
  /** La sala se cerró: esas personas vuelven al inicio en línea. */
  onClosed(room: Room, userIds: string[]): void;
  /** Un código nuevo. Las pruebas lo fijan. */
  code?: () => string;
}

/** Un código al azar. Con 32 caracteres y 6 lugares hay más de mil millones: adivinar uno no es práctico. */
export function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Por si un código sale repetido: se intenta de nuevo, y después de esto se da por imposible. */
const CODE_TRIES = 50;

export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly byUser = new Map<string, Room>();

  constructor(private readonly options: RoomsOptions) {}

  get size(): number {
    return this.rooms.size;
  }

  of(userId: string): Room | undefined {
    return this.byUser.get(userId);
  }

  /** Crea una sala. Quien la crea se sienta con el ninja que eligió. */
  create(player: Player, element: ElementKind): Room {
    const next = this.options.code ?? randomRoomCode;
    let code = next();
    for (let i = 0; this.rooms.has(code); i++) {
      if (i >= CODE_TRIES) throw new Error('No se pudo generar un código de sala libre.');
      code = next();
    }
    const room: Room = { code, host: player, members: new Map(), playing: false, orphan: false };
    room.members.set(player.userId, { player, seat: element, wanted: null, connected: true, cancelGone: null });
    this.rooms.set(code, room);
    this.byUser.set(player.userId, room);
    this.announce(room);
    return room;
  }

  /**
   * Se une a una sala con el código tal como lo escribió la persona. Si su ninja está libre, se sienta; si
   * no, entra sin asiento y elige uno libre.
   */
  join(player: Player, text: string, element: ElementKind): Room | PlayError {
    const code = normalizeRoomCode(text);
    const room = isRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room) return 'room_not_found';
    if (room.members.has(player.userId)) return room;
    if (room.playing) return 'room_started';
    if (room.members.size >= ELEMENTS.length) return 'room_full';
    const free = !this.seated(room, element);
    room.members.set(player.userId, {
      player,
      seat: free ? element : null,
      wanted: free ? null : element,
      connected: true,
      cancelGone: null,
    });
    this.byUser.set(player.userId, room);
    this.announce(room);
    return room;
  }

  /** Elige un ninja libre: quien entró sin asiento, o quien quiere cambiar el suyo. */
  pick(userId: string, element: ElementKind): PlayError | null {
    const room = this.byUser.get(userId);
    const member = room?.members.get(userId);
    if (!room || !member || room.playing) return 'not_now';
    if (member.seat === element) return null;
    if (this.seated(room, element)) return 'seat_taken';
    member.seat = element;
    member.wanted = null;
    this.announce(room);
    return null;
  }

  /** Sale de la sala. Si era quien la creó, la sala se cierra para todos. */
  leave(userId: string): void {
    const room = this.byUser.get(userId);
    if (!room) return;
    if (room.host.userId === userId) {
      this.close(room, userId);
      return;
    }
    this.remove(room, userId);
    this.announce(room);
  }

  /** Se le cerró la conexión: conserva su lugar un rato, por si vuelve. */
  disconnect(userId: string): void {
    const room = this.byUser.get(userId);
    const member = room?.members.get(userId);
    if (!room || !member?.connected) return;
    member.connected = false;
    // Durante una partida no corre ningún plazo: de quién sigue se ocupa la partida.
    if (!room.playing) this.startGone(room, member);
    this.announce(room);
  }

  /** Volvió: recupera su lugar. */
  reconnect(userId: string): Room | undefined {
    const room = this.byUser.get(userId);
    const member = room?.members.get(userId);
    if (!room || !member) return undefined;
    member.connected = true;
    member.cancelGone?.();
    member.cancelGone = null;
    this.announce(room);
    return room;
  }

  /**
   * Quien creó la sala empieza la partida. Juegan quienes están sentados y conectados: quien se quedó sin
   * conexión pierde su lugar. Con dos personas, el ninja libre es para el bot (D-89).
   */
  start(userId: string): Team | PlayError {
    const room = this.byUser.get(userId);
    if (!room || room.host.userId !== userId || room.playing) return 'not_now';
    const here = [...room.members.values()].filter((m) => m.connected);
    // Con alguien todavía eligiendo su ninja, la partida no empieza: se quedaría fuera.
    if (here.some((m) => m.seat === null) || here.length < 2) return 'not_now';
    for (const member of [...room.members.values()]) if (!member.connected) this.remove(room, member.player.userId);
    room.playing = true;
    const members = here.map((m) => ({ player: m.player, element: m.seat as ElementKind }));
    const bot = ELEMENTS.find((el) => members.every((m) => m.element !== el)) ?? null;
    return { members, bot };
  }

  /**
   * Esa persona abandonó la partida de su sala (R-39): sale también de la sala, y queda libre para jugar
   * en otra parte. Si es quien la creó, la sala se cierra cuando termine esa partida: los demás siguen
   * jugando.
   */
  abandon(userId: string): void {
    const room = this.byUser.get(userId);
    if (!room) return;
    if (!room.playing) {
      this.leave(userId);
      return;
    }
    if (room.host.userId === userId) room.orphan = true;
    this.remove(room, userId);
  }

  /** ¿Seguirá abierta esa sala cuando termine su partida? */
  survives(code: string): boolean {
    const room = this.rooms.get(code);
    return room !== undefined && !room.orphan;
  }

  /**
   * La partida de la sala terminó: quienes siguen en ella vuelven a la sala, con sus asientos. Si quien la
   * creó abandonó la partida, la sala se cierra sin más aviso: el resultado ya dijo que no hay sala a la
   * que volver. Devuelve si la sala sigue abierta.
   */
  finish(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    room.playing = false;
    if (room.orphan) {
      for (const userId of [...room.members.keys()]) this.remove(room, userId);
      this.rooms.delete(room.code);
      return false;
    }
    // Quien sigue sin conexión al terminar la partida conserva su lugar el plazo de siempre.
    for (const member of room.members.values()) if (!member.connected) this.startGone(room, member);
    this.announce(room);
    return true;
  }

  /** Lo que ve esa persona de su sala, o `null` si no está en ninguna. */
  stateOf(userId: string): RoomState | null {
    const room = this.byUser.get(userId);
    const me = room?.members.get(userId);
    if (!room || !me) return null;
    const here = [...room.members.values()].filter((m) => m.connected);
    const seated = here.filter((m) => m.seat !== null);
    const choosing = here.filter((m) => m.seat === null);
    const start =
      choosing.length > 0 ? 'choosing' : seated.length >= 3 ? 'full' : seated.length === 2 ? 'bot' : 'alone';
    return {
      type: 'room.state',
      code: room.code,
      host: room.host.name,
      seats: ELEMENTS.map((element) => {
        const member = this.seated(room, element);
        return {
          element,
          name: member?.player.name ?? null,
          host: member?.player.userId === room.host.userId,
          you: member?.player.userId === userId,
          connected: member?.connected ?? false,
        };
      }),
      you: { seat: me.seat, host: room.host.userId === userId, wanted: me.wanted },
      choosing: choosing.map((m) => m.player.name),
      start,
      bot: start === 'bot' ? (ELEMENTS.find((el) => seated.every((m) => m.seat !== el)) ?? null) : null,
    };
  }

  /** Cierra todas las salas y cancela lo pendiente (al apagar el servidor). */
  clear(): void {
    for (const room of this.rooms.values()) for (const m of room.members.values()) m.cancelGone?.();
    this.rooms.clear();
    this.byUser.clear();
  }

  private seated(room: Room, element: ElementKind): Member | undefined {
    return [...room.members.values()].find((m) => m.seat === element);
  }

  /** El plazo de quien está sin conexión: al vencer pierde su lugar, y si creó la sala, la sala se cierra. */
  private startGone(room: Room, member: Member): void {
    member.cancelGone?.();
    member.cancelGone = this.options.later(() => {
      member.cancelGone = null;
      // Volvió, o ya no está en esta sala: el plazo no aplica.
      if (member.connected || room.members.get(member.player.userId) !== member) return;
      if (room.host.userId === member.player.userId) {
        this.close(room, null);
        return;
      }
      this.remove(room, member.player.userId);
      this.announce(room);
    }, this.options.emptyMs);
  }

  private remove(room: Room, userId: string): void {
    const member = room.members.get(userId);
    if (!member) return;
    member.cancelGone?.();
    member.cancelGone = null;
    room.members.delete(userId);
    if (this.byUser.get(userId) === room) this.byUser.delete(userId);
  }

  /** Cierra la sala. A `leaver`, que salió por su cuenta, no se le avisa: ya sabe que se fue. */
  private close(room: Room, leaver: string | null): void {
    const told = [...room.members.keys()].filter((id) => id !== leaver);
    for (const userId of [...room.members.keys()]) this.remove(room, userId);
    this.rooms.delete(room.code);
    this.options.onClosed(room, told);
  }

  /** Les dice a quienes están en la sala cómo quedó. Durante una partida no: están jugando, no en la sala. */
  private announce(room: Room): void {
    if (room.playing) return;
    for (const member of room.members.values()) {
      if (!member.connected) continue;
      const state = this.stateOf(member.player.userId);
      if (state) this.options.onState(member.player.userId, state);
    }
  }
}
