import { PROTOCOL_VERSION, type ServerMessage, type ServerPayload, serverMessageSchema } from '@ventisca/protocol';
import type { Link, Player } from '../../src/play/link';

/*
 * Una conexión de mentira, sin red: guarda lo que el servidor le manda. Con ella se prueban la cola, las
 * salas y las partidas directamente contra el centro del juego (`Hub`), sin sockets ni esperas.
 */
export class FakeLink implements Link {
  /** Todo lo recibido, en orden, ya validado contra el protocolo. */
  readonly received: ServerMessage[] = [];
  /** El código con que el servidor la cerró, o `null` si sigue abierta. */
  closedWith: number | null = null;
  private seq = 0;
  private read = 0;

  constructor(readonly player: Player) {}

  send(message: ServerPayload, re?: number): void {
    if (this.closedWith !== null) return;
    const head = re === undefined ? { v: PROTOCOL_VERSION, seq: this.seq } : { v: PROTOCOL_VERSION, seq: this.seq, re };
    this.seq += 1;
    // Lo que manda el servidor tiene que cumplir el protocolo: si no, la prueba falla aquí.
    this.received.push(serverMessageSchema.parse(JSON.parse(JSON.stringify({ ...head, ...message }))));
  }

  close(code: number): void {
    this.closedWith = code;
  }

  /** Lo recibido desde la última vez que se preguntó. */
  fresh(): ServerMessage[] {
    const out = this.received.slice(this.read);
    this.read = this.received.length;
    return out;
  }

  /** El último mensaje de ese tipo. */
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.received.findLast((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }

  /** Todos los de ese tipo, en orden. */
  all<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
}

let people = 0;

/** Una persona nueva, con su conexión de mentira. */
export function person(name?: string): FakeLink {
  people += 1;
  const id = String(people).padStart(12, '0');
  return new FakeLink({ userId: `00000000-0000-4000-8000-${id}`, name: name ?? `Ninja ${people}` });
}

/** Otra conexión de la misma persona: otra pestaña, o la misma que vuelve. */
export const again = (link: FakeLink): FakeLink => new FakeLink(link.player);
