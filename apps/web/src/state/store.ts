import type {
  AchievementId,
  BankCard,
  BonusCondition,
  CoinReward,
  ElementKind,
  MatchState,
  Plan,
  Round,
  Vec,
} from '@ventisca/core';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { TIPS } from '../i18n/es';
import { loadAchievements, loadSettings, type Settings, type Unlocked } from './persist';
import { loadProfile, type Profile } from './profile';

export type Screen = 'title' | 'camino' | 'team' | 'collection' | 'loading' | 'battle' | 'results';
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

export interface Results {
  state: MatchState;
  earned: AchievementId[];
  fresh: AchievementId[];
  /** Monedas que pagó la partida (R-29) y saldo después de cobrarlas. */
  reward: CoinReward;
  balance: number;
}

/** Cartas recién sacadas de una caja, para la animación de revelado. */
export interface Reveal {
  element: ElementKind;
  cards: BankCard[];
  /** Por posición: true si era una carta que el jugador todavía no tenía. */
  fresh: boolean[];
  key: number;
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
  unlocked: Unlocked;
  seed: number | null;
  profile: Profile;
  reveal: Reveal | null;
  collectionTab: ElementKind;
  collectionReturn: Screen;
  /** Camino recién elegido: la pantalla de equipo da la bienvenida una vez. */
  welcome: ElementKind | null;
  /** Mantener Espacio (o el botón) acelera la resolución del turno. */
  boosting: boolean;
  resolveStep: ResolveStep;
  flights: CardFlight[];
  /** Cartas en vuelo: la mano las oculta hasta que aterrizan. */
  incoming: string[];
  /** Cartas que acaban de aterrizar (destello de llegada). */
  arrived: string[];
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
  unlocked: loadAchievements(),
  seed: null,
  profile: loadProfile(),
  reveal: null,
  collectionTab: 'fire',
  collectionReturn: 'title',
  welcome: null,
  boosting: false,
  resolveStep: null,
  flights: [],
  incoming: [],
  arrived: [],
});

export const store = createStore<AppState>()(() => initialState());

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector);
}
