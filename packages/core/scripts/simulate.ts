/**
 * Simulación masiva sin render (M4 del PRD). Juega partidas completas con el
 * bot de ninjas y reporta tasa de victoria, combos, turnos y monedas por partida.
 *
 *   pnpm sim                                  → 2000 partidas con el bot al máximo y el mazo fijo de v1
 *   pnpm sim -- --matches 500 --skill 0.6 --storm
 *   pnpm sim -- --collection starter          → reserva de un jugador nuevo (R-30, camino de Fuego)
 *   pnpm sim -- --collection box --path snow  → tras una caja de 3 por elemento, camino de Nieve
 *   pnpm sim -- --table                       → tabla del §18.3: todas las colecciones, habilidad 0,6
 *
 * Colecciones: fixed (por omisión), empty, starter-no-path, starter, box, random8, full y top7.
 */
import {
  coinsForMatch,
  createMatch,
  type Difficulty,
  difficultyConfig,
  ELEMENTS,
  type ElementKind,
  type MatchState,
  planTeam,
  resolveTurn,
  rngFrom,
} from '../src';
import {
  COLLECTION_PRESETS,
  type CollectionPreset,
  isCollectionPreset,
  PRESET_LABELS,
  presetDecks,
} from './collections';

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
  /** Monedas que pagaría la partida (R-29), sin las monedas dobles. */
  coins: number;
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

function textArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const table = process.argv.includes('--table');
const matches = arg('matches', 2000);
// La tabla del §18.3 se midió con juego flojo (0,6); el resto, con el bot al máximo.
const skill = arg('skill', table ? 0.6 : 1);
const seedBase = arg('seed', 20260929);
const difficulty: Difficulty = process.argv.includes('--storm') ? 'storm' : 'classic';
const collection = textArg('collection', 'fixed');
const path = textArg('path', 'fire');

if (!isCollectionPreset(collection)) {
  console.error(`Colección desconocida: ${collection}. Opciones: ${COLLECTION_PRESETS.join(', ')}.`);
  process.exit(1);
}
if (!(ELEMENTS as readonly string[]).includes(path)) {
  console.error(`Camino desconocido: ${path}. Opciones: ${ELEMENTS.join(', ')}.`);
  process.exit(1);
}
const camino = path as ElementKind;

function play(seed: number, diff: Difficulty, preset: CollectionPreset): Sample {
  const decks = presetDecks(preset, seed, camino);
  let state = createMatch({ seed, difficulty: diff, ...(decks ? { decks } : {}) }).state;
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
    coins: coinsForMatch(state, false).total,
  };
}

function run(diff: Difficulty, preset: CollectionPreset): { samples: Sample[]; secs: string } {
  const t0 = Date.now();
  const samples: Sample[] = [];
  for (let i = 0; i < matches; i++) samples.push(play((seedBase + i * 2654435761) >>> 0, diff, preset));
  return { samples, secs: ((Date.now() - t0) / 1000).toFixed(1) };
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)} %`);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const avg = (xs: number[]): string => (xs.length ? mean(xs).toFixed(2) : '—');
function quantile(xs: number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}
/** Números con coma decimal, para pegar en la documentación. */
const es = (n: number, digits: number): string => n.toFixed(digits).replace('.', ',');
const pathName: Record<ElementKind, string> = { fire: 'Fuego', water: 'Agua', snow: 'Nieve' };
const usesPath = (preset: CollectionPreset) => preset === 'starter' || preset === 'box';

function report(samples: Sample[], secs: string): void {
  const reserve = `${PRESET_LABELS[collection as CollectionPreset]}${usesPath(collection as CollectionPreset) ? ` · camino de ${pathName[camino]}` : ''}`;
  const wins = samples.filter((s) => s.status === 'victory');
  const cleared = samples.map((s) => s.turnsToClearMain).filter((t): t is number => t !== null);
  const defeatsByRound = [1, 2, 3].map((r) => samples.filter((s) => s.status === 'defeat' && s.round === r).length);
  const byCondition = (c: Sample['condition']) =>
    samples.filter((s) => s.condition === c && s.turnsToClearMain !== null);

  console.log(`\nSimulación: ${matches} partidas · dificultad ${difficulty} · bot con habilidad ${skill} · ${secs} s`);
  console.log(`Reserva: ${reserve}\n`);
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
  console.log(`Monedas por partida (media)  ${avg(samples.map((s) => s.coins))}`);
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
}

/** Tabla del §18.3: victoria por colección en ambas dificultades, combos y monedas en Clásica. */
function tableReport(): void {
  const t0 = Date.now();
  const rows: string[] = [];
  for (const preset of COLLECTION_PRESETS) {
    if (preset === 'fixed') continue;
    const classic = run('classic', preset).samples;
    const storm = run('storm', preset).samples;
    const winRate = (xs: Sample[]) => (100 * xs.filter((s) => s.status === 'victory').length) / xs.length;
    rows.push(
      `| ${PRESET_LABELS[preset]} | ${es(winRate(classic), 1)} % | ${es(winRate(storm), 1)} % | ${es(
        mean(classic.map((s) => s.combos)),
        2,
      )} | ${Math.round(mean(classic.map((s) => s.coins)))} |`,
    );
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nTabla del §18.3 · ${matches} partidas por celda · bot con habilidad ${skill} · camino de ${pathName[camino]} · ${secs} s\n`,
  );
  console.log(
    '| Colección (por elemento) | Clásica | Tormenta | Combos por partida (Clásica) | Monedas por partida (Clásica) |',
  );
  console.log('|---|---|---|---|---|');
  for (const row of rows) console.log(row);
  console.log('');
}

if (table) {
  tableReport();
} else {
  const { samples, secs } = run(difficulty, collection);
  report(samples, secs);
}
