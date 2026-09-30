import type { MapId } from '@ventisca/core';
import { face, INK, line, outline, type Pt, poly, star, svgDoc } from './svg';

/*
 * Fondos (1280×720) y roca. El tablero se dibuja encima con Phaser, así que
 * los fondos cuidan sobre todo la franja superior y los costados.
 */

function peak(cx: number, top: number, hw: number, base: number, light: string, dark: string, alpha = 1): string {
  const h = base - top;
  const full: Pt[] = [
    [cx - hw, base],
    [cx, top],
    [cx + hw, base],
  ];
  const shade: Pt[] = [
    [cx, top],
    [cx + hw, base],
    [cx + hw * 0.1, base],
  ];
  const cap: Pt[] = [
    [cx - hw * 0.3, top + h * 0.3],
    [cx, top],
    [cx + hw * 0.3, top + h * 0.3],
    [cx + hw * 0.12, top + h * 0.24],
    [cx + hw * 0.02, top + h * 0.34],
    [cx - hw * 0.12, top + h * 0.26],
  ];
  return (
    `<g opacity="${alpha}">` +
    face(full, light) +
    face(shade, dark) +
    face(cap, '#F6F9FB') +
    outline(full, 2.2) +
    outline(cap, 1.6) +
    '</g>'
  );
}

function pine(x: number, base: number, s: number): string {
  let o = poly(
    [
      [x - 4 * s, base],
      [x + 4 * s, base],
      [x + 4 * s, base - 14 * s],
      [x - 4 * s, base - 14 * s],
    ],
    '#6B5B53',
    { sw: 2 },
  );
  const tiers = [
    [base - 10 * s, 34 * s, 38 * s],
    [base - 34 * s, 28 * s, 34 * s],
    [base - 56 * s, 21 * s, 30 * s],
  ] as const;
  for (const [y, hw, h] of tiers) {
    const tri: Pt[] = [
      [x - hw, y],
      [x, y - h],
      [x + hw, y],
    ];
    o += face(tri, '#76A39C');
    o += face(
      [
        [x, y - h],
        [x + hw, y],
        [x, y],
      ],
      '#5E8C86',
    );
    o += face(
      [
        [x - hw * 0.45, y - h * 0.55],
        [x, y - h],
        [x + hw * 0.45, y - h * 0.55],
        [x + hw * 0.1, y - h * 0.62],
        [x - hw * 0.15, y - h * 0.5],
      ],
      '#F6F9FB',
    );
    o += outline(tri, 2);
  }
  return o;
}

function flakes(seed: number, count: number, area: [number, number, number, number]): string {
  let s = seed;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  let o = '';
  for (let i = 0; i < count; i++) {
    const x = area[0] + rand() * (area[2] - area[0]);
    const y = area[1] + rand() * (area[3] - area[1]);
    const r = 3 + rand() * 5;
    o += `<polygon points="${star(x, y, r, r * 0.35, 6)
      .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
      .join(' ')}" fill="#FFFFFF" stroke="${INK}" stroke-width="1" stroke-opacity="0.45"/>`;
  }
  return o;
}

function cliffs(side: 'left' | 'right'): string {
  const m = (p: Pt[]): Pt[] => (side === 'left' ? p : p.map(([x, y]) => [1280 - x, y] as Pt));
  const wall = m([
    [0, 0],
    [138, 0],
    [176, 120],
    [150, 250],
    [182, 400],
    [158, 720],
    [0, 720],
  ]);
  let o = face(wall, '#8C9AB0');
  o += face(
    m([
      [138, 0],
      [176, 120],
      [150, 250],
      [96, 190],
      [70, 40],
    ]),
    '#75849C',
  );
  o += face(
    m([
      [150, 250],
      [182, 400],
      [158, 720],
      [110, 520],
    ]),
    '#6A7991',
  );
  o += outline(wall, 2.6);
  for (const ledge of [
    [
      [20, 150],
      [120, 132],
      [168, 150],
      [104, 158],
    ],
    [
      [10, 330],
      [104, 312],
      [170, 340],
      [96, 350],
    ],
    [
      [18, 520],
      [120, 500],
      [164, 526],
      [80, 536],
    ],
  ] as Pt[][]) {
    o += poly(m(ledge), '#F6F9FB', { sw: 2 });
  }
  o += line(m([[40, 60]])[0] as Pt, m([[96, 190]])[0] as Pt, 1.4);
  o += line(m([[60, 420]])[0] as Pt, m([[110, 520]])[0] as Pt, 1.4);
  return o;
}

export function backgroundSvg(map: MapId, scale = 1.5): string {
  let o =
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#C5D6E4"/><stop offset="0.5" stop-color="#E2EAF1"/><stop offset="1" stop-color="#EEF3F7"/>' +
    '</linearGradient></defs><rect width="1280" height="720" fill="url(#sky)"/>';

  // Cordillera lejana.
  const far: [number, number, number][] = [
    [80, 34, 150],
    [300, 20, 170],
    [520, 46, 150],
    [720, 16, 190],
    [950, 40, 160],
    [1170, 24, 170],
  ];
  for (const [cx, top, hw] of far) o += peak(cx, top, hw, 170, '#BCCDDC', '#A5BACD', 0.9);

  // Campo nevado detrás del tablero, con pliegues suaves.
  const field: Pt[] = [
    [0, 138],
    [1280, 126],
    [1280, 720],
    [0, 720],
  ];
  o += face(field, '#EDF2F6');
  o += line([0, 138], [1280, 126], 2.4);
  for (const [a, b] of [
    [
      [0, 260],
      [240, 150],
    ],
    [
      [1280, 250],
      [1040, 140],
    ],
    [
      [0, 610],
      [200, 520],
    ],
    [
      [1280, 600],
      [1090, 530],
    ],
  ] as [Pt, Pt][]) {
    o += line(a, b, 2, '#D6E1EA');
  }

  if (map === 'cumbre') {
    o += peak(40, 150, 190, 560, '#C9D7E3', '#AFC2D3');
    o += peak(1250, 170, 200, 560, '#C9D7E3', '#AFC2D3');
    o += flakes(7, 26, [0, 0, 1280, 120]);
    o += flakes(19, 10, [0, 150, 180, 540]);
    o += flakes(23, 10, [1100, 150, 1280, 540]);
  } else if (map === 'desfiladero') {
    o += cliffs('left');
    o += cliffs('right');
    o += flakes(11, 18, [180, 0, 1100, 110]);
  } else {
    for (const [x, base, s] of [
      [40, 300, 1.1],
      [128, 250, 0.8],
      [70, 470, 1.25],
      [150, 560, 0.95],
      [1238, 290, 1.1],
      [1150, 240, 0.8],
      [1210, 470, 1.25],
      [1128, 570, 0.95],
    ] as const) {
      o += pine(x, base, s);
    }
    o += flakes(31, 20, [0, 0, 1280, 110]);
  }
  return svgDoc(1280, 720, o, scale);
}

/** Roca de papel arrugado con nieve encima. */
export function rockSvg(scale = 2): string {
  const main: Pt[] = [
    [8, 82],
    [14, 55],
    [33, 36],
    [58, 29],
    [79, 40],
    [93, 62],
    [91, 83],
  ];
  let o = face(main, '#A7B4C6');
  o += face(
    [
      [58, 29],
      [79, 40],
      [93, 62],
      [52, 58],
    ],
    '#8795AB',
  );
  o += face(
    [
      [52, 58],
      [93, 62],
      [91, 83],
      [44, 83],
    ],
    '#7B8BA3',
  );
  o += face(
    [
      [14, 55],
      [33, 36],
      [52, 58],
      [28, 82],
      [8, 82],
    ],
    '#B7C3D2',
  );
  o += outline(main, 3);
  o += line([33, 36], [52, 58], 1.5);
  o += line([52, 58], [44, 83], 1.5);
  o += line([52, 58], [93, 62], 1.5);
  o += poly(
    [
      [20, 50],
      [33, 36],
      [58, 29],
      [79, 40],
      [86, 50],
      [72, 47],
      [57, 43],
      [41, 49],
      [30, 46],
    ],
    '#F7FAFC',
    { sw: 2.2 },
  );
  return svgDoc(100, 90, o, scale);
}
