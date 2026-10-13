import { type Collection, type ElementKind, starterCollection } from '@ventisca/core';
import type { MatchEnd, OpenMatch, PlayStore } from '../../src/play/store';

/*
 * Un almacén en memoria, para probar el centro del juego sin Postgres. Hace lo mismo que el de verdad
 * (`dbStore`), que tiene sus propias pruebas contra una base.
 */
export class MemoryStore implements PlayStore {
  /** La colección de cada cuenta. Quien no aparece aquí todavía no eligió su carta de camino. */
  readonly collections = new Map<string, Collection>();
  readonly opened: OpenMatch[] = [];
  readonly closed: ({ matchId: string } & MatchEnd)[] = [];

  /** Le da a esa cuenta la colección de alguien que acaba de elegir ese camino (R-30). */
  give(userId: string, camino: ElementKind = 'fire'): void {
    this.collections.set(userId, starterCollection(camino));
  }

  async collectionOf(userId: string): Promise<Collection | null> {
    return this.collections.get(userId) ?? null;
  }

  async openMatch(match: OpenMatch): Promise<void> {
    this.opened.push(structuredClone(match));
  }

  async closeMatch(matchId: string, end: MatchEnd): Promise<void> {
    if (this.closed.some((c) => c.matchId === matchId)) return;
    this.closed.push({ matchId, ...structuredClone(end) });
  }
}
