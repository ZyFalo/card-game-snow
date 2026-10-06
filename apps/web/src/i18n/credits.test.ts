import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDITS_TEXT } from './es';

/* D-76: la pantalla de créditos muestra el "Texto corto para el juego" de CREDITOS.md, tal cual. */
describe('Créditos', () => {
  it('el texto del juego es el de la última sección de CREDITOS.md', () => {
    const md = readFileSync(new URL('../../../../CREDITOS.md', import.meta.url), 'utf8');
    const section = md.split(/^## /m).at(-1) ?? '';
    expect(section.split('\n')[0]).toBe('Texto corto para el juego');
    const quote = section
      .split('\n')
      .filter((line) => line.startsWith('> '))
      .map((line) => line.slice(2).trim())
      .join(' ');
    expect(quote).not.toBe('');
    expect(CREDITS_TEXT.body.slice(0, 3).join(' ')).toBe(quote);
  });

  it('la frase del arte, que estaba en el pie de la portada, cierra los créditos', () => {
    expect(CREDITS_TEXT.body.at(-1)).toBe('Arte, sonido y música generados en código.');
  });
});
