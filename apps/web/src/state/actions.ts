import {
  type ElementKind,
  eq,
  type GameEvent,
  getNinja,
  livingNinjas,
  type MatchState,
  type Plan,
  suggestPlan,
  type Vec,
} from '@ventisca/core';
import { audio } from '../audio/audio';
import { URL_SPEED } from '../game/speed';
import type { GameHost, HostMessage } from '../host/GameHost';
import { LocalHost } from '../host/LocalHost';
import { TIPS } from '../i18n/es';
import { bridge, sceneReady } from './bridge';
import { type Settings, saveSettings } from './persist';
import { firstFallTip, nextPending, nextPlannable, plansArray, stepFor, turnClockMs, withoutAction } from './planning';
import { applyEvent, beforeIntro } from './present';
import { clickOutcome, type StepOutcome, undoOutcome } from './steps';
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
  const { settings } = store.getState();
  attachHost(new LocalHost());
  const seed = Math.floor(Math.random() * 2 ** 32) >>> 0;
  // D-50: sin reserva, cada ninja juega con el mazo de referencia del balance (8, 9, 10, 10, 11 y 12).
  await host.start({ seed, difficulty: settings.difficulty });
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
    step: 'move',
    pendingCard: null,
    hover: null,
    reviveTip: null,
    reviveTipSeen: false,
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
  await scene.playEvents(events, applyToView, generation);
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
  const { match, reviveTipSeen } = store.getState();
  if (match?.status !== 'playing') return;
  const reviveTip = firstFallTip(match, reviveTipSeen);
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
    step: 'move',
    pendingCard: null,
    reviveTip,
    reviveTipSeen: reviveTipSeen || reviveTip !== null,
    timer: { ...host.timer(), total: ms },
  });
}

/**
 * Solo para las pruebas e2e y las capturas (main.tsx la expone en desarrollo): deja la partida en curso
 * en un tablero preparado, en el anfitrión, en el estado y en la escena, y empieza a planificar.
 */
export function loadBoard(state: MatchState): void {
  if (!(host instanceof LocalHost)) return;
  host.load(state);
  store.setState({ match: state, view: state, hover: null, notice: null });
  bridge.scene?.setupMatch(state);
  beginPlanning();
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
    step: 'move',
    hover: null,
    reviveTip: null,
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
    await scene.playEvents(events, applyToView, generation);
    if (!scene.isCurrent(generation)) return;
  } else {
    for (const e of events) applyToView(e);
  }
  store.setState({ view: state });
  if (state.status !== 'playing') {
    finishMatch();
    return;
  }
  beginPlanning();
}

/** Tras la celebración, los resultados. El sandbox no da monedas ni logros (D-34). */
function finishMatch(): void {
  const { match } = store.getState();
  store.setState({ phase: 'ended', screen: 'results', results: match ? { state: match } : null });
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
  store.setState({
    screen: 'title',
    phase: 'idle',
    paused: false,
    overlay: null,
    plans: {},
    active: null,
    step: 'move',
  });
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

/*
 * Cada ninja se planifica en dos pasos: moverse y actuar (state/steps.ts decide qué hace cada clic). Aquí
 * solo se aplica el resultado al estado, con su sonido y su aviso.
 */

/** Sin movimiento ni acción no hay plan: se quita, para que Esc vuelva a abrir la pausa. */
function setPlan(id: ElementKind, plan: Plan): void {
  store.setState((s) => {
    const plans = { ...s.plans };
    if (plan.moveTo || plan.action) plans[id] = plan;
    else delete plans[id];
    return { plans };
  });
}

function canPlan(): boolean {
  const st = store.getState();
  return st.phase === 'planning' && !st.paused && !!st.match;
}

export function selectNinja(id: ElementKind): void {
  const st = store.getState();
  if (!canPlan() || !st.match) return;
  const n = getNinja(st.match, id);
  if (!n || n.hp <= 0 || st.active === id) return;
  // Si ya eligió casilla o acción, se retoma en el paso de actuar; si no, empieza por moverse.
  store.setState({ active: id, pendingCard: null, step: stepFor(st.plans[id]) });
  audio.play('select');
}

export function cycleNinja(dir: 1 | -1): void {
  const st = store.getState();
  if (!canPlan() || !st.match) return;
  const next = nextPlannable(st.match, st.plans, st.active, dir);
  if (next) selectNinja(next);
}

/**
 * El ninja activo eligió su acción. Con "Pasar al siguiente ninja", le toca al siguiente que tenga algo por
 * decidir. Tras moverse no: puede cambiar de casilla con otro clic, y se pasa de ninja con Tab.
 */
function afterStep(): void {
  const st = store.getState();
  if (!st.settings.autoAdvance || !st.match || !st.active) return;
  const next = nextPending(st.match, st.plans, st.active);
  if (next) store.setState({ active: next, pendingCard: null, step: stepFor(st.plans[next]) });
}

function apply(o: StepOutcome): void {
  const { active } = store.getState();
  if (o.select) {
    selectNinja(o.select);
    return;
  }
  if (o.plan && active) setPlan(active, o.plan);
  if (o.cardDone) store.setState({ pendingCard: null });
  if (o.step) store.setState({ step: o.step });
  if (o.notice) notify(o.notice);
  if (o.sound) audio.play(o.sound);
  if (o.finished) afterStep();
}

export function clickTile(v: Vec): void {
  if (!canPlan()) return;
  apply(clickOutcome(store.getState(), v));
}

export function undo(): void {
  if (!canPlan()) return;
  apply(undoOutcome(store.getState()));
}

export function selectCard(cardId: string): void {
  const st = store.getState();
  if (!canPlan() || !st.active || !st.match) return;
  const n = getNinja(st.match, st.active);
  if (!n || n.hp <= 0 || !n.hand.some((c) => c.id === cardId)) return;
  const plan = st.plans[st.active];
  // Clic en la carta ya colocada: se retira.
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
  store.setState({ pendingCard: null, step: 'act' });
  audio.play('place');
  afterStep();
}

export function setHover(v: Vec | null): void {
  const h = store.getState().hover;
  if ((h && v && eq(h, v)) || (!h && !v)) return;
  store.setState({ hover: v });
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
