import type { ElementKind } from '@ventisca/core';
import { ELEMENT_COLORS, type ElementColors } from './palette';
import { circle, face, folded, INK, line, outline, type Pt, poly, star, svgDoc } from './svg';

/*
 * Ninjas de la Propuesta A "Pliegues": figuras de papel plegado, entintadas
 * cada una con su elemento. Miran a la derecha (hacia los enemigos).
 *   Brasa (Fuego): abanico plegado.  Marea (Agua): guanteletes de papel.
 *   Escarcha (Nieve): capucha puntiaguda y estrella de papel.
 */

export type NinjaPart = 'tails' | 'armBack' | 'legBack' | 'legFront' | 'torso' | 'head' | 'armFront' | 'weapon';
export const NINJA_PARTS: readonly NinjaPart[] = [
  'tails',
  'armBack',
  'legBack',
  'legFront',
  'torso',
  'head',
  'armFront',
  'weapon',
];

export const NINJA_W = 120;
export const NINJA_H = 140;

interface Shape {
  torso: { top: Pt; left: Pt; bottom: Pt; right: Pt };
  belt: Pt[];
  head: Pt[]; // [arriba, der-sup, der-inf, abajo, izq-inf, izq-sup]
  backArm: Pt[];
  frontArm: Pt[];
}

const SHAPES: Record<ElementKind, Shape> = {
  fire: {
    torso: { top: [60, 54], left: [38, 80], bottom: [60, 108], right: [82, 80] },
    belt: [
      [46, 90],
      [74, 90],
      [71, 97],
      [49, 97],
    ],
    head: [
      [60, 12],
      [81, 24],
      [81, 46],
      [60, 58],
      [39, 46],
      [39, 24],
    ],
    backArm: [
      [44, 64],
      [26, 88],
      [36, 92],
    ],
    frontArm: [
      [76, 64],
      [98, 78],
      [90, 88],
    ],
  },
  water: {
    torso: { top: [60, 52], left: [31, 80], bottom: [60, 110], right: [89, 80] },
    belt: [
      [41, 90],
      [79, 90],
      [72, 97],
      [48, 97],
    ],
    head: [
      [60, 12],
      [81, 24],
      [81, 46],
      [60, 58],
      [39, 46],
      [39, 24],
    ],
    backArm: [
      [40, 64],
      [22, 84],
      [32, 90],
    ],
    frontArm: [
      [80, 64],
      [100, 78],
      [92, 88],
    ],
  },
  snow: {
    torso: { top: [60, 56], left: [42, 82], bottom: [60, 108], right: [78, 82] },
    belt: [
      [47, 90],
      [73, 90],
      [68, 97],
      [52, 97],
    ],
    head: [
      [60, 1],
      [80, 26],
      [79, 47],
      [60, 58],
      [41, 47],
      [40, 26],
    ],
    backArm: [
      [46, 66],
      [30, 90],
      [40, 93],
    ],
    frontArm: [
      [74, 66],
      [94, 50],
      [99, 60],
    ],
  },
};

function fan(cx: number, cy: number, r: number, a0: number, a1: number, n: number, c: ElementColors): string {
  const arc: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    arc.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  let out = '';
  for (let i = 0; i < n; i++) {
    out += poly([[cx, cy], arc[i] as Pt, arc[i + 1] as Pt], i % 2 === 0 ? c.accent : c.accentLight, { sw: 1.4 });
  }
  out += outline([[cx, cy], ...arc], 2.6);
  out += circle(cx, cy, 3, c.dark, INK, 1.6);
  return out;
}

function fist(cx: number, cy: number, r: number, c: ElementColors): string {
  const p: Pt[] = [
    [cx - r, cy - r * 0.55],
    [cx - r * 0.2, cy - r],
    [cx + r, cy - r * 0.6],
    [cx + r, cy + r * 0.55],
    [cx + r * 0.15, cy + r],
    [cx - r, cy + r * 0.6],
  ];
  const shade: Pt[] = [
    [cx + r * 0.05, cy - r * 0.1],
    [cx + r, cy - r * 0.6],
    [cx + r, cy + r * 0.55],
    [cx + r * 0.15, cy + r],
  ];
  return (
    folded(p, shade, c.accentLight, c.accent, 2.6) +
    line([cx - r * 0.55, cy - r * 0.1], [cx + r * 0.05, cy - r * 0.1], 1.4)
  );
}

function bodyParts(el: ElementKind): Record<NinjaPart, string> {
  const c = ELEMENT_COLORS[el];
  const s = SHAPES[el];
  const { top, left, bottom, right } = s.torso;
  const h = s.head;
  const p: Record<NinjaPart, string> = {
    tails: '',
    armBack: '',
    legBack: '',
    legFront: '',
    torso: '',
    head: '',
    armFront: '',
    weapon: '',
  };

  // Cintas de la bandana, detrás de la cabeza.
  p.tails += poly(
    [
      [42, 31],
      [15, 21],
      [22, 33],
    ],
    c.dark,
    { sw: 2.4 },
  );
  p.tails += poly(
    [
      [42, 37],
      [17, 42],
      [25, 48],
    ],
    c.dark,
    { sw: 2.4 },
  );

  // Brazo trasero (y puño trasero de Marea).
  p.armBack += poly(s.backArm, c.dark, { sw: 2.6 });
  if (el === 'water') p.armBack += fist(26, 88, 9, c);

  // Piernas y pies.
  p.legBack += poly(
    [
      [50, 102],
      [59, 102],
      [57, 130],
      [46, 130],
    ],
    c.dark,
    { sw: 2.6 },
  );
  p.legFront += poly(
    [
      [61, 102],
      [70, 102],
      [76, 130],
      [65, 130],
    ],
    c.base,
    { sw: 2.6 },
  );
  p.legBack += face(
    [
      [43, 128],
      [59, 128],
      [59, 135],
      [41, 135],
    ],
    INK,
  );
  p.legFront += face(
    [
      [63, 128],
      [79, 128],
      [81, 135],
      [63, 135],
    ],
    INK,
  );

  // Torso plegado: mitad izquierda clara, mitad derecha en el tono base.
  p.torso += folded([top, left, bottom, right], [top, right, bottom], c.light, c.base);
  p.torso += line(top, bottom, 1.4);

  // Cinturón de tinta con nudo del color de acento.
  p.torso += face(s.belt, INK);
  p.torso += poly(
    [
      [57, 92],
      [64, 92],
      [61, 102],
    ],
    c.accent,
    { sw: 1.6 },
  );

  // Cabeza plegada con banda de tinta y ojos.
  p.head += folded(h, [h[0] as Pt, h[1] as Pt, h[2] as Pt, h[3] as Pt], c.light, c.base);
  p.head += face(
    [
      [40.5, 29],
      [80.5, 29],
      [80, 41],
      [41, 41],
    ],
    INK,
  );
  p.head += face(
    [
      [61, 32],
      [69, 34.5],
      [69, 38.5],
      [61, 37],
    ],
    '#FFFFFF',
  );
  p.head += face(
    [
      [72, 34.5],
      [79, 32],
      [79, 37],
      [72, 38.5],
    ],
    '#FFFFFF',
  );

  // Brazo delantero y arma de cada clase.
  if (el === 'fire') {
    p.weapon += fan(94, 82, 31, -150, -38, 6, c);
    p.armFront += poly(s.frontArm, c.base, { sw: 2.6 });
  } else if (el === 'water') {
    p.armFront += poly(s.frontArm, c.base, { sw: 2.6 });
    p.weapon += fist(98, 86, 12, c);
  } else {
    p.armFront += poly(s.frontArm, c.base, { sw: 2.6 });
    const sh = star(101, 44, 12, 4.2, 4, Math.PI / 4);
    p.weapon += folded(sh, [[101, 44], ...sh.slice(0, 4)], c.accentLight, c.accent, 2.2);
    p.weapon += circle(101, 44, 2.2, c.dark, INK, 1.2);
  }
  return p;
}

/** Orden de dibujo de la figura completa (el mismo del dibujo original). */
const DRAW_ORDER: Record<ElementKind, readonly NinjaPart[]> = {
  fire: ['tails', 'armBack', 'legBack', 'legFront', 'torso', 'head', 'weapon', 'armFront'],
  water: ['tails', 'armBack', 'legBack', 'legFront', 'torso', 'head', 'armFront', 'weapon'],
  snow: ['tails', 'armBack', 'legBack', 'legFront', 'torso', 'head', 'armFront', 'weapon'],
};

const composed = (el: ElementKind): string => {
  const parts = bodyParts(el);
  return DRAW_ORDER[el].map((k) => parts[k]).join('');
};

/** Ninja de pie (figura completa: fantasmas de planificación, retratos y menús). */
export function ninjaStandSvg(el: ElementKind, scale = 2): string {
  return svgDoc(NINJA_W, NINJA_H, composed(el), scale);
}

/** Retrato (cabeza y hombros) para el HUD y la cinemática de combo. */
export function ninjaBustSvg(el: ElementKind, scale = 2): string {
  return svgDoc(88, 80, composed(el), scale, '17 -2 88 80');
}

/** Una pieza del esqueleto, sobre el mismo lienzo de 120×140 (fase 1 de animación). */
export function ninjaPartSvg(el: ElementKind, part: NinjaPart, scale = 2): string {
  return svgDoc(NINJA_W, NINJA_H, bodyParts(el)[part], scale);
}

/** Ninja caído: papel arrugado y empapado de nieve. */
export function ninjaKoSvg(el: ElementKind, scale = 2): string {
  const c = ELEMENT_COLORS[el];
  let out = '';
  out += poly(
    [
      [80, 104],
      [102, 95],
      [97, 107],
    ],
    c.dark,
    { sw: 2.4 },
  );
  const ball: Pt[] = [
    [36, 112],
    [43, 97],
    [57, 91],
    [70, 97],
    [81, 93],
    [86, 108],
    [77, 121],
    [62, 125],
    [45, 123],
  ];
  out += face(ball, c.light);
  out += face(
    [
      [57, 91],
      [70, 97],
      [64, 110],
    ],
    c.base,
  );
  out += face(
    [
      [70, 97],
      [81, 93],
      [86, 108],
      [64, 110],
    ],
    c.dark,
  );
  out += face(
    [
      [64, 110],
      [86, 108],
      [77, 121],
      [62, 125],
    ],
    c.base,
  );
  out += outline(ball, 2.8);
  out += line([43, 97], [64, 110], 1.5);
  out += line([64, 110], [45, 123], 1.5);
  out += face(
    [
      [47, 103],
      [67, 99],
      [68, 106],
      [48, 110],
    ],
    INK,
  );
  out += line([55, 105.5], [62, 104], 1.6, '#FFFFFF');
  // Montículo de nieve que lo cubre en parte.
  const mound: Pt[] = [
    [6, 138],
    [18, 120],
    [34, 114],
    [48, 120],
    [62, 116],
    [80, 118],
    [98, 116],
    [110, 124],
    [116, 138],
  ];
  out += face(mound, '#F4F8FB');
  out += face(
    [
      [62, 138],
      [80, 118],
      [98, 116],
      [110, 124],
      [116, 138],
    ],
    '#DCE7EF',
  );
  out += outline(mound, 2.6);
  return svgDoc(NINJA_W, NINJA_H, out, scale);
}
