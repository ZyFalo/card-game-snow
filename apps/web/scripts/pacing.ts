// Mide el ritmo de las animaciones: bot jugando partidas completas, sin render.
import { createMatch, type Difficulty, planTeam, resolveTurn, rngFrom } from '@ventisca/core';
import { estimateEventsMs, FAST_FACTOR, isCombatTurn, TIMING, TIMING_V07, type Timing } from '../src/game/timing';

const arg = (n: string, d: number) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const matches = arg('matches', 300);

function measure(t: Timing, difficulty: Difficulty, groupBurns: boolean) {
  const combat: number[] = [];
  const combos: number[] = [];
  let matchMs = 0;
  for (let m = 0; m < matches; m++) {
    const seed = (20260929 + m * 2654435761) >>> 0;
    const created = createMatch({ seed, difficulty });
    let state = created.state;
    matchMs += estimateEventsMs(created.events, t, groupBurns);
    const rng = rngFrom(seed ^ 0x51ed);
    while (state.status === 'playing' && state.turn < 200) {
      const r = resolveTurn(state, planTeam(state, { skill: 0.8, rng }));
      const ms = estimateEventsMs(r.events, t, groupBurns);
      matchMs += ms;
      if (isCombatTurn(r.events)) (r.events.some((e) => e.t === 'combo') ? combos : combat).push(ms);
      state = r.state;
    }
  }
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))] ?? 0;
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  return `turno sin combo: mediana ${s(q(combat, 0.5))} · p90 ${s(q(combat, 0.9))} | turno con combo: mediana ${s(q(combos, 0.5))} · p90 ${s(q(combos, 0.9))} | partida entera: ${s(matchMs / matches)}`;
}

for (const difficulty of ['classic', 'storm'] as Difficulty[]) {
  console.log(`\n${difficulty === 'classic' ? 'Clásica' : 'Tormenta'} (${matches} partidas, bot 0,8)`);
  console.log(`  v0.7 (antes)   ${measure(TIMING_V07, difficulty, false)}`);
  console.log(`  actual         ${measure(TIMING, difficulty, true)}`);
  console.log(`  actual rápida  ${measure(scale(TIMING, FAST_FACTOR), difficulty, true)}`);
}

function scale(t: Timing, k: number): Timing {
  return JSON.parse(JSON.stringify(t), (_key, v) => (typeof v === 'number' ? v * k : v)) as Timing;
}
