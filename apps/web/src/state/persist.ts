import { DIFFICULTIES, type Difficulty } from '@ventisca/core';
import { PACES, type Pace } from '../i18n/es';

/* Preferencias del jugador en localStorage (siempre con try/catch). */

export interface Settings {
  pace: Pace;
  difficulty: Difficulty;
  tips: boolean;
  /** "Pasar al siguiente ninja": al elegir la acción de un ninja, el foco pasa solo al siguiente (D-79). */
  autoAdvance: boolean;
  sfx: boolean;
  music: boolean;
  reducedMotion: boolean;
  /** Animaciones rápidas: todo el turno a FAST_FACTOR (fase 3). */
  fastAnimations: boolean;
  /** Ayuda "Ver el daño antes de confirmar" (D-78): solo en las partidas locales. */
  aidDamage: boolean;
  /** Ayuda "Ver el alcance de los enemigos" (D-78): solo en las partidas locales. */
  aidReach: boolean;
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
  // D-79: apagado. En la prueba con personas, la gente elegía por su cuenta al siguiente ninja.
  autoAdvance: false,
  sfx: true,
  music: true,
  reducedMotion: false,
  fastAnimations: false,
  aidDamage: false,
  aidReach: false,
};

const KEY_SETTINGS = 'ventisca:settings:v1';

/**
 * Versión de los ajustes guardados: va junto a ellos y sube cuando un cambio pide tocar lo que ya está en
 * el navegador. La 2 apaga "Pasar al siguiente ninja" una sola vez (D-79).
 */
const SETTINGS_VERSION = 2;

/** La versión con que se guardaron esos ajustes. Los anteriores a D-79 no la traen: son la 1. */
function storedVersion(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 1;
  const { version } = raw as { version?: unknown };
  return typeof version === 'number' ? version : 1;
}

export function loadSettings(): Settings {
  const base = { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() };
  try {
    const raw = window.localStorage.getItem(KEY_SETTINGS);
    if (!raw) return base;
    const saved: unknown = JSON.parse(raw);
    const settings = sanitizeSettings(saved, base);
    if (storedVersion(saved) >= SETTINGS_VERSION) return settings;
    // D-79: migración única. "Pasar al siguiente ninja" venía encendido, y en lo ya guardado también se
    // apaga. Se guarda con la versión nueva, así no se repite: después, cada persona decide.
    const migrated = { ...settings, autoAdvance: false };
    saveSettings(migrated);
    return migrated;
  } catch {
    return base;
  }
}

const BOOLEAN_SETTINGS = [
  'tips',
  'autoAdvance',
  'sfx',
  'music',
  'reducedMotion',
  'fastAnimations',
  'aidDamage',
  'aidReach',
] as const;

/** Ajustes leídos del almacenamiento: cada campo inválido o ausente vuelve a su valor de `base`. */
function sanitizeSettings(raw: unknown, base: Settings): Settings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const out: Settings = { ...base };
  // Solo claves propias: con `in`, "toString" o "constructor" pasarían y dejarían el reloj en NaN.
  if (typeof r.pace === 'string' && Object.hasOwn(PACES, r.pace)) out.pace = r.pace as Pace;
  if ((DIFFICULTIES as readonly unknown[]).includes(r.difficulty)) out.difficulty = r.difficulty as Difficulty;
  for (const k of BOOLEAN_SETTINGS) if (typeof r[k] === 'boolean') out[k] = r[k];
  return out;
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ ...s, version: SETTINGS_VERSION }));
  } catch {
    /* sin almacenamiento disponible: se mantiene solo en memoria */
  }
}

/** Perfil y logros de v1. El sandbox no da progreso (D-34) y lo guardado se descarta (D-55). */
const DISCARDED_KEYS = ['ventisca:profile:v1', 'ventisca:achievements:v1'];

export function discardLocalProgress(): void {
  try {
    for (const key of DISCARDED_KEYS) window.localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento disponible: no hay nada que borrar */
  }
}
