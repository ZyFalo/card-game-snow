import type { BonusCondition, ElementKind, MatchState, Plan, Round, Vec } from '@ventisca/core';
import type { User } from '@ventisca/protocol';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { TIPS } from '../i18n/es';
import { loadSettings, type Settings } from './persist';

export type Screen = 'title' | 'team' | 'loading' | 'battle' | 'results' | 'account';

/** Vistas de la pantalla de cuenta (modo en línea). */
export type AccountView =
  | 'login'
  | 'register'
  | 'verify'
  | 'recover'
  | 'recoverCode'
  | 'revert'
  | 'profile'
  | 'privacy';

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
  info: string | null;
}
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
  pendingCard: string | null;
  hover: Vec | null;
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
  pendingCard: null,
  hover: null,
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
    info: null,
  },
});

export const store = createStore<AppState>()(() => initialState());

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector);
}
