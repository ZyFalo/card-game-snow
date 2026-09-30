import type { ElementKind, EnemyKind } from '@ventisca/core';
import type { NinjaPart } from './ninjas';

/*
 * Esqueletos de recorte (fase 1 de animación, P-13). Cada pieza es una capa del
 * mismo lienzo SVG y gira alrededor de su articulación (pivote, en coordenadas
 * del SVG). Los hijos se dibujan en el orden indicado; 'self' es la imagen de la
 * propia pieza. Apiladas en reposo reproducen exactamente la figura completa.
 */

export interface RigDef {
  id: string;
  width: number;
  height: number;
  /** Punto de apoyo (pies) en coordenadas del SVG: coincide con el pie de la unidad. */
  anchor: readonly [number, number];
  pivots: Record<string, readonly [number, number]>;
  children: Record<string, readonly string[]>;
}

const SHOULDER_BACK: Record<ElementKind, readonly [number, number]> = {
  fire: [43, 66],
  water: [40, 65],
  snow: [45, 67],
};
const SHOULDER_FRONT: Record<ElementKind, readonly [number, number]> = {
  fire: [77, 66],
  water: [80, 66],
  snow: [75, 67],
};
const WEAPON: Record<ElementKind, readonly [number, number]> = { fire: [94, 82], water: [98, 86], snow: [101, 44] };

export function ninjaRig(el: ElementKind): RigDef {
  const pivots: Record<NinjaPart, readonly [number, number]> = {
    legBack: [54, 103],
    legFront: [65, 103],
    torso: [60, 104],
    armBack: SHOULDER_BACK[el],
    head: [60, 57],
    tails: [42, 34],
    armFront: SHOULDER_FRONT[el],
    weapon: WEAPON[el],
  };
  return {
    id: `ninja-${el}`,
    width: 120,
    height: 140,
    anchor: [60, 140],
    pivots,
    children: {
      root: ['legBack', 'legFront', 'torso'],
      torso: ['armBack', 'self', 'head', 'armFront'],
      head: ['tails', 'self'],
      // El abanico de Brasa va detrás del brazo; el puño y la estrella, delante.
      armFront: el === 'fire' ? ['weapon', 'self'] : ['self', 'weapon'],
    },
  };
}

export function golemRig(kind: EnemyKind): RigDef {
  if (kind === 'sniper') {
    return {
      id: 'golem-sniper',
      width: 120,
      height: 140,
      anchor: [60, 140],
      pivots: {
        armBack: [73, 65],
        legBack: [54, 103],
        legFront: [66, 103],
        torso: [60, 106],
        head: [60, 47],
        armFront: [50, 67],
        weapon: [33, 72],
      },
      children: {
        root: ['legBack', 'legFront', 'torso'],
        torso: ['armBack', 'self', 'head', 'armFront'],
        armFront: ['self', 'weapon'],
      },
    };
  }
  if (kind === 'artillery') {
    return {
      id: 'golem-artillery',
      width: 120,
      height: 140,
      anchor: [60, 140],
      pivots: {
        pack: [84, 70],
        legBack: [49, 109],
        legFront: [71, 109],
        torso: [61, 110],
        head: [50, 58],
        armFront: [42, 71],
        weapon: [20, 47],
      },
      children: {
        root: ['legBack', 'legFront', 'torso'],
        torso: ['pack', 'self', 'head', 'armFront'],
        armFront: ['self', 'weapon'],
      },
    };
  }
  return {
    id: 'golem-colossus',
    width: 150,
    height: 150,
    anchor: [75, 150],
    pivots: {
      armBack: [116, 60],
      legBack: [58, 117],
      legFront: [94, 117],
      torso: [75, 118],
      head: [76, 42],
      armFront: [35, 60],
    },
    children: {
      root: ['legBack', 'legFront', 'torso'],
      torso: ['armBack', 'self', 'head', 'armFront'],
    },
  };
}

/** Clave de textura de una pieza. */
export const partKey = (rig: RigDef, part: string): string => `rig-${rig.id}-${part}`;

/** Todas las piezas de un esqueleto (sin la raíz). */
export function rigParts(rig: RigDef): string[] {
  return Object.keys(rig.pivots);
}
