/*
 * La grilla de las pantallas (docs/lineamientos-de-diseno.md, sección 12). Son los mismos números que las
 * variables `--grid-*` y `--space-*` de `:root` en styles.css: una prueba los compara. Aquí viven para lo
 * que el CSS no puede hacer solo: medir en las pruebas que una pantalla cae sobre sus columnas.
 */

/** El escenario de referencia: 12 columnas a 1280×720, con el ritmo vertical en pasos de 8 px. */
export const GRID = { width: 1280, height: 720, cols: 12, gutter: 16, margin: 56, step: 8 } as const;

/** Respiro, en px: dentro de un elemento, entre los elementos de un grupo, entre grupos y entre zonas. */
export const SPACE = { in: 8, item: 16, group: 24, zone: 32 } as const;

/** Una línea de lectura no pasa de 75 caracteres. */
export const READ_MAX_CH = 75;

export interface GridSpec {
  cols: number;
  margin: number;
  gutter: number;
}

/**
 * Las pantallas adaptables cambian de grilla con el ancho de la ventana: 12 columnas desde 1024 px, 8 entre
 * 600 y 1023 px, y 4 por debajo de 600 px.
 */
export const BREAKPOINTS: readonly (GridSpec & { min: number })[] = [
  { min: 1024, cols: 12, margin: 56, gutter: 16 },
  { min: 600, cols: 8, margin: 32, gutter: 16 },
  { min: 0, cols: 4, margin: 16, gutter: 16 },
];

export function gridFor(width: number): GridSpec {
  const { cols, margin, gutter } = BREAKPOINTS.find((b) => width >= b.min) ?? (BREAKPOINTS.at(-1) as GridSpec);
  return { cols, margin, gutter };
}

/** El ancho de una columna en una ventana de ese ancho. */
export const colWidth = (width: number = GRID.width, g: GridSpec = GRID): number =>
  (width - 2 * g.margin - (g.cols - 1) * g.gutter) / g.cols;

/** Dónde empieza la columna `col` (la primera es la 1). */
export const colLeft = (col: number, width: number = GRID.width, g: GridSpec = GRID): number =>
  g.margin + (col - 1) * (colWidth(width, g) + g.gutter);

/** El ancho de `n` columnas seguidas, con los espacios que quedan entre ellas. */
export const span = (n: number, width: number = GRID.width, g: GridSpec = GRID): number =>
  n * colWidth(width, g) + (n - 1) * g.gutter;

/** Un bloque de una plantilla: la columna donde empieza y cuántas ocupa. */
export interface Block {
  col: number;
  span: number;
}

/**
 * Las cuatro plantillas. Cada una dice en qué columnas va cada bloque; lo demás (alto, orden y respiro)
 * lo pone la pantalla, siempre en pasos de 8 px.
 */
export const TEMPLATES = {
  /** Menú: la cabeza a la izquierda, el contenido en tarjetas de 4 columnas y las acciones a la derecha. */
  menu: {
    head: { col: 1, span: 6 },
    cards: [
      { col: 1, span: 4 },
      { col: 5, span: 4 },
      { col: 9, span: 4 },
    ],
    actions: { col: 7, span: 6 },
  },
  /** Batalla: la barra de arriba en una fila, el tablero al centro y la barra inferior. */
  battle: {
    top: {
      strip: { col: 1, span: 6 },
      clock: { col: 7, span: 1 },
      confirm: { col: 8, span: 2 },
      round: { col: 10, span: 2 },
      buttons: { col: 12, span: 1 },
    },
    board: { col: 2, span: 10 },
    bottom: {
      panels: [
        { col: 1, span: 2 },
        { col: 3, span: 2 },
        { col: 5, span: 2 },
      ],
      hand: { col: 7, span: 3 },
      tip: { col: 10, span: 3 },
    },
  },
  /** Lectura: la columna de texto ocupa 7 columnas; la ilustración, las 4 de la derecha. */
  read: {
    head: { col: 1, span: 8 },
    text: { col: 1, span: 7 },
    art: { col: 9, span: 4 },
    actions: { col: 7, span: 6 },
  },
  /** Diálogo: 6 columnas centradas, sobre el fondo oscurecido. */
  dialog: {
    panel: { col: 4, span: 6 },
  },
} as const satisfies Record<string, unknown>;
