/**
 * Simulación masiva sin render (M4 del PRD). Juega partidas completas con el
 * bot de ninjas y reporta tasa de victoria, combos, turnos y monedas por partida.
 *
 *   pnpm sim                                  → 2000 partidas con el bot al máximo y el mazo fijo de v1
 *   pnpm sim -- --matches 500 --skill 0.6 --storm
 *   pnpm sim -- --collection starter          → reserva de un jugador nuevo (R-30, camino de Fuego)
 *   pnpm sim -- --collection box --path snow  → tras una caja de 3 por elemento, camino de Nieve
 *   pnpm sim -- --table                       → tabla del §18.3: todas las colecciones, habilidad 0,6
 *   pnpm sim -- --team fire=new,water=full,snow=bot → un equipo en línea: quién lleva cada ninja (R-34)
 *   pnpm sim -- --mixed                       → tablas de equipos de colecciones mezcladas (P-20), habilidad 0,6
 *
 * Colecciones: fixed (por omisión), empty, starter-no-path, starter, box, random8, full y top7.
 * Asientos de un equipo: bot, new-off, new, box, box3 y full.
 */
import {
  coinsForMatch,
  createMatch,
  type DeckCard,
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
  arrangements,
  COLLECTION_PRESETS,
  type CollectionPreset,
  isCollectionPreset,
  PRESET_LABELS,
  parseTeam,
  presetDecks,
  SEAT_LABELS,
  SEAT_SHORT,
  type SeatPreset,
  type Team,
  teamDecks,
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
  /** Reanimaciones que se empezaron (R-09) y las que se interrumpieron porque cayó quien revivía. */
  reviveTries: number;
  reviveLost: number;
  /** Caídos que levantó una carta de Nieve (R-17). */
  cardRevives: number;
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
const mixed = process.argv.includes('--mixed');
const matches = arg('matches', 2000);
// Las tablas se miden con juego flojo (0,6); el resto, con el bot al máximo.
const skill = arg('skill', table || mixed ? 0.6 : 1);
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

let team: Team | null = null;
const teamText = textArg('team', '');
if (teamText) {
  try {
    team = parseTeam(teamText);
  } catch (e) {
    console.error(`${(e as Error).message} Ejemplo: --team fire=new,water=full,snow=bot`);
    process.exit(1);
  }
}

/** Las reservas de una partida según su semilla, o `undefined` para el mazo fijo en los tres ninjas. */
type DeckSource = (seed: number) => Partial<Record<ElementKind, readonly DeckCard[]>> | undefined;

const fromPreset =
  (preset: CollectionPreset): DeckSource =>
  (seed) =>
    presetDecks(preset, seed, camino);
const fromTeam =
  (t: Team): DeckSource =>
  (seed) =>
    teamDecks(t, seed);

function play(seed: number, diff: Difficulty, decksFor: DeckSource): Sample {
  const decks = decksFor(seed);
  let state = createMatch({ seed, difficulty: diff, ...(decks ? { decks } : {}) }).state;
  const rng = rngFrom(seed ^ 0x9e3779b9);
  let noKoAtRound3 = false;
  let fullHealthAtRound3 = false;
  let reviveTries = 0;
  let reviveLost = 0;
  let cardRevives = 0;
  while (state.status === 'playing' && state.turn < 200) {
    const plans = planTeam(state, { skill, rng });
    const r = resolveTurn(state, plans);
    for (const e of r.events) {
      if (e.t === 'reviveStart') reviveTries += 1;
      else if (e.t === 'reviveInterrupted') reviveLost += 1;
      else if (e.t === 'revive' && e.cause === 'card') cardRevives += 1;
    }
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
    reviveTries,
    reviveLost,
    cardRevives,
  };
}

function run(diff: Difficulty, decksFor: DeckSource): { samples: Sample[]; secs: string } {
  const t0 = Date.now();
  const samples: Sample[] = [];
  for (let i = 0; i < matches; i++) samples.push(play((seedBase + i * 2654435761) >>> 0, diff, decksFor));
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

function report(samples: Sample[], secs: string, reserve: string): void {
  const wins = samples.filter((s) => s.status === 'victory');
  const cleared = samples.map((s) => s.turnsToClearMain).filter((t): t is number => t !== null);
  const defeatsByRound = [1, 2, 3].map((r) => samples.filter((s) => s.status === 'defeat' && s.round === r).length);
  const byCondition = (c: Sample['condition']) =>
    samples.filter((s) => s.condition === c && s.turnsToClearMain !== null);

  console.log(`\nSimulación: ${matches} partidas · dificultad ${difficulty} · bot con habilidad ${skill} · ${secs} s`);
  console.log(`${reserve}\n`);
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
  const tries = samples.reduce((acc, s) => acc + s.reviveTries, 0);
  const lost = samples.reduce((acc, s) => acc + s.reviveLost, 0);
  console.log(
    `Reanimaciones por partida    ${avg(samples.map((s) => s.reviveTries))} · se interrumpen ${pct(lost, tries)}`,
  );
  console.log(`Caídos que levanta una carta ${avg(samples.map((s) => s.cardRevives))}`);
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
    const classic = run('classic', fromPreset(preset)).samples;
    const storm = run('storm', fromPreset(preset)).samples;
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

/* ---------- Equipos de colecciones mezcladas (P-20 del PRD de v2) ---------- */

type Seats = readonly [SeatPreset, SeatPreset, SeatPreset];

/**
 * Los equipos que mide `--mixed`. Cada uno se juega con todas las formas de repartir sus asientos
 * entre los tres ninjas, porque no da igual quién lleva el mazo corto.
 */
const MIXED_TEAMS: { group: string; seats: Seats }[] = [
  { group: 'Sandbox (D-50): el mazo de referencia en los tres ninjas', seats: ['bot', 'bot', 'bot'] },
  { group: 'Tres personas', seats: ['new', 'new', 'new'] },
  { group: 'Tres personas', seats: ['new', 'new', 'box'] },
  { group: 'Tres personas', seats: ['new', 'box', 'box'] },
  { group: 'Tres personas', seats: ['box', 'box', 'box'] },
  { group: 'Tres personas', seats: ['new', 'new', 'full'] },
  { group: 'Tres personas', seats: ['new', 'box', 'full'] },
  { group: 'Tres personas', seats: ['new', 'full', 'full'] },
  { group: 'Tres personas', seats: ['box', 'box', 'full'] },
  { group: 'Tres personas', seats: ['box', 'full', 'full'] },
  { group: 'Tres personas', seats: ['box3', 'box3', 'box3'] },
  { group: 'Tres personas', seats: ['full', 'full', 'full'] },
  { group: 'Dos personas y el bot (D-35)', seats: ['new', 'new', 'bot'] },
  { group: 'Dos personas y el bot (D-35)', seats: ['new', 'box', 'bot'] },
  { group: 'Dos personas y el bot (D-35)', seats: ['new', 'full', 'bot'] },
  { group: 'Dos personas y el bot (D-35)', seats: ['box', 'box', 'bot'] },
  { group: 'Dos personas y el bot (D-35)', seats: ['box', 'full', 'bot'] },
  { group: 'Dos personas y el bot (D-35)', seats: ['full', 'full', 'bot'] },
  { group: 'Personas nuevas fuera de su camino (R-34)', seats: ['new-off', 'new-off', 'new-off'] },
  { group: 'Personas nuevas fuera de su camino (R-34)', seats: ['new', 'new-off', 'new-off'] },
  { group: 'Personas nuevas fuera de su camino (R-34)', seats: ['new-off', 'full', 'full'] },
];

/** Límites de turnos que se prueban para la condición "contra el reloj" (R-21), alrededor del actual. */
const LIMIT_SWEEP: Record<Difficulty, number[]> = {
  classic: [11, 12, 13, 14, 15, 16, 18],
  storm: [16, 17, 18, 19, 20, 22, 24],
};

const teamName = (seats: Seats): string => seats.map((seat) => SEAT_SHORT[seat]).join(' · ');
const teamLine = (t: Team): string => ELEMENTS.map((el) => `${pathName[el]}: ${SEAT_SHORT[t[el]]}`).join(' · ');
const winRate = (xs: Sample[]): number => (100 * xs.filter((s) => s.status === 'victory').length) / xs.length;
const clearedTurns = (xs: Sample[]): number[] =>
  xs.map((s) => s.turnsToClearMain).filter((t): t is number => t !== null);

interface TeamResult {
  seats: Seats;
  group: string;
  /** Todas las partidas del equipo, juntando sus repartos. */
  samples: Sample[];
  /** Victoria de cada reparto, de menor a mayor. */
  byArrangement: { team: Team; win: number }[];
}

function runTeam(diff: Difficulty, seats: Seats, group: string): TeamResult {
  const byArrangement: TeamResult['byArrangement'] = [];
  const samples: Sample[] = [];
  for (const t of arrangements(seats)) {
    const r = run(diff, fromTeam(t)).samples;
    byArrangement.push({ team: t, win: winRate(r) });
    samples.push(...r);
  }
  byArrangement.sort((a, b) => a.win - b.win);
  return { seats, group, samples, byArrangement };
}

/** Tablas de P-20: cómo le va a cada equipo y qué pasa con el límite de turnos del bonus. */
function mixedReport(): void {
  const t0 = Date.now();
  const results: Record<Difficulty, TeamResult[]> = { classic: [], storm: [] };
  for (const { group, seats } of MIXED_TEAMS) {
    for (const diff of ['classic', 'storm'] as const) results[diff].push(runTeam(diff, seats, group));
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const diffName: Record<Difficulty, string> = { classic: 'Clásica', storm: 'Tormenta' };
  console.log(
    `\nEquipos de colecciones mezcladas (P-20) · ${matches} partidas por reparto · bot con habilidad ${skill} · ${secs} s`,
  );
  console.log('\nAsientos:');
  for (const seat of new Set(MIXED_TEAMS.flatMap((t) => t.seats)))
    console.log(`- ${SEAT_SHORT[seat]}: ${SEAT_LABELS[seat]}`);

  const range = (r: TeamResult): string => {
    const lo = r.byArrangement[0];
    const hi = r.byArrangement[r.byArrangement.length - 1];
    return lo && hi && r.byArrangement.length > 1 ? `${es(lo.win, 1)} a ${es(hi.win, 1)} %` : '—';
  };
  const worst = (r: TeamResult): string => {
    const lo = r.byArrangement[0];
    return lo && r.byArrangement.length > 1 ? teamLine(lo.team) : '—';
  };

  for (const diff of ['classic', 'storm'] as const) {
    console.log(`\n### ${diffName[diff]}: cómo le va a cada equipo\n`);
    console.log(
      '| Equipo | Victoria | Según quién lleva qué ninja | El peor reparto | Combos por partida | Caídas por partida | Monedas por persona |',
    );
    console.log('|---|---|---|---|---|---|---|');
    let group = '';
    for (const r of results[diff]) {
      if (r.group !== group) {
        group = r.group;
        console.log(`| **${group}** | | | | | | |`);
      }
      console.log(
        `| ${teamName(r.seats)} | ${es(winRate(r.samples), 1)} % | ${range(r)} | ${worst(r)} | ${es(
          mean(r.samples.map((s) => s.combos)),
          2,
        )} | ${es(mean(r.samples.map((s) => s.kos)), 2)} | ${Math.round(mean(r.samples.map((s) => s.coins)))} |`,
      );
    }
  }

  for (const diff of ['classic', 'storm'] as const) {
    const limit = difficultyConfig(diff).bonusTurnLimit;
    const sweep = LIMIT_SWEEP[diff];
    console.log(`\n### ${diffName[diff]}: el límite de turnos del bonus (hoy, ${limit})\n`);
    console.log(
      `| Equipo | Superan la ronda 3 | Turnos hasta superarla (p25 · p50 · p75) | ${sweep
        .map((l) => (l === limit ? `**≤ ${l} (hoy)**` : `≤ ${l}`))
        .join(' | ')} |`,
    );
    console.log(`|---|---|---|${sweep.map(() => '---').join('|')}|`);
    let group = '';
    for (const r of results[diff]) {
      if (r.group !== group) {
        group = r.group;
        console.log(`| **${group}** | | |${sweep.map(() => ' ').join('|')}|`);
      }
      const cleared = clearedTurns(r.samples);
      const within = (l: number) =>
        cleared.length === 0 ? '—' : `${es((100 * cleared.filter((t) => t <= l).length) / cleared.length, 1)} %`;
      const quartiles =
        cleared.length === 0
          ? '—'
          : `${quantile(cleared, 0.25)} · ${quantile(cleared, 0.5)} · ${quantile(cleared, 0.75)}`;
      console.log(
        `| ${teamName(r.seats)} | ${es((100 * cleared.length) / r.samples.length, 1)} %${
          cleared.length < 100 ? ' \\*' : ''
        } | ${quartiles} | ${sweep.map((l) => (l === limit ? `**${within(l)}**` : within(l))).join(' | ')} |`,
      );
    }
    console.log(
      '\nLos porcentajes de cada límite son sobre las partidas que superan la ronda 3. \\* Menos de 100 partidas la superan: la cifra no es representativa.',
    );
  }
  console.log('');
}

if (table) {
  tableReport();
} else if (mixed) {
  mixedReport();
} else if (team) {
  const { samples, secs } = run(difficulty, fromTeam(team));
  report(samples, secs, `Equipo: ${teamLine(team)}`);
} else {
  const { samples, secs } = run(difficulty, fromPreset(collection));
  const reserve = `${PRESET_LABELS[collection]}${usesPath(collection) ? ` · camino de ${pathName[camino]}` : ''}`;
  report(samples, secs, `Reserva: ${reserve}`);
}
