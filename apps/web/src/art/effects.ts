import type { ElementKind } from '@ventisca/core';
import { ELEMENT_COLORS, ICE } from './palette';
import { circle, face, folded, INK, line, outline, type Pt, poly, regular, star, svgDoc } from './svg';

/* ---------- Íconos de estado (32×32) ---------- */

export function iconSvg(name: 'shield' | 'boost' | 'stun' | 'burn' | 'heal' | 'attack' | 'revive', scale = 2): string {
  let o = '';
  switch (name) {
    case 'shield': {
      const hex = regular(16, 16, 13, 6, Math.PI / 6);
      o += folded(hex, [hex[5] as Pt, hex[0] as Pt, hex[1] as Pt, hex[2] as Pt, [16, 16]], '#F2FBF9', '#BDEBE3', 2.4);
      o += outline(regular(16, 16, 6.5, 6, Math.PI / 6), 1.6, '#2E9E8F');
      break;
    }
    case 'boost':
      o += poly(
        [
          [6, 18],
          [16, 8],
          [26, 18],
          [21, 18],
          [16, 13],
          [11, 18],
        ],
        '#5B8FE6',
        { sw: 2 },
      );
      o += poly(
        [
          [6, 27],
          [16, 17],
          [26, 27],
          [21, 27],
          [16, 22],
          [11, 27],
        ],
        '#2F6FDB',
        { sw: 2 },
      );
      break;
    case 'stun':
      o += poly(star(10, 11, 7, 2.6, 4), '#F2B84B', { sw: 1.8 });
      o += poly(star(23, 20, 6, 2.2, 4), '#F8D78C', { sw: 1.8 });
      o += `<path d="M6 25 Q16 31 26 25" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'burn':
      o += poly(
        [
          [16, 3],
          [25, 16],
          [24, 25],
          [16, 30],
          [8, 25],
          [7, 16],
          [12, 19],
        ],
        '#E4572E',
        { sw: 2.2 },
      );
      o += face(
        [
          [16, 14],
          [21, 22],
          [16, 27],
          [11, 22],
        ],
        '#F2B84B',
      );
      break;
    case 'heal':
      o += poly(
        [
          [12, 4],
          [20, 4],
          [20, 12],
          [28, 12],
          [28, 20],
          [20, 20],
          [20, 28],
          [12, 28],
          [12, 20],
          [4, 20],
          [4, 12],
          [12, 12],
        ],
        '#4FC9B8',
        { sw: 2.2 },
      );
      break;
    case 'attack':
      o += circle(16, 16, 11, 'none', '#D14545', 3);
      o += line([16, 1], [16, 9], 3, '#D14545') + line([16, 23], [16, 31], 3, '#D14545');
      o += line([1, 16], [9, 16], 3, '#D14545') + line([23, 16], [31, 16], 3, '#D14545');
      break;
    case 'revive':
      o += poly(
        [
          [16, 3],
          [28, 16],
          [21, 16],
          [21, 29],
          [11, 29],
          [11, 16],
          [4, 16],
        ],
        '#F2B84B',
        { sw: 2.2 },
      );
      break;
  }
  return svgDoc(32, 32, o, scale);
}

/* ---------- Efectos de cartas y proyectiles ---------- */

/** Fénix de papel (carta de Fuego). */
export function phoenixSvg(scale = 2): string {
  const c = ELEMENT_COLORS.fire;
  let o = '';
  for (const [a, b] of [
    [
      [30, 50],
      [2, 40],
    ],
    [
      [30, 56],
      [4, 62],
    ],
    [
      [30, 53],
      [0, 52],
    ],
  ] as [Pt, Pt][]) {
    o += poly([a, b, [a[0] + 8, a[1] + 2]], c.accent, { sw: 1.8 });
  }
  o += folded(
    [
      [30, 52],
      [58, 38],
      [104, 48],
      [118, 42],
      [110, 56],
      [70, 66],
    ],
    [
      [58, 52],
      [104, 48],
      [110, 56],
      [70, 66],
    ],
    c.light,
    c.base,
  );
  o += folded(
    [
      [52, 44],
      [70, 4],
      [84, 46],
    ],
    [
      [70, 4],
      [84, 46],
      [70, 44],
    ],
    c.accentLight,
    c.accent,
  );
  o += folded(
    [
      [60, 58],
      [92, 86],
      [88, 56],
    ],
    [
      [88, 56],
      [92, 86],
      [80, 70],
    ],
    c.base,
    c.dark,
  );
  o += circle(106, 47, 1.8, INK, INK, 0);
  return svgDoc(120, 90, o, scale);
}

/** Ola plegada (carta de Agua). */
export function waveSvg(scale = 2): string {
  const c = ELEMENT_COLORS.water;
  let o = '';
  const bands: [Pt[], string][] = [
    [
      [
        [0, 140],
        [30, 90],
        [90, 60],
        [170, 50],
        [240, 70],
        [300, 140],
      ],
      c.accentLight,
    ],
    [
      [
        [20, 140],
        [60, 96],
        [130, 74],
        [200, 80],
        [260, 110],
        [290, 140],
      ],
      c.light,
    ],
    [
      [
        [40, 140],
        [90, 110],
        [160, 100],
        [230, 118],
        [270, 140],
      ],
      c.base,
    ],
  ];
  for (const [p, fill] of bands) o += poly(p, fill, { sw: 2.6 });
  // Cresta enroscada.
  o += folded(
    [
      [170, 50],
      [214, 20],
      [258, 26],
      [276, 52],
      [252, 46],
      [232, 60],
    ],
    [
      [214, 20],
      [258, 26],
      [276, 52],
      [252, 46],
    ],
    '#FFFFFF',
    c.accent,
  );
  o += line([60, 118], [110, 100], 1.4) + line([150, 90], [210, 96], 1.4);
  return svgDoc(300, 140, o, scale);
}

/** Copo de papel recortado (carta de Nieve). */
export function flakeSvg(scale = 2): string {
  const c = ELEMENT_COLORS.snow;
  let o = '';
  const arm: Pt[] = [
    [80, 80],
    [74, 44],
    [66, 36],
    [74, 32],
    [80, 8],
    [86, 32],
    [94, 36],
    [86, 44],
  ];
  for (let i = 0; i < 6; i++) {
    const rot = `transform="rotate(${i * 60} 80 80)"`;
    o += `<g ${rot}>${face(arm, i % 2 === 0 ? c.accentLight : c.accent)}${outline(arm, 2.2)}${line([80, 76], [80, 20], 1.2, c.dark)}</g>`;
  }
  o += poly(regular(80, 80, 13, 6), c.base, { sw: 2.2 });
  return svgDoc(160, 160, o, scale);
}

/** Grulla de papel (curación de Nieve). */
export function craneSvg(scale = 2): string {
  const c = ELEMENT_COLORS.snow;
  let o = '';
  o += folded(
    [
      [4, 22],
      [18, 18],
      [30, 22],
      [42, 8],
      [36, 24],
      [22, 30],
    ],
    [
      [18, 18],
      [30, 22],
      [22, 30],
    ],
    c.accentLight,
    c.accent,
    2,
  );
  o += folded(
    [
      [14, 20],
      [22, 2],
      [26, 21],
    ],
    [
      [22, 2],
      [26, 21],
      [20, 20],
    ],
    '#FFFFFF',
    c.light,
    2,
  );
  return svgDoc(44, 34, o, scale);
}

/** Estrella de papel (ataque de Nieve). */
export function paperStarSvg(scale = 2): string {
  const c = ELEMENT_COLORS.snow;
  const p = star(14, 14, 12, 4.2, 4, Math.PI / 4);
  return svgDoc(28, 28, folded(p, [[14, 14], ...p.slice(0, 4)], c.accentLight, c.accent, 2), scale);
}

/** Dardo de papel con estela de fuego (ataque de Fuego). */
export function dartSvg(scale = 2): string {
  const c = ELEMENT_COLORS.fire;
  let o = poly(
    [
      [0, 7],
      [10, 2],
      [8, 7],
      [10, 12],
    ],
    c.accent,
    { sw: 1.6 },
  );
  o += folded(
    [
      [6, 7],
      [34, 1],
      [40, 7],
      [34, 13],
    ],
    [
      [6, 7],
      [40, 7],
      [34, 13],
    ],
    c.light,
    c.base,
    2,
  );
  return svgDoc(40, 14, o, scale);
}

export function hailSvg(scale = 2): string {
  return svgDoc(24, 24, circle(12, 12, 9.5, ICE.white, INK, 2.2) + circle(9, 9, 3, '#FFFFFF', 'none', 0), scale);
}

export function icicleSvg(scale = 2): string {
  return svgDoc(
    44,
    12,
    folded(
      [
        [0, 6],
        [40, 1],
        [44, 6],
        [40, 11],
      ],
      [
        [0, 6],
        [44, 6],
        [40, 11],
      ],
      ICE.white,
      ICE.light,
      1.8,
    ),
    scale,
  );
}

/** Triángulo blanco para partículas (se tiñe en Phaser). */
export function bitSvg(scale = 2): string {
  return svgDoc(
    16,
    16,
    face(
      [
        [2, 14],
        [8, 2],
        [14, 14],
      ],
      '#FFFFFF',
    ),
    scale,
  );
}

/** Anillo blanco para pulsos e impactos (se tiñe en Phaser). */
export function ringSvg(scale = 2): string {
  return svgDoc(64, 64, circle(32, 32, 27, 'none', '#FFFFFF', 5), scale);
}

/** Carta en miniatura que vuela del ninja al área. */
export function miniCardSvg(el: ElementKind, scale = 2): string {
  const c = ELEMENT_COLORS[el];
  let o = poly(
    [
      [2, 2],
      [34, 2],
      [34, 46],
      [2, 46],
    ],
    '#F6F9FB',
    { sw: 2.4 },
  );
  o += face(
    [
      [3, 3],
      [33, 3],
      [33, 14],
      [3, 14],
    ],
    c.base,
  );
  o += face(
    [
      [24, 46],
      [34, 36],
      [34, 46],
    ],
    c.light,
  );
  o += poly(star(18, 30, 8, 3, 4, Math.PI / 4), c.accent, { sw: 1.6 });
  return svgDoc(36, 48, o, scale);
}

/* ---------- Efectos de la fase 2 (blancos: se tiñen en Phaser) ---------- */

/** Estallido de impacto: estrella de papel de 8 puntas. */
export function fxImpactSvg(scale = 2): string {
  return svgDoc(64, 64, face(star(32, 32, 30, 11, 8, -Math.PI / 2), '#FFFFFF'), scale);
}

/** Llamita para quemaduras y lluvia de fuego. */
export function fxFlameSvg(scale = 2): string {
  return svgDoc(
    24,
    32,
    face(
      [
        [12, 1],
        [21, 14],
        [20, 24],
        [12, 31],
        [4, 24],
        [3, 14],
        [8, 17],
      ],
      '#FFFFFF',
    ),
    scale,
  );
}

/** Gota para salpicaduras de agua. */
export function fxDropSvg(scale = 2): string {
  return svgDoc(16, 22, '<path d="M8 1 C11 7 15 11 15 15 A7 7 0 0 1 1 15 C1 11 5 7 8 1 Z" fill="#FFFFFF"/>', scale);
}

/** Copo pequeño para ventiscas. */
export function fxFlakeSmallSvg(scale = 2): string {
  let o = '';
  for (let i = 0; i < 3; i++) {
    o += `<g transform="rotate(${i * 60} 10 10)"><rect x="9" y="1" width="2" height="18" rx="1" fill="#FFFFFF"/></g>`;
  }
  o += '<circle cx="10" cy="10" r="2.6" fill="#FFFFFF"/>';
  return svgDoc(20, 20, o, scale);
}

/** Chispa de 4 puntas (estrellas del aturdido, destellos). */
export function fxSparkSvg(scale = 2): string {
  return svgDoc(20, 20, face(star(10, 10, 9.5, 2.6, 4), '#FFFFFF'), scale);
}

/** Bocanada de nieve (polvo al pisar, apariciones). */
export function fxPuffSvg(scale = 2): string {
  return svgDoc(
    32,
    22,
    '<circle cx="10" cy="13" r="8" fill="#F6F9FB"/><circle cx="18" cy="9" r="8" fill="#FFFFFF"/><circle cx="24" cy="14" r="7" fill="#EEF3F7"/><rect x="6" y="14" width="22" height="7" rx="3.5" fill="#DCE7EF"/>',
    scale,
  );
}

/** Barrido en media luna (golpe de Témpano). */
export function fxSwipeSvg(scale = 2): string {
  return svgDoc(120, 60, '<path d="M4 54 Q60 -18 116 54 Q60 12 4 54 Z" fill="#FFFFFF"/>', scale);
}

/** Haz de luz vertical (reanimación). */
export function fxBeamSvg(scale = 2): string {
  return svgDoc(
    40,
    200,
    '<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.7" stop-color="#FFFFFF" stop-opacity="0.75"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.95"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="1"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><mask id="m"><rect width="40" height="200" fill="url(#h)"/></mask></defs><rect width="40" height="200" fill="url(#b)" mask="url(#m)"/>',
    scale,
  );
}

/** Sello de papel recortado bajo el área de una carta. */
export function fxSigilSvg(scale = 2): string {
  let o = circle(100, 100, 92, 'none', '#FFFFFF', 6) + circle(100, 100, 74, 'none', '#FFFFFF', 3);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const cx = 100 + Math.cos(a) * 83;
    const cy = 100 + Math.sin(a) * 83;
    o += face(
      [
        [cx + Math.cos(a) * 7, cy + Math.sin(a) * 7],
        [cx + Math.cos(a + 2.1) * 5, cy + Math.sin(a + 2.1) * 5],
        [cx + Math.cos(a - 2.1) * 5, cy + Math.sin(a - 2.1) * 5],
      ],
      '#FFFFFF',
    );
  }
  o += outline(star(100, 100, 60, 26, 6), 3, '#FFFFFF');
  return svgDoc(200, 200, o, scale);
}
