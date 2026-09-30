import {
  type AchievementId,
  addToCollection,
  boxPrice,
  type CoinReward,
  coinsForRound,
  type ElementKind,
  earnedAchievements,
  enemyAt,
  eq,
  type GameEvent,
  getNinja,
  hasDoubleCoins,
  isActionValid,
  isRock,
  isThreatened,
  key,
  livingNinjas,
  type MatchState,
  ninjaAt,
  openBox,
  type Plan,
  type Round,
  reservesFor,
  rngFrom,
  starterCollection,
  suggestPlan,
  type Vec,
} from '@ventisca/core';
import { audio } from '../audio/audio';
import { URL_SPEED } from '../game/speed';
import type { GameHost, HostMessage } from '../host/GameHost';
import { LocalHost } from '../host/LocalHost';
import { NINJA_TEXT, NOTICE, TIPS } from '../i18n/es';
import { bridge, sceneReady } from './bridge';
import { type Settings, saveAchievements, saveSettings } from './persist';
import { activeInfo, nextPlannable, plansArray, turnClockMs } from './planning';
import { applyEvent, beforeIntro } from './present';
import { saveProfile } from './profile';
import { type CardFlight, type Screen, store } from './store';

/* Flujo de la partida y acciones del jugador. La UI (React y Phaser) solo llama a estas funciones. */

let host: GameHost = new LocalHost();
let noticeKey = 0;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function goto(screen: Screen): void {
  store.setState({ screen });
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...store.getState().settings, ...patch };
  store.setState({ settings });
  saveSettings(settings);
  audio.setSfx(settings.sfx);
  audio.setMusic(settings.music);
}

export function notify(text: string): void {
  noticeKey += 1;
  store.setState({ notice: { text, key: noticeKey } });
}

export function setHelp(open: boolean): void {
  store.setState({ helpOpen: open });
}

function applyToView(e: GameEvent): void {
  const v = store.getState().view;
  if (v) store.setState({ view: applyEvent(v, e) });
}

/* ---------- Cobro (R-29, D-31) ---------- */

/** Monedas que lleva cobradas la partida en curso, ronda por ronda. */
let reward: CoinReward = { lines: [], base: 0, doubled: false, total: 0 };

/**
 * Cada evento, al mostrarse: actualiza el estado presentado y, según D-31, acredita cada
 * ronda superada en el momento en que termina y guarda resultados y logros al terminar
 * la partida, antes de la celebración. Lo cobrado no se pierde aunque después salgas.
 */
function onEvent(e: GameEvent): void {
  applyToView(e);
  if (e.t === 'roundEnd') creditRound(e.round);
  else if (e.t === 'matchEnd') recordResults();
}

function creditRound(round: Round): void {
  const st = store.getState();
  const doubled = hasDoubleCoins(Object.keys(st.unlocked) as AchievementId[]);
  const coins = coinsForRound(round, doubled);
  const base = coinsForRound(round, false);
  reward = {
    lines: [...reward.lines, { round, coins: base }],
    base: reward.base + base,
    doubled,
    total: reward.total + coins,
  };
  const profile = { ...st.profile, coins: st.profile.coins + coins };
  saveProfile(profile);
  store.setState({ profile });
}

function recordResults(): void {
  const st = store.getState();
  const state = st.match;
  if (!state || st.results) return;
  const earned = earnedAchievements(state);
  const unlocked = { ...st.unlocked };
  const fresh = earned.filter((id) => !unlocked[id]);
  for (const id of fresh) unlocked[id] = new Date().toISOString();
  saveAchievements(unlocked);
  store.setState({ unlocked, results: { state, earned, fresh, reward, balance: st.profile.coins } });
}

/* ---------- Partida ---------- */

/**
 * Cambia de host: el anterior se cierra y sus mensajes se descartan. Los mensajes del nuevo
 * se muestran de a uno y en orden: cada uno espera a que termine de animarse el anterior.
 */
function attachHost(next: GameHost): void {
  host.close();
  host = next;
  let shown = Promise.resolve();
  next.subscribe((msg) => {
    shown = shown.then(() => (host === next ? show(msg) : undefined)).catch(reportError);
  });
}

function show(msg: HostMessage): Promise<void> {
  return msg.type === 'matchStart' ? showMatchStart(msg.state, msg.events) : showTurn(msg.state, msg.events);
}

export async function startMatch(): Promise<void> {
  const { settings, profile } = store.getState();
  attachHost(new LocalHost());
  reward = { lines: [], base: 0, doubled: false, total: 0 };
  const seed = Math.floor(Math.random() * 2 ** 32) >>> 0;
  // R-26: cada ninja lleva toda su colección (con repetidas) como reserva.
  const decks = profile.camino ? reservesFor(profile.collection) : undefined;
  await host.start({ seed, difficulty: settings.difficulty, ...(decks ? { decks } : {}) });
}

/** La partida está lista (mensaje `matchStart`): pantalla de carga, entrada y primer turno. */
async function showMatchStart(state: MatchState, events: GameEvent[]): Promise<void> {
  const { settings } = store.getState();
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)] ?? '';
  store.setState({
    screen: 'loading',
    loadingTip: tip,
    phase: 'intro',
    match: state,
    view: beforeIntro(state),
    plans: {},
    active: null,
    pendingCard: null,
    hover: null,
    overlay: null,
    paused: false,
    results: null,
    seed: state.seed,
    timer: { deadline: null, remaining: null, total: null },
  });
  const scene = await sceneReady;
  const generation = scene.setupMatch(beforeIntro(state));
  await sleep((settings.reducedMotion ? 900 : 1800) * URL_SPEED);
  if (!scene.isCurrent(generation)) return;
  store.setState({ screen: 'battle' });
  await scene.playEvents(events, onEvent, generation);
  if (!scene.isCurrent(generation)) return;
  store.setState({ view: state });
  beginPlanning();
}

/** Reloj del turno (R-04) de la partida en curso. */
export function planningMs(): number | null {
  const { settings, match } = store.getState();
  return match ? turnClockMs(settings.pace, livingNinjas(match).length) : null;
}

export function beginPlanning(): void {
  const { match } = store.getState();
  if (match?.status !== 'playing') return;
  const ms = planningMs();
  host.startTimer(ms, () => {
    void confirmTurn(true);
  });
  setBoost(false);
  store.setState({
    phase: 'planning',
    resolveStep: null,
    plans: {},
    active: nextPlannable(match, {}, null, 1),
    pendingCard: null,
    timer: { ...host.timer(), total: ms },
  });
}

/** Fin de la planificación: sin planes, selección ni reloj. */
function closePlanning(): void {
  host.stopTimer();
  store.setState({
    phase: 'resolving',
    resolveStep: 'ninjas',
    plans: {},
    pendingCard: null,
    active: null,
    hover: null,
    timer: { deadline: null, remaining: null, total: null },
  });
}

export async function confirmTurn(fromTimeout = false): Promise<void> {
  const st = store.getState();
  if (st.phase !== 'planning' || (st.paused && !fromTimeout)) return;
  audio.play('confirm');
  closePlanning();
  await host.submit(plansArray(st.plans));
}

/** Un turno resuelto (mensaje `turnResult`): se anima y sigue la partida o llegan los resultados. */
async function showTurn(state: MatchState, events: GameEvent[]): Promise<void> {
  // En línea, el reloj del servidor también puede cerrar el turno sin que este cliente confirme.
  if (store.getState().phase === 'planning') closePlanning();
  store.setState({ match: state });
  const scene = bridge.scene;
  if (scene) {
    const generation = scene.currentGeneration();
    await scene.playEvents(events, onEvent, generation);
    if (!scene.isCurrent(generation)) return;
  } else {
    for (const e of events) onEvent(e);
  }
  store.setState({ view: state });
  if (state.status !== 'playing') {
    finishMatch();
    return;
  }
  beginPlanning();
}

/** Tras la celebración. Monedas, resultados y logros ya se guardaron al mostrarse sus eventos (D-31). */
function finishMatch(): void {
  recordResults();
  store.setState({ phase: 'ended', screen: 'results' });
}

export function restartMatch(): void {
  setBoost(false);
  host.stopTimer();
  bridge.scene?.abort();
  store.setState({ paused: false });
  void startMatch();
}

export function quitToMenu(): void {
  setBoost(false);
  host.stopTimer();
  bridge.scene?.abort();
  store.setState({ screen: 'title', phase: 'idle', paused: false, overlay: null, plans: {}, active: null });
}

export function togglePause(force?: boolean): void {
  const st = store.getState();
  if (st.screen !== 'battle') return;
  const paused = force ?? !st.paused;
  if (paused === st.paused) return;
  if (paused) {
    setBoost(false);
    host.pauseTimer();
  }
  if (!paused) host.resumeTimer();
  bridge.scene?.setPaused(paused);
  store.setState({ paused, timer: { ...host.timer(), total: st.timer.total } });
}

export function replayJson(): string {
  return JSON.stringify(host.replay());
}

/* ---------- Planificación (§9.3) ---------- */

/** Sin movimiento ni acción no hay plan: se quita, para que Esc vuelva a abrir la pausa. */
function setPlan(id: ElementKind, plan: Plan): void {
  store.setState((s) => {
    const plans = { ...s.plans };
    if (plan.moveTo || plan.action) plans[id] = plan;
    else delete plans[id];
    return { plans };
  });
}

const withoutAction = (plan: Plan): Plan =>
  plan.moveTo ? { ninjaId: plan.ninjaId, moveTo: plan.moveTo } : { ninjaId: plan.ninjaId };

function canPlan(): boolean {
  const st = store.getState();
  return st.phase === 'planning' && !st.paused && !!st.match;
}

export function selectNinja(id: ElementKind): void {
  const st = store.getState();
  if (!canPlan() || !st.match) return;
  const n = getNinja(st.match, id);
  if (!n || n.hp <= 0 || st.active === id) return;
  store.setState({ active: id, pendingCard: null });
  audio.play('select');
}

export function cycleNinja(dir: 1 | -1): void {
  const st = store.getState();
  if (!canPlan() || !st.match) return;
  const next = nextPlannable(st.match, st.plans, st.active, dir);
  if (next) selectNinja(next);
}

function afterAction(): void {
  const st = store.getState();
  if (!st.settings.autoAdvance || !st.match) return;
  const next = nextPlannable(st.match, st.plans, st.active, 1, true);
  if (next && next !== st.active) store.setState({ active: next, pendingCard: null });
}

function setAction(ninjaId: ElementKind, plan: Plan, action: NonNullable<Plan['action']>): void {
  setPlan(ninjaId, { ...plan, action });
  store.setState({ pendingCard: null });
  audio.play('place');
  afterAction();
}

function reject(text: string): void {
  notify(text);
  audio.play('error');
}

export function clickTile(v: Vec): void {
  if (!canPlan()) return;
  const st = store.getState();
  const m = st.match;
  if (!m) return;
  const occupant = ninjaAt(m, v);
  const info = activeInfo(st);
  if (!info) {
    if (occupant && occupant.hp > 0) selectNinja(occupant.id);
    return;
  }
  const { ninja, plan } = info;

  if (st.pendingCard) {
    if (info.cardTiles.some((t) => eq(t, v))) {
      setAction(ninja.id, withoutAction(plan), { type: 'card', cardId: st.pendingCard, at: v });
      return;
    }
    if (occupant && occupant.id !== ninja.id && occupant.hp > 0) {
      selectNinja(occupant.id);
      return;
    }
    reject(NOTICE.cardOutOfRange);
    return;
  }

  if (occupant && occupant.id !== ninja.id) {
    if (info.heal.some((a) => a.id === occupant.id)) {
      setAction(ninja.id, plan, { type: 'heal', targetId: occupant.id });
      return;
    }
    if (info.revive.some((a) => a.id === occupant.id)) {
      setAction(ninja.id, plan, { type: 'revive', targetId: occupant.id });
      // R-09 (D-18): se levanta con 1 de vida antes del turno de los gólems.
      if (isThreatened(m, occupant.pos)) {
        notify(NOTICE.exposedRevive(NINJA_TEXT[occupant.id].name));
      }
      return;
    }
    if (occupant.hp > 0) {
      selectNinja(occupant.id);
      return;
    }
    reject(NOTICE.reviveFromNeighbor(NINJA_TEXT[occupant.id].name));
    return;
  }

  if (occupant && occupant.id === ninja.id) {
    if (plan.moveTo) {
      const next: Plan = { ninjaId: ninja.id };
      if (plan.action && isActionValid(m, ninja.id, ninja.pos, plan.action)) next.action = plan.action;
      setPlan(ninja.id, next);
      audio.play('select');
    }
    return;
  }

  const enemy = enemyAt(m, v);
  if (enemy) {
    if (info.attack.some((e) => e.id === enemy.id)) {
      setAction(ninja.id, plan, { type: 'attack', targetId: enemy.id });
      return;
    }
    reject(NOTICE.enemyOutOfRange);
    return;
  }

  if (plan.moveTo && eq(plan.moveTo, v)) return;
  if (info.moves.has(key(v))) {
    const next: Plan = { ninjaId: ninja.id, moveTo: v };
    if (plan.action && isActionValid(m, ninja.id, v, plan.action)) next.action = plan.action;
    else if (plan.action) notify(NOTICE.actionLost);
    setPlan(ninja.id, next);
    audio.play('select');
    return;
  }
  const reservedBy = plansArray(st.plans).find((p) => p.ninjaId !== ninja.id && p.moveTo && eq(p.moveTo, v));
  if (reservedBy) reject(NOTICE.tileReserved(NINJA_TEXT[reservedBy.ninjaId].name));
  else if (isRock(m, v)) reject(NOTICE.rock);
  else reject(NOTICE.outOfReach(NINJA_TEXT[ninja.id].name));
}

export function undo(): void {
  const st = store.getState();
  if (!canPlan() || !st.active) return;
  if (st.pendingCard) {
    store.setState({ pendingCard: null });
    return;
  }
  const plan = st.plans[st.active];
  if (!plan) return;
  if (plan.action) {
    setPlan(st.active, withoutAction(plan));
  } else if (plan.moveTo) {
    const plans = { ...st.plans };
    delete plans[st.active];
    store.setState({ plans });
  }
  audio.play('select');
}

export function selectCard(cardId: string): void {
  const st = store.getState();
  if (!canPlan() || !st.active || !st.match) return;
  const n = getNinja(st.match, st.active);
  if (!n || n.hp <= 0 || !n.hand.some((c) => c.id === cardId)) return;
  const plan = st.plans[st.active];
  if (plan?.action?.type === 'card' && plan.action.cardId === cardId) {
    setPlan(st.active, withoutAction(plan));
    store.setState({ pendingCard: null });
    audio.play('select');
    return;
  }
  store.setState({ pendingCard: st.pendingCard === cardId ? null : cardId });
  audio.play('select');
}

export function selectCardIndex(index: number): void {
  const st = store.getState();
  if (!st.match || !st.active) return;
  const card = getNinja(st.match, st.active)?.hand[index];
  if (card) selectCard(card.id);
}

export function suggest(): void {
  const st = store.getState();
  if (!canPlan() || !st.active || !st.match) return;
  const plan = suggestPlan(st.match, st.active, plansArray(st.plans));
  if (!plan) return;
  setPlan(st.active, plan);
  store.setState({ pendingCard: null });
  audio.play('place');
  afterAction();
}

export function setHover(v: Vec | null): void {
  const h = store.getState().hover;
  if ((h && v && eq(h, v)) || (!h && !v)) return;
  store.setState({ hover: v });
}

/* ---------- Progresión (§18) ---------- */

let revealKey = 0;

/** Entrada al juego: la primera vez se elige el camino (R-30). */
export function enterGame(): void {
  store.setState({ screen: store.getState().profile.camino ? 'team' : 'camino' });
}

export function chooseCamino(element: ElementKind): void {
  const { profile } = store.getState();
  if (profile.camino) return;
  const next = { ...profile, camino: element, collection: starterCollection(element) };
  saveProfile(next);
  audio.play('bonus');
  store.setState({ profile: next, screen: 'team', welcome: element });
}

export function openCollection(from: Screen, tab?: ElementKind): void {
  const st = store.getState();
  store.setState({ screen: 'collection', collectionReturn: from, collectionTab: tab ?? st.profile.camino ?? 'fire' });
}

export function closeCollection(): void {
  store.setState({ screen: store.getState().collectionReturn, reveal: null });
}

export function setCollectionTab(tab: ElementKind): void {
  store.setState({ collectionTab: tab });
}

/** Compra y abre una caja (R-28). Devuelve false si no alcanzan las monedas. */
export function buyBox(element: ElementKind, size: number): boolean {
  const { profile } = store.getState();
  const price = boxPrice(size);
  if (profile.coins < price) {
    audio.play('error');
    return false;
  }
  const rng = rngFrom(Math.floor(Math.random() * 2 ** 32) >>> 0);
  const cards = openBox(element, size, rng);
  const seen = new Set(Object.keys(profile.collection).filter((id) => (profile.collection[id] ?? 0) > 0));
  const fresh = cards.map((c) => {
    const isNew = !seen.has(c.id);
    seen.add(c.id);
    return isNew;
  });
  const next = {
    ...profile,
    coins: profile.coins - price,
    collection: addToCollection(profile.collection, cards),
    boxesOpened: profile.boxesOpened + 1,
  };
  saveProfile(next);
  revealKey += 1;
  audio.play('confirm');
  store.setState({ profile: next, reveal: { element, cards, fresh, key: revealKey } });
  return true;
}

export function closeReveal(): void {
  store.setState({ reveal: null });
}

export function dismissWelcome(): void {
  store.setState({ welcome: null });
}

/* ---------- Coreografía (fase 3) ---------- */

/** Mantener Espacio o el botón acelera la resolución del turno. */
export function setBoost(on: boolean): void {
  const st = store.getState();
  const next = on && st.phase === 'resolving' && !st.paused;
  if (st.boosting === next) return;
  store.setState({ boosting: next });
  bridge.scene?.setBoost(next);
}

/* ---------- Interfaz (fase 4) ---------- */

/** Una carta en vuelo llegó a su destino: aparece en la mano con un destello. */
export function landFlight(f: CardFlight): void {
  store.setState((s) => ({
    flights: s.flights.filter((x) => x.id !== f.id),
    incoming: s.incoming.filter((id) => id !== f.cardId),
    arrived: [...s.arrived, f.cardId],
  }));
  window.setTimeout(() => {
    store.setState((s) => ({ arrived: s.arrived.filter((id) => id !== f.cardId) }));
  }, 520);
}

export function clearFlights(): void {
  store.setState({ flights: [], incoming: [], arrived: [] });
}
