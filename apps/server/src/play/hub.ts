import { CLOSE, type ClientMessage } from '@ventisca/protocol';
import type { Link } from './link';

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

export interface HubOptions {
  log: HubLog;
}

export class Hub {
  /** La conexión abierta de cada cuenta: una sola a la vez (D-102). */
  private readonly links = new Map<string, Link>();
  /** Lo que cambia el estado pasa de a uno, en orden: ningún mensaje ve a medias lo que hizo otro. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: HubOptions) {}

  /** Cuántas personas hay conectadas. */
  get online(): number {
    return this.links.size;
  }

  /** Corre `task` cuando terminen las anteriores. Un fallo se registra y no detiene a las que siguen. */
  private run(task: () => void | Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((err: unknown) => {
      const e = err as Error;
      this.options.log.error({ err: { type: e?.name, message: e?.message } }, 'Fallo en el juego en línea');
    });
    return this.queue;
  }

  /** Una persona abrió su conexión. Si ya tenía otra, vale la nueva: la anterior se cierra. */
  connect(link: Link): Promise<void> {
    return this.run(() => {
      const { userId, name } = link.player;
      const previous = this.links.get(userId);
      this.links.set(userId, link);
      previous?.close(CLOSE.replaced);
      link.send({ type: 'welcome', name });
      this.place(link);
    });
  }

  /** La conexión se cerró. La de una pestaña ya reemplazada no cuenta: esa persona sigue conectada. */
  disconnect(link: Link): Promise<void> {
    return this.run(() => {
      const { userId } = link.player;
      if (this.links.get(userId) !== link) return;
      this.links.delete(userId);
    });
  }

  /** Un mensaje ya validado contra el protocolo. */
  receive(link: Link, message: ClientMessage): Promise<void> {
    return this.run(() => {
      // Llegó por una conexión que ya fue reemplazada: no vale.
      if (this.links.get(link.player.userId) !== link) return;
      this.handle(link, message);
    });
  }

  /** La sesión de esa cuenta terminó (la cerró, cambió su contraseña o borró la cuenta): fuera su conexión. */
  endSession(userId: string): Promise<void> {
    return this.run(() => {
      const link = this.links.get(userId);
      if (!link) return;
      this.links.delete(userId);
      link.close(CLOSE.sessionEnded);
    });
  }

  /** El servidor se apaga: cierra todas las conexiones, y cada cliente volverá a conectarse solo. */
  shutdown(): Promise<void> {
    return this.run(() => {
      for (const link of this.links.values()) link.close(CLOSE.restart);
      this.links.clear();
    });
  }

  /** Le dice a la persona dónde está. */
  private place(link: Link): void {
    link.send({ type: 'idle', reason: null, notice: null });
  }

  private handle(link: Link, message: ClientMessage): void {
    link.send({ type: 'error', code: 'not_now' }, message.seq);
  }
}
