import { MAPS } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { backgroundSvg, HUD_BAND_Y } from './scenery';

/*
 * El fondo deja lisa la franja de abajo, donde va el HUD del combate: una línea del fondo cruzaba el
 * título de la mano y la pista de las teclas, y en los otros mapas pasaba lo mismo con un pino y con el
 * acantilado.
 */

/** Las figuras del fondo (polígonos y líneas) con su punto más bajo; un trazo llega medio grosor más abajo. */
function shapes(svg: string): { tag: string; fill: string; bottom: number }[] {
  const out: { tag: string; fill: string; bottom: number }[] = [];
  for (const [, tag, attrs = ''] of svg.matchAll(/<(polygon|line)\b([^>]*)>/g)) {
    const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];
    const stroke = attr('stroke');
    const half = stroke && stroke !== 'none' ? Number(attr('stroke-width') ?? 0) / 2 : 0;
    const ys =
      tag === 'polygon'
        ? (attr('points') ?? '')
            .trim()
            .split(/\s+/)
            .map((pair) => Number(pair.split(',')[1]))
        : [Number(attr('y1')), Number(attr('y2'))];
    out.push({ tag: tag as string, fill: attr('fill') ?? '', bottom: Math.max(...ys) + half });
  }
  return out;
}

describe('El fondo deja libre la franja del HUD', () => {
  for (const map of MAPS) {
    it(`${map}: por debajo de la franja solo queda el campo nevado`, () => {
      const all = shapes(backgroundSvg(map));
      expect(all.length).toBeGreaterThan(20);
      // Un trazo que termina justo en la línea se asoma medio grosor: es la base de una montaña.
      const below = all.filter((s) => s.bottom > HUD_BAND_Y + 2);
      expect(below).toEqual([{ tag: 'polygon', fill: '#EDF2F6', bottom: 720 }]);
    });
  }

  it('la franja empieza por encima del título de la mano, que arranca a 551 px', () => {
    // 720 de alto, menos 12 de margen, 128 de las cartas, 16 de separación y 13 del título.
    expect(HUD_BAND_Y).toBeLessThanOrEqual(720 - 12 - 128 - 16 - 13 - 4);
  });
});
