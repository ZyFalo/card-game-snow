import { GRID_H, GRID_W, type Vec } from '@ventisca/core';

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
/** Punto donde se apoyan los pies de una unidad. */
export const footPoint = (v: Vec) => ({ x: BOARD_X + v.x * TW + TW / 2, y: BOARD_Y + v.y * TH + TH - 20 });

export function tileAt(x: number, y: number): Vec | null {
  const tx = Math.floor((x - BOARD_X) / TW);
  const ty = Math.floor((y - BOARD_Y) / TH);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return null;
  return { x: tx, y: ty };
}

export const UNIT_SIZE = {
  ninja: { w: 82, h: 96 },
  sniper: { w: 82, h: 96 },
  artillery: { w: 86, h: 100 },
  colossus: { w: 108, h: 108 },
  rock: { w: 84, h: 76 },
} as const;
