import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDITS_TEXT, PORTFOLIO_TEXT, SCREEN_TEXT } from './es';

/* D-76: la pantalla de créditos muestra el "Texto corto para el juego" de CREDITOS.md, tal cual. */
describe('Créditos', () => {
  const md = readFileSync(new URL('../../../../CREDITOS.md', import.meta.url), 'utf8');
  const section = md.split(/^## /m).at(-1) ?? '';
  /** Los párrafos de la cita: en el archivo los separa una línea que solo trae el signo de la cita. */
  const quote = section
    .split('\n')
    .filter((line) => line.startsWith('>'))
    .map((line) => line.slice(1).trim())
    .join('\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replaceAll('\n', ' '));
  /** Un vínculo de Markdown: su texto y su dirección. */
  const LINK = /\[([^\]]+)\]\(([^)]+)\)/;

  it('el texto del juego es el de la última sección de CREDITOS.md', () => {
    expect(section.split('\n')[0]).toBe('Texto corto para el juego');
    expect(quote).toHaveLength(2);
    expect(quote[0]).not.toBe('');
    expect(CREDITS_TEXT.body.slice(0, 3).join(' ')).toBe(quote[0]);
  });

  it('la frase del arte, que estaba en el pie de la portada, sigue al texto de CREDITOS.md', () => {
    expect(CREDITS_TEXT.body).toHaveLength(4);
    expect(CREDITS_TEXT.body.at(-1)).toBe('Arte, sonido y música generados en código.');
  });

  it('D-108: la última línea, la de quien hace Ventisca, es la de CREDITOS.md, con el mismo vínculo', () => {
    const line = quote.at(-1) ?? '';
    const [, text, url] = LINK.exec(line) ?? [];
    expect(text).toBe(PORTFOLIO_TEXT.site);
    expect(url).toBe(PORTFOLIO_TEXT.url);
    // En el juego, la línea es el texto y, a continuación, el vínculo.
    expect(line.replace(LINK, '$1')).toBe(`${CREDITS_TEXT.madeBy} ${PORTFOLIO_TEXT.site}`);
    expect(line.replace(LINK, '$1')).toBe('Hecho por William Peña. Conoce sus otros proyectos en wpena.dev');
  });
});

/* D-108: tres vínculos discretos llevan al portafolio de quien hace Ventisca. */
describe('El portafolio', () => {
  it('D-108: la dirección va tal cual, sin parámetros de seguimiento', () => {
    expect(PORTFOLIO_TEXT.url).toBe('https://wpena.dev');
    const url = new URL(PORTFOLIO_TEXT.url);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(url.host).toBe(PORTFOLIO_TEXT.site);
  });

  it('D-108: el pie de la portada dice de quién es el proyecto', () => {
    expect(`${SCREEN_TEXT.pilot} ${PORTFOLIO_TEXT.author}`).toBe('Piloto de un proyecto personal de William Peña');
  });

  it('D-108: el sello dice a dónde lleva, y a un lector de pantalla, que se abre en otra pestaña', () => {
    expect(PORTFOLIO_TEXT.hint).toBe('wpena.dev ↗');
    expect(PORTFOLIO_TEXT.seal).toBe('Portafolio de William Peña en wpena.dev, se abre en otra pestaña');
  });

  it('D-108: un vínculo de texto le dice a un lector de pantalla lo que se lee y que se abre en otra pestaña', () => {
    // Lo que se oye empieza por lo que se ve: así también lo encuentra quien lo pide por voz.
    for (const text of [PORTFOLIO_TEXT.author, PORTFOLIO_TEXT.site]) {
      expect(PORTFOLIO_TEXT.newTab(text)).toBe(`${text}, se abre en otra pestaña`);
    }
  });
});
