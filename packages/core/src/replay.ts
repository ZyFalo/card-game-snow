import { hashState } from './hash';
import { resolveTurn } from './resolve';
import { createMatch } from './setup';
import type { MatchState, ReplayData } from './types';

/**
 * Versión de las reglas con que se graba una repetición. Súbela cada vez que un cambio
 * de reglas altere cómo se reproduce una partida grabada: la repetición vieja se rechaza
 * en vez de reproducirse distinta. Historial: 1 → 2 con D-33 (vida redondeada en Tormenta).
 */
export const REPLAY_VERSION = 2;

/** Reproduce una partida completa a partir de su semilla y sus planes (R-23). */
export function runReplay(replay: ReplayData): { state: MatchState; hashes: string[] } {
  if (replay.version !== REPLAY_VERSION) {
    throw new Error(
      `Esta repetición se grabó con la versión ${replay.version ?? 'desconocida'} de las reglas y la actual es la ${REPLAY_VERSION}: ya no se reproduciría igual, así que no se puede cargar.`,
    );
  }
  let state = createMatch({
    seed: replay.seed,
    mapId: replay.mapId,
    difficulty: replay.difficulty,
    bonusCondition: replay.bonusCondition,
    ...(replay.decks ? { decks: replay.decks } : {}),
  }).state;
  const hashes: string[] = [hashState(state)];
  for (const plans of replay.turns) {
    if (state.status !== 'playing') break;
    const result = resolveTurn(state, plans);
    state = result.state;
    hashes.push(result.hash);
  }
  return { state, hashes };
}
