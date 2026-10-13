import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Block, colLeft, colWidth, GRID, gridFor, READ_MAX_CH, SPACE, span, TEMPLATES } from './grid';

/* La grilla de las pantallas (lineamientos, sección 12; D-99). */

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));

/** El valor de una variable de `:root`, siguiendo las que apuntan a otra (`var(--gap-1)`). */
function token(name: string): string {
  const value = root.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`Falta ${name} en :root`);
  const alias = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  return alias ? token(alias) : value;
}

const end = (b: Block) => b.col + b.span - 1;

describe('Grilla y composición (D-99)', () => {
  it('las variables de :root son las mismas que usa el código', () => {
    expect(token('--grid-cols')).toBe(String(GRID.cols));
    expect(token('--grid-gutter')).toBe(`${GRID.gutter}px`);
    expect(token('--grid-margin')).toBe(`${GRID.margin}px`);
    expect(token('--grid-step')).toBe(`${GRID.step}px`);
    expect(token('--space-in')).toBe(`${SPACE.in}px`);
    expect(token('--space-item')).toBe(`${SPACE.item}px`);
    expect(token('--space-group')).toBe(`${SPACE.group}px`);
    expect(token('--space-zone')).toBe(`${SPACE.zone}px`);
    expect(token('--read-max')).toBe(`${READ_MAX_CH}ch`);
  });

  it('12 columnas, sus 11 espacios y los dos márgenes llenan los 1280 px', () => {
    expect(GRID.cols * colWidth() + (GRID.cols - 1) * GRID.gutter + 2 * GRID.margin).toBeCloseTo(GRID.width);
    expect(colLeft(1)).toBe(GRID.margin);
    expect(colLeft(GRID.cols) + colWidth()).toBeCloseTo(GRID.width - GRID.margin);
    expect(span(GRID.cols)).toBeCloseTo(GRID.width - 2 * GRID.margin);
  });

  it('el respiro y los márgenes siguen el ritmo de 8 px', () => {
    for (const px of [...Object.values(SPACE), GRID.gutter, GRID.margin]) expect(px % GRID.step).toBe(0);
    // De menos a más: dentro de un elemento, entre elementos, entre grupos y entre zonas.
    expect(Object.values(SPACE)).toEqual([...Object.values(SPACE)].sort((a, b) => a - b));
  });

  it('las pantallas adaptables pasan de 12 a 8 y a 4 columnas', () => {
    expect(gridFor(1280)).toMatchObject({ cols: 12, margin: 56 });
    expect(gridFor(1024)).toMatchObject({ cols: 12, margin: 56 });
    expect(gridFor(1023)).toMatchObject({ cols: 8, margin: 32 });
    expect(gridFor(600)).toMatchObject({ cols: 8, margin: 32 });
    expect(gridFor(599)).toMatchObject({ cols: 4, margin: 16 });
    expect(gridFor(390)).toMatchObject({ cols: 4, margin: 16 });
    // En cada una, las columnas siguen llenando el ancho.
    for (const width of [1440, 800, 390]) {
      const g = gridFor(width);
      expect(g.cols * colWidth(width, g) + (g.cols - 1) * g.gutter + 2 * g.margin).toBeCloseTo(width);
    }
  });

  it('batalla: la barra de arriba llena las 12 columnas, sin huecos ni cruces', () => {
    const { strip, clock, confirm, round, buttons } = TEMPLATES.battle.top;
    const row = [strip, clock, confirm, round, buttons];
    expect(row.reduce((sum, b) => sum + b.span, 0)).toBe(GRID.cols);
    for (let i = 1; i < row.length; i++) expect((row[i] as Block).col).toBe(end(row[i - 1] as Block) + 1);
    // Abajo: tres paneles de 2 columnas, la mano y el lugar de los consejos.
    const bottom = [...TEMPLATES.battle.bottom.panels, TEMPLATES.battle.bottom.hand, TEMPLATES.battle.bottom.tip];
    expect(bottom.reduce((sum, b) => sum + b.span, 0)).toBe(GRID.cols);
  });

  it('simetría: el tablero y el diálogo van centrados en el eje, y las tarjetas se reparten en partes iguales', () => {
    for (const block of [TEMPLATES.battle.board, TEMPLATES.dialog.panel]) {
      const left = colLeft(block.col);
      const right = GRID.width - (left + span(block.span));
      expect(left).toBeCloseTo(right);
    }
    expect(TEMPLATES.menu.cards.map((c) => c.span)).toEqual([4, 4, 4]);
    expect(end(TEMPLATES.menu.cards.at(-1) as Block)).toBe(GRID.cols);
  });

  it('lectura: la columna de texto mide unos 680 px', () => {
    expect(span(TEMPLATES.read.text.span)).toBeGreaterThan(660);
    expect(span(TEMPLATES.read.text.span)).toBeLessThan(700);
  });
});
