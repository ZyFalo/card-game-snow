import type { BonusCondition, ElementKind, MatchState, Plan, Round, Vec } from '@ventisca/core';
import type { Progress, User } from '@ventisca/protocol';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { TIPS } from '../i18n/es';
import { loadSettings, type Settings } from './persist';

export type Screen = 'title' | 'team' | 'loading' | 'battle' | 'results' | 'account' | 'credits';

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
  | 'camino'
  | 'collection';

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

/** Los dos pasos de planificar a un ninja: primero moverse, después actuar (state/steps.ts). */
export type PlanStep = 'move' | 'act';

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

export interface AppState {
  screen: Screen;
  settings: Settings;
  helpOpen: boolean;
  paused: boolean;
  phase: Phase;
  /** Estado autoritativo (el último que devolvió el motor). */
  match: MatchState | null;
  /** Estado presentado: avanza evento por evento mientras se anima el turno. */
  view: MatchState | null;
  plans: Partial<Record<ElementKind, Plan>>;
  active: ElementKind | null;
  /** El paso en que está el ninja activo. */
  step: PlanStep;
  pendingCard: string | null;
  hover: Vec | null;
  /** R-09: el ninja que nombra el consejo de cómo revivir, la primera vez que alguien cae en la partida. */
  reviveTip: ElementKind | null;
  /** Ese consejo ya salió en esta partida. */
  reviveTipSeen: boolean;
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
}

export const initialState = (): AppState => ({
  screen: 'title',
  settings: loadSettings(),
  helpOpen: false,
  paused: false,
  phase: 'idle',
  match: null,
  view: null,
  plans: {},
  active: null,
  step: 'move',
  pendingCard: null,
  hover: null,
  reviveTip: null,
  reviveTipSeen: false,
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
});

export const store = createStore<AppState>()(() => initialState());

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector);
}
