import { ACHIEVEMENT_IDS, type GameEvent, type MatchState } from '@ventisca/core';
import { z } from 'zod';

/*
 * El juego en línea (PRD de v2, "Protocolo de mensajes"). Toda la partida viaja por una sola conexión
 * WebSocket, en `PLAY_PATH`, con mensajes en JSON. Cada mensaje lleva la versión del protocolo, un número
 * de secuencia y su tipo.
 *
 * El servidor no confía en nada de lo que llega: valida cada mensaje con estos esquemas y cada plan con el
 * motor. Lo que manda el servidor también tiene su esquema, para que el cliente no anime algo mal formado.
 */

/** Sube cuando un cambio deja de entenderse con los clientes ya abiertos: esos reciben `protocol_version`. */
export const PROTOCOL_VERSION = 1;

/** La ruta de la conexión. Va bajo `/api`, en el mismo origen que el juego: la cookie de sesión viaja sola. */
export const PLAY_PATH = '/api/play';

/** Límites de la conexión (D-102). Un mensaje más grande, o más mensajes que estos, la cierran. */
export const PLAY_LIMITS = {
  /** Tamaño máximo de un mensaje del cliente, en bytes. El plan más largo no llega a 200. */
  maxMessageBytes: 2048,
  /** Mensajes por segundo que se sostienen, y cuántos se aceptan de golpe. */
  messagesPerSecond: 15,
  burst: 30,
} as const;

/** Por qué el servidor cerró la conexión. Los códigos de 4000 en adelante son de la aplicación. */
export const CLOSE = {
  /** La misma cuenta abrió el juego en otra pestaña: vale la conexión nueva. */
  replaced: 4000,
  /** Un mensaje que no cumple el protocolo, o de otra versión. */
  protocol: 4001,
  rateLimited: 4002,
  /** La sesión terminó: se cerró, o se borró la cuenta. */
  sessionEnded: 4003,
  /** El servidor se está reiniciando (RFC 6455: "service restart"). */
  restart: 1012,
} as const;

const element = z.enum(['fire', 'water', 'snow']);
type Element = z.infer<typeof element>;

/* ---------- Salas con código (R-53) ---------- */

/** 6 caracteres, sin los que se confunden al dictarlos: ni la O ni el 0, ni la I ni el 1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** El código tal como lo escribió la persona: sin espacios ni guiones, y en mayúsculas. */
export const normalizeRoomCode = (text: string): string => text.replace(/[\s-]/g, '').toUpperCase();

export const isRoomCode = (code: string): boolean => ROOM_CODE.test(code);

/** Partido en dos para dictarlo fácil: `KQ7 RTX`. */
export const formatRoomCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

/* ---------- El plan de un ninja ---------- */

const tile = z.object({ x: z.number().int().min(0).max(8), y: z.number().int().min(0).max(4) }).strict();

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('attack'), targetId: z.string().min(1).max(8) }).strict(),
  z.object({ type: z.literal('heal'), targetId: element }).strict(),
  z.object({ type: z.literal('revive'), targetId: element }).strict(),
  z.object({ type: z.literal('card'), cardId: z.string().min(1).max(16), at: tile }).strict(),
]);

/**
 * Lo que una persona planea para su ninja en un turno: a dónde se mueve y qué hace. No dice de qué ninja
 * es: el servidor sabe qué asiento ocupa cada conexión, y nadie puede planear por otro.
 */
export const seatPlanSchema = z.object({ moveTo: tile.optional(), action: action.optional() }).strict();
export type SeatPlan = z.infer<typeof seatPlanSchema>;

/* ---------- Del cliente al servidor ---------- */

const fromClient = { v: z.literal(PROTOCOL_VERSION), seq: z.number().int().nonnegative() };
const turn = z.number().int().nonnegative();

export const clientMessageSchema = z.discriminatedUnion('type', [
  /** Entra a la cola pública con ese ninja (R-52). */
  z.object({ ...fromClient, type: z.literal('queue.join'), element }).strict(),
  z.object({ ...fromClient, type: z.literal('queue.leave') }).strict(),
  /** Acepta empezar con el bot en el ninja libre (D-88). */
  z.object({ ...fromClient, type: z.literal('queue.acceptBot') }).strict(),
  /** Crea una sala y se sienta con ese ninja (R-53). */
  z.object({ ...fromClient, type: z.literal('room.create'), element }).strict(),
  /** Se une a una sala. El código llega como lo escribió la persona; el servidor lo normaliza. */
  z.object({ ...fromClient, type: z.literal('room.join'), code: z.string().min(1).max(16), element }).strict(),
  /** Elige un ninja libre de la sala. */
  z.object({ ...fromClient, type: z.literal('room.pick'), element }).strict(),
  /** Solo quien creó la sala: empieza la partida (D-89). */
  z.object({ ...fromClient, type: z.literal('room.start') }).strict(),
  z.object({ ...fromClient, type: z.literal('room.leave') }).strict(),
  /** El plan en curso de su ninja, para que lo vean los compañeros (R-35). */
  z.object({ ...fromClient, type: z.literal('plan.update'), turn, plan: seatPlanSchema }).strict(),
  /** El plan final del turno. Confirmar es definitivo (R-36). */
  z.object({ ...fromClient, type: z.literal('plan.confirm'), turn, plan: seatPlanSchema }).strict(),
  /** Terminó de ver ese turno: el reloj del siguiente puede empezar (R-36). El 0 es la entrada de la partida. */
  z.object({ ...fromClient, type: z.literal('turn.ready'), turn }).strict(),
  /** Sale de la partida: es abandonar (R-39). */
  z.object({ ...fromClient, type: z.literal('match.leave') }).strict(),
  /** Ya vio el aviso de su última partida: no vuelve a salir. */
  z.object({ ...fromClient, type: z.literal('notice.seen') }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];
/** Un mensaje del cliente sin lo que le pone la conexión al enviarlo. */
export type ClientPayload = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v' | 'seq'> : never) : never;

/* ---------- Del servidor al cliente ---------- */

/** Por qué una petición no se pudo hacer. El cliente pone el texto; el servidor solo manda el código. */
export const playErrorSchema = z.enum([
  /** No cumple el protocolo. */
  'bad_message',
  /** El cliente es de otra versión: hay que recargar la página. */
  'protocol_version',
  'rate_limited',
  /** El mensaje no vale ahora: por ejemplo, confirmar un turno que ya se resolvió. */
  'not_now',
  /** Falta elegir la carta de camino (R-30): sin ella no hay colección con que jugar. */
  'camino_required',
  'room_not_found',
  'room_full',
  'room_started',
  /** Ese ninja ya lo tiene otra persona de la sala. */
  'seat_taken',
]);
export type PlayError = z.infer<typeof playErrorSchema>;

/**
 * El aviso que queda pendiente de la última partida, y que se muestra una sola vez sobre "Jugar en línea":
 * la partida terminó mientras la persona estaba desconectada (cuenta como abandono, R-39), o el servidor se
 * reinició (R-54).
 */
export const matchNoticeSchema = z.enum(['left_behind', 'restart']);
export type MatchNotice = z.infer<typeof matchNoticeSchema>;

/** Por qué la persona volvió al inicio en línea sin pedirlo. */
export const idleReasonSchema = z.enum([
  /** La sala se cerró: salió quien la creó, o pasó 2 minutos sin nadie (R-53). */
  'room_closed',
]);
export type IdleReason = z.infer<typeof idleReasonSchema>;

const achievement = z.enum(ACHIEVEMENT_IDS);
const round = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal('bonus')]);

/** Un asiento de la cola: el elemento y, si ya hay alguien, su nombre visible. */
const queueSeat = z.object({ element, name: z.string().nullable() });

/** Un asiento de una sala. `connected`: una persona sentada pero sin conexión conserva su lugar un rato. */
const roomSeat = z.object({
  element,
  name: z.string().nullable(),
  host: z.boolean(),
  you: z.boolean(),
  connected: z.boolean(),
});

/**
 * Cómo está una persona en la partida: jugando, desconectada (su ninja queda quieto, R-38) o fuera, porque
 * abandonó (R-39).
 */
export const seatStatusSchema = z.enum(['here', 'away', 'left']);
export type SeatStatus = z.infer<typeof seatStatusSchema>;

/** Un asiento de la partida. El bot no tiene nombre ni estado: siempre está. */
const matchSeat = z.object({
  element,
  kind: z.enum(['human', 'bot']),
  name: z.string().nullable(),
  status: seatStatusSchema,
});
export type MatchSeat = z.infer<typeof matchSeat>;

/**
 * El plan de un ninja tal como lo ven los demás. `card` es el valor de la carta que planea jugar: el resto
 * de su mano no se ve (R-35). `ready`: ya confirmó, o no tiene nada que confirmar (el bot, un ninja quieto
 * o caído).
 */
const teamPlan = z.object({
  ninja: element,
  plan: seatPlanSchema.nullable(),
  card: z.number().int().nullable(),
  ready: z.boolean(),
});
export type TeamPlan = z.infer<typeof teamPlan>;

/** El estado y los eventos son del motor: ya vienen del servidor, y aquí solo se comprueba su forma general. */
const matchState = z.custom<MatchState>((v) => typeof v === 'object' && v !== null && 'ninjas' in v && 'enemies' in v);
const gameEvents = z.custom<GameEvent[]>((v) => Array.isArray(v) && v.every((e) => typeof e?.t === 'string'));

const fromServer = {
  v: z.literal(PROTOCOL_VERSION),
  seq: z.number().int().nonnegative(),
  /** El `seq` del mensaje del cliente al que responde, si responde a uno. */
  re: z.number().int().nonnegative().optional(),
};

/** El reloj del turno: cuánto falta, medido al enviar, y cuánto dura entero (R-36). */
const clock = { endsInMs: z.number().int().nonnegative(), seconds: z.number().int().positive() };

export const serverMessageSchema = z.discriminatedUnion('type', [
  /** La conexión quedó abierta. Enseguida llega dónde está la persona: `idle`, la cola, una sala o su partida. */
  z.object({ ...fromServer, type: z.literal('welcome'), name: z.string() }),
  /** Está en el inicio en línea: ni en la cola, ni en una sala, ni en una partida. */
  z.object({
    ...fromServer,
    type: z.literal('idle'),
    reason: idleReasonSchema.nullable(),
    notice: matchNoticeSchema.nullable(),
  }),
  /**
   * La cola (R-52). Los tres asientos van en orden Fuego, Agua y Nieve. `offer`: la oferta del bot, con el
   * ninja que tomaría, si esta persona ya aceptó y a quién se espera.
   */
  z.object({
    ...fromServer,
    type: z.literal('queue.state'),
    you: element,
    seats: z.array(queueSeat).length(3),
    offer: z.object({ bot: element, accepted: z.boolean(), waitingFor: z.string().nullable() }).nullable(),
    /** Cuánto lleva buscando esta persona. */
    waitedMs: z.number().int().nonnegative(),
  }),
  /**
   * Una sala (R-53). `you.seat` es `null` mientras la persona elige un ninja libre, y `you.wanted`, el que
   * traía y encontró ocupado. `start`: qué puede hacer quien la creó.
   */
  z.object({
    ...fromServer,
    type: z.literal('room.state'),
    code: z.string(),
    host: z.string(),
    seats: z.array(roomSeat).length(3),
    you: z.object({ seat: element.nullable(), host: z.boolean(), wanted: element.nullable() }),
    /** Quienes todavía eligen su ninja: con ellos pendientes, la partida no empieza. */
    choosing: z.array(z.string()),
    start: z.enum(['alone', 'choosing', 'bot', 'full']),
    /** El ninja que tomaría el bot, si se empieza con él. */
    bot: element.nullable(),
  }),
  /** Empieza una partida. `room`: el código de la sala desde la que se juega, o `null` si salió de la cola. */
  z.object({
    ...fromServer,
    type: z.literal('match.start'),
    matchId: z.string(),
    you: element,
    seats: z.array(matchSeat).length(3),
    state: matchState,
    events: gameEvents,
    room: z.string().nullable(),
  }),
  /**
   * La persona volvió a una partida en curso (R-38). Trae el estado tal como está, sin animarlo. Su ninja
   * sigue quieto hasta el turno siguiente. `turn` es `null` entre un turno y otro, mientras se ve el anterior.
   */
  z.object({
    ...fromServer,
    type: z.literal('match.resume'),
    matchId: z.string(),
    you: element,
    seats: z.array(matchSeat).length(3),
    state: matchState,
    room: z.string().nullable(),
    turn: z.object({ n: turn, ...clock, plans: z.array(teamPlan) }).nullable(),
  }),
  /** Empieza la planificación de un turno, con su reloj. `plans`: quién ya está listo y el plan del bot. */
  z.object({
    ...fromServer,
    type: z.literal('turn.start'),
    turn,
    ...clock,
    seats: z.array(matchSeat).length(3),
    plans: z.array(teamPlan),
  }),
  /** Cambió el plan de un compañero, o confirmó (R-35). */
  z.object({ ...fromServer, type: z.literal('team.plan'), turn, ...teamPlan.shape }),
  /**
   * El servidor no aceptó parte del plan de esta persona: `plan` es lo que quedó. `reason`: la casilla ya
   * la reservó un compañero, a ese caído ya lo revive otro, o el plan no vale para el motor.
   */
  z.object({
    ...fromServer,
    type: z.literal('plan.fix'),
    turn,
    plan: seatPlanSchema.nullable(),
    reason: z.enum(['tile_reserved', 'revive_taken', 'invalid']),
    /** El ninja del compañero que llegó primero. */
    by: element.nullable(),
  }),
  /** Un turno resuelto: sus eventos, para animarlos, y el estado que queda. */
  z.object({ ...fromServer, type: z.literal('turn.result'), turn, events: gameEvents, state: matchState }),
  /** Una persona se desconectó, volvió o abandonó. */
  z.object({ ...fromServer, type: z.literal('player.status'), ninja: element, status: seatStatusSchema }),
  /**
   * La partida terminó. Cada persona recibe lo suyo: las rondas que cobró, sus monedas ya acreditadas (con
   * `doubled` si su amuleto está completo), los logros que ganó en esta partida, todos los que tiene y su
   * saldo. `room`: la sala a la que vuelve, si sigue abierta.
   */
  z.object({
    ...fromServer,
    type: z.literal('match.end'),
    result: z.enum(['victory', 'defeat']),
    coins: z.object({
      lines: z.array(z.object({ round, coins: z.number().int().nonnegative() })),
      doubled: z.boolean(),
      total: z.number().int().nonnegative(),
    }),
    earned: z.array(achievement),
    achievements: z.array(achievement),
    balance: z.number().int().nonnegative(),
    room: z.string().nullable(),
  }),
  z.object({ ...fromServer, type: z.literal('error'), code: playErrorSchema }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerMessageType = ServerMessage['type'];
/** Un mensaje del servidor sin lo que le pone la conexión al enviarlo. */
export type ServerPayload = ServerMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'v' | 'seq' | 're'>
    : never
  : never;

export type { Element as PlayElement };
