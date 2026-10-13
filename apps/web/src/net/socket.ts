import {
  CLOSE,
  type ClientMessage,
  type ClientPayload,
  PLAY_PATH,
  PROTOCOL_VERSION,
  type ServerMessage,
  serverMessageSchema,
} from '@ventisca/protocol';

/*
 * La conexión del juego en línea (PRD de v2, "Protocolo de mensajes"): un WebSocket en `PLAY_PATH`, en el
 * mismo origen que el juego, así que la cookie de sesión viaja sola. Aquí vive todo lo que es de la
 * conexión y no del juego: numerar lo que sale, comprobar lo que entra y volver a conectarse cuando se cae.
 *
 * Cuando la conexión se cae sin que nadie lo pida, se intenta de nuevo, cada vez con más espera. No se
 * intenta de nuevo si el servidor dijo por qué la cerró y volver no sirve: la cuenta abrió el juego en otra
 * pestaña, la sesión terminó o el juego tiene una versión nueva.
 */

/**
 * Cómo está la conexión.
 * - `connecting`: el primer intento.
 * - `reconnecting`: se cayó y se está intentando de nuevo.
 * - `replaced`: la misma cuenta abrió el juego en otra pestaña, y vale esa.
 * - `outdated`: el juego tiene una versión nueva; hay que recargar la página.
 * - `signedOut`: la sesión terminó.
 * - `closed`: se cerró a pedido.
 */
export type LinkStatus = 'connecting' | 'open' | 'reconnecting' | 'replaced' | 'outdated' | 'signedOut' | 'closed';

/** Lo que se usa de un WebSocket: las pruebas ponen uno de mentira. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
}

export interface PlaySocketOptions {
  url: string;
  open(url: string): SocketLike;
  /** Corre `task` dentro de `ms`; devuelve cómo cancelarlo. */
  later(task: () => void, ms: number): () => void;
  /**
   * ¿Sigue habiendo sesión? Se pregunta cuando un intento falla antes de abrirse, porque el navegador no
   * dice por qué: `false` si el servidor respondió que no hay sesión, y `null` si no respondió.
   */
  signedIn(): Promise<boolean | null>;
  onStatus(status: LinkStatus): void;
  onMessage(message: ServerMessage): void;
}

/** La espera antes de cada intento, en milisegundos. El último valor se repite. */
export const RETRY_MS = [400, 1000, 2000, 4000, 6000] as const;

/** La dirección de la conexión para la página en que corre el juego. */
export function playUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${PLAY_PATH}`;
}

export class PlaySocket {
  private socket: SocketLike | null = null;
  private status: LinkStatus = 'closed';
  private seq = 0;
  /** Los intentos fallidos seguidos: de ahí sale la espera del siguiente. */
  private failures = 0;
  private cancelRetry: (() => void) | null = null;
  /** Hubo al menos una conexión abierta: lo que sigue es reconectar. */
  private opened = false;

  constructor(private readonly options: PlaySocketOptions) {}

  get state(): LinkStatus {
    return this.status;
  }

  /** Abre la conexión. Si ya hay una abierta o en camino, no hace nada. */
  connect(): void {
    if (this.socket || this.cancelRetry) return;
    this.opened = false;
    this.failures = 0;
    this.attempt();
  }

  /** Manda un mensaje. Devuelve `false` si no hay conexión abierta: ese mensaje se pierde. */
  send(payload: ClientPayload): boolean {
    if (!this.socket || this.status !== 'open') return false;
    const message = { ...payload, v: PROTOCOL_VERSION, seq: this.seq++ } as ClientMessage;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Cierra la conexión y deja de intentar. */
  close(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      this.release(socket);
      socket.close(1000);
    }
    this.set('closed');
  }

  private set(status: LinkStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }

  private release(socket: SocketLike): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
  }

  private attempt(): void {
    this.cancelRetry = null;
    this.set(this.opened ? 'reconnecting' : 'connecting');
    const socket = this.options.open(this.options.url);
    this.socket = socket;
    let wasOpen = false;
    socket.onopen = () => {
      wasOpen = true;
      this.opened = true;
      this.failures = 0;
      // Cada conexión numera sus mensajes desde cero.
      this.seq = 0;
      this.set('open');
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = (event) => {
      this.release(socket);
      if (this.socket !== socket) return;
      this.socket = null;
      void this.closed(event.code, wasOpen);
    };
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = serverMessageSchema.safeParse(json);
    // Un mensaje que este cliente no entiende no se anima ni se adivina: se deja pasar.
    if (!parsed.success) return;
    this.options.onMessage(parsed.data);
  }

  /** La conexión se cerró sin que este cliente lo pidiera: se decide si vale la pena volver a intentarlo. */
  private async closed(code: number, wasOpen: boolean): Promise<void> {
    if (code === CLOSE.replaced) return this.set('replaced');
    if (code === CLOSE.protocol) return this.set('outdated');
    if (code === CLOSE.sessionEnded) return this.set('signedOut');
    this.set(this.opened ? 'reconnecting' : 'connecting');
    if (!wasOpen) {
      // Ni siquiera se abrió: o el servidor no está, o rechazó el intento porque ya no hay sesión.
      const signedIn = await this.options.signedIn();
      // Mientras se preguntaba, alguien cerró la conexión o abrió otra.
      if (this.socket || this.cancelRetry || this.status === 'closed') return;
      if (signedIn === false) return this.set('signedOut');
    }
    const wait = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)] as number;
    this.failures += 1;
    this.cancelRetry = this.options.later(() => this.attempt(), wait);
  }
}
