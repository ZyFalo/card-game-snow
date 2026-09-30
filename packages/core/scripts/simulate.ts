/**
 * Simulación masiva sin render (M4 del PRD). Juega partidas completas con el
 * bot de ninjas y reporta tasa de victoria, combos y turnos por partida.
 *
 *   pnpm sim                       → 2000 partidas con el bot al máximo
 *   pnpm sim -- --matches 500 --skill 0.6
 */
import {
  createMatch,
  type Difficulty,
  difficultyConfig,
  type MatchState,
  planTeam,
  resolveTurn,
  rngFrom,
} from '../src';

interface Sample {
  status: MatchState['status'];
  round: MatchState['round'];
  turns: number;
  turnsToClearMain: number | null;
  combos: number;
  tripleCombos: number;
  cards: number;
  kos: number;
  condition: MatchState['bonusCondition'];
  bonusEntered: boolean;
  bonusOutcome: MatchState['bonusOutcome'];
  noKoAtRound3: boolean;
  fullHealthAtRound3: boolean;
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const matches = arg('matches', 2000);
const skill = arg('skill', 1);
const seedBase = arg('seed', 20260929);
const difficulty: Difficulty = process.argv.includes('--storm') ? 'storm' : 'classic';

function play(seed: number): Sample {
  let state = createMatch({ seed, difficulty }).state;
  const rng = rngFrom(seed ^ 0x9e3779b9);
  let noKoAtRound3 = false;
  let fullHealthAtRound3 = false;
  while (state.status === 'playing' && state.turn < 200) {
    const plans = planTeam(state, { skill, rng });
    const r = resolveTurn(state, plans);
    if (r.events.some((e) => e.t === 'bonusCheck')) {
      noKoAtRound3 = r.state.ninjas.every((n) => !n.everKo);
      fullHealthAtRound3 = r.state.ninjas.every((n) => n.hp === n.maxHp);
    }
    state = r.state;
  }
  const st = state.stats;
  return {
    status: state.status,
    round: state.round,
    turns: st.turns,
    turnsToClearMain: st.turnsToClearMain,
    combos: st.combos,
    tripleCombos: st.tripleCombos,
    cards: st.cardsPlayed,
    kos: st.ninjaKos,
    condition: state.bonusCondition,
    bonusEntered: st.bonusEntered,
    bonusOutcome: state.bonusOutcome,
    noKoAtRound3,
    fullHealthAtRound3,
  };
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)} %`);
const avg = (xs: number[]): string => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '—');
function quantile(xs: number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

const t0 = Date.now();
const samples: Sample[] = [];
for (let i = 0; i < matches; i++) samples.push(play((seedBase + i * 2654435761) >>> 0));
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const wins = samples.filter((s) => s.status === 'victory');
const cleared = samples.map((s) => s.turnsToClearMain).filter((t): t is number => t !== null);
const defeatsByRound = [1, 2, 3].map((r) => samples.filter((s) => s.status === 'defeat' && s.round === r).length);
const byCondition = (c: Sample['condition']) => samples.filter((s) => s.condition === c && s.turnsToClearMain !== null);

console.log(`\nSimulación: ${matches} partidas · dificultad ${difficulty} · bot con habilidad ${skill} · ${secs} s\n`);
console.log(`Victoria                     ${pct(wins.length, matches)}`);
console.log(`Derrotas en ronda 1/2/3      ${defeatsByRound.join(' / ')}`);
console.log(`Turnos por partida (media)   ${avg(samples.map((s) => s.turns))}`);
console.log(
  `Turnos hasta superar R1–R3   p25 ${quantile(cleared, 0.25)} · p50 ${quantile(cleared, 0.5)} · p75 ${quantile(cleared, 0.75)}`,
);
console.log(`Combos por partida           ${avg(samples.map((s) => s.combos))}`);
console.log(`Partidas con algún combo     ${pct(samples.filter((s) => s.combos > 0).length, matches)}`);
console.log(`Combos triples por partida   ${avg(samples.map((s) => s.tripleCombos))}`);
console.log(`Cartas jugadas por partida   ${avg(samples.map((s) => s.cards))}`);
console.log(`Caídas de ninjas por partida ${avg(samples.map((s) => s.kos))}`);
console.log('\nCondición del bonus (entre partidas que superaron la ronda 3):');
for (const c of ['noKo', 'fullHealth', 'turnLimit'] as const) {
  const group = byCondition(c);
  console.log(`  ${c.padEnd(11)} entra al bonus ${pct(group.filter((s) => s.bonusEntered).length, group.length)}`);
}
const reachedR3 = samples.filter((s) => s.turnsToClearMain !== null);
console.log(`  (si fuera "sin caídas")     ${pct(reachedR3.filter((s) => s.noKoAtRound3).length, reachedR3.length)}`);
console.log(
  `  (si fuera "vida completa")  ${pct(reachedR3.filter((s) => s.fullHealthAtRound3).length, reachedR3.length)}`,
);
console.log(`  límite de turnos actual     ${difficultyConfig(difficulty).bonusTurnLimit}`);
const bonusPlayed = samples.filter((s) => s.bonusEntered);
console.log(
  `Bonus ganados                ${pct(bonusPlayed.filter((s) => s.bonusOutcome === 'won').length, bonusPlayed.length)}\n`,
);
