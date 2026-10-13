import { PLAY_LIMITS, PROTOCOL_VERSION, type ServerPayload } from '@ventisca/protocol';

/* Una conexión abierta del juego en línea, vista desde el servidor. */

/** La persona al otro lado: su cuenta y su nombre visible, que ven sus compañeros. */
export interface Player {
  userId: string;
  name: string;
}

/**
 * Por dónde el servidor le habla a una persona. Detrás hay un WebSocket; las pruebas de la cola, las salas
 * y las partidas usan uno de mentira, sin red.
 */
export interface Link {
  readonly player: Player;
  /** `re`: el `seq` del mensaje del cliente al que se responde. */
  send(message: ServerPayload, re?: number): void;
  close(code: number): void;
}

/** Lo mínimo que se usa de un WebSocket: así no hace falta uno de verdad para probar los límites. */
export interface RawSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number): void;
}

const OPEN = 1;

/** La conexión de verdad: numera lo que envía y descarta lo que ya no se puede entregar. */
export class SocketLink implements Link {
  private seq = 0;

  constructor(
    private readonly socket: RawSocket,
    readonly player: Player,
  ) {}

  send(message: ServerPayload, re?: number): void {
    if (this.socket.readyState !== OPEN) return;
    const head = re === undefined ? { v: PROTOCOL_VERSION, seq: this.seq } : { v: PROTOCOL_VERSION, seq: this.seq, re };
    this.seq += 1;
    this.socket.send(JSON.stringify({ ...head, ...message }));
  }

  close(code: number): void {
    this.socket.close(code);
  }
}

/**
 * Límite de mensajes por conexión (D-102): un balde que se llena a un ritmo fijo. Deja pasar una ráfaga
 * corta, como varios clics seguidos al planear, y corta a quien manda sin parar.
 */
export class Bucket {
  private tokens: number;
  private last: number;

  constructor(
    now: number,
    private readonly perSecond: number = PLAY_LIMITS.messagesPerSecond,
    private readonly burst: number = PLAY_LIMITS.burst,
  ) {
    this.tokens = burst;
    this.last = now;
  }

  /** ¿Pasa un mensaje ahora? Si pasa, gasta una ficha. */
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
