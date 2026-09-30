import { type AchievementId, DIFFICULTIES, type Difficulty } from '@ventisca/core';
import { PACES, type Pace } from '../i18n/es';

/* Preferencias y logros del jugador en localStorage (siempre con try/catch). */

export interface Settings {
  pace: Pace;
  difficulty: Difficulty;
  tips: boolean;
  autoAdvance: boolean;
  sfx: boolean;
  music: boolean;
  reducedMotion: boolean;
  /** Animaciones rápidas: todo el turno a FAST_FACTOR (fase 3). */
  fastAnimations: boolean;
}

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS: Settings = {
  pace: 'normal',
  difficulty: 'classic',
  tips: true,
  autoAdvance: true,
  sfx: true,
  music: true,
  reducedMotion: false,
  fastAnimations: false,
};

const KEY_SETTINGS = 'ventisca:settings:v1';
const KEY_ACHIEVEMENTS = 'ventisca:achievements:v1';

export function loadSettings(): Settings {
  const base = { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() };
  try {
    const raw = window.localStorage.getItem(KEY_SETTINGS);
    return raw ? sanitizeSettings(JSON.parse(raw), base) : base;
  } catch {
    return base;
  }
}

const BOOLEAN_SETTINGS = ['tips', 'autoAdvance', 'sfx', 'music', 'reducedMotion', 'fastAnimations'] as const;

/** Ajustes leídos del almacenamiento: cada campo inválido o ausente vuelve a su valor de `base`. */
function sanitizeSettings(raw: unknown, base: Settings): Settings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const out: Settings = { ...base };
  if (typeof r.pace === 'string' && r.pace in PACES) out.pace = r.pace as Pace;
  if ((DIFFICULTIES as readonly unknown[]).includes(r.difficulty)) out.difficulty = r.difficulty as Difficulty;
  for (const k of BOOLEAN_SETTINGS) if (typeof r[k] === 'boolean') out[k] = r[k];
  return out;
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {
    /* sin almacenamiento disponible: se mantiene solo en memoria */
  }
}

export type Unlocked = Partial<Record<AchievementId, string>>;

export function loadAchievements(): Unlocked {
  try {
    const raw = window.localStorage.getItem(KEY_ACHIEVEMENTS);
    return raw ? (JSON.parse(raw) as Unlocked) : {};
  } catch {
    return {};
  }
}

export function saveAchievements(u: Unlocked): void {
  try {
    window.localStorage.setItem(KEY_ACHIEVEMENTS, JSON.stringify(u));
  } catch {
    /* sin almacenamiento disponible */
  }
}
