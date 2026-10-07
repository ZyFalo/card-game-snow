import type { ElementKind } from '@ventisca/core';

/** Paleta de la Propuesta A "Pliegues" (§10.1 del PRD). */
export const PALETTE = {
  paper: '#EAF0F4',
  paperLight: '#F6F9FB',
  paperShade: '#DCE6EE',
  ink: '#1F2440',
  grieta: '#8FB8D8',
  gold: '#F2B84B',
  danger: '#D14545',
} as const;

export interface ElementColors {
  base: string;
  light: string;
  dark: string;
  accent: string;
  accentLight: string;
  /** El color suave del elemento: el mismo de `--fire-soft`, `--water-soft` y `--snow-soft` en la interfaz. */
  soft: string;
}

export const ELEMENT_COLORS: Record<ElementKind, ElementColors> = {
  fire: {
    base: '#E4572E',
    light: '#F07A55',
    dark: '#B83E1C',
    accent: '#F2B84B',
    accentLight: '#F8D78C',
    soft: '#FBE3DA',
  },
  water: {
    base: '#2F6FDB',
    light: '#5B8FE6',
    dark: '#1F4FA8',
    accent: '#9CC0F5',
    accentLight: '#CFE0FA',
    soft: '#DCE8FB',
  },
  snow: {
    base: '#4FC9B8',
    light: '#7FDBCD',
    dark: '#2E9E8F',
    accent: '#D9F4EF',
    accentLight: '#F2FBF9',
    soft: '#DAF4F0',
  },
};

export const ICE = {
  base: '#8FB8D8',
  light: '#C9E2F2',
  dark: '#5E88AE',
  deep: '#3F6487',
  glow: '#7FE7FF',
  white: '#F4FAFD',
} as const;

export const hex = (color: string): number => Number.parseInt(color.slice(1), 16);
