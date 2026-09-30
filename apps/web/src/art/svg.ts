/** Utilidades mínimas para escribir SVG como texto (todo el arte se genera en código). */
export const INK = '#1F2440';

export type Pt = readonly [number, number];

const r1 = (n: number): number => Math.round(n * 10) / 10;
export const pts = (p: readonly Pt[]): string => p.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');

interface StrokeOpts {
  stroke?: string;
  sw?: number;
  extra?: string;
}

/** Polígono con contorno de tinta. */
export const poly = (p: readonly Pt[], fill: string, o: StrokeOpts = {}): string =>
  `<polygon points="${pts(p)}" fill="${fill}" stroke="${o.stroke ?? INK}" stroke-width="${o.sw ?? 3}" stroke-linejoin="round" ${o.extra ?? ''}/>`;

/** Polígono sin contorno (para las caras de un pliegue). */
export const face = (p: readonly Pt[], fill: string, extra = ''): string =>
  `<polygon points="${pts(p)}" fill="${fill}" ${extra}/>`;

/** Contorno sin relleno. */
export const outline = (p: readonly Pt[], sw = 3, stroke = INK): string =>
  `<polygon points="${pts(p)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;

/** Figura plegada: cara clara completa, cara oscura encima y contorno de tinta. */
export const folded = (full: readonly Pt[], dark: readonly Pt[], light: string, shade: string, sw = 3): string =>
  face(full, light) + face(dark, shade) + outline(full, sw);

export const line = (a: Pt, b: Pt, sw = 1.6, stroke = INK, extra = ''): string =>
  `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${extra}/>`;

export const circle = (cx: number, cy: number, r: number, fill: string, stroke = INK, sw = 2.5): string =>
  `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;

/** Polígono regular (hexágonos, octágonos…). */
export function regular(cx: number, cy: number, r: number, sides: number, rot = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Estrella de n puntas (radio exterior e interior). */
export function star(cx: number, cy: number, outer: number, inner: number, points: number, rot = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Documento SVG. `scale` fija el tamaño de rasterizado (2× para que se vea nítido). */
export function svgDoc(w: number, h: number, body: string, scale = 2, viewBox = `0 0 ${w} ${h}`): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="${viewBox}">${body}</svg>`;
}

export const toDataUri = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
