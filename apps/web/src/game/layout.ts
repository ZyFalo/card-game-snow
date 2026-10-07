import { ELEMENTS, type ElementKind, GRID_H, GRID_W, type Vec } from '@ventisca/core';

/*
 * Coordenadas lógicas del escenario: 1280×720. El canvas de Phaser se crea a
 * 1920×1080 (RES = 1,5) y la cámara hace zoom, así la escena usa coordenadas
 * lógicas pero se ve nítida en pantallas grandes.
 */
export const STAGE_W = 1280;
export const STAGE_H = 720;
export const RES = 1.5;

export const TW = 100;
export const TH = 84;
export const BOARD_X = (STAGE_W - GRID_W * TW) / 2;
export const BOARD_Y = 102;

export const tileRect = (v: Vec) => ({ x: BOARD_X + v.x * TW, y: BOARD_Y + v.y * TH, w: TW, h: TH });
export const tileCenter = (v: Vec) => ({ x: BOARD_X + v.x * TW + TW / 2, y: BOARD_Y + v.y * TH + TH / 2 });

/*
 * Cada unidad cabe en su casilla (lineamientos de diseño, sección "Tablero"): la figura, su barra de
 * vida y sus íconos de estado. Así una unidad no tapa a la de la casilla de arriba ni su barra.
 */

/** Alto, dentro de la casilla, de la línea donde se apoyan los pies de una unidad. */
export const FOOT_Y = 67;
/** La figura se dibuja un poco más abajo que la línea de los pies, para que pise su sombra. */
export const FIGURE_SINK = 2;
/** Punto donde se apoyan los pies de una unidad. */
export const footPoint = (v: Vec) => ({ x: BOARD_X + v.x * TW + TW / 2, y: BOARD_Y + v.y * TH + FOOT_Y });
/** Centro del cuerpo de una unidad: ahí van las marcas de objetivo y de ahí salen las líneas de mira. */
export const aimPoint = (v: Vec) => ({ x: BOARD_X + v.x * TW + TW / 2, y: BOARD_Y + v.y * TH + FOOT_Y - 30 });
/** Esquina de arriba a la izquierda de la casilla: ahí va el número de orden de quien actúa desde ella. */
export const orderPoint = (v: Vec) => ({ x: BOARD_X + v.x * TW + 15, y: BOARD_Y + v.y * TH + 15 });

export function tileAt(x: number, y: number): Vec | null {
  const tx = Math.floor((x - BOARD_X) / TW);
  const ty = Math.floor((y - BOARD_Y) / TH);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return null;
  return { x: tx, y: ty };
}

/** Tamaño en pantalla del lienzo de cada figura. Una prueba mide que lo dibujado quepa en la casilla. */
export const UNIT_SIZE = {
  ninja: { w: 57, h: 66.5 },
  sniper: { w: 57, h: 66.5 },
  artillery: { w: 60, h: 70 },
  colossus: { w: 71, h: 71 },
  rock: { w: 84, h: 76 },
} as const;

/**
 * Las piezas que acompañan a una unidad dentro de su casilla, medidas desde sus pies (x desde el centro
 * de la casilla; y hacia abajo): la barra de vida con su número a la derecha y, arriba a la derecha,
 * la columna de íconos de estado.
 */
export const UNIT_HUD = {
  bar: { x: -24, y: 5, w: 48, h: 5, frame: 2 },
  hpText: { x: 29, y: 7.5, size: 13 },
  icon: { x: 38, y: -55, size: 16, step: 18 },
} as const;

/**
 * Miniatura de una carta colocada: una carta pequeña, como las de la mano, en la franja de arriba de su
 * casilla. Cada elemento tiene su lugar fijo, en el orden de los paneles: Fuego a la izquierda, Agua al
 * centro y Nieve a la derecha. Así las tres caben sin taparse y ninguna se mueve al sumarse otra.
 * `band` es el alto de su franja de color, donde va el valor; `ring`, el grosor del borde dorado del combo.
 */
export const MINI = { w: 26, h: 33, top: 4, gap: 4, band: 14, value: 13, ring: 2 } as const;

/** El lugar de la miniatura de ese elemento en su casilla. */
export function miniRect(v: Vec, el: ElementKind): { x: number; y: number; w: number; h: number } {
  const slot = ELEMENTS.indexOf(el) - 1;
  const cx = BOARD_X + v.x * TW + TW / 2 + slot * (MINI.w + MINI.gap);
  return { x: cx - MINI.w / 2, y: BOARD_Y + v.y * TH + MINI.top, w: MINI.w, h: MINI.h };
}
