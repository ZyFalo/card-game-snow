import type { EnemyKind } from '@ventisca/core';
import { ICE } from './palette';
import { circle, face, folded, INK, line, outline, type Pt, poly, regular, svgDoc } from './svg';

/*
 * Gólems de escarcha: bloques facetados de hielo con ojos que brillan.
 * Miran a la izquierda (hacia los ninjas).
 *   Carámbano: francotirador delgado con jabalina de hielo.
 *   Granizo: artillero redondo que carga granizo a la espalda.
 *   Témpano: coloso de bloques, lento y enorme.
 */

export const GOLEM_SIZE: Record<EnemyKind, { w: number; h: number }> = {
  sniper: { w: 120, h: 140 },
  artillery: { w: 120, h: 140 },
  colossus: { w: 150, h: 150 },
};

const eyes = (p: Pt[]): string => face(p, ICE.glow) + line(p[0] as Pt, p[1] as Pt, 1.2, '#FFFFFF') + outline(p, 1.4);

function sniper(): Record<string, string> {
  const p: Record<string, string> = {
    armBack: '',
    legBack: '',
    legFront: '',
    torso: '',
    head: '',
    armFront: '',
    weapon: '',
  };
  p.armBack += poly(
    [
      [72, 64],
      [88, 84],
      [80, 88],
    ],
    ICE.dark,
    { sw: 2.6 },
  );
  p.legBack += poly(
    [
      [50, 102],
      [58, 102],
      [56, 132],
      [45, 132],
    ],
    ICE.dark,
    { sw: 2.6 },
  );
  p.legFront += poly(
    [
      [62, 102],
      [70, 102],
      [75, 132],
      [64, 132],
    ],
    ICE.base,
    { sw: 2.6 },
  );
  const torso: Pt[] = [
    [60, 50],
    [74, 60],
    [72, 104],
    [60, 110],
    [48, 104],
    [46, 60],
  ];
  p.torso += folded(
    torso,
    [
      [60, 50],
      [74, 60],
      [72, 104],
      [60, 110],
    ],
    ICE.light,
    ICE.base,
  );
  p.torso += line([60, 50], [60, 110], 1.3);
  p.torso += line([48, 80], [60, 74], 1.2);
  // Cabeza de cristal con púas.
  p.head += poly(
    [
      [50, 26],
      [41, 10],
      [53, 19],
    ],
    ICE.base,
    { sw: 2.4 },
  );
  p.head += poly(
    [
      [68, 24],
      [81, 13],
      [73, 31],
    ],
    ICE.dark,
    { sw: 2.4 },
  );
  const head: Pt[] = [
    [60, 6],
    [70, 24],
    [68, 45],
    [55, 47],
    [49, 26],
  ];
  p.head += folded(
    head,
    [
      [60, 6],
      [70, 24],
      [68, 45],
      [60, 46],
    ],
    ICE.white,
    ICE.light,
  );
  p.head += eyes([
    [47, 31],
    [58, 29],
    [58, 35],
    [48, 36],
  ]);
  // Brazo con jabalina de hielo apuntando a la izquierda.
  p.armFront += poly(
    [
      [49, 63],
      [31, 70],
      [34, 79],
      [51, 73],
    ],
    ICE.base,
    { sw: 2.6 },
  );
  p.weapon += poly(
    [
      [4, 71],
      [46, 66],
      [46, 75],
    ],
    ICE.white,
    { sw: 2.2 },
  );
  p.weapon += line([12, 71], [44, 70.5], 1, ICE.dark);
  return p;
}

function artillery(): Record<string, string> {
  const p: Record<string, string> = {
    pack: '',
    legBack: '',
    legFront: '',
    torso: '',
    head: '',
    armFront: '',
    weapon: '',
  };
  // Canasta de granizo en la espalda.
  p.pack += poly(
    [
      [74, 58],
      [110, 56],
      [103, 78],
      [80, 78],
    ],
    ICE.deep,
    { sw: 2.6 },
  );
  for (const [x, y, r] of [
    [83, 49, 7],
    [95, 46, 7.5],
    [106, 53, 6],
    [89, 38, 6],
  ] as const) {
    p.pack += circle(x, y, r, ICE.white, INK, 2);
    p.pack += circle(x - r * 0.3, y - r * 0.3, r * 0.3, '#FFFFFF', 'none', 0);
  }
  p.legBack += poly(
    [
      [42, 108],
      [56, 108],
      [56, 133],
      [40, 133],
    ],
    ICE.dark,
    { sw: 2.6 },
  );
  p.legFront += poly(
    [
      [64, 108],
      [78, 108],
      [82, 133],
      [66, 133],
    ],
    ICE.base,
    { sw: 2.6 },
  );
  const body = regular(61, 86, 32, 8, Math.PI / 8);
  p.torso += folded(body, [body[7] as Pt, body[0] as Pt, body[1] as Pt, body[2] as Pt, [61, 86]], ICE.light, ICE.base);
  p.torso += line(body[3] as Pt, [61, 86], 1.2);
  p.torso += line([61, 86], body[7] as Pt, 1.2);
  p.torso += line([48, 98], [58, 110], 1.2);
  // Cabeza pequeña.
  const head = regular(45, 48, 14, 6, Math.PI / 6);
  p.head += folded(head, [head[5] as Pt, head[0] as Pt, head[1] as Pt, [45, 48]], ICE.white, ICE.light);
  p.head += eyes([
    [34, 45],
    [45, 44],
    [45, 49],
    [34, 50],
  ]);
  // Brazo alzado con una bola de granizo.
  p.armFront += poly(
    [
      [39, 74],
      [21, 59],
      [29, 52],
      [45, 67],
    ],
    ICE.base,
    { sw: 2.6 },
  );
  p.weapon += circle(20, 47, 11, ICE.white, INK, 2.6);
  p.weapon += circle(16, 43, 3.5, '#FFFFFF', 'none', 0);
  return p;
}

function colossus(): Record<string, string> {
  const p: Record<string, string> = { armBack: '', legBack: '', legFront: '', torso: '', head: '', armFront: '' };
  // Brazo trasero.
  p.armBack += poly(
    [
      [116, 56],
      [138, 78],
      [130, 100],
      [114, 86],
    ],
    ICE.dark,
    { sw: 2.8 },
  );
  p.armBack += folded(
    [
      [122, 96],
      [145, 99],
      [141, 121],
      [119, 117],
    ],
    [
      [134, 97],
      [145, 99],
      [141, 121],
      [131, 119],
    ],
    ICE.base,
    ICE.dark,
    2.8,
  );
  p.legBack += poly(
    [
      [48, 116],
      [68, 116],
      [66, 146],
      [44, 146],
    ],
    ICE.dark,
    { sw: 2.8 },
  );
  p.legFront += poly(
    [
      [84, 116],
      [104, 116],
      [108, 146],
      [86, 146],
    ],
    ICE.base,
    { sw: 2.8 },
  );
  const body: Pt[] = [
    [34, 42],
    [116, 42],
    [124, 120],
    [26, 120],
  ];
  p.torso += folded(
    body,
    [
      [75, 42],
      [116, 42],
      [124, 120],
      [75, 120],
    ],
    ICE.light,
    ICE.base,
    3.2,
  );
  p.torso += line([75, 42], [75, 120], 1.4);
  p.torso += line([36, 78], [58, 70], 1.3);
  p.torso += line([90, 96], [110, 104], 1.3);
  // Nieve sobre los hombros.
  p.torso += poly(
    [
      [30, 46],
      [44, 34],
      [62, 39],
      [78, 32],
      [98, 38],
      [120, 46],
      [100, 48],
      [76, 44],
      [52, 48],
    ],
    ICE.white,
    { sw: 2.4 },
  );
  // Cabeza de bloque.
  p.head += folded(
    [
      [61, 13],
      [90, 13],
      [92, 40],
      [59, 40],
    ],
    [
      [76, 13],
      [90, 13],
      [92, 40],
      [76, 40],
    ],
    ICE.white,
    ICE.light,
  );
  p.head += eyes([
    [63, 23],
    [72, 23],
    [72, 29],
    [63, 29],
  ]);
  p.head += eyes([
    [77, 23],
    [85, 23],
    [85, 29],
    [77, 29],
  ]);
  // Brazo delantero con puño enorme.
  p.armFront += poly(
    [
      [36, 56],
      [13, 74],
      [16, 98],
      [37, 88],
    ],
    ICE.base,
    { sw: 2.8 },
  );
  p.armFront += folded(
    [
      [3, 91],
      [27, 85],
      [31, 111],
      [7, 117],
    ],
    [
      [16, 88],
      [27, 85],
      [31, 111],
      [19, 114],
    ],
    ICE.white,
    ICE.light,
    2.8,
  );
  return p;
}

/** Piezas de cada gólem, en el orden de dibujo de la figura completa. */
export const GOLEM_PARTS: Record<EnemyKind, readonly string[]> = {
  sniper: ['armBack', 'legBack', 'legFront', 'torso', 'head', 'armFront', 'weapon'],
  artillery: ['pack', 'legBack', 'legFront', 'torso', 'head', 'armFront', 'weapon'],
  colossus: ['armBack', 'legBack', 'legFront', 'torso', 'head', 'armFront'],
};

const BUILD: Record<EnemyKind, () => Record<string, string>> = { sniper, artillery, colossus };

const composedGolem = (kind: EnemyKind): string => {
  const parts = BUILD[kind]();
  return GOLEM_PARTS[kind].map((k) => parts[k] ?? '').join('');
};

export function golemSvg(kind: EnemyKind, scale = 2): string {
  const { w, h } = GOLEM_SIZE[kind];
  return svgDoc(w, h, composedGolem(kind), scale);
}

/** Retrato para la ayuda y la pantalla de resultados. */
export function golemBustSvg(kind: EnemyKind, scale = 2): string {
  const { w, h } = GOLEM_SIZE[kind];
  return svgDoc(w, h, composedGolem(kind), scale, `0 0 ${w} ${h}`);
}

/** Una pieza del esqueleto del gólem, sobre el lienzo completo (fase 1 de animación). */
export function golemPartSvg(kind: EnemyKind, part: string, scale = 2): string {
  const { w, h } = GOLEM_SIZE[kind];
  return svgDoc(w, h, BUILD[kind]()[part] ?? '', scale);
}
