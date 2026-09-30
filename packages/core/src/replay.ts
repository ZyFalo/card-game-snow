import { hashState } from './hash';
import { resolveTurn } from './resolve';
import { createMatch } from './setup';
import type { MatchState, ReplayData } from './types';

/** Reproduce una partida completa a partir de su semilla y sus planes (R-23). */
export function runReplay(replay: ReplayData): { state: MatchState; hashes: string[] } {
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
