import {
  type ElementKind,
  type EnemyKind,
  eq,
  type GameEvent,
  getNinja,
  livingNinjas,
  type MatchState,
  type Plan,
  suggestPlan,
  type Vec,
} from '@ventisca/core';
import type { MatchSeat, SeatStatus, TeamPlan } from '@ventisca/protocol';
import { audio } from '../audio/audio';
import { URL_SPEED } from '../game/speed';
import type { GameHost, HostMessage, OnlineEnd, OnlineSeats, OnlineTurn } from '../host/GameHost';
import { LocalHost } from '../host/LocalHost';
import { toPlan } from '../host/NetworkHost';
import { NINJA_TEXT, NINJA_TIPS, NOTICE, ONLINE_TEXT, TIPS } from '../i18n/es';
import { bridge, sceneReady } from './bridge';
import { type Settings, saveSettings } from './persist';
import { nextPending, nextPlannable, plansArray, spotAt, turnClockMs, withoutAction } from './planning';
import { applyEvent, beforeIntro } from './present';
import { clickOutcome, type StepOutcome, undoOutcome } from './steps';
import { type CardFlight, type OnlineMatch, type Screen, store } from './store';
import { readyOf, reveal, revealAll, seatOf, teamPlans } from './team';
import type { TipId } from './tips';

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
  store.setState({ helpOpen: open, helpDemo: null });
}

/**
 * La demostración de un gólem, abierta desde la ayuda (D-82). No depende de la franja ni del ratón: sirve
 * con el teclado y con "Consejos en pantalla" apagado. Va sobre la ayuda, no en la partida.
 */
export function openHelpDemo(enemy: EnemyKind): void {
  store.setState({ helpDemo: enemy });
}

export function closeHelpDemo(): void {
  if (store.getState().helpDemo) store.setState({ helpDemo: null });
}

/** Abre la demostración de las cartas de ese ninja (D-81), sin combo. Solo hay una abierta a la vez. */
export function openCardDemo(ninja: ElementKind): void {
  store.setState({ demo: { kind: 'card', ninja, combo: false }, hover: null });
}

/** Abre la demostración de cómo ataca ese gólem (D-82). */
export function openGolemDemo(enemy: EnemyKind): void {
  store.setState({ demo: { kind: 'golem', enemy }, hover: null });
}

/** El selector "Sin combo | Con combo" de la demostración de una carta. */
export function setDemoCombo(combo: boolean): void {
  const { demo } = store.getState();
  if (demo?.kind === 'card' && demo.combo !== combo) store.setState({ demo: { ...demo, combo } });
}

export function closeDemo(): void {
  if (store.getState().demo) store.setState({ demo: null });
}

/** "Entendido": ese consejo queda aprendido y no vuelve a salir (D-80). Se guarda con los ajustes. */
export function learnTip(id: TipId): void {
  const { learnedTips } = store.getState().settings;
  if (!learnedTips.includes(id)) updateSettings({ learnedTips: [...learnedTips, id] });
}

/** Desde la ayuda: los consejos vuelven a salir, cada uno en su momento (D-80). */
export function forgetTips(): void {
  updateSettings({ learnedTips: [] });
}

function applyToView(e: GameEvent): void {
  const v = store.getState().view;
  if (v) store.setState({ view: applyEvent(v, e) });
}

/* ---------- Partida ---------- */

/**
 * Cambia de host: el anterior se cierra y sus mensajes se descartan. Los mensajes del nuevo
 * se muestran de a uno y en orden: cada uno espera a que termine de animarse el anterior.
 *
 * En línea, el servidor no espera a un cliente que se atrasa (R-36): si mientras se anima un turno ya
 * llegó el resultado del siguiente, lo atrasado se pone en el tablero sin animarlo, para alcanzar al equipo.
 */
function attachHost(next: GameHost): void {
  host.close();
  host = next;
  store.setState({ local: next.local });
  const pending: HostMessage[] = [];
  let running = false;
  const pump = async () => {
    if (running) return;
    running = true;
    while (pending.length > 0 && host === next) {
      const msg = pending.shift() as HostMessage;
      try {
        await show(msg, staleBehind(msg, pending));
      } catch (err) {
        reportError(err);
      }
    }
    running = false;
  };
  next.subscribe((msg) => {
    pending.push(msg);
    void pump();
  });
}

/**
 * ¿Quedó atrasado ese mensaje? Lo está si detrás ya espera el resultado de un turno posterior, o la
 * vuelta a la partida, que trae el tablero entero.
 */
export function staleBehind(msg: HostMessage, pending: readonly HostMessage[]): boolean {
  if (msg.type === 'matchEnd' || msg.type === 'matchResume') return false;
  return pending.some((m) => m.type === 'turnResult' || m.type === 'matchResume');
}

/** Empieza a jugar sobre ese host. Lo usa el juego en línea, que crea el suyo cuando el servidor arma la partida. */
export function playOn(next: GameHost): void {
  attachHost(next);
}

function show(msg: HostMessage, stale: boolean): Promise<void> | void {
  switch (msg.type) {
    case 'matchStart':
      return showMatchStart(msg.state, msg.events, msg.online);
    case 'turnResult':
      return stale ? skipTurn(msg.state) : showTurn(msg.state, msg.events);
    case 'matchResume':
      return showResume(msg.state, msg.online, msg.turn);
    case 'turnStart':
      return stale ? undefined : showTurnStart(msg.turn, msg.seats);
    case 'teamPlan':
      return showTeamPlan(msg.turn, msg.plan);
    case 'planFix':
      return showPlanFix(msg);
    case 'seat':
      return showSeat(msg.ninja, msg.status);
    case 'matchEnd':
      return showMatchEnd(msg.end);
  }
}

/** Cambia solo lo de la partida en línea, si hay una. */
function patchOnline(patch: Partial<OnlineMatch>): void {
  store.setState((s) => (s.online.match ? { online: { ...s.online, match: { ...s.online.match, ...patch } } } : {}));
}

export async function startMatch(): Promise<void> {
  const { settings } = store.getState();
  attachHost(new LocalHost());
  const seed = Math.floor(Math.random() * 2 ** 32) >>> 0;
  // D-50: sin reserva, cada ninja juega con el mazo de referencia del balance (8, 9, 10, 10, 11 y 12).
  await host.start({ seed, difficulty: settings.difficulty });
}

/** Cuánto se ve la pantalla de carga. En línea trae un consejo del ninja elegido: se le da tiempo de lectura. */
export const LOADING_MS = { local: 1800, localReduced: 900, online: 3400 } as const;

/** El "Consejo ninja" de la carga (D-100): los tres de cada ninja se turnan entre partidas. */
let ninjaTipTurn = Math.floor(Math.random() * 3);
function nextNinjaTip(ninja: ElementKind): string {
  const tips = NINJA_TIPS[ninja];
  ninjaTipTurn = (ninjaTipTurn + 1) % tips.length;
  return tips[ninjaTipTurn] as string;
}

/** La partida está lista (mensaje `matchStart`): pantalla de carga, entrada y primer turno. */
async function showMatchStart(state: MatchState, events: GameEvent[], online?: OnlineSeats): Promise<void> {
  const { settings } = store.getState();
  const tip = online ? nextNinjaTip(online.you) : (TIPS[Math.floor(Math.random() * TIPS.length)] ?? '');
  store.setState((s) => ({
    screen: 'loading',
    loadingTip: tip,
    phase: 'intro',
    match: state,
    view: beforeIntro(state),
    plans: {},
    active: null,
    pendingCard: null,
    hover: null,
    demo: null,
    overlay: null,
    paused: false,
    results: null,
    // En línea el servidor no manda la semilla (D-102).
    seed: online ? null : state.seed,
    timer: { deadline: null, remaining: null, total: null },
    online: online
      ? {
          ...s.online,
          match: { ...online, turn: null, ready: [], plays: false, waiting: false },
          end: null,
          leaving: false,
          back: false,
        }
      : s.online,
  }));
  const scene = await sceneReady;
  const generation = scene.setupMatch(beforeIntro(state));
  const loading = online ? LOADING_MS.online : settings.reducedMotion ? LOADING_MS.localReduced : LOADING_MS.local;
  await sleep(loading * URL_SPEED);
  if (!scene.isCurrent(generation)) return;
  store.setState({ screen: 'battle' });
  await scene.playEvents(events, applyToView, generation);
  if (!scene.isCurrent(generation)) return;
  store.setState({ view: state });
  afterWatching(0);
}

/**
 * Terminó de verse un turno, o la entrada de la partida. En el sandbox se pasa a planificar. En línea se
 * le avisa al servidor, y la planificación empieza cuando él lo dice, con su reloj (R-36).
 */
function afterWatching(turn: number): void {
  if (host.local) {
    beginPlanning();
    return;
  }
  host.watched?.(turn);
  patchOnline({ waiting: true });
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
  forgetSpotted();
  store.setState({
    phase: 'planning',
    resolveStep: null,
    spotted: null,
    plans: {},
    active: nextPlannable(match, {}, null, 1),
    pendingCard: null,
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
  forgetSpotted();
  store.setState({
    phase: 'resolving',
    resolveStep: 'ninjas',
    spotted: null,
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
  if (!st.local) {
    confirmOnline();
    return;
  }
  audio.play('confirm');
  closePlanning();
  await host.submit(plansArray(st.plans));
}

/**
 * En línea, confirmar es definitivo (R-36): esta persona queda lista y ya no cambia su plan. El turno se
 * resuelve cuando confirman todos o cuando vence el reloj del servidor.
 */
function confirmOnline(): void {
  const st = store.getState();
  const om = st.online.match;
  if (!om?.plays || om.ready.includes(om.you) || st.online.leaving) return;
  audio.play('confirm');
  dropSpotted();
  const plan = st.plans[om.you];
  store.setState({
    active: null,
    pendingCard: null,
    demo: null,
    online: { ...st.online, match: { ...om, ready: [...om.ready, om.you] } },
  });
  void host.submit(plan ? [plan] : []);
}

/* ---------- La partida en línea (R-35 a R-39) ---------- */

/** Empieza la planificación de un turno, con el reloj del servidor y los planes que ya están a la vista. */
function showTurnStart(turn: OnlineTurn, seats: MatchSeat[]): void {
  const st = store.getState();
  const om = st.online.match;
  if (!om || st.match?.status !== 'playing') return;
  const match = revealAll(st.match, turn.plans);
  const me = getNinja(match, om.you);
  const plays = !!me && me.hp > 0;
  setBoost(false);
  forgetSpotted();
  store.setState({
    phase: 'planning',
    resolveStep: null,
    spotted: null,
    match,
    view: match,
    plans: teamPlans(turn.plans, om.you),
    active: plays ? om.you : null,
    pendingCard: null,
    timer: { deadline: turn.deadline, remaining: null, total: turn.totalMs },
    online: {
      ...st.online,
      match: { ...om, seats, turn: turn.n, ready: readyOf(turn.plans), plays, waiting: false },
    },
  });
}

/** Cambió el plan de un compañero, o confirmó. */
function showTeamPlan(turn: number, plan: TeamPlan): void {
  const st = store.getState();
  const om = st.online.match;
  if (!om || om.turn !== turn || st.phase !== 'planning' || !st.match || plan.ninja === om.you) return;
  const match = reveal(st.match, plan);
  const plans = { ...st.plans };
  const next = toPlan(plan.ninja, plan.plan);
  if (next) plans[plan.ninja] = next;
  else delete plans[plan.ninja];
  const others = om.ready.filter((id) => id !== plan.ninja);
  store.setState({
    match,
    view: match,
    plans,
    online: { ...st.online, match: { ...om, ready: plan.ready ? [...others, plan.ninja] : others } },
  });
}

/**
 * El servidor no aceptó parte del plan de esta persona: un compañero llegó primero a esa casilla o a ese
 * caído. Queda lo que sí vale, y si había confirmado, esa confirmación no cuenta: puede corregir y confirmar.
 */
function showPlanFix(fix: Extract<HostMessage, { type: 'planFix' }>): void {
  const st = store.getState();
  const om = st.online.match;
  if (!om || om.turn !== fix.turn || st.phase !== 'planning' || !st.match) return;
  const before = st.plans[om.you];
  const plan = toPlan(om.you, fix.plan);
  const plans = { ...st.plans };
  if (plan) plans[om.you] = plan;
  else delete plans[om.you];
  store.setState({
    plans,
    pendingCard: null,
    active: om.plays ? om.you : null,
    online: { ...st.online, match: { ...om, ready: om.ready.filter((id) => id !== om.you) } },
  });
  const by = fix.by ? NINJA_TEXT[fix.by].name : null;
  const fallen = before?.action?.type === 'revive' ? NINJA_TEXT[before.action.targetId as ElementKind]?.name : null;
  if (fix.reason === 'tile_reserved' && by) notify(NOTICE.tileReserved(by));
  else if (fix.reason === 'revive_taken' && by && fallen) notify(NOTICE.reviveTaken(by, fallen));
  else notify(ONLINE_TEXT.planInvalid);
  audio.play('error');
  // Si se cruzaron mensajes, el servidor podría tener otro plan: con esto los dos quedan con el mismo.
  host.planChanged?.(plan);
}

/** Una persona se desconectó, volvió o abandonó: su ninja queda quieto, o deja de estarlo (R-38, R-39). */
function showSeat(ninja: ElementKind, status: SeatStatus): void {
  const om = store.getState().online.match;
  const seat = om ? seatOf(om, ninja) : undefined;
  if (!om || !seat || seat.status === status) return;
  patchOnline({ seats: om.seats.map((s) => (s.element === ninja ? { ...s, status } : s)) });
  if (ninja === om.you || seat.kind !== 'human') return;
  const who = seat.name ?? '';
  const name = NINJA_TEXT[ninja].name;
  if (status === 'away') notify(ONLINE_TEXT.wentAway(who, name));
  else if (status === 'left') notify(ONLINE_TEXT.wentOut(who, name));
  else notify(ONLINE_TEXT.cameBack(who, name));
}

/** Cuánto se ve la franja "Volviste". */
const BACK_MS = 6000;
let backTimer: number | null = null;

/**
 * La persona volvió a su partida (R-38): el tablero se pone como está, sin animarlo. Su ninja sigue quieto
 * hasta el turno siguiente.
 */
async function showResume(state: MatchState, online: OnlineSeats, turn: OnlineTurn | null): Promise<void> {
  const match = turn ? revealAll(state, turn.plans) : state;
  setBoost(false);
  forgetSpotted();
  store.setState((s) => ({
    screen: 'battle',
    phase: turn ? 'planning' : 'resolving',
    resolveStep: turn ? null : 'end',
    spotted: null,
    match,
    view: match,
    plans: turn ? teamPlans(turn.plans, online.you) : {},
    active: null,
    pendingCard: null,
    hover: null,
    demo: null,
    overlay: null,
    paused: false,
    results: null,
    seed: null,
    timer: turn
      ? { deadline: turn.deadline, remaining: null, total: turn.totalMs }
      : { deadline: null, remaining: null, total: null },
    online: {
      ...s.online,
      match: {
        ...online,
        turn: turn?.n ?? null,
        ready: turn ? readyOf(turn.plans) : [],
        plays: false,
        waiting: turn === null,
      },
      end: null,
      leaving: false,
      back: true,
    },
  }));
  if (backTimer !== null) window.clearTimeout(backTimer);
  backTimer = window.setTimeout(() => {
    backTimer = null;
    store.setState((s) => ({ online: { ...s.online, back: false } }));
  }, BACK_MS);
  const scene = await sceneReady;
  scene.setupMatch(match);
  // Entre un turno y otro no hay nada que mirar aquí: se avisa, para no hacer esperar al equipo.
  if (!turn) host.watched?.(state.turn);
}

/** Un turno que llegó atrasado: se pone en el tablero sin animarlo, y no se avisa de nada. */
function skipTurn(state: MatchState): void {
  if (store.getState().phase === 'planning') closePlanning();
  store.setState({ match: state, view: state, overlay: null });
  bridge.scene?.setupMatch(state);
}

/** La partida en línea terminó: los resultados, con las cuentas que hizo el servidor (R-40). */
function showMatchEnd(end: OnlineEnd): void {
  const { match } = store.getState();
  setBoost(false);
  store.setState((s) => ({
    phase: 'ended',
    screen: 'results',
    demo: null,
    results: match ? { state: match } : null,
    online: { ...s.online, end, leaving: false },
  }));
}

/**
 * La partida en línea ya no está para esta persona: salió, o terminó sin ella. Se suelta el tablero y el
 * host de red; a qué pantalla se va lo decide quien llama.
 */
export function dropOnlineMatch(): void {
  if (host.local) return;
  setBoost(false);
  bridge.scene?.abort();
  attachHost(new LocalHost());
  store.setState((s) => ({
    phase: 'idle',
    paused: false,
    overlay: null,
    plans: {},
    active: null,
    pendingCard: null,
    hover: null,
    demo: null,
    results: null,
    timer: { deadline: null, remaining: null, total: null },
    online: { ...s.online, match: null, end: null, leaving: false, back: false },
  }));
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
    // En línea, los resultados llegan con las cuentas del servidor, en el mensaje `matchEnd`.
    if (host.local) finishMatch();
    return;
  }
  afterWatching(state.turn);
}

/** Tras la celebración, los resultados. El sandbox no da monedas ni logros (D-34). */
function finishMatch(): void {
  const { match } = store.getState();
  store.setState({ phase: 'ended', screen: 'results', demo: null, results: match ? { state: match } : null });
}

export function restartMatch(): void {
  if (!host.local) return;
  setBoost(false);
  host.stopTimer();
  bridge.scene?.abort();
  store.setState({ paused: false });
  void startMatch();
}

export function quitToMenu(): void {
  if (!host.local) return;
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
    demo: null,
  });
}

export function togglePause(force?: boolean): void {
  const st = store.getState();
  // En línea no hay pausa (R-36): el reloj es del servidor y es de todo el equipo.
  if (st.screen !== 'battle' || !st.local) return;
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
 * Qué hace cada clic al planificar lo decide state/steps.ts. Aquí solo se aplica el resultado al estado,
 * con su sonido y su aviso.
 */

/** Sin movimiento ni acción no hay plan: se quita, para que Esc vuelva a abrir la pausa. */
function setPlan(id: ElementKind, plan: Plan): void {
  store.setState((s) => {
    const plans = { ...s.plans };
    if (plan.moveTo || plan.action) plans[id] = plan;
    else delete plans[id];
    return { plans };
  });
  // En línea, los compañeros ven el plan en cuanto cambia (R-35).
  if (!host.local) host.planChanged?.(store.getState().plans[id]);
}

function canPlan(): boolean {
  const st = store.getState();
  if (st.phase !== 'planning' || st.paused || !st.match) return false;
  if (st.local) return true;
  // En línea se planea solo al ninja propio, mientras no se haya confirmado ni se esté por salir.
  const om = st.online.match;
  return !!om?.plays && !om.ready.includes(om.you) && !st.online.leaving;
}

export function selectNinja(id: ElementKind): void {
  const st = store.getState();
  // En línea cada persona lleva a un solo ninja: no hay otro que activar.
  if (!st.local || !canPlan() || !st.match) return;
  const n = getNinja(st.match, id);
  if (!n || n.hp <= 0 || st.active === id) return;
  dropSpotted();
  // La demostración abierta es la de las cartas de otro ninja: se cierra con el cambio.
  store.setState({ active: id, pendingCard: null, demo: null });
  audio.play('select');
}

export function cycleNinja(dir: 1 | -1): void {
  const st = store.getState();
  if (!canPlan() || !st.match) return;
  const next = nextPlannable(st.match, st.plans, st.active, dir);
  if (next) selectNinja(next);
}

/**
 * El ninja activo eligió su acción. Con "Pasar al siguiente ninja", que viene apagado (D-79), le toca al
 * siguiente que tenga algo por decidir. Sin esa ayuda el foco se queda: quien juega pasa al siguiente con
 * un clic en él o con Tab. Tras moverse nunca salta: puede cambiar de casilla con otro clic.
 */
function afterStep(): void {
  const st = store.getState();
  if (!st.local || !st.settings.autoAdvance || !st.match || !st.active) return;
  const next = nextPending(st.match, st.plans, st.active);
  if (next) store.setState({ active: next, pendingCard: null });
}

function apply(o: StepOutcome): void {
  const { active } = store.getState();
  if (o.select) {
    selectNinja(o.select);
    return;
  }
  if (o.plan && active) setPlan(active, o.plan);
  if (o.cardDone) store.setState({ pendingCard: null });
  if (o.notice) notify(o.notice);
  if (o.sound) audio.play(o.sound);
  if (o.finished) afterStep();
}

export function clickTile(v: Vec): void {
  if (!canPlan()) return;
  dropSpotted();
  apply(clickOutcome(store.getState(), v));
}

export function undo(): void {
  if (!canPlan()) return;
  dropSpotted();
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
  // "Sugerir jugada" es del sandbox: en línea cada quien decide lo suyo.
  if (!st.local || !canPlan() || !st.active || !st.match) return;
  const plan = suggestPlan(st.match, st.active, plansArray(st.plans));
  if (!plan) return;
  dropSpotted();
  setPlan(st.active, plan);
  store.setState({ pendingCard: null });
  audio.play('place');
  afterStep();
}

/*
 * El gólem que nombra la franja (D-82). Al pasar el ratón sobre un gólem, la franja lo nombra y ofrece
 * "Ver cómo ataca". Para llegar a ese botón hay que sacar el ratón del gólem, así que el gólem se queda
 * en la franja un momento más, y todo el tiempo que el ratón esté sobre ella.
 */
const SPOTTED_HOLD_MS = 2500;
let spottedTimer: number | null = null;
let spottedHeld = false;

function keepSpotted(): void {
  if (spottedTimer !== null) window.clearTimeout(spottedTimer);
  spottedTimer = null;
}

/** El ratón dejó al gólem: la franja lo suelta al rato, salvo que el ratón esté sobre ella. */
function releaseSpotted(): void {
  if (spottedHeld || spottedTimer !== null || !store.getState().spotted) return;
  spottedTimer = window.setTimeout(() => {
    spottedTimer = null;
    store.setState({ spotted: null });
  }, SPOTTED_HOLD_MS);
}

/** El ratón entra en la franja o sale de ella. */
export function holdSpotted(held: boolean): void {
  spottedHeld = held;
  if (held) keepSpotted();
  else releaseSpotted();
}

function forgetSpotted(): void {
  keepSpotted();
  spottedHeld = false;
}

/** Quien juega hizo algo: la franja vuelve al estado del turno, sin esperar. */
function dropSpotted(): void {
  keepSpotted();
  if (store.getState().spotted) store.setState({ spotted: null });
}

export function setHover(v: Vec | null): void {
  const st = store.getState();
  const h = st.hover;
  if ((h && v && eq(h, v)) || (!h && !v)) return;
  const kind = st.phase === 'planning' ? spotAt(st.match, v) : null;
  if (!kind) {
    store.setState({ hover: v });
    releaseSpotted();
    return;
  }
  keepSpotted();
  store.setState({ hover: v, spotted: kind });
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
