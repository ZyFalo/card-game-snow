import { ELEMENTS, ENEMY_KINDS } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { golemSvg } from '../art/golems';
import { ninjaKoSvg, ninjaOutlineSvg, ninjaStandSvg } from '../art/ninjas';
import { golemRig, ninjaRig } from '../art/rigs';
import {
  FIGURE_SINK,
  FOOT_Y,
  footPoint,
  MINI,
  miniRect,
  ORDER_BADGE,
  orderPoint,
  READY_MARK,
  readyPoint,
  TH,
  TW,
  tileRect,
  UNIT_HUD,
  UNIT_SIZE,
} from './layout';

/*
 * Lineamientos de diseño, sección "Tablero": cada unidad cabe en su casilla, con su barra de vida y sus
 * íconos de estado dentro. Las figuras se miden por lo que dibujan, no por su lienzo, que trae márgenes.
 */

/** Borde interior de la casilla: el papel de adentro empieza a 3 px del borde. */
const INSET = 3;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Caja de lo que dibuja un SVG del juego, en sus unidades: polígonos, líneas y círculos, con medio trazo. */
function drawnBox(svg: string): Box {
  const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const grow = (x: number, y: number, r: number) => {
    box.left = Math.min(box.left, x - r);
    box.right = Math.max(box.right, x + r);
    box.top = Math.min(box.top, y - r);
    box.bottom = Math.max(box.bottom, y + r);
  };
  for (const [, tag, attrs = ''] of svg.matchAll(/<(polygon|line|circle)\b([^>]*)>/g)) {
    const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
    const num = (name: string) => Number(attr(name) ?? 0);
    const stroke = attr('stroke');
    const half = stroke && stroke !== 'none' ? num('stroke-width') / 2 : 0;
    if (tag === 'polygon') {
      for (const pair of (attr('points') ?? '').trim().split(/\s+/)) {
        const [x, y] = pair.split(',').map(Number);
        grow(x as number, y as number, half);
      }
    } else if (tag === 'line') {
      grow(num('x1'), num('y1'), half);
      grow(num('x2'), num('y2'), half);
    } else {
      grow(num('cx'), num('cy'), num('r') + half);
    }
  }
  return box;
}

/** La misma caja ya en la casilla, en píxeles: el lienzo se apoya en los pies por su punto de anclaje. */
function inTile(svg: string, size: { w: number }, rig: { width: number; anchor: readonly [number, number] }): Box {
  const s = size.w / rig.width;
  const b = drawnBox(svg);
  const x = (v: number) => TW / 2 + (v - rig.anchor[0]) * s;
  const y = (v: number) => FOOT_Y + FIGURE_SINK + (v - rig.anchor[1]) * s;
  return { left: x(b.left), right: x(b.right), top: y(b.top), bottom: y(b.bottom) };
}

function expectInsideTile(b: Box, inset = 0): void {
  expect(b.left).toBeGreaterThanOrEqual(inset);
  expect(b.top).toBeGreaterThanOrEqual(inset);
  expect(b.right).toBeLessThanOrEqual(TW - inset);
  expect(b.bottom).toBeLessThanOrEqual(TH - inset);
}

describe('Cada unidad cabe en su casilla', () => {
  for (const el of ELEMENTS) {
    it(`el ninja de ${el} de pie, su silueta y su figura de caído caben en la casilla`, () => {
      expectInsideTile(inTile(ninjaStandSvg(el), UNIT_SIZE.ninja, ninjaRig(el)));
      expectInsideTile(inTile(ninjaKoSvg(el), UNIT_SIZE.ninja, ninjaRig(el)));
      // La silueta es la misma figura con un filtro: se mide para que no deje de serlo.
      expect(ninjaOutlineSvg(el)).toContain(ninjaStandSvg(el).replace(/^<svg[^>]*>|<\/svg>$/g, ''));
    });
  }

  for (const kind of ENEMY_KINDS) {
    it(`el gólem ${kind} cabe en la casilla`, () => {
      expectInsideTile(inTile(golemSvg(kind), UNIT_SIZE[kind], golemRig(kind)));
    });
  }

  it('las figuras se apoyan sobre su barra de vida, sin taparla', () => {
    const barTop = FOOT_Y + UNIT_HUD.bar.y - UNIT_HUD.bar.frame;
    for (const el of ELEMENTS) {
      expect(inTile(ninjaStandSvg(el), UNIT_SIZE.ninja, ninjaRig(el)).bottom).toBeLessThanOrEqual(barTop);
    }
    for (const kind of ENEMY_KINDS) {
      expect(inTile(golemSvg(kind), UNIT_SIZE[kind], golemRig(kind)).bottom).toBeLessThanOrEqual(barTop);
    }
  });

  it('la barra de vida y su número quedan dentro del papel de la casilla', () => {
    const { bar, hpText } = UNIT_HUD;
    expectInsideTile(
      {
        left: TW / 2 + bar.x - bar.frame,
        right: TW / 2 + bar.x + bar.w + bar.frame,
        top: FOOT_Y + bar.y - bar.frame,
        bottom: FOOT_Y + bar.y + bar.h + bar.frame,
      },
      INSET,
    );
    // El número va a la derecha de la barra, sin pisarla. La vida máxima tiene dos cifras (84, un Témpano
    // en Tormenta), y una cifra en negrita mide unos 0,6 de su tamaño.
    expect(hpText.x).toBeGreaterThanOrEqual(bar.x + bar.w + bar.frame);
    expectInsideTile(
      {
        left: TW / 2 + hpText.x,
        right: TW / 2 + hpText.x + 2 * 0.6 * hpText.size,
        top: FOOT_Y + hpText.y - hpText.size / 2,
        bottom: FOOT_Y + hpText.y + hpText.size / 2,
      },
      INSET,
    );
  });

  it('el número de vida respeta el tamaño mínimo de texto de los lineamientos', () => {
    expect(UNIT_HUD.hpText.size).toBeGreaterThanOrEqual(13);
  });

  it('caben dos íconos de estado a la vez, que es lo máximo: escudo y potencia, o aturdido y quemado', () => {
    const { icon } = UNIT_HUD;
    for (const i of [0, 1]) {
      const cy = FOOT_Y + icon.y + i * icon.step;
      expectInsideTile(
        {
          left: TW / 2 + icon.x - icon.size / 2,
          right: TW / 2 + icon.x + icon.size / 2,
          top: cy - icon.size / 2,
          bottom: cy + icon.size / 2,
        },
        INSET,
      );
    }
    expect(icon.step).toBeGreaterThanOrEqual(icon.size);
  });
});

/*
 * Lineamientos de diseño, sección "Tablero": cada carta colocada deja una miniatura en la franja de
 * arriba de su casilla, y cada elemento tiene su lugar fijo.
 */
describe('Las miniaturas de las cartas colocadas', () => {
  const tile = { x: 4, y: 2 };
  const box = tileRect(tile);
  /** La miniatura con su borde dorado, que es lo más que ocupa. */
  const framed = (el: (typeof ELEMENTS)[number]) => {
    const r = miniRect(tile, el);
    return { left: r.x - MINI.ring, right: r.x + r.w + MINI.ring, top: r.y - MINI.ring, bottom: r.y + r.h + MINI.ring };
  };

  it('ninguna miniatura tapa a otra: las tres caben lado a lado, también con el borde dorado del combo', () => {
    const [fire, water, snow] = ELEMENTS.map(framed);
    if (!fire || !water || !snow) throw new Error('faltan elementos');
    expect(fire.right).toBeLessThanOrEqual(water.left);
    expect(water.right).toBeLessThanOrEqual(snow.left);
    // Todas a la misma altura.
    expect(new Set([fire.top, water.top, snow.top]).size).toBe(1);
  });

  it('cada elemento tiene su lugar fijo: Fuego a la izquierda, Agua al centro y Nieve a la derecha', () => {
    const [fire, water, snow] = ELEMENTS.map((el) => miniRect(tile, el));
    if (!fire || !water || !snow) throw new Error('faltan elementos');
    expect(ELEMENTS).toEqual(['fire', 'water', 'snow']);
    expect(fire.x).toBeLessThan(water.x);
    expect(water.x).toBeLessThan(snow.x);
    // La de Agua, centrada en la casilla; las otras dos, a la misma distancia de ella.
    expect(water.x + water.w / 2).toBe(box.x + TW / 2);
    expect(water.x - fire.x).toBe(snow.x - water.x);
  });

  it('el lugar depende solo de la casilla y del elemento: no se mueve al sumarse otra carta', () => {
    for (const el of ELEMENTS) {
      const here = miniRect(tile, el);
      const there = miniRect({ x: tile.x + 2, y: tile.y + 1 }, el);
      expect(there.x - here.x).toBe(2 * TW);
      expect(there.y - here.y).toBe(TH);
    }
  });

  it('van en la franja de arriba de la casilla, dentro de su papel', () => {
    for (const el of ELEMENTS) {
      const r = framed(el);
      expect(r.left - box.x).toBeGreaterThanOrEqual(INSET);
      expect(box.x + TW - r.right).toBeGreaterThanOrEqual(INSET);
      expect(r.top - box.y).toBeGreaterThanOrEqual(0);
      // No pasan de la mitad de la casilla: abajo van los pies de la unidad y su barra de vida.
      expect(r.bottom - box.y).toBeLessThanOrEqual(TH / 2);
    }
  });

  it('el valor de la carta respeta el tamaño mínimo de texto de los lineamientos', () => {
    expect(MINI.value).toBeGreaterThanOrEqual(13);
    expect(MINI.band).toBeGreaterThanOrEqual(MINI.value - 1);
  });
});

/*
 * Lineamientos de diseño, sección "Tablero": el número de orden va arriba a la izquierda de la casilla
 * desde la que actúa el ninja. Ahí mismo va la miniatura de Fuego: con una carta en la casilla, baja.
 */
describe('El número de orden y las miniaturas', () => {
  const tile = { x: 4, y: 2 };
  const box = tileRect(tile);
  /** El círculo del número, con su borde, como un cuadrado que lo contiene. */
  const badge = (below: boolean) => {
    const c = orderPoint(tile, below);
    const r = ORDER_BADGE.r + ORDER_BADGE.stroke / 2;
    return { cx: c.x, cy: c.y, r, left: c.x - r, right: c.x + r, top: c.y - r, bottom: c.y + r };
  };
  const mini = (el: (typeof ELEMENTS)[number]) => {
    const r = miniRect(tile, el);
    return { left: r.x - MINI.ring, right: r.x + r.w + MINI.ring, top: r.y - MINI.ring, bottom: r.y + r.h + MINI.ring };
  };
  const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  /** Distancia del centro del círculo al punto más cercano de una caja: menor que el radio, la pisa. */
  const reaches = (c: { cx: number; cy: number; r: number }, b: Box) => {
    const dx = Math.max(b.left - c.cx, 0, c.cx - b.right);
    const dy = Math.max(b.top - c.cy, 0, c.cy - b.bottom);
    return Math.hypot(dx, dy) < c.r;
  };

  it('arriba, el número pisa el lugar de la miniatura de Fuego: por eso no pueden ir juntos', () => {
    expect(overlaps(badge(false), mini('fire'))).toBe(true);
  });

  it('abajo no pisa ninguna miniatura, y queda dentro de la casilla', () => {
    const low = badge(true);
    for (const el of ELEMENTS) expect(overlaps(low, mini(el))).toBe(false);
    expect(low.top).toBeGreaterThan(mini('fire').bottom);
    expect(low.left).toBeGreaterThanOrEqual(box.x);
    expect(low.bottom).toBeLessThanOrEqual(box.y + TH);
    // En la misma columna que arriba: solo cambia de esquina.
    expect(low.cx).toBe(badge(false).cx);
  });

  it('abajo tampoco pisa la barra de vida ni su número', () => {
    const low = badge(true);
    const { bar, hpText } = UNIT_HUD;
    const feet = { x: box.x + TW / 2, y: box.y + FOOT_Y };
    const life = {
      left: feet.x + bar.x - bar.frame,
      right: feet.x + bar.x + bar.w + bar.frame,
      top: feet.y + bar.y - bar.frame,
      bottom: feet.y + bar.y + bar.h + bar.frame,
    };
    expect(reaches(low, life)).toBe(false);
    expect(low.right).toBeLessThan(feet.x + hpText.x);
  });
});

describe('La marca de listo de una partida en línea (R-36)', () => {
  const at = { x: 4, y: 2 };
  const circle = (c: { x: number; y: number }, r: number) => ({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r });
  const mark = (below: boolean) => circle(readyPoint(at, below), READY_MARK.r + READY_MARK.stroke / 2);
  const hits = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('va al centro de la casilla, sobre la cabeza, sin pisar el número de orden ni los íconos de estado', () => {
    const tile = tileRect(at);
    expect(readyPoint(at).x).toBe(tile.x + tile.w / 2);
    const order = circle(orderPoint(at), ORDER_BADGE.r + ORDER_BADGE.stroke / 2);
    expect(hits(mark(false), order)).toBe(false);
    const fp = footPoint(at);
    const icon = {
      x: fp.x + UNIT_HUD.icon.x - UNIT_HUD.icon.size / 2,
      y: fp.y + UNIT_HUD.icon.y - UNIT_HUD.icon.size / 2,
      w: UNIT_HUD.icon.size,
      h: UNIT_HUD.icon.size,
    };
    expect(hits(mark(false), icon)).toBe(false);
  });

  it('con una carta en la casilla baja al pecho: no tapa ninguna miniatura ni la barra de vida', () => {
    for (const el of ELEMENTS) expect(hits(mark(true), miniRect(at, el)), el).toBe(false);
    const fp = footPoint(at);
    const bar = { x: fp.x + UNIT_HUD.bar.x, y: fp.y + UNIT_HUD.bar.y, w: UNIT_HUD.bar.w, h: UNIT_HUD.bar.h };
    expect(hits(mark(true), bar)).toBe(false);
    // Arriba sí quedaría sobre la miniatura del centro: por eso baja.
    expect(hits(mark(false), miniRect(at, 'water'))).toBe(true);
  });
});
