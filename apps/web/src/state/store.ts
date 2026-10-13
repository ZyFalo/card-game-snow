import type { BonusCondition, ElementKind, EnemyKind, MatchState, Plan, Round, Vec } from '@ventisca/core';
import type { MatchNotice, MatchSeat, PlayError, Progress, ServerPayload, User } from '@ventisca/protocol';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { OnlineEnd } from '../host/GameHost';
import { TIPS } from '../i18n/es';
import type { LinkStatus } from '../net/socket';
import { loadSettings, type Settings } from './persist';

export type Screen =
  | 'title'
  | 'team'
  | 'loading'
  | 'battle'
  | 'results'
  | 'account'
  | 'credits'
  | 'online'
  | 'notebook';

/** Vistas de la pantalla de cuenta (modo en línea). */
export type AccountView =
  | 'login'
  | 'register'
  | 'verify'
  | 'recover'
  | 'recoverCode'
  | 'revert'
  | 'profile'
  | 'privacy'
  | 'camino';

/** El campo al que apunta un error, para mostrarlo debajo de él (lineamientos, sección 4). */
export type AccountField = 'email' | 'displayName' | 'password' | 'repeat' | 'code' | 'current';

export interface AccountState {
  /** `offline`: no hay servidor (sin red, o el build de un solo archivo); se juega sin cuenta. */
  status: 'unknown' | 'offline' | 'ready';
  user: User | null;
  view: AccountView;
  /** A qué vista vuelve el aviso de privacidad. */
  previous: AccountView;
  /** Correo del registro o de la recuperación en curso, para el paso del código. */
  email: string;
  /** Correo nuevo pedido desde el perfil, a la espera de su código (R-48). */
  pendingEmail: string | null;
  turnstileSiteKey: string | null;
  busy: boolean;
  error: string | null;
  /** Sin campo, el error va en un mensaje arriba del formulario. */
  errorField: AccountField | null;
  /** `gold`: algo en curso (te mandamos un código); `snow`: algo terminado. */
  info: { text: string; tone: 'gold' | 'snow' } | null;
}

/** Una caja de la tienda: su elemento y cuántas cartas trae (R-28). */
export interface Box {
  element: ElementKind;
  size: number;
}

/** Una caja recién abierta, para mostrar sus cartas. `fresh`: si cada carta era nueva en la colección. */
export interface Reveal {
  key: number;
  element: ElementKind;
  cards: string[];
  fresh: boolean[];
}

/** El progreso de la cuenta (D-34), tal como lo dio el servidor. El cliente nunca lo calcula. */
export interface ProgressState {
  /** Estado de la última lectura. `idle`: todavía no se pidió; `error`: no se pudo leer. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: Progress | null;
  /** Elemento que muestra la colección. */
  tab: ElementKind;
  /** Hay una petición en curso que cambia el progreso: elegir el camino o comprar una caja. */
  busy: boolean;
  /**
   * La compra en curso o, sin petición en curso, la que quedó sin respuesta (D-66 y D-68). Guarda su
   * identificador: si la respuesta se pierde, no se sabe si el servidor cobró, y el reintento de la
   * misma caja lo reutiliza para que el servidor devuelva el resultado original sin cobrar de nuevo.
   * Cualquier respuesta definitiva, sea la caja o un rechazo, la deja en `null`.
   */
  pending: (Box & { purchaseId: string }) | null;
  /** El error de la última petición que cambia el progreso. */
  error: string | null;
  reveal: Reveal | null;
}

export const initialProgress = (): ProgressState => ({
  status: 'idle',
  data: null,
  tab: 'fire',
  busy: false,
  pending: null,
  error: null,
  reveal: null,
});

/** intro: aparición de la ronda; planning: el jugador planifica; resolving: se anima el turno. */
export type Phase = 'idle' | 'intro' | 'planning' | 'resolving' | 'ended';

export type Overlay =
  /** `turn`: el turno que se planificará al terminar el cartel (R-21). */
  | { kind: 'round'; round: Round; condition: BonusCondition; turnLimit: number; turn: number; key: number; ms: number }
  | { kind: 'combo'; elements: ElementKind[]; key: number; ms: number }
  | { kind: 'bonus'; met: boolean; condition: BonusCondition; key: number; ms: number }
  | null;

/** Carta robada que vuela del ninja en el tablero a su mano o a su panel (fase 4). */
export interface CardFlight {
  id: number;
  ninja: ElementKind;
  cardId: string;
  element: ElementKind;
  value: number;
  /** Punto de salida en coordenadas del escenario (1280×720). */
  from: { x: number; y: number };
  ms: number;
}

/** En qué parte de la resolución va el turno (consejo en pantalla). */
export type ResolveStep = 'ninjas' | 'enemies' | 'end' | null;

export interface TimerState {
  /** Momento (performance.now) en que vence el turno; null si no hay reloj o está en pausa. */
  deadline: number | null;
  /** Milisegundos restantes mientras el reloj está en pausa. */
  remaining: number | null;
  total: number | null;
}

/** El sandbox no da monedas ni logros (D-34): los resultados son la partida y sus estadísticas. */
export interface Results {
  state: MatchState;
}

/**
 * La demostración abierta, una a la vez: qué hacen las cartas de ese ninja, con o sin combo (D-81), o cómo
 * ataca ese gólem (D-82).
 */
export type OpenDemo = { kind: 'card'; ninja: ElementKind; combo: boolean } | { kind: 'golem'; enemy: EnemyKind };

/** La partida en línea de esta persona: su ninja, quién lleva cada uno y cómo va el turno (R-35 a R-39). */
export interface OnlineMatch {
  you: ElementKind;
  seats: MatchSeat[];
  /** El código de la sala desde la que se juega, o `null` si salió de la cola. */
  room: string | null;
  /** El turno que se planea, o `null` entre un turno y otro. */
  turn: number | null;
  /** Los ninjas que ya están listos en el turno que se planea: confirmaron, o no tienen nada que confirmar. */
  ready: ElementKind[];
  /** Esta persona lleva a su ninja en este turno: está en pie, y no acaba de volver (R-38). */
  plays: boolean;
  /** Ya terminó de ver el turno anterior, y espera a que termine su equipo (R-36). */
  waiting: boolean;
}

export type QueueView = Extract<ServerPayload, { type: 'queue.state' }>;
export type RoomView = Extract<ServerPayload, { type: 'room.state' }>;

/** El juego en línea: la conexión, dónde está la persona y su partida. */
export interface OnlineState {
  /** `off`: sin conexión porque no se pidió. */
  link: LinkStatus | 'off';
  /** Dónde está según el servidor, fuera de una partida. `null`: todavía no lo dijo. */
  place: 'home' | 'queue' | 'room' | null;
  /** Lo que se ve en el inicio en línea: la ficha del ninja, o crear una sala o unirse a una. */
  view: 'pick' | 'rooms';
  /** El ninja elegido en la ficha: con él se entra a la cola o a una sala. */
  element: ElementKind;
  queue: QueueView | null;
  /** Cuándo llegó el último estado de la cola (`performance.now`), para seguir contando el tiempo de búsqueda. */
  queueAt: number;
  room: RoomView | null;
  /** Hay una petición en camino: entrar a la cola, crear una sala o unirse a una. */
  busy: boolean;
  /** Por qué no se pudo hacer lo último que se pidió. */
  error: PlayError | 'code_empty' | null;
  /** El aviso pendiente de la última partida: se muestra una sola vez, sobre "Jugar en línea". */
  notice: MatchNotice | null;
  /** La sala en que estaba se cerró. */
  roomClosed: boolean;
  match: OnlineMatch | null;
  /** El resultado de la partida que terminó, mientras se ve. */
  end: OnlineEnd | null;
  /** El aviso "¿Salir de la partida?" está abierto. */
  leaving: boolean;
  /** Acaba de volver a su partida: la franja "Volviste" se ve un momento. */
  back: boolean;
}

/**
 * La Libreta ninja (D-100): el progreso y las cartas de la cuenta. `page` recorre la colección en páginas
 * de 2 × 5, dos por elemento; `from` es la pantalla a la que vuelve al cerrarse.
 */
export interface NotebookState {
  tab: 'progress' | 'cards' | 'boxes';
  page: number;
  from: Screen;
}

export const initialOnline = (): OnlineState => ({
  link: 'off',
  place: null,
  view: 'pick',
  element: 'fire',
  queue: null,
  queueAt: 0,
  room: null,
  busy: false,
  error: null,
  notice: null,
  roomClosed: false,
  match: null,
  end: null,
  leaving: false,
  back: false,
});

export interface AppState {
  screen: Screen;
  settings: Settings;
  /** La partida corre en este navegador (`GameHost.local`): ahí valen las ayudas opcionales (D-78). */
  local: boolean;
  helpOpen: boolean;
  /** El gólem cuya demostración se abrió desde la ayuda (D-82): va sobre ella, en cualquier pantalla. */
  helpDemo: EnemyKind | null;
  paused: boolean;
  phase: Phase;
  /** Estado autoritativo (el último que devolvió el motor). */
  match: MatchState | null;
  /** Estado presentado: avanza evento por evento mientras se anima el turno. */
  view: MatchState | null;
  plans: Partial<Record<ElementKind, Plan>>;
  active: ElementKind | null;
  pendingCard: string | null;
  hover: Vec | null;
  /** El gólem que nombra la franja: el último que miró el ratón, mientras dura (D-82). */
  spotted: EnemyKind | null;
  demo: OpenDemo | null;
  timer: TimerState;
  overlay: Overlay;
  notice: { text: string; key: number } | null;
  loadingTip: string;
  results: Results | null;
  seed: number | null;
  /** Mantener Espacio (o el botón) acelera la resolución del turno. */
  boosting: boolean;
  resolveStep: ResolveStep;
  flights: CardFlight[];
  /** Cartas en vuelo: la mano las oculta hasta que aterrizan. */
  incoming: string[];
  /** Cartas que acaban de aterrizar (destello de llegada). */
  arrived: string[];
  /** El navegador no tiene WebGL: el tablero no se puede dibujar. */
  webglMissing: boolean;
  account: AccountState;
  progress: ProgressState;
  online: OnlineState;
  notebook: NotebookState;
}

export const initialState = (): AppState => ({
  screen: 'title',
  settings: loadSettings(),
  local: true,
  helpOpen: false,
  helpDemo: null,
  paused: false,
  phase: 'idle',
  match: null,
  view: null,
  plans: {},
  active: null,
  pendingCard: null,
  hover: null,
  spotted: null,
  demo: null,
  timer: { deadline: null, remaining: null, total: null },
  overlay: null,
  notice: null,
  loadingTip: TIPS[0] as string,
  results: null,
  seed: null,
  boosting: false,
  resolveStep: null,
  flights: [],
  incoming: [],
  arrived: [],
  webglMissing: false,
  account: {
    status: 'unknown',
    user: null,
    view: 'login',
    previous: 'login',
    email: '',
    pendingEmail: null,
    turnstileSiteKey: null,
    busy: false,
    error: null,
    errorField: null,
    info: null,
  },
  progress: initialProgress(),
  online: initialOnline(),
  notebook: { tab: 'progress', page: 0, from: 'title' },
});

export const store = createStore<AppState>()(() => initialState());

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector);
}
