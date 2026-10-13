import { ELEMENTS } from '@ventisca/core';
import { describe, expect, it } from 'vitest';
import { NINJA_CLIPS } from '../game/rig/clips';
import { art } from './index';
import { bodyParts, NINJA_PARTS } from './ninjas';
import { ninjaDottedSvg, ninjaPoseSvg, ninjaSilhouetteSvg, POSE_H, POSE_W } from './poses';
import { ninjaRig } from './rigs';

/* Los ninjas en pose de las pantallas en línea: el mismo esqueleto y las mismas poses del tablero. */

describe('Ninjas en pose (D-100)', () => {
  it('cada figura lleva todas sus piezas, una vez cada una', () => {
    for (const el of ELEMENTS) {
      const svg = ninjaPoseSvg(el, {});
      for (const part of NINJA_PARTS) {
        expect(svg.split(`class="p-${part}"`).length - 1, `${el} · ${part}`).toBe(1);
        expect(svg, `${el} · ${part}`).toContain(bodyParts(el)[part]);
      }
      expect(svg.split('class="p-root"').length - 1).toBe(1);
    }
  });

  it('cada pieza gira alrededor de la articulación del esqueleto del juego', () => {
    for (const el of ELEMENTS) {
      const rig = ninjaRig(el);
      const svg = ninjaPoseSvg(el, {});
      for (const [part, [x, y]] of Object.entries(rig.pivots)) {
        expect(svg, `${el} · ${part}`).toContain(`.p-${part}{transform-box:view-box;transform-origin:${x}px ${y}px;`);
      }
      // La raíz se apoya en los pies.
      expect(svg).toContain(`.p-root{transform-box:view-box;transform-origin:${rig.anchor[0]}px ${rig.anchor[1]}px;`);
    }
  });

  it('las piezas van anidadas como en el esqueleto: la cabeza dentro del torso, y las cintas dentro de la cabeza', () => {
    const svg = ninjaPoseSvg('water', {});
    const at = (part: string) => svg.indexOf(`class="p-${part}"`);
    expect(at('root')).toBeLessThan(at('torso'));
    expect(at('torso')).toBeLessThan(at('head'));
    expect(at('head')).toBeLessThan(at('tails'));
    // El arma de Brasa va detrás de su brazo; la de los demás, delante.
    const fire = ninjaPoseSvg('fire', {});
    expect(fire.indexOf('class="p-weapon"')).toBeLessThan(fire.indexOf(bodyParts('fire').armFront));
    expect(at('weapon')).toBeGreaterThan(svg.indexOf(bodyParts('water').armFront));
  });

  it('una sola pose queda quieta; con dos, va y vuelve entre ellas', () => {
    const [a, b] = NINJA_CLIPS.snow.idle.frames;
    const still = ninjaPoseSvg('snow', a?.pose ?? {});
    expect(still).not.toContain('animation');
    expect(still).not.toContain('@keyframes');
    const moving = ninjaPoseSvg('snow', a?.pose ?? {}, b?.pose ?? {}, 760);
    expect(moving).toContain('animation:k-head 760ms ease-in-out infinite alternate');
    expect(moving).toContain('@keyframes k-head{to{transform:translate(0px,-1.2px) rotate(-1.2deg) scale(1,1)}}');
    // De la primera pose sale el punto de partida.
    expect(moving).toContain('transform:translate(0px,-0.4px) rotate(1.5deg) scale(1,1);animation:k-head');
  });

  it('el lienzo deja lugar para los brazos en alto de la pose de acción', () => {
    expect(POSE_W).toBeGreaterThan(120);
    expect(POSE_H).toBeGreaterThan(140);
    const svg = ninjaPoseSvg('fire', {});
    expect(svg).toContain(`viewBox="-26 -34 ${POSE_W} ${POSE_H}"`);
  });

  it('la silueta de tinta y la punteada tienen la forma del ninja, sin sus colores a la vista', () => {
    for (const el of ELEMENTS) {
      expect(ninjaSilhouetteSvg(el)).toContain('flood-color="#1F2440"');
      expect(ninjaSilhouetteSvg(el)).toContain('filter="url(#tinta)"');
      expect(ninjaDottedSvg(el)).toContain('mask="url(#corte)"');
      expect(ninjaDottedSvg(el)).toContain('feMorphology');
    }
  });

  it('el arte de la interfaz: reposo y acción, en movimiento o quietos, sin repetir trabajo', () => {
    for (const el of ELEMENTS) {
      expect(art.idle(el)).toMatch(/^data:image\/svg\+xml/);
      expect(art.idle(el)).toBe(art.idle(el));
      expect(art.idle(el)).not.toBe(art.idle(el, false));
      expect(decodeURIComponent(art.idle(el, false))).not.toContain('animation');
      expect(decodeURIComponent(art.action(el))).toContain('620ms');
      expect(art.action(el)).not.toBe(art.idle(el));
      expect(art.silhouette(el)).not.toBe(art.dotted(el));
    }
  });
});
